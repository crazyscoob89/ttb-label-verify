-- Benchmark admission ONLY on the existing $50 ledger. Preserve all old tuples.
-- No saved-record, row, ACL, ceiling, settlement, or app-engine changes.
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
 OR NOT ((b @> '{"schemaVersion":1,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"image-observations-v1","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"photo-set-observations-v2","model":"anthropic/claude-haiku-4.5","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"azure-ocr-photo-observations-v1","model":"mistral-document-ai-2512","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"openai/gpt-4.1","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"google/gemini-2.5-flash","maxCostMicrousd":1000000}'::jsonb OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"isolated-vision-benchmark-v1","model":"google/gemini-2.5-flash-lite","maxCostMicrousd":1000000}'::jsonb))
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
COMMIT;
