import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { bindingSchema, executeReserved } from '../lib/spend';
import { groupFixture } from './fixtures/photo-groups';
import { prepareGroupAssets } from '../lib/group-assets';
import { aggregatePhotoEvidence as aggregateV1 } from '../lib/photo-evidence-v1';
import { comparePhotoApplication as compareV4 } from '../lib/group-rules-v4';
import { checkedPhotoRecord } from '../lib/photo-record';

const migration = readFileSync('db/migrations/005_azure_ocr_provider.sql', 'utf8');
const functionDefinition = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) throw Error('Missing function');
  return sql.slice(start, sql.indexOf('END $$;', start) + 'END $$;'.length);
};
const azureTuple = ' OR b @> \'{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"azure-ocr-photo-observations-v1","model":"mistral-document-ai-2512","maxCostMicrousd":1000000}\'::jsonb';

test('005 changes only two admission functions, leaving spend operations and photo asset checks byte-exact', () => {
  const previousSpend = functionDefinition(readFileSync('db/migrations/003_photo_groups.sql', 'utf8'), 'public.ttb_demo_spend');
  const spend = functionDefinition(migration, 'public.ttb_demo_spend');
  expect(spend).toContain(azureTuple); expect(spend.replace(azureTuple, '')).toBe(previousSpend);
  const previousPhoto = functionDefinition(readFileSync('db/migrations/004_bottle_semantics.sql', 'utf8'), 'ttb_demo_private.photo_asset_bytes');
  const photo = functionDefinition(migration, 'ttb_demo_private.photo_asset_bytes');
  const replaceAdmission = (s: string) => s.replace(/ OR (?:doc->'extraction'->>'promptVersion' IS DISTINCT FROM 'photo-set-observations-v2'|NOT \(\n[\s\S]*?\n \)) OR coalesce/, ' OR PROVIDER_ADMISSION OR coalesce');
  expect(replaceAdmission(photo)).toBe(replaceAdmission(previousPhoto));
  expect([...migration.matchAll(/CREATE OR REPLACE FUNCTION ([^(]+)/g)].map(m => m[1])).toEqual(['public.ttb_demo_spend', 'ttb_demo_private.photo_asset_bytes']);
  const outsideFunctions = migration.replace(spend, '').replace(photo, '').replace(/^--.*$/gm, '');
  expect(outsideFunctions).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|GRANT|REVOKE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
  expect(outsideFunctions.trim()).toMatch(/^BEGIN;[\s\S]*COMMIT;$/);
});

const socket = process.env.TTB_HOSTED_TEST_SOCKET, psql = process.env.TTB_HOSTED_TEST_PSQL;
// Opt in only on an independently verified disposable cluster. Creates/drops
// only its OWN random database and owner, never accepts a database URL/name.
test.skipIf(!socket || !psql)('real local PostgreSQL 004 to 005: exact Azure admission, frozen history/ACLs, shared liability and replay fences', async () => {
  if (!socket?.startsWith('/') || !psql?.startsWith('/') || process.env.TTB_HOSTED_TEST_PORT === '55483') throw Error('Explicit safe local test cluster required');
  const database = 'ttb_azure_test_' + randomUUID().replaceAll('-', ''), owner = database + '_owner';
  function sql(query: string, role = owner, db = database): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(psql!, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', socket!, '-p', process.env.TTB_HOSTED_TEST_PORT ?? '5432', '-d', db], {
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b);
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(Error(err)));
      child.stdin.end((role ? `SET ROLE "${role}"; ` : '') + query);
    });
  }
  const quote = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
  const rpc = (name: 'spend' | 'review', op: string, input: unknown) => sql(`SELECT public.ttb_demo_${name}('${op}',${quote(input)});`, 'service_role');
  const bind = () => bindingSchema.parse({ reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(), imageSha256: 'a'.repeat(64), schemaVersion: 2, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'azure-ocr-photo-observations-v1', model: 'mistral-document-ai-2512', maxCostMicrousd: 1000000 });
  await sql(`CREATE ROLE "${owner}" NOLOGIN;`, '', 'postgres');
  await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`, '', 'postgres');
  try {
    await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
    for (const file of ['002_hosted_demo.sql', '003_photo_groups.sql', '004_bottle_semantics.sql']) await sql(readFileSync('db/migrations/' + file, 'utf8'));
    const f = await groupFixture(1), prepared = prepareGroupAssets(f.record, f.photos);
    const historical = checkedPhotoRecord({ ...f.record, aggregationVersion: 'photo-set-aggregation-v1', ...aggregateV1(f.record.photoEvidence), comparison: compareV4(f.record.application, f.record.photoEvidence) });
    if (!historical) throw Error('Invalid frozen fixture');
    const old = prepareGroupAssets(historical, f.photos);
    const payload = (group: typeof prepared) => { const p = group.assets[1]; return { id: group.id, record: group.recordText, key: p.key, sha256: p.sha256, bytes: p.bytes, mime: p.mime, assets: group.assets }; };
    const azureRecord = { ...f.record, source: 'azure-foundry', extraction: { ...f.record.extraction, model: 'mistral-document-ai-2512', promptVersion: 'azure-ocr-photo-observations-v1', attemptId: randomUUID(), reservationId: randomUUID() } };
    const photoAdmission = (record: unknown) => {
      const p = prepared.assets[1];
      return sql(`SELECT ttb_demo_private.photo_asset_bytes(${quote(JSON.stringify(record))}#>>'{}',${quote(prepared.assets)},'${prepared.id}','${p.key}','${p.sha256}',${p.bytes},'${p.mime}')`);
    };
    // SQL-only synthetic provider fixtures: never represent paid extraction.
    await expect(photoAdmission(azureRecord)).rejects.toThrow('invalid group record');
    for (const group of [old, prepared]) {
      await rpc('review', 'snapshot_prepare', payload(group)); await rpc('review', 'snapshot_commit', { id: group.id });
      const intent = { confirmed: true, outcome: 'second-review', notes: 'Synthetic historical SQL fixture.' };
      await rpc('review', 'save', { comparisonId: group.id, idempotencyKey: randomUUID(), request: JSON.stringify({ comparisonId: group.id, intent }), intent: JSON.stringify(intent) });
    }
    await rpc('review', 'upload_reserve', { id: randomUUID(), bytes: 42 });
    // Owner seed ONLY in the new random test database; 005 never activates/imports.
    await sql("UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,incurred=7000000,custody_id=gen_random_uuid(),custody_sha256=repeat('a',64)");
    const legacy = [1, 2].map(schemaVersion => ({ ...bind(), schemaVersion, promptVersion: schemaVersion === 1 ? 'image-observations-v1' : 'photo-set-observations-v2', model: 'anthropic/claude-haiku-4.5' }));
    for (const binding of legacy) {
      const claimId = randomUUID(); await rpc('spend', 'reserve', { binding }); await rpc('spend', 'claim', { binding, claimId }); await rpc('spend', 'complete', { binding, claimId });
    }
    await expect(rpc('spend', 'reserve', { binding: bind() })).rejects.toThrow('invalid binding');
    const tables = ['ledger', 'holds', 'work', 'reviews', 'snapshots', 'snapshot_allocations', 'quota', 'uploads'];
    const inventory = () => sql(`SELECT jsonb_build_object(${tables.map(t => `'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') FROM ttb_demo_private.${t} r)`).join(',')})`);
    const catalog = () => sql("SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ttb_demo_private')");
    const definitions = async () => JSON.parse(await sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ttb_demo_private')")) as Record<string, string>;
    const security = () => sql("SELECT jsonb_build_object('tables',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ttb_demo_private'),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ttb_demo_private'),'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='ttb_demo_private'))");
    const before = { inventory: await inventory(), catalog: await catalog(), definitions: await definitions(), security: await security() };
    await sql(migration);
    expect(await inventory()).toBe(before.inventory); expect(await catalog()).toBe(before.catalog); expect(await security()).toBe(before.security);
    const after = await definitions(), fingerprint = (s: string) => createHash('sha256').update(s).digest('hex');
    expect(Object.keys(after).filter(k => fingerprint(after[k]) !== fingerprint(before.definitions[k])).sort()).toEqual([
      'ttb_demo_private.photo_asset_bytes(text,jsonb,uuid,text,text,integer,text)', 'ttb_demo_spend(text,jsonb)',
    ]);
    for (const group of [old, prepared]) expect(JSON.parse(await rpc('review', 'snapshot_get', { id: group.id })).record).toBe(group.recordText);
    for (const role of ['anon', 'authenticated']) await expect(sql("SELECT public.ttb_demo_spend('has_intent','{}')", role)).rejects.toThrow('permission denied');
    await expect(sql('SELECT * FROM ttb_demo_private.ledger', 'service_role')).rejects.toThrow('permission denied');
    await expect(sql("SELECT ttb_demo_private.photo_asset_bytes('',null,null,null,null,null,null)", 'service_role')).rejects.toThrow('permission denied');

    // Exhaustive source/model/prompt/rules cross-products, including SQL NULL.
    for (const [rulesRevision, aggregationVersion] of [[4, 'photo-set-aggregation-v1'], [6, 'photo-set-aggregation-v2']] as const)
      for (const source of ['fixture', 'openrouter', 'azure-foundry', null])
        for (const model of ['offline-fixture', 'anthropic/claude-haiku-4.5', 'mistral-document-ai-2512', null])
          for (const promptVersion of ['photo-set-observations-v2', 'azure-ocr-photo-observations-v1', null]) {
            const validLegacy = promptVersion === 'photo-set-observations-v2' && ((source === 'fixture' && model === 'offline-fixture') || (source === 'openrouter' && model === 'anthropic/claude-haiku-4.5'));
            const validAzure = rulesRevision === 6 && source === 'azure-foundry' && model === 'mistral-document-ai-2512' && promptVersion === 'azure-ocr-photo-observations-v1';
            const record = { ...azureRecord, source, aggregationVersion, comparison: { ...azureRecord.comparison, rulesRevision }, extraction: { ...azureRecord.extraction, model, promptVersion } };
            if (validLegacy || validAzure) expect(Number(await photoAdmission(record))).toBe(prepared.assets.reduce((n, a) => n + a.bytes, 0));
            else await expect(photoAdmission(record)).rejects.toThrow('invalid group record');
          }
    for (const record of [
      { ...azureRecord, aggregationVersion: 'photo-set-aggregation-v1' },
      { ...azureRecord, comparison: { ...azureRecord.comparison, rulesRevision: 4 } },
      { ...azureRecord, extraction: { ...azureRecord.extraction, schemaVersion: 1 } },
      { ...azureRecord, source: undefined },
    ]) await expect(photoAdmission(record)).rejects.toThrow('invalid group record');
    // Admission rejects do not rewrite earlier snapshots/reviews/allocations.
    expect(await inventory()).toBe(before.inventory);
    const newGroup = prepareGroupAssets(f.record, f.photos), azurePayload = { ...payload(newGroup), record: JSON.stringify(azureRecord) };
    await rpc('review', 'snapshot_prepare', azurePayload); await rpc('review', 'snapshot_commit', { id: newGroup.id });
    expect(JSON.parse(await rpc('review', 'snapshot_get', { id: newGroup.id })).record).toBe(azurePayload.record);
    const azureIntent = { confirmed: true, outcome: 'second-review', notes: 'Synthetic Azure SQL fixture, not provider output.' };
    const azureSave = { comparisonId: newGroup.id, idempotencyKey: randomUUID(), request: JSON.stringify({ comparisonId: newGroup.id, intent: azureIntent }), intent: JSON.stringify(azureIntent) };
    const azureReceipt = JSON.parse(await rpc('review', 'save', azureSave));
    expect(JSON.parse(await rpc('review', 'save', azureSave))).toEqual(azureReceipt);
    expect(JSON.parse(await rpc('review', 'detail', { id: azureReceipt.reviewId })).record).toBe(azurePayload.record);

    for (const model of ['anthropic/claude-haiku-4.5', 'mistral-document-ai-2512'])
      for (const schemaVersion of [1, 2])
        for (const promptVersion of ['image-observations-v1', 'photo-set-observations-v2', 'azure-ocr-photo-observations-v1']) {
          const binding = { ...bind(), model, schemaVersion, promptVersion };
          const allowed = bindingSchema.safeParse(binding).success;
          const attempt = sql(`BEGIN; SELECT public.ttb_demo_spend('reserve',${quote({ binding })}); ROLLBACK;`, 'service_role');
          if (allowed) expect(JSON.parse(await attempt).binding).toEqual(binding); else await expect(attempt).rejects.toThrow('invalid binding');
        }
    for (const patch of [{ maxCostMicrousd: 999999 }, { maxCostMicrousd: 1000001 }, { maxCostMicrousd: '1000000' }, { schemaVersion: '2' }, { rulesVersion: 'unknown' }, { reservationId: 'bad' }, { attemptId: null }, { requestId: 'bad' }, { requestId: null }, { imageSha256: null }, { imageSha256: 'A'.repeat(64) }, { source: 'azure-foundry' }, { model: undefined }])
      await expect(rpc('spend', 'reserve', { binding: { ...bind(), ...patch } })).rejects.toThrow();
    const b = bind(), calls = { count: 0 };
    const store = {
      reserve: async (binding: typeof b) => JSON.parse(await rpc('spend', 'reserve', { binding })),
      claim: async (binding: typeof b, claimId: string) => JSON.parse(await rpc('spend', 'claim', { binding, claimId })),
      complete: async (binding: typeof b, claimId: string) => JSON.parse(await rpc('spend', 'complete', { binding, claimId })),
    };
    expect(await executeReserved(store, b, async () => ++calls.count)).toEqual({ ok: true, value: 1 });
    for (const binding of [b, { ...bind(), attemptId: b.attemptId }, { ...bind(), reservationId: b.reservationId }])
      expect((await executeReserved(store, binding, async () => ++calls.count)).ok).toBe(false);
    expect(calls.count).toBe(1);
    const racing = bind(); await store.reserve(racing);
    const claims = await Promise.allSettled([store.claim(racing, randomUUID()), store.claim(racing, randomUUID())]);
    expect(claims.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const winner = (claims.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<{ claimId: string }>).value.claimId;
    await expect(store.complete(racing, randomUUID())).rejects.toThrow('completion denied');
    await expect(store.claim({ ...racing, imageSha256: 'b'.repeat(64) }, randomUUID())).rejects.toThrow('claim denied');
    const more = [bind(), bind()]; for (const binding of more) await store.reserve(binding);
    const secondClaim = randomUUID(); await store.claim(more[0], secondClaim);
    await expect(store.claim(more[1], randomUUID())).rejects.toThrow('busy');
    await store.complete(racing, winner); await store.complete(more[0], secondClaim);
    await expect(store.claim(racing, randomUUID())).rejects.toThrow('claim denied');
    await expect(store.complete(racing, winner)).rejects.toThrow('completion denied');
    for (const query of ["DELETE FROM ttb_demo_private.holds", "UPDATE ttb_demo_private.holds SET binding='{}'", "UPDATE ttb_demo_private.holds SET state='reserved',claim=null", "UPDATE ttb_demo_private.snapshot_allocations SET record='{}'", 'DELETE FROM ttb_demo_private.reviews']) await expect(sql(query)).rejects.toThrow();
    const count = Number(await sql('SELECT count(*) FROM ttb_demo_private.holds'));
    for (let i = count; i < 17; i++) await store.reserve(bind());
    const final = await Promise.allSettled([store.reserve(bind()), store.reserve(bind())]);
    expect(final.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(store.reserve(bind())).rejects.toThrow('exhausted');
    expect(await sql("SELECT incurred||':'||ceiling||':'||(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('7000000:25000000:18000000');
    // Reapplying admission is idempotent even with fully exhausted funded state.
    const exhausted = await inventory(); await sql(migration); expect(await inventory()).toBe(exhausted); expect(await catalog()).toBe(before.catalog);
  } finally {
    await sql(`DROP DATABASE "${database}";`, '', 'postgres');
    await sql(`DROP ROLE "${owner}";`, '', 'postgres');
  }
}, 120000);
