-- Standalone shared-code demo successor. Does not depend on/enable migration 001.
-- Apply once as the trusted migration owner, never from app startup.
-- NO budget is provisioned here. Owner-only custody import + independently
-- verified exclusive authority are required before enabled may become true.
BEGIN;
CREATE SCHEMA ttb_demo_private;
REVOKE ALL ON SCHEMA ttb_demo_private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE ttb_demo_private.ledger (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL CHECK(version=1),
 enabled boolean NOT NULL DEFAULT false, ceiling bigint NOT NULL DEFAULT 0 CHECK(ceiling IN(0,25000000)),
 incurred bigint NOT NULL DEFAULT 0 CHECK(incurred>=0 AND incurred<=ceiling),
 custody_id uuid UNIQUE, custody_sha256 text CHECK(custody_sha256 ~ '^[a-f0-9]{64}$'),
 CHECK(NOT enabled OR (ceiling=25000000 AND custody_id IS NOT NULL AND custody_sha256 IS NOT NULL))
);
INSERT INTO ttb_demo_private.ledger(id,version) VALUES(1,1);
CREATE TABLE ttb_demo_private.holds (
 reservation uuid PRIMARY KEY, attempt uuid NOT NULL UNIQUE, binding text NOT NULL,
 amount bigint NOT NULL CHECK(amount=1000000), state text NOT NULL CHECK(state IN('reserved','claimed','unresolved')),
 claim uuid UNIQUE, CHECK((state='reserved')=(claim IS NULL))
);
CREATE TABLE ttb_demo_private.work(id uuid PRIMARY KEY);
CREATE TABLE ttb_demo_private.quota(id integer PRIMARY KEY CHECK(id=1));
INSERT INTO ttb_demo_private.quota VALUES(1);
-- Pending allocations count forever. Storage and SQL are not a transaction;
-- lost acknowledgments can leave private orphans, never unaccounted growth.
CREATE TABLE ttb_demo_private.snapshot_allocations (
 id uuid PRIMARY KEY, record text NOT NULL CHECK(octet_length(record)<=262144),
 key text NOT NULL UNIQUE CHECK(key='snapshots/'||id::text),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760), mime text NOT NULL CHECK(mime IN('image/png','image/jpeg')),
 CHECK((record::jsonb->>'processing'='complete' AND record::jsonb->>'imageSha256'=sha256) IS TRUE)
);
CREATE TABLE ttb_demo_private.snapshots(id uuid PRIMARY KEY REFERENCES ttb_demo_private.snapshot_allocations(id));
CREATE TABLE ttb_demo_private.reviews (
 id uuid PRIMARY KEY, comparison_id uuid NOT NULL UNIQUE REFERENCES ttb_demo_private.snapshots(id),
 key uuid NOT NULL UNIQUE, request text NOT NULL CHECK(octet_length(request)<=393216),
 intent text NOT NULL CHECK(octet_length(intent)<=393216), saved_at text NOT NULL
);
CREATE TABLE ttb_demo_private.uploads(id uuid PRIMARY KEY, bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 10485760));
CREATE FUNCTION ttb_demo_private.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'immutable'; END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ttb_demo_private.snapshot_allocations FOR EACH ROW EXECUTE FUNCTION ttb_demo_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ttb_demo_private.snapshots FOR EACH ROW EXECUTE FUNCTION ttb_demo_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ttb_demo_private.reviews FOR EACH ROW EXECUTE FUNCTION ttb_demo_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON ttb_demo_private.uploads FOR EACH ROW EXECUTE FUNCTION ttb_demo_private.immutable();
CREATE FUNCTION ttb_demo_private.hold_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'permanent liability'; END IF;
 IF ROW(NEW.reservation,NEW.attempt,NEW.binding,NEW.amount) IS DISTINCT FROM ROW(OLD.reservation,OLD.attempt,OLD.binding,OLD.amount)
 OR NOT ((OLD.state='reserved' AND NEW.state='claimed' AND NEW.claim IS NOT NULL) OR (OLD.state='claimed' AND NEW.state='unresolved' AND NEW.claim=OLD.claim)) THEN RAISE EXCEPTION 'invalid hold transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER hold_transition BEFORE UPDATE OR DELETE ON ttb_demo_private.holds FOR EACH ROW EXECUTE FUNCTION ttb_demo_private.hold_transition();

