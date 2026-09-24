import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { createDemoHandler } from '../lib/demo-route';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { privateLedgerDir } from './fixtures/private-ledger';
import { image } from './fixtures/synthetic';
import fixtures from './fixtures/comparisons.json';

// Real Windows PowerShell ACL checks can exceed Vitest's default test timeout.
if (process.platform === 'win32') vi.setConfig({ testTimeout: 60_000 });

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const secret = 'synthetic-only-access-code-0123456789abcdef';
const intent = () => ({ attemptId: randomUUID(), reservationId: randomUUID(), batchId: randomUUID(), pairId: 'filename:label.png', revision: 1 });
function setup() {
  const dir = privateLedgerDir(); dirs.push(dir);
  const path = join(dir, 'spend.sqlite'); SqliteSpendStore.provision(path);
  const transport = vi.fn(async (url: string) => url.endsWith('/models')
    ? Response.json({ data: [{ id: 'anthropic/claude-haiku-4.5', context_length: 200000, pricing: { prompt: '0.000001', completion: '0.000005' } }] })
    : Response.json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(fixtures.evidence) } }] }));
  const env = { TTB_DEMO_ENABLED: 'true', TTB_DEMO_ACCESS_SECRET: secret, TTB_DEMO_ORIGIN: 'https://demo.example', TTB_DEMO_DATA_DIR: dir, TTB_DEMO_PERSISTENT_VOLUME: 'single-private-volume-v1', OPENROUTER_API_KEY: 'synthetic-key' };
  return { path, env, transport, handler: createDemoHandler({ env, transport }) };
}
async function request(phase: string, options: { binding?: string; token?: ReturnType<typeof intent>; app?: unknown; bytes?: Uint8Array<ArrayBuffer>; extra?: boolean } = {}) {
  const form = new FormData();
  form.set('image', new File([options.bytes ?? new Uint8Array(await image())], 'label.png', { type: 'image/png' }));
  form.set('application', JSON.stringify(options.app ?? fixtures.application));
  if (options.extra) form.set('maxCostMicrousd', '1');
  const headers: Record<string, string> = { origin: 'https://demo.example', 'x-ttb-demo-code': secret, 'x-ttb-batch-phase': phase };
  if (options.binding) headers['x-ttb-batch-binding'] = options.binding;
  if (options.token) headers['x-ttb-batch-intent'] = JSON.stringify(options.token);
  return new Request('https://demo.example/api/comparisons', { method: 'POST', headers, body: form });
}
async function prepare(s: ReturnType<typeof setup>, app: unknown = fixtures.application) {
  const response = await s.handler(await request('prepare', { app }));
  expect(response.status).toBe(200);
  const value = await response.json();
  expect(value.prepared.imageSha256).toMatch(/^[a-f0-9]{64}$/);
  return value.prepared as { imageSha256: string; binding: string };
}

test('preparation sanitizes on server, binds application, and never reserves or dispatches', async () => {
  const s = setup();
  const bytes = new Uint8Array(await sharp(await image()).withMetadata().png().toBuffer());
  const response = await s.handler(await request('prepare', { bytes }));
  expect(response.status).toBe(200);
  const { prepared } = await response.json();
  expect(prepared.imageSha256).not.toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(s.transport).not.toHaveBeenCalled();
  const store = new SqliteSpendStore(s.path); expect(store.totals().unresolvedMicrousd).toBe(0); store.close();
  const bad = await s.handler(await request('prepare', { bytes: new TextEncoder().encode('not a png') }));
  expect(bad.status).toBe(400); expect(s.transport).not.toHaveBeenCalled();
});

