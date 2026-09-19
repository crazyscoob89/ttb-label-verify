-- SOURCE ONLY. Do not apply without separate isolated-DB/migration authorization.
-- One-shot migration, not advertised as replayable. Requires Supabase auth schema,
-- anon/authenticated/service_role and a migration principal allowed to create roles,
-- grant the narrow auth row-lock privileges and assume the newly created owner.
-- PostgREST must expose ONLY ttb_api (never ttb_private), verify JWT signatures,
-- and use authenticated without direct SQL login access. No service key at runtime.
BEGIN;
CREATE ROLE ttb_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE ttb_purge NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT ttb_owner TO CURRENT_USER;
CREATE SCHEMA ttb_private AUTHORIZATION ttb_owner;
CREATE SCHEMA ttb_api AUTHORIZATION ttb_owner;
REVOKE ALL ON SCHEMA ttb_private, ttb_api FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO ttb_owner;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO ttb_owner;
GRANT SELECT (id, banned_until, deleted_at), UPDATE (id) ON auth.users TO ttb_owner;
GRANT SELECT (id, user_id, not_after), UPDATE (id) ON auth.sessions TO ttb_owner;
-- UPDATE(id) is required by PostgreSQL FOR SHARE; no runtime role inherits it.
-- No SQL function writes auth tables. Verify these grants on the managed target.
SET LOCAL ROLE ttb_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA ttb_api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA ttb_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE ttb_private.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  issuer text NOT NULL CHECK (issuer ~ '^https://[^/]+/auth/v1$')
);
-- Intentionally no issuer, user, workspace, object or permission seeds.
CREATE TABLE ttb_private.memberships (
  workspace_id text NOT NULL CHECK (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'reviewer', 'viewer')),
  active boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE FUNCTION ttb_private.exact_keys(value jsonb, keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(jsonb_typeof(value) = 'object' AND value ?& keys
    AND (SELECT count(*) FROM jsonb_object_keys(value)) = cardinality(keys), false)
$$;
CREATE FUNCTION ttb_private.valid_text(value jsonb, max_length integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(jsonb_typeof(value) = 'string' AND length(value #>> '{}') BETWEEN 1 AND max_length
    AND btrim(value #>> '{}') <> '' AND (value #>> '{}') !~ '[[:cntrl:]]', false)
$$;
CREATE FUNCTION ttb_private.valid_units(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN jsonb_typeof(value) = 'number' AND (value #>> '{}') ~ '^[0-9]+$'
    THEN (value #>> '{}')::numeric <= 9007199254740991 ELSE false END
$$;
CREATE FUNCTION ttb_private.valid_application(a jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE k text; country text;
BEGIN
  IF NOT ttb_private.exact_keys(a, ARRAY['applicationId','applicationVersion','brand','classType','abv','netContents','producerName','producerAddress','commodity','imported','origin']) THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['applicationId','applicationVersion','brand','classType','netContents','producerName','producerAddress'] LOOP
    IF NOT ttb_private.valid_text(a->k, CASE WHEN k IN ('applicationId','applicationVersion') THEN 128 ELSE 1000 END) THEN RETURN false; END IF;
  END LOOP;
  IF a->>'applicationId' <> btrim(a->>'applicationId') OR a->>'applicationVersion' <> btrim(a->>'applicationVersion') THEN RETURN false; END IF;
  IF jsonb_typeof(a->'abv') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  IF (a->>'abv')::numeric NOT BETWEEN 0 AND 100 OR NOT COALESCE(a->>'commodity' IN ('wine','distilled-spirits','malt-beverage'), false)
    OR jsonb_typeof(a->'imported') IS DISTINCT FROM 'boolean'
    OR NOT ttb_private.exact_keys(a->'origin', ARRAY['kind','country'])
    OR NOT ttb_private.valid_text(a->'origin'->'country', 1000) THEN RETURN false; END IF;
  IF (a->'origin'->>'kind') IS DISTINCT FROM CASE WHEN (a->>'imported')::boolean THEN 'imported' ELSE 'domestic' END THEN RETURN false; END IF;
  country := replace(lower(btrim(a->'origin'->>'country')), '.', '');
  RETURN ((a->>'imported')::boolean <> (country IN ('united states','united states of america','us','usa')));
END $$;
CREATE FUNCTION ttb_private.valid_image(d jsonb, workspace text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF NOT ttb_private.exact_keys(d, ARRAY['objectKey','objectVersionId','sha256','mime','byteLength','width','height']) THEN RETURN false; END IF;
  IF NOT COALESCE(d->>'objectVersionId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND d->>'sha256' ~ '^[a-f0-9]{64}$' AND d->>'mime' IN ('image/png','image/jpeg'), false) THEN RETURN false; END IF;
  IF NOT ttb_private.valid_units(d->'byteLength') OR NOT ttb_private.valid_units(d->'width') OR NOT ttb_private.valid_units(d->'height') THEN RETURN false; END IF;
  RETURN COALESCE((d->>'byteLength')::numeric BETWEEN 1 AND 10485760
    AND (d->>'width')::numeric BETWEEN 1 AND 20000000 AND (d->>'height')::numeric BETWEEN 1 AND 20000000
    AND (d->>'width')::numeric * (d->>'height')::numeric <= 20000000
    AND d->>'objectKey' = 'private/' || workspace || '/' || (d->>'objectVersionId') || '/' || (d->>'sha256') || CASE WHEN d->>'mime' = 'image/png' THEN '.png' ELSE '.jpg' END, false);
END $$;
CREATE TABLE ttb_private.applications (
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  application_version text NOT NULL,
  snapshot jsonb NOT NULL CHECK (ttb_private.valid_application(snapshot)),
  PRIMARY KEY (workspace_id, application_id, application_version),
  CHECK (snapshot->>'applicationId' = application_id AND snapshot->>'applicationVersion' = application_version)
);
-- An owner-controlled storage attestor must insert this ONLY after verifying exact
-- sanitized bytes in a private, non-overwritable object. No runtime INSERT grant.
-- This migration does not create/activate a bucket or pretend DB references prove bytes.
CREATE TABLE ttb_private.objects (
  object_version_id uuid PRIMARY KEY,
  workspace_id text NOT NULL CHECK (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  created_by uuid NOT NULL,
  object_key text NOT NULL UNIQUE,
  descriptor jsonb NOT NULL,
  CHECK (ttb_private.valid_image(descriptor, workspace_id)),
  CHECK (descriptor->>'objectVersionId' = object_version_id::text AND descriptor->>'objectKey' = object_key),
  UNIQUE (workspace_id, object_version_id)
);
CREATE TABLE ttb_private.evidence (
  evidence_id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  application_id text NOT NULL,
  application_version text NOT NULL,
  object_version_id uuid NOT NULL UNIQUE,
  record jsonb NOT NULL,
  FOREIGN KEY (workspace_id, application_id, application_version) REFERENCES ttb_private.applications,
  FOREIGN KEY (workspace_id, object_version_id) REFERENCES ttb_private.objects (workspace_id, object_version_id)
);
CREATE TABLE ttb_private.evidence_access (
  evidence_id uuid PRIMARY KEY REFERENCES ttb_private.evidence,
  revoked_at timestamptz
);
CREATE TABLE ttb_private.spend_ledger (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  ceiling_microusd bigint NOT NULL CHECK (ceiling_microusd BETWEEN 0 AND 9007199254740991),
  incurred_microusd bigint NOT NULL CHECK (incurred_microusd BETWEEN 0 AND 9007199254740991),
  unresolved_microusd bigint NOT NULL CHECK (unresolved_microusd BETWEEN 0 AND 9007199254740991),
  reservation_microusd bigint NOT NULL CHECK (reservation_microusd BETWEEN 1 AND 9007199254740991),
  CHECK (incurred_microusd + unresolved_microusd <= ceiling_microusd)
);
INSERT INTO ttb_private.spend_ledger VALUES (true, false, 0, 0, 0, 1);
CREATE TABLE ttb_private.spend_reservations (
  reservation_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL UNIQUE,
  workspace_id text NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  binding jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','claimed','unresolved')),
  claim_id uuid UNIQUE,
  CHECK ((state = 'reserved') = (claim_id IS NULL))
);

-- Owner-only policies keep FORCE RLS active even in definers. Runtime has no
-- private schema/table privileges and no row policies. Purge role has NO grants;
-- reviewed retention/tombstone tooling is a separate, unactivated capability.
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['settings','memberships','applications','objects','evidence','evidence_access','spend_ledger','spend_reservations'] LOOP
    EXECUTE format('ALTER TABLE ttb_private.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE ttb_private.%I FORCE ROW LEVEL SECURITY', name);
    EXECUTE format('CREATE POLICY owner_only ON ttb_private.%I TO ttb_owner USING (true) WITH CHECK (true)', name);
  END LOOP;
END $$;
CREATE FUNCTION ttb_private.immutable_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'immutable source' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON ttb_private.evidence FOR EACH ROW EXECUTE FUNCTION ttb_private.immutable_source();
CREATE TRIGGER immutable_applications BEFORE UPDATE OR DELETE ON ttb_private.applications FOR EACH ROW EXECUTE FUNCTION ttb_private.immutable_source();
CREATE TRIGGER immutable_objects BEFORE UPDATE OR DELETE ON ttb_private.objects FOR EACH ROW EXECUTE FUNCTION ttb_private.immutable_source();

CREATE FUNCTION ttb_api.session_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE claims jsonb; issuer text; uid uuid; sid uuid; deadline timestamptz; session_limit timestamptz; ban timestamptz; deleted timestamptz;
BEGIN
  -- Only gateway-verified JWT claims are authority. Do not expose a direct SQL
  -- login that can SET request.jwt.claims; never accept claims/user IDs as arguments.
  claims := auth.jwt(); uid := auth.uid();
  SELECT s.issuer INTO issuer FROM ttb_private.settings s WHERE singleton;
  IF uid IS NULL OR issuer IS NULL OR claims->>'iss' IS DISTINCT FROM issuer
    OR claims->>'aud' IS DISTINCT FROM 'authenticated' OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR NOT ttb_private.valid_units(claims->'exp') OR NOT COALESCE(claims->>'session_id' ~ '^[a-f0-9-]{36}$', false) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  sid := (claims->>'session_id')::uuid;
  deadline := to_timestamp((claims->>'exp')::double precision);
  -- Deterministic lock order: user -> session -> membership -> source/access.
  -- Managed ban/session DELETE and owner membership UPDATE conflict with these locks.
  SELECT banned_until, deleted_at INTO ban, deleted FROM auth.users WHERE id = uid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'access denied' USING ERRCODE = '42501'; END IF;
  SELECT not_after INTO session_limit FROM auth.sessions WHERE id = sid AND user_id = uid FOR SHARE;
  IF NOT FOUND OR deleted IS NOT NULL OR (ban IS NOT NULL AND ban > clock_timestamp()) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF session_limit IS NOT NULL THEN deadline := least(deadline, session_limit); END IF;
  IF deadline <= clock_timestamp() THEN RAISE EXCEPTION 'access denied' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('sessionId',sid,'userId',uid,'expiresAt',floor(extract(epoch FROM deadline)*1000)::bigint,'revoked',false);
END $$;
CREATE FUNCTION ttb_private.authorize(p_workspace text, p_write boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s jsonb; m ttb_private.memberships%ROWTYPE;
BEGIN
  s := ttb_api.session_context();
  SELECT * INTO m FROM ttb_private.memberships WHERE workspace_id = p_workspace AND user_id = (s->>'userId')::uuid FOR SHARE;
  IF NOT FOUND OR NOT m.active OR (p_write AND m.role = 'viewer') THEN RAISE EXCEPTION 'access denied' USING ERRCODE = '42501'; END IF;
  -- Check wall clock AFTER any membership lock wait, not transaction-stable now().
  s := ttb_api.session_context();
  RETURN s || jsonb_build_object('workspaceId',m.workspace_id,'role',m.role);
END $$;
CREATE FUNCTION ttb_private.assert_actor(p_workspace text, p_actor jsonb, p_write boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actual jsonb;
BEGIN
  actual := ttb_private.authorize(p_workspace, p_write);
  IF NOT ttb_private.exact_keys(p_actor, ARRAY['sessionId','userId','workspaceId','role','sessionExpiresAt','checkedAt'])
    OR p_actor->'sessionId' IS DISTINCT FROM actual->'sessionId' OR p_actor->'userId' IS DISTINCT FROM actual->'userId'
    OR p_actor->'workspaceId' IS DISTINCT FROM actual->'workspaceId' OR p_actor->'role' IS DISTINCT FROM actual->'role'
    OR NOT ttb_private.valid_units(p_actor->'sessionExpiresAt') OR NOT ttb_private.valid_units(p_actor->'checkedAt') THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  IF (p_actor->>'sessionExpiresAt')::bigint > (actual->>'expiresAt')::bigint
    OR (p_actor->>'sessionExpiresAt')::bigint <= floor(extract(epoch FROM clock_timestamp())*1000)
    OR (p_actor->>'checkedAt')::bigint > floor(extract(epoch FROM clock_timestamp())*1000) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;
  RETURN actual;
END $$;
CREATE FUNCTION ttb_api.membership_context(p_workspace text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a jsonb;
BEGIN
  a := ttb_private.authorize(p_workspace, false);
  RETURN jsonb_build_object('userId',a->'userId','workspaceId',a->'workspaceId','role',a->'role','active',true);
END $$;
CREATE FUNCTION ttb_api.evidence_insert(p_workspace text, p_actor jsonb, p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a jsonb; app jsonb; prior jsonb; o ttb_private.objects%ROWTYPE; eid uuid; created bigint; expires bigint; ms bigint; committed jsonb;
BEGIN
  a := ttb_private.assert_actor(p_workspace, p_actor, true);
  IF NOT ttb_private.exact_keys(p_record, ARRAY['evidenceId','workspaceId','createdBy','createdAt','expiresAt','revokedAt','application','image'])
    OR p_record->'workspaceId' IS DISTINCT FROM a->'workspaceId' OR p_record->'createdBy' IS DISTINCT FROM a->'userId'
    OR p_record->'revokedAt' IS DISTINCT FROM 'null'::jsonb
    OR NOT ttb_private.valid_units(p_record->'createdAt') OR NOT ttb_private.valid_units(p_record->'expiresAt')
    OR NOT ttb_private.valid_application(p_record->'application') OR NOT ttb_private.valid_image(p_record->'image', p_workspace) THEN
    RAISE EXCEPTION 'invalid evidence';
  END IF;
  eid := (p_record->>'evidenceId')::uuid;
  created := (p_record->>'createdAt')::bigint; expires := (p_record->>'expiresAt')::bigint;
  IF expires <= created OR expires - created > 2592000000 THEN RAISE EXCEPTION 'invalid retention'; END IF;
  app := p_record->'application';
  INSERT INTO ttb_private.applications VALUES (p_workspace, app->>'applicationId', app->>'applicationVersion', app)
    ON CONFLICT (workspace_id, application_id, application_version) DO NOTHING;
  SELECT snapshot INTO prior FROM ttb_private.applications WHERE workspace_id = p_workspace
    AND application_id = app->>'applicationId' AND application_version = app->>'applicationVersion' FOR SHARE;
  IF prior IS DISTINCT FROM app THEN RAISE EXCEPTION 'application binding collision'; END IF;
  SELECT * INTO o FROM ttb_private.objects WHERE workspace_id = p_workspace
    AND object_version_id = (p_record->'image'->>'objectVersionId')::uuid FOR SHARE;
  IF NOT FOUND OR o.created_by::text IS DISTINCT FROM a->>'userId' OR o.descriptor IS DISTINCT FROM p_record->'image' THEN
    RAISE EXCEPTION 'private object unavailable';
  END IF;
  -- Recheck after ALL possible conflict/row-lock waits, before immutable commit.
  PERFORM ttb_private.assert_actor(p_workspace, p_actor, true);
  ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF created > ms OR expires <= ms THEN RAISE EXCEPTION 'expired evidence'; END IF;
  INSERT INTO ttb_private.evidence VALUES (eid, p_workspace, app->>'applicationId', app->>'applicationVersion', o.object_version_id, p_record) RETURNING record INTO committed;
  INSERT INTO ttb_private.evidence_access VALUES (eid, NULL);
  -- Unique evidence/object insert can wait. Check again; exception rolls it all back.
  PERFORM ttb_private.assert_actor(p_workspace, p_actor, true);
  IF expires <= floor(extract(epoch FROM clock_timestamp())*1000) THEN RAISE EXCEPTION 'expired evidence'; END IF;
  RETURN committed;
END $$;
CREATE FUNCTION ttb_api.evidence_read(p_workspace text, p_actor jsonb, p_evidence_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE row_record jsonb; revoked timestamptz; ms bigint;
BEGIN
  PERFORM ttb_private.assert_actor(p_workspace, p_actor, false);
  SELECT e.record, x.revoked_at INTO row_record, revoked FROM ttb_private.evidence e
    JOIN ttb_private.evidence_access x USING (evidence_id)
    WHERE e.evidence_id = p_evidence_id AND e.workspace_id = p_workspace FOR SHARE OF x;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM ttb_private.assert_actor(p_workspace, p_actor, false);
  ms := floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF revoked IS NOT NULL OR (row_record->>'expiresAt')::bigint <= ms OR (row_record->>'createdAt')::bigint > ms THEN RETURN NULL; END IF;
  RETURN row_record;
END $$;

CREATE FUNCTION ttb_private.valid_binding(b jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE k text;
BEGIN
  IF NOT ttb_private.exact_keys(b, ARRAY['reservationId','attemptId','requestId','imageSha256','schemaVersion','rulesVersion','promptVersion','model','maxCostMicrousd']) THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['reservationId','attemptId','requestId'] LOOP
    IF NOT COALESCE(b->>k ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$', false) THEN RETURN false; END IF;
  END LOOP;
  RETURN COALESCE(b->>'imageSha256' ~ '^[a-f0-9]{64}$' AND b->'schemaVersion' = '1'::jsonb
    AND b->>'rulesVersion' = 'prototype-seven-fields-v1' AND b->>'promptVersion' = 'image-observations-v1'
    AND b->>'model' = 'anthropic/claude-haiku-4.5' AND ttb_private.valid_units(b->'maxCostMicrousd')
    AND (b->>'maxCostMicrousd')::numeric > 0, false);
END $$;
CREATE FUNCTION ttb_private.spend_operation(p_operation text, p_workspace text, p_binding jsonb, p_claim_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ledger ttb_private.spend_ledger%ROWTYPE; r ttb_private.spend_reservations%ROWTYPE; a jsonb; cost bigint;
BEGIN
  IF NOT ttb_private.valid_binding(p_binding) THEN RAISE EXCEPTION 'invalid binding'; END IF;
  -- Every writer uses this SAME singleton lock, across all users/workspaces.
  SELECT * INTO ledger FROM ttb_private.spend_ledger WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'spend unavailable'; END IF;
  a := ttb_private.authorize(p_workspace, true);
  cost := (p_binding->>'maxCostMicrousd')::bigint;
  SELECT * INTO r FROM ttb_private.spend_reservations WHERE reservation_id = (p_binding->>'reservationId')::uuid;
  IF FOUND THEN
    IF r.binding IS DISTINCT FROM p_binding OR r.workspace_id IS DISTINCT FROM p_workspace
      OR r.user_id::text IS DISTINCT FROM a->>'userId' OR r.session_id::text IS DISTINCT FROM a->>'sessionId' THEN
      RAISE EXCEPTION 'idempotency collision';
    END IF;
    IF p_operation = 'reserve' THEN
      IF r.state <> 'reserved' THEN RAISE EXCEPTION 'reservation already dispatched'; END IF;
    ELSIF p_operation = 'claim' THEN
      IF NOT ledger.enabled OR cost <> ledger.reservation_microusd OR r.state <> 'reserved' OR p_claim_id IS NULL THEN RAISE EXCEPTION 'claim denied'; END IF;
      UPDATE ttb_private.spend_reservations SET state = 'claimed', claim_id = p_claim_id WHERE reservation_id = r.reservation_id RETURNING * INTO r;
    ELSIF p_operation = 'complete' THEN
      IF r.state NOT IN ('claimed','unresolved') OR p_claim_id IS NULL OR r.claim_id IS DISTINCT FROM p_claim_id THEN RAISE EXCEPTION 'completion denied'; END IF;
      UPDATE ttb_private.spend_reservations SET state = 'unresolved' WHERE reservation_id = r.reservation_id RETURNING * INTO r;
    ELSE RAISE EXCEPTION 'operation denied'; END IF;
  ELSE
    IF p_operation <> 'reserve' OR NOT ledger.enabled OR cost <> ledger.reservation_microusd
      OR ledger.incurred_microusd + ledger.unresolved_microusd + cost > ledger.ceiling_microusd THEN RAISE EXCEPTION 'spend unavailable'; END IF;
    IF EXISTS (SELECT 1 FROM ttb_private.spend_reservations WHERE attempt_id = (p_binding->>'attemptId')::uuid) THEN RAISE EXCEPTION 'idempotency collision'; END IF;
    INSERT INTO ttb_private.spend_reservations VALUES ((p_binding->>'reservationId')::uuid, (p_binding->>'attemptId')::uuid,
      p_workspace, (a->>'userId')::uuid, (a->>'sessionId')::uuid, p_binding, 'reserved', NULL) RETURNING * INTO r;
    UPDATE ttb_private.spend_ledger SET unresolved_microusd = unresolved_microusd + cost WHERE singleton RETURNING * INTO ledger;
  END IF;
  -- No release, expiry reclaim, reset, caller budget or settlement operation exists.
  -- Timeout/crash/failed dispatch retains the entire hold forever until a separately
  -- reviewed privileged reconciliation (not implemented) proves incurred liability.
  PERFORM ttb_private.authorize(p_workspace, true);
  RETURN jsonb_build_object('binding',r.binding,'state',r.state,'claimId',r.claim_id,
    'ledger',jsonb_build_object('currency','USD','ceilingMicrousd',ledger.ceiling_microusd,
      'incurredMicrousd',ledger.incurred_microusd,'unresolvedMicrousd',ledger.unresolved_microusd));
END $$;
CREATE FUNCTION ttb_api.spend_reserve(p_workspace text, p_binding jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT ttb_private.spend_operation('reserve', p_workspace, p_binding, NULL)
$$;
CREATE FUNCTION ttb_api.spend_claim(p_workspace text, p_binding jsonb, p_claim_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT ttb_private.spend_operation('claim', p_workspace, p_binding, p_claim_id)
$$;
CREATE FUNCTION ttb_api.spend_complete(p_workspace text, p_binding jsonb, p_claim_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT ttb_private.spend_operation('complete', p_workspace, p_binding, p_claim_id)
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA ttb_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ttb_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ttb_api FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA ttb_api TO authenticated;
GRANT EXECUTE ON FUNCTION ttb_api.session_context(), ttb_api.membership_context(text),
  ttb_api.evidence_insert(text,jsonb,jsonb), ttb_api.evidence_read(text,jsonb,uuid),
  ttb_api.spend_reserve(text,jsonb), ttb_api.spend_claim(text,jsonb,uuid), ttb_api.spend_complete(text,jsonb,uuid) TO authenticated;
RESET ROLE;
REVOKE ttb_owner FROM CURRENT_USER;
COMMIT;