CREATE FUNCTION public.ttb_demo_spend(p_op text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='2s' SET statement_timeout='4s' AS $$
DECLARE l ttb_demo_private.ledger; h ttb_demo_private.holds; b jsonb; held bigint; c uuid;
BEGIN
 SELECT * INTO STRICT l FROM ttb_demo_private.ledger WHERE id=1 FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO held FROM ttb_demo_private.holds;
 IF NOT l.enabled OR l.version<>1 OR l.ceiling<>25000000 OR l.incurred+held>l.ceiling THEN RAISE EXCEPTION 'spend unavailable'; END IF;
 IF p_op='acquire' THEN
  IF (SELECT count(*) FROM ttb_demo_private.work)>=2 THEN RAISE EXCEPTION 'busy'; END IF;
  INSERT INTO ttb_demo_private.work VALUES((p_input->>'id')::uuid); RETURN 'null';
 ELSIF p_op='release' THEN
  DELETE FROM ttb_demo_private.work WHERE id=(p_input->>'id')::uuid; RETURN 'null';
 ELSIF p_op='has_intent' THEN
  RETURN to_jsonb(EXISTS(SELECT 1 FROM ttb_demo_private.holds WHERE attempt=(p_input->>'attemptId')::uuid OR reservation=(p_input->>'reservationId')::uuid));
 END IF;
 b=p_input->'binding';
 IF b IS NULL OR jsonb_typeof(b)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>9
 OR NOT (b ?& ARRAY['reservationId','attemptId','requestId','imageSha256','schemaVersion','rulesVersion','promptVersion','model','maxCostMicrousd'])
 OR NOT (b @> '{"schemaVersion":1,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"image-observations-v1","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb)
 OR b->>'requestId' IS NULL OR b->>'reservationId' IS NULL OR b->>'attemptId' IS NULL
 OR (b->>'imageSha256') !~ '^[a-f0-9]{64}$' OR b->>'imageSha256' IS NULL THEN RAISE EXCEPTION 'invalid binding'; END IF;
 PERFORM (b->>'requestId')::uuid;
 IF p_op='reserve' THEN
  IF l.incurred+held+1000000>l.ceiling THEN RAISE EXCEPTION 'exhausted'; END IF;
  INSERT INTO ttb_demo_private.holds VALUES((b->>'reservationId')::uuid,(b->>'attemptId')::uuid,b::text,1000000,'reserved',NULL) RETURNING * INTO h;
 ELSIF p_op='claim' THEN
  c=(p_input->>'claimId')::uuid;
  IF (SELECT count(*) FROM ttb_demo_private.holds WHERE state='claimed')>=2 THEN RAISE EXCEPTION 'busy'; END IF;
  UPDATE ttb_demo_private.holds SET state='claimed',claim=c WHERE reservation=(b->>'reservationId')::uuid AND binding::jsonb=b AND state='reserved' RETURNING * INTO h;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim denied'; END IF;
 ELSIF p_op='complete' THEN
  c=(p_input->>'claimId')::uuid;
  UPDATE ttb_demo_private.holds SET state='unresolved' WHERE reservation=(b->>'reservationId')::uuid AND binding::jsonb=b AND state='claimed' AND claim=c RETURNING * INTO h;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion denied'; END IF;
 ELSE RAISE EXCEPTION 'unknown operation'; END IF;
 SELECT coalesce(sum(amount),0) INTO held FROM ttb_demo_private.holds;
 RETURN jsonb_build_object('binding',h.binding::jsonb,'state',h.state,'claimId',h.claim,'ledger',jsonb_build_object('currency','USD','ceilingMicrousd',l.ceiling,'incurredMicrousd',l.incurred,'unresolvedMicrousd',held));
END $$;
CREATE FUNCTION ttb_demo_private.receipt(r ttb_demo_private.reviews) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('state','SAVED','reviewId',r.id,'comparisonId',r.comparison_id,'savedAt',r.saved_at,'identity','Shared demo access code — NOT an individually authenticated reviewer');
$$;
CREATE FUNCTION public.ttb_demo_review(p_op text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='2s' SET statement_timeout='4s' AS $$
DECLARE a ttb_demo_private.snapshot_allocations; r ttb_demo_private.reviews; n integer; total bigint; off integer; result jsonb; request_doc jsonb; intent_doc jsonb;
BEGIN
 -- One short transaction lock for quotas and review identity. Never held over Storage/provider IO.
 PERFORM 1 FROM ttb_demo_private.quota WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'quota unavailable'; END IF;
 IF p_op='upload_reserve' THEN
  SELECT count(*),coalesce(sum(bytes),0) INTO n,total FROM ttb_demo_private.uploads;
  IF n>=200 OR total+(p_input->>'bytes')::bigint>134217728 THEN RAISE EXCEPTION 'review-capacity'; END IF;
  INSERT INTO ttb_demo_private.uploads VALUES((p_input->>'id')::uuid,(p_input->>'bytes')::integer); RETURN 'null';
 ELSIF p_op='snapshot_prepare' THEN
  SELECT count(*),coalesce(sum(bytes+octet_length(record)),0) INTO n,total FROM ttb_demo_private.snapshot_allocations;
  IF n>=200 OR total+(p_input->>'bytes')::bigint+octet_length(p_input->>'record')>134217728 THEN RAISE EXCEPTION 'review-capacity'; END IF;
  INSERT INTO ttb_demo_private.snapshot_allocations VALUES((p_input->>'id')::uuid,p_input->>'record',p_input->>'key',p_input->>'sha256',(p_input->>'bytes')::integer,p_input->>'mime'); RETURN 'null';
 ELSIF p_op='snapshot_commit' THEN
  INSERT INTO ttb_demo_private.snapshots VALUES((p_input->>'id')::uuid); RETURN 'null';
 ELSIF p_op='snapshot_get' THEN
  SELECT x.* INTO a FROM ttb_demo_private.snapshot_allocations x JOIN ttb_demo_private.snapshots s ON s.id=x.id WHERE s.id=(p_input->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'comparison-not-found'; END IF;
  RETURN jsonb_build_object('record',a.record);
 ELSIF p_op='save' THEN
  SELECT x.* INTO a FROM ttb_demo_private.snapshot_allocations x JOIN ttb_demo_private.snapshots s ON s.id=x.id WHERE s.id=(p_input->>'comparisonId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'comparison-not-found'; END IF;
  request_doc=(p_input->>'request')::jsonb; intent_doc=(p_input->>'intent')::jsonb;
  -- Full comparison policy is checked in the trusted server adapter. SQL binds
  -- the exact canonical bytes to this immutable snapshot and unique retry key.
  IF request_doc->>'comparisonId' IS DISTINCT FROM a.id::text OR request_doc->'intent' IS DISTINCT FROM intent_doc OR intent_doc->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'invalid review'; END IF;
  SELECT * INTO r FROM ttb_demo_private.reviews WHERE key=(p_input->>'idempotencyKey')::uuid;
  IF FOUND THEN
   IF r.request<>p_input->>'request' THEN RAISE EXCEPTION 'idempotency-conflict'; END IF;
   RETURN ttb_demo_private.receipt(r);
  END IF;
  IF EXISTS(SELECT 1 FROM ttb_demo_private.reviews WHERE comparison_id=a.id) THEN RAISE EXCEPTION 'comparison-already-reviewed'; END IF;
  INSERT INTO ttb_demo_private.reviews VALUES(gen_random_uuid(),a.id,(p_input->>'idempotencyKey')::uuid,p_input->>'request',p_input->>'intent',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) RETURNING * INTO r;
  RETURN ttb_demo_private.receipt(r);
 ELSIF p_op='list' THEN
  off=(p_input->>'offset')::integer;
  IF off IS NULL OR off<0 OR off>200 THEN RAISE EXCEPTION 'invalid-offset'; END IF;
  SELECT coalesce(jsonb_agg(x.value ORDER BY x.saved_at DESC,x.id DESC),'[]') INTO result FROM (
   SELECT rv.saved_at,rv.id,jsonb_build_object('receipt',ttb_demo_private.receipt(rv),'application',sa.record::jsonb->'application','outcome',rv.intent::jsonb->>'outcome') value
   FROM ttb_demo_private.reviews rv JOIN ttb_demo_private.snapshot_allocations sa ON sa.id=rv.comparison_id ORDER BY rv.saved_at DESC,rv.id DESC LIMIT 50 OFFSET off
  ) x; RETURN result;
 ELSIF p_op IN('detail','evidence') THEN
  SELECT * INTO r FROM ttb_demo_private.reviews WHERE id=(p_input->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'review-not-found'; END IF;
  SELECT * INTO STRICT a FROM ttb_demo_private.snapshot_allocations WHERE id=r.comparison_id;
  IF p_op='detail' THEN RETURN jsonb_build_object('receipt',ttb_demo_private.receipt(r),'record',a.record,'intent',r.intent); END IF;
  RETURN jsonb_build_object('key',a.key,'sha256',a.sha256,'bytes',a.bytes,'mime',a.mime);
 ELSE RAISE EXCEPTION 'unknown operation'; END IF;
END $$;
-- Supabase installs broad default privileges; revoke EXPLICITLY on all objects.
REVOKE ALL ON ALL TABLES IN SCHEMA ttb_demo_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ttb_demo_private FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ledger','holds','work','quota','snapshot_allocations','snapshots','reviews','uploads'] LOOP
  EXECUTE format('ALTER TABLE ttb_demo_private.%I ENABLE ROW LEVEL SECURITY',t);
  -- Definer owner is the only policy subject; runtime never receives table DML.
  EXECUTE format('CREATE POLICY owner_only ON ttb_demo_private.%I TO %I USING(true) WITH CHECK(true)',t,current_user);
  EXECUTE format('ALTER TABLE ttb_demo_private.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.ttb_demo_spend(text,jsonb),public.ttb_demo_review(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ttb_demo_spend(text,jsonb),public.ttb_demo_review(text,jsonb) TO service_role;
COMMIT;
