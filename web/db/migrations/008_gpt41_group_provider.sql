-- PARENT REVIEW REQUIRED: do not apply as part of candidate implementation.
-- Admission-only delta from 007: genuine GPT-4.1 production group tuple.
-- Retains 007 benchmark tuples, 006 $50 ceiling, all historical tuples/receipts.
-- No ledger/hold data mutation, ceiling reset, settlement, or ACL changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.ttb_demo_spend(p_op text,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='2s' SET statement_timeout='4s' AS $$
DECLARE l ttb_demo_private.ledger; h ttb_demo_private.holds; b jsonb; held bigint; c uuid;
BEGIN
 SELECT * INTO STRICT l FROM ttb_demo_private.ledger WHERE id=1 FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO held FROM ttb_demo_private.holds;
 IF NOT l.enabled OR l.version<>1 OR l.ceiling<>50000000 OR l.incurred+held>l.ceiling THEN RAISE EXCEPTION 'spend unavailable'; END IF;
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
 OR NOT ((b @> '{"schemaVersion":1,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"image-observations-v1","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"photo-set-observations-v2","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"azure-ocr-photo-observations-v1","model":"mistral-document-ai-2512","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"openai/gpt-4.1","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"google/gemini-2.5-flash","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"google/gemini-2.5-flash-lite","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"gpt41-photo-observations-v1","model":"openai/gpt-4.1","maxCostMicrousd":1000000}'::jsonb))
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
CREATE OR REPLACE FUNCTION ttb_demo_private.photo_asset_bytes(record_text text,assets jsonb,comparison_id uuid,anchor_key text,anchor_sha text,anchor_bytes integer,anchor_mime text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE doc jsonb; photos jsonb; p jsonb; a jsonb; expected jsonb; n integer; originals bigint=0; normalized bigint=0; pixels bigint=0; media_bytes bigint=0; primary_photo text;
BEGIN
 doc=record_text::jsonb;photos=doc->'photos';
 IF jsonb_path_exists(photos,'$.** ? (@ == null)') OR jsonb_path_exists(assets,'$.** ? (@ == null)') THEN RAISE EXCEPTION 'null photo descriptor'; END IF;
 IF octet_length(record_text)>98304 OR jsonb_typeof(photos) IS DISTINCT FROM 'array' OR doc->>'recordVersion' IS DISTINCT FROM '2' OR NOT ((doc->'comparison'->>'rulesRevision' IS NOT DISTINCT FROM '4' AND doc->>'aggregationVersion' IS NOT DISTINCT FROM 'photo-set-aggregation-v1') OR (doc->'comparison'->>'rulesRevision' IS NOT DISTINCT FROM '6' AND doc->>'aggregationVersion' IS NOT DISTINCT FROM 'photo-set-aggregation-v2') OR (doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":7},"aggregationVersion":"photo-set-aggregation-v2"}'::jsonb)) OR doc->'extraction'->>'schemaVersion' IS DISTINCT FROM '2' OR NOT (
  (doc->'extraction'->>'promptVersion' IS NOT DISTINCT FROM 'photo-set-observations-v2' AND (
   (doc->>'source' IS NOT DISTINCT FROM 'fixture' AND doc->'extraction'->>'model' IS NOT DISTINCT FROM 'offline-fixture') OR
   (doc->>'source' IS NOT DISTINCT FROM 'openrouter' AND doc->'extraction'->>'model' IS NOT DISTINCT FROM 'anthropic/claude-haiku-4.5')
  )) OR
  (doc->>'source' IS NOT DISTINCT FROM 'azure-foundry' AND doc->'extraction'->>'model' IS NOT DISTINCT FROM 'mistral-document-ai-2512' AND doc->'extraction'->>'promptVersion' IS NOT DISTINCT FROM 'azure-ocr-photo-observations-v1' AND doc->'comparison'->>'rulesRevision' IS NOT DISTINCT FROM '6' AND doc->>'aggregationVersion' IS NOT DISTINCT FROM 'photo-set-aggregation-v2') OR
  (doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":6},"aggregationVersion":"photo-set-aggregation-v2"}'::jsonb) OR
  (doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":7},"aggregationVersion":"photo-set-aggregation-v2"}'::jsonb)
 ) OR coalesce(doc->>'photoSetSha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid group record'; END IF;
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
COMMIT;
