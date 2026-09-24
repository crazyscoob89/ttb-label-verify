-- Additive shared-demo photo groups. Apply once as the SAME migration owner as
-- 002 after reviewing the live catalog. Does not create infra, reset quota,
-- activate the ledger, import custody, or alter any historical snapshot/hold.
BEGIN;
CREATE FUNCTION ttb_demo_private.photo_asset_bytes(record_text text,assets jsonb,comparison_id uuid,anchor_key text,anchor_sha text,anchor_bytes integer,anchor_mime text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE doc jsonb; photos jsonb; p jsonb; a jsonb; expected jsonb; n integer; originals bigint=0; normalized bigint=0; pixels bigint=0; media_bytes bigint=0; primary_photo text;
BEGIN
 doc=record_text::jsonb;photos=doc->'photos';
 IF jsonb_path_exists(photos,'$.** ? (@ == null)') OR jsonb_path_exists(assets,'$.** ? (@ == null)') THEN RAISE EXCEPTION 'null photo descriptor'; END IF;
 IF octet_length(record_text)>98304 OR jsonb_typeof(photos) IS DISTINCT FROM 'array' OR doc->>'recordVersion' IS DISTINCT FROM '2' OR doc->'comparison'->>'rulesRevision' IS DISTINCT FROM '4' OR doc->>'aggregationVersion' IS DISTINCT FROM 'photo-set-aggregation-v1' OR doc->'extraction'->>'schemaVersion' IS DISTINCT FROM '2' OR doc->'extraction'->>'promptVersion' IS DISTINCT FROM 'photo-set-observations-v2' OR coalesce(doc->>'photoSetSha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid group record'; END IF;
 n=jsonb_array_length(photos);primary_photo=photos->0->>'photoId';
 IF n<1 OR n>4 OR jsonb_typeof(assets) IS DISTINCT FROM 'array' OR jsonb_array_length(assets)<>2*n OR (SELECT count(DISTINCT v->>'photoId') FROM jsonb_array_elements(photos) v)<>n OR (SELECT count(DISTINCT v->>'sourceSha256') FROM jsonb_array_elements(photos) v)<>n THEN RAISE EXCEPTION 'invalid photo assets'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(photos) LOOP
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>7 OR NOT(p ?& ARRAY['photoId','role','filename','mime','bytes','sourceSha256','normalized']) OR p->>'photoId' IS DISTINCT FROM ((p->>'photoId')::uuid)::text OR p->>'role' NOT IN('front','back','neck','closeup','other') OR p->>'mime' NOT IN('image/png','image/jpeg') OR coalesce(p->>'sourceSha256','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p->'bytes') IS DISTINCT FROM 'number' OR (p->>'bytes') !~ '^[0-9]+$' OR (p->>'bytes')::bigint NOT BETWEEN 1 AND 10485760 THEN RAISE EXCEPTION 'invalid photo descriptor'; END IF;
  expected=p->'normalized';
  IF jsonb_typeof(expected->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(expected->'height') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid dimensions'; END IF;
  IF jsonb_typeof(expected) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(expected))<>5 OR NOT(expected ?& ARRAY['sha256','bytes','mime','width','height']) OR expected->>'mime' NOT IN('image/png','image/jpeg') OR coalesce(expected->>'sha256','') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(expected->'bytes') IS DISTINCT FROM 'number' OR (expected->>'bytes') !~ '^[0-9]+$' OR (expected->>'bytes')::bigint NOT BETWEEN 1 AND 10485760 OR (expected->>'width') !~ '^[0-9]+$' OR (expected->>'height') !~ '^[0-9]+$' OR (expected->>'width')::bigint NOT BETWEEN 1 AND 20000000 OR (expected->>'height')::bigint NOT BETWEEN 1 AND 20000000 OR (expected->>'width')::bigint*(expected->>'height')::bigint>20000000 THEN RAISE EXCEPTION 'invalid normalized descriptor'; END IF;
  originals=originals+(p->>'bytes')::bigint;normalized=normalized+(expected->>'bytes')::bigint;pixels=pixels+(expected->>'width')::bigint*(expected->>'height')::bigint;
 END LOOP;
 IF originals>20971520 OR normalized>20971520 OR pixels>40000000 OR (SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(assets) v)<>2*n OR (SELECT count(DISTINCT (v->>'photoId',v->>'variant')) FROM jsonb_array_elements(assets) v)<>2*n THEN RAISE EXCEPTION 'invalid group allocation'; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(assets) LOOP
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>6 OR NOT(a ?& ARRAY['photoId','variant','key','sha256','bytes','mime']) OR coalesce(a->>'key','') !~ '^snapshots/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR a->>'variant' NOT IN('original','normalized') THEN RAISE EXCEPTION 'invalid asset'; END IF;
  SELECT value INTO p FROM jsonb_array_elements(photos) WHERE value->>'photoId'=a->>'photoId';
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown photo'; END IF;
  expected=CASE WHEN a->>'variant'='original' THEN jsonb_build_object('sha256',p->'sourceSha256','bytes',p->'bytes','mime',p->'mime') ELSE (p->'normalized')-'width'-'height' END;
  IF a-'photoId'-'variant'-'key' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'asset mismatch'; END IF;
  IF a->>'photoId'=primary_photo AND a->>'variant'='normalized' AND (a->>'key' IS DISTINCT FROM anchor_key OR a->>'sha256' IS DISTINCT FROM anchor_sha OR (a->>'bytes')::integer IS DISTINCT FROM anchor_bytes OR a->>'mime' IS DISTINCT FROM anchor_mime) THEN RAISE EXCEPTION 'primary asset mismatch'; END IF;
  media_bytes=media_bytes+(a->>'bytes')::bigint;
 END LOOP;
 IF anchor_key IS DISTINCT FROM 'snapshots/'||comparison_id::text OR anchor_sha IS DISTINCT FROM photos->0->'normalized'->>'sha256' OR doc->>'imageSha256' IS DISTINCT FROM anchor_sha THEN RAISE EXCEPTION 'primary anchor mismatch'; END IF;
 RETURN media_bytes;
END $$;
REVOKE ALL ON FUNCTION ttb_demo_private.photo_asset_bytes(text,jsonb,uuid,text,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE ttb_demo_private.snapshot_allocations ADD COLUMN assets jsonb NULL;
ALTER TABLE ttb_demo_private.snapshot_allocations ADD CONSTRAINT photo_assets_valid CHECK(
 (assets IS NULL AND NOT(record::jsonb ? 'recordVersion')) OR
 (assets IS NOT NULL AND ttb_demo_private.photo_asset_bytes(record,assets,id,key,sha256,bytes,mime)>0)
);
CREATE OR REPLACE FUNCTION public.ttb_demo_spend(p_op text,p_input jsonb) RETURNS jsonb
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
 OR NOT ((b @> '{"schemaVersion":1,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"image-observations-v1","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"photo-set-observations-v2","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb))
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
CREATE OR REPLACE FUNCTION public.ttb_demo_review(p_op text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='2s' SET statement_timeout='4s' AS $$
DECLARE a ttb_demo_private.snapshot_allocations; r ttb_demo_private.reviews; n integer; total bigint; off integer; result jsonb; request_doc jsonb; intent_doc jsonb; media_bytes bigint; assets_doc jsonb; upload_doc jsonb;
BEGIN
 -- One short transaction lock for quotas and review identity. Never held over Storage/provider IO.
 PERFORM 1 FROM ttb_demo_private.quota WHERE id=1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'quota unavailable'; END IF;
 IF p_op='upload_reserve_group' THEN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>1 OR jsonb_typeof(p_input->'uploads') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid uploads'; END IF;
  n=jsonb_array_length(p_input->'uploads');
  IF n<1 OR n>4 OR (SELECT count(DISTINCT u->>'id') FROM jsonb_array_elements(p_input->'uploads') u)<>n THEN RAISE EXCEPTION 'invalid uploads'; END IF;
  media_bytes=0;
  FOR upload_doc IN SELECT value FROM jsonb_array_elements(p_input->'uploads') LOOP
   IF jsonb_typeof(upload_doc) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(upload_doc))<>2 OR NOT(upload_doc ?& ARRAY['id','bytes']) OR jsonb_typeof(upload_doc->'bytes') IS DISTINCT FROM 'number' OR (upload_doc->>'bytes') !~ '^[0-9]+$' OR (upload_doc->>'bytes')::bigint NOT BETWEEN 1 AND 10485760 OR (upload_doc->>'id') IS DISTINCT FROM ((upload_doc->>'id')::uuid)::text THEN RAISE EXCEPTION 'invalid uploads'; END IF;
   media_bytes=media_bytes+(upload_doc->>'bytes')::bigint;
  END LOOP;
  IF media_bytes>20971520 THEN RAISE EXCEPTION 'invalid uploads'; END IF;
  SELECT count(*),coalesce(sum(bytes),0) INTO n,total FROM ttb_demo_private.uploads;
  IF n+jsonb_array_length(p_input->'uploads')>200 OR total+media_bytes>134217728 THEN RAISE EXCEPTION 'review-capacity'; END IF;
  INSERT INTO ttb_demo_private.uploads SELECT (u->>'id')::uuid,(u->>'bytes')::integer FROM jsonb_array_elements(p_input->'uploads') u; RETURN 'null';
 ELSIF p_op='upload_reserve' THEN
  SELECT count(*),coalesce(sum(bytes),0) INTO n,total FROM ttb_demo_private.uploads;
  IF n>=200 OR total+(p_input->>'bytes')::bigint>134217728 THEN RAISE EXCEPTION 'review-capacity'; END IF;
  INSERT INTO ttb_demo_private.uploads VALUES((p_input->>'id')::uuid,(p_input->>'bytes')::integer); RETURN 'null';
 ELSIF p_op='snapshot_prepare' THEN
  assets_doc=p_input->'assets';
  IF assets_doc IS NOT NULL THEN
   media_bytes=ttb_demo_private.photo_asset_bytes(p_input->>'record',assets_doc,(p_input->>'id')::uuid,p_input->>'key',p_input->>'sha256',(p_input->>'bytes')::integer,p_input->>'mime');
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(assets_doc) candidate,ttb_demo_private.snapshot_allocations prior WHERE candidate->>'key'=prior.key OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior.assets) prior_asset WHERE prior_asset->>'key'=candidate->>'key')) THEN RAISE EXCEPTION 'asset key conflict'; END IF;
  ELSE
   IF (p_input->>'record')::jsonb ? 'recordVersion' THEN RAISE EXCEPTION 'group assets required'; END IF;
   media_bytes=(p_input->>'bytes')::bigint;
  END IF;
  IF EXISTS(SELECT 1 FROM ttb_demo_private.snapshot_allocations prior,jsonb_array_elements(prior.assets) asset WHERE asset->>'key'=p_input->>'key') THEN RAISE EXCEPTION 'asset key conflict'; END IF;
  SELECT count(*),coalesce(sum(octet_length(record)+CASE WHEN assets IS NULL THEN bytes ELSE (SELECT sum((v->>'bytes')::bigint) FROM jsonb_array_elements(assets) v) END),0) INTO n,total FROM ttb_demo_private.snapshot_allocations;
  IF n>=200 OR total+media_bytes+octet_length(p_input->>'record')>134217728 THEN RAISE EXCEPTION 'review-capacity'; END IF;
  INSERT INTO ttb_demo_private.snapshot_allocations(id,record,key,sha256,bytes,mime,assets) VALUES((p_input->>'id')::uuid,p_input->>'record',p_input->>'key',p_input->>'sha256',(p_input->>'bytes')::integer,p_input->>'mime',assets_doc); RETURN 'null';
 ELSIF p_op='snapshot_commit' THEN
  INSERT INTO ttb_demo_private.snapshots VALUES((p_input->>'id')::uuid); RETURN 'null';
 ELSIF p_op='snapshot_get' THEN
  SELECT x.* INTO a FROM ttb_demo_private.snapshot_allocations x JOIN ttb_demo_private.snapshots s ON s.id=x.id WHERE s.id=(p_input->>'id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'comparison-not-found'; END IF;
  RETURN jsonb_build_object('record',a.record)||CASE WHEN a.assets IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('assets',a.assets) END;
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
  IF p_op='detail' THEN RETURN jsonb_build_object('receipt',ttb_demo_private.receipt(r),'record',a.record,'intent',r.intent)||CASE WHEN a.assets IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('assets',a.assets) END; END IF;
  IF p_input ? 'photoId' OR p_input ? 'variant' THEN
   IF (SELECT count(*) FROM jsonb_object_keys(p_input))<>3 OR NOT(p_input ?& ARRAY['id','photoId','variant']) OR a.assets IS NULL OR p_input->>'variant' NOT IN('original','normalized') THEN RAISE EXCEPTION 'review-not-found'; END IF;
   SELECT value-'photoId'-'variant' INTO result FROM jsonb_array_elements(a.assets) WHERE value->>'photoId'=p_input->>'photoId' AND value->>'variant'=p_input->>'variant';
   IF NOT FOUND THEN RAISE EXCEPTION 'review-not-found'; END IF;
   RETURN result;
  END IF;
  RETURN jsonb_build_object('key',a.key,'sha256',a.sha256,'bytes',a.bytes,'mime',a.mime);
 ELSE RAISE EXCEPTION 'unknown operation'; END IF;
END $$;
-- CREATE OR REPLACE retains function owners and table RLS/immutable triggers.
REVOKE ALL ON FUNCTION public.ttb_demo_spend(text,jsonb),public.ttb_demo_review(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ttb_demo_spend(text,jsonb),public.ttb_demo_review(text,jsonb) TO service_role;
COMMIT;
