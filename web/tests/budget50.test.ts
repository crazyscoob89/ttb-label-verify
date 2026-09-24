import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { executeReserved, type SpendBinding } from '../lib/spend';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import { groupFixture } from './fixtures/photo-groups';
import { prepareGroupAssets } from '../lib/group-assets';

const migration = readFileSync('db/migrations/006_budget_50.sql', 'utf8');
const definition = (s: string) => s.match(/CREATE OR REPLACE FUNCTION public.ttb_demo_spend\([\s\S]*?END \$\$;/)![0];
const bind = (): SpendBinding => ({ reservationId: randomUUID(), attemptId: randomUUID(), requestId: randomUUID(), imageSha256: 'a'.repeat(64), schemaVersion: 2, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'azure-ocr-photo-observations-v1', model: 'mistral-document-ai-2512', maxCostMicrousd: 1000000 });

test('006 function differs from 005 only in finite ceiling admission; no provider/binding/claim changes', () => {
  expect(definition(migration).replace('l.ceiling<>50000000', 'l.ceiling<>25000000')).toBe(definition(readFileSync('db/migrations/005_azure_ocr_provider.sql', 'utf8')));
  const outside = migration.replace(definition(migration), '').replace(/^--.*$/gm, '');
  expect(outside.match(/UPDATE [^;]+;/g)).toEqual(['UPDATE ttb_demo_private.ledger SET ceiling=50000000 WHERE id=1 AND ceiling=25000000;']);
  expect(outside).not.toMatch(/\b(?:DELETE|INSERT|TRUNCATE|GRANT|REVOKE|DISABLE)\b/);
  expect(outside).toContain('ADD CONSTRAINT ledger_ceiling_check CHECK(ceiling IN(0,50000000))');
  expect(outside).toContain('ADD CONSTRAINT ledger_check1 CHECK(NOT enabled OR (ceiling=50000000 AND custody_id IS NOT NULL AND custody_sha256 IS NOT NULL))');
});

test('generic receipt consumers accept $50, retain $25 liability, fail closed on exhaustion/replays', async () => {
  const s = new OfflineSpendStore(); s.ceiling = 50000000; s.historical = 25000000;
  const work = vi.fn(async () => 'synthetic only'), first = bind();
  expect(await executeReserved(s, first, work)).toEqual({ ok: true, value: 'synthetic only' });
  expect((await executeReserved(s, first, work)).ok).toBe(false);
  for (let i = 1; i < 25; i++) expect((await executeReserved(s, bind(), work)).ok).toBe(true);
  expect((await executeReserved(s, bind(), work)).ok).toBe(false);
  expect(work).toHaveBeenCalledTimes(25); expect(s.historical).toBe(25000000); expect(s.unresolved).toBe(25000000);
});

const socket = process.env.TTB_HOSTED_TEST_SOCKET, psql = process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket || !psql)('local PG 005 -> 006 preserves full history/ACLs; sameledger $50 admission remains bounded', async () => {
  if (!socket?.startsWith('/') || !psql?.startsWith('/') || process.env.TTB_HOSTED_TEST_PORT === '55483') throw Error('Explicit disposable local cluster required');
  const database = 'ttb_budget50_' + randomUUID().replaceAll('-', ''), owner = database + '_owner';
  function sql(query: string, role = owner, db = database): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(psql!, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', socket!, '-p', process.env.TTB_HOSTED_TEST_PORT ?? '5432', '-d', db], { env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', b => out += b); child.stderr.on('data', b => err += b);
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(Error(err)));
      child.stdin.end((role ? `SET ROLE "${role}"; ` : '') + query);
    });
  }
  const quote = (v: unknown) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
  const rpc = (name: 'spend' | 'review', op: string, input: unknown) => sql(`SELECT public.ttb_demo_${name}('${op}',${quote(input)})`, 'service_role');
  await sql(`CREATE ROLE "${owner}" NOLOGIN`, '', 'postgres');
  await sql(`CREATE DATABASE "${database}" OWNER "${owner}"`, '', 'postgres');
  try {
    await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
    for (const file of ['002_hosted_demo.sql', '003_photo_groups.sql', '004_bottle_semantics.sql', '005_azure_ocr_provider.sql']) await sql(readFileSync('db/migrations/' + file, 'utf8'));
    const f = await groupFixture(1), group = prepareGroupAssets(f.record, f.photos), p = group.assets[1];
    await rpc('review', 'snapshot_prepare', { id: group.id, record: group.recordText, key: p.key, sha256: p.sha256, bytes: p.bytes, mime: p.mime, assets: group.assets });
    await rpc('review', 'snapshot_commit', { id: group.id });
    const intent = { confirmed: true, outcome: 'second-review', notes: 'Synthetic budget migration fixture.' };
    const saved = await rpc('review', 'save', { comparisonId: group.id, idempotencyKey: randomUUID(), request: JSON.stringify({ comparisonId: group.id, intent }), intent: JSON.stringify(intent) });
    await rpc('review', 'upload_reserve', { id: randomUUID(), bytes: 42 });
    await sql("UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,custody_id=gen_random_uuid(),custody_sha256=repeat('a',64)");
    const oldBindings = Array.from({ length: 25 }, (_, i) => i % 2 ? bind() : { ...bind(), model: 'anthropic/claude-haiku-4.5', promptVersion: 'photo-set-observations-v2' } as SpendBinding);
    for (const binding of oldBindings) { const claimId = randomUUID(); await rpc('spend', 'reserve', { binding }); await rpc('spend', 'claim', { binding, claimId }); await rpc('spend', 'complete', { binding, claimId }); }
    await expect(rpc('spend', 'reserve', { binding: bind() })).rejects.toThrow('exhausted');
    const tables = ['ledger', 'holds', 'work', 'reviews', 'snapshots', 'snapshot_allocations', 'quota', 'uploads'];
    const inventory = async () => JSON.parse(await sql(`SELECT jsonb_build_object(${tables.map(t => `'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') FROM ttb_demo_private.${t} r)`).join(',')})`));
    const functions = () => sql("SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','ttb_demo_private')");
    const security = () => sql("SELECT jsonb_build_object('schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='ttb_demo_private'),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='ttb_demo_private'::regnamespace),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='ttb_demo_private'::regnamespace),'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='ttb_demo_private'))");
    const constraints = async () => JSON.parse(await sql("SELECT jsonb_agg(jsonb_build_object('name',conname,'table',conrelid::regclass::text,'def',pg_get_constraintdef(oid),'validated',convalidated) ORDER BY conrelid,conname) FROM pg_constraint WHERE connamespace='ttb_demo_private'::regnamespace")) as { name: string; table: string; def: string; validated: boolean }[];
    const before = await inventory(), fc = await functions(), sec = await security(), cc = await constraints();
    // 006 refuses in-flight work and leaves everything intact on failure.
    const workId = randomUUID(); await rpc('spend', 'acquire', { id: workId });
    await expect(sql(migration)).rejects.toThrow('quiescent ledger required'); await rpc('spend', 'release', { id: workId });
    expect(await inventory()).toEqual(before);
    await sql(migration);
    const after = await inventory(); expect(after.ledger).toEqual([{ ...before.ledger[0], ceiling: 50000000 }]);
    expect({ ...after, ledger: before.ledger }).toEqual(before); expect(await functions()).toBe(fc); expect(await security()).toBe(sec);
    expect(await constraints()).toEqual(cc.map(c => c.table === 'ttb_demo_private.ledger' && ['ledger_ceiling_check','ledger_check1'].includes(c.name) ? { ...c, def: c.def.replaceAll('25000000','50000000') } : c));
    expect(await sql("SELECT ceiling-incurred-(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('25000000');
    expect(JSON.parse(await rpc('review', 'detail', { id: JSON.parse(saved).reviewId })).record).toBe(group.recordText);
    await expect(sql(migration)).rejects.toThrow('expected existing funded $25 ledger'); expect(await inventory()).toEqual(after);
    for (const role of ['anon','authenticated']) await expect(sql("SELECT public.ttb_demo_spend('has_intent','{}')", role)).rejects.toThrow('permission denied');
    await expect(sql('SELECT * FROM ttb_demo_private.ledger', 'service_role')).rejects.toThrow('permission denied');
    const syntheticWork = vi.fn(async () => 'synthetic only');
    const store = { reserve: async (binding: SpendBinding) => JSON.parse(await rpc('spend','reserve',{binding})), claim: async (binding: SpendBinding, claimId: string) => JSON.parse(await rpc('spend','claim',{binding,claimId})), complete: async (binding: SpendBinding, claimId: string) => JSON.parse(await rpc('spend','complete',{binding,claimId})) };
    expect((await executeReserved(store, bind(), syntheticWork)).ok).toBe(true); expect(syntheticWork).toHaveBeenCalledTimes(1);
    for (const b of oldBindings) await expect(store.reserve(b)).rejects.toThrow();
    const claims = [bind(),bind(),bind()]; for (const b of claims) await store.reserve(b);
    const claimIds = [randomUUID(),randomUUID()]; await store.claim(claims[0],claimIds[0]); await store.claim(claims[1],claimIds[1]);
    await expect(store.claim(claims[2],randomUUID())).rejects.toThrow('busy');
    for (let i=0;i<2;i++) await store.complete(claims[i],claimIds[i]);
    await expect(rpc('spend','reserve',{ binding: { ...bind(),maxCostMicrousd:2000000 } })).rejects.toThrow('invalid binding');
    await expect(sql("BEGIN; UPDATE ttb_demo_private.ledger SET enabled=false; SELECT public.ttb_demo_spend('has_intent','{}'); ROLLBACK;")).rejects.toThrow('spend unavailable');
    for (const ceiling of [25000000,51000000,100000000]) await expect(sql(`UPDATE ttb_demo_private.ledger SET ceiling=${ceiling}`)).rejects.toThrow('check constraint');
    await expect(sql('UPDATE ttb_demo_private.ledger SET custody_id=null')).rejects.toThrow('check constraint');
    await expect(sql('DELETE FROM ttb_demo_private.holds')).rejects.toThrow('permanent liability');
    for (let i=29;i<49;i++) await store.reserve(bind());
    const race = await Promise.allSettled([store.reserve(bind()),store.reserve(bind())]); expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await expect(store.reserve(bind())).rejects.toThrow('exhausted');
    expect(await sql("SELECT ceiling||':'||incurred||':'||(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('50000000:0:50000000');
  } finally { await sql(`DROP DATABASE "${database}"`, '', 'postgres'); await sql(`DROP ROLE "${owner}"`, '', 'postgres'); }
}, 120000);