test('same intent survives handler restart without another dispatch or hold; changed IDs do not evade dedup', async () => {
  const s = setup(); const { binding } = await prepare(s); const token = intent();
  expect((await s.handler(await request('execute', { binding, token }))).status).toBe(200);
  const restarted = createDemoHandler({ env: s.env, transport: s.transport });
  for (const replay of [token, { ...token, reservationId: randomUUID() }, { ...token, attemptId: randomUUID() }]) {
    const response = await restarted(await request('execute', { binding, token: replay }));
    expect(response.status).toBe(409); expect((await response.json()).code).toBe('attempt-already-recorded');
  }
  expect(s.transport).toHaveBeenCalledTimes(2);
  const store = new SqliteSpendStore(s.path); expect(store.totals().unresolvedMicrousd).toBe(1_000_000); store.close();
});

test('failed paid intent remains consumed with its full hold; replay never dispatches again', async () => {
  const s = setup(); const { binding } = await prepare(s); const token = intent();
  const original = s.transport.getMockImplementation()!;
  s.transport.mockImplementation(async url => url.endsWith('/models') ? original(url) : Response.json({error:'synthetic failure'},{status:500}));
  expect((await s.handler(await request('execute', { binding, token }))).status).toBe(502);
  expect((await createDemoHandler({env:s.env,transport:s.transport})(await request('execute', { binding, token }))).status).toBe(409);
  expect(s.transport).toHaveBeenCalledTimes(2);
  const store = new SqliteSpendStore(s.path); expect(store.totals().unresolvedMicrousd).toBe(1_000_000); store.close();
});

test('edited application needs new preparation and explicit new attempt; no trusted browser hash/cost', async () => {
  const s = setup(); const { binding } = await prepare(s); const token = intent();
  const app = { ...fixtures.application, applicationVersion: 'v2', brand: 'Edited brand' };
  expect((await s.handler(await request('execute', { binding, token, app }))).status).toBe(400);
  const differentImage = new Uint8Array(await sharp(await image()).resize(40,40).png().toBuffer());
  expect((await s.handler(await request('execute', { binding, token, bytes: differentImage }))).status).toBe(400);
  expect((await s.handler(await request('execute', { binding: '0'.repeat(64) + '.' + '0'.repeat(64), token }))).status).toBe(400);
  expect((await s.handler(await request('execute', { binding, token, extra: true }))).status).toBe(400);
  expect(s.transport).not.toHaveBeenCalled();
  const next = await prepare(s, app);
  const response = await s.handler(await request('execute', { binding: next.binding, token: { ...intent(), revision: 2 }, app }));
  const payload = await response.json(); expect(response.status).toBe(200);
  expect(payload.result.application).toEqual(app); expect(payload.result.imageSha256).toBe(next.imageSha256);
});

test('two server slots admit work, third fails closed and duplicate racing intent dispatches once', async () => {
  const s = setup(); const { binding } = await prepare(s);
  const original = s.transport.getMockImplementation()!;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  s.transport.mockImplementation(async url => { if (!url.endsWith('/models')) await gate; return original(url); });
  const a = intent(), b = intent();
  const first = s.handler(await request('execute', { binding, token: a }));
  const second = s.handler(await request('execute', { binding, token: b }));
  try {
    // Windows ledger ACL inspection spawns PowerShell (~400-800ms per store open),
    // so concurrent executes can take well over vi.waitFor's 1s default to reach
    // dispatch. The gate must be released on EVERY exit path and the in-flight
    // handlers awaited before afterEach deletes the fixture dir, otherwise the
    // still-open spend.sqlite handle makes rmSync fail with EBUSY.
    await vi.waitFor(() => expect(s.transport).toHaveBeenCalledTimes(4), { timeout: 30_000 });
    expect((await s.handler(await request('execute', { binding, token: intent() }))).status).toBe(429);
  } finally { release(); await Promise.allSettled([first, second]); }
  expect((await first).status).toBe(200); expect((await second).status).toBe(200);
  const c = intent(); const replies = await Promise.all([s.handler(await request('execute', { binding, token: c })), s.handler(await request('execute', { binding, token: c }))]);
  expect(replies.filter(r => r.status === 200)).toHaveLength(1);
  expect(s.transport).toHaveBeenCalledTimes(6);
});
