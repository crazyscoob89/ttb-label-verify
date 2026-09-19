import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { createOpenRouterProvider, OPENROUTER_ENDPOINT, OPENROUTER_MODEL } from '../lib/extraction/openrouter';
import { createFixtureProvider } from '../lib/extraction/fixture-provider';
import { EXTRACTION_LIMITS, type ExtractionRequest } from '../lib/extraction/provider';
import { compareApplication, WARNING_REFERENCE } from '../lib/rules';
import fixtures from './fixtures/comparisons.json';
import { OfflineSpendStore } from './helpers/offline-spend-store';

const request = (): ExtractionRequest => ({ image: Buffer.from('offline synthetic image'), mimeType: 'image/png', reservationId: randomUUID(), attemptId: randomUUID() });
const envelope = (content = JSON.stringify(fixtures.evidence)) => ({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { cost: 0 } });
const response = (value: unknown = envelope()) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function setup(transport = vi.fn(async (_url: string, _init: RequestInit) => response())) {
  const store = new OfflineSpendStore();
  const provider = createOpenRouterProvider({ authorized: true, apiKey: 'offline-test-key', maxCostMicrousd: 100, store, transport });
  return { provider, store, transport };
}
afterEach(() => vi.useRealTimers());

test('default provider denies without network', async () => {
  const network = vi.fn(); vi.stubGlobal('fetch', network);
  try { expect(await createOpenRouterProvider().extract(request())).toEqual({ processing: 'failed', code: 'unconfigured' }); expect(network).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});
test.each([undefined, false, 'true'])('authorization %s cannot dispatch via adapter directly', async authorized => {
  const transport = vi.fn(); const store = new OfflineSpendStore();
  const p = createOpenRouterProvider({ authorized: authorized as boolean, apiKey: 'offline', maxCostMicrousd: 100, store, transport });
  expect((await p.extract(request())).processing).toBe('failed'); expect(transport).not.toHaveBeenCalled(); expect(store.rows.size).toBe(0);
});
test('extracts strict evidence with bound provenance, no verdict and no cost release', async () => {
  const { provider, store, transport } = setup(); const req = request();
  const result = await provider.extract(req); expect(result.processing).toBe('complete');
  if (result.processing !== 'complete') throw new Error('Expected evidence');
  expect(result.evidence).toEqual(fixtures.evidence);
  expect(result.metadata).toMatchObject({ source: 'openrouter', model: OPENROUTER_MODEL, schemaVersion: 1, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'image-observations-v1', imageSha256: createHash('sha256').update(req.image).digest('hex'), reservationId: req.reservationId, attemptId: req.attemptId });
  expect(result.metadata.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(result).not.toHaveProperty('verdict'); expect(result).not.toHaveProperty('usage');
  expect(compareApplication(fixtures.application, result.evidence).processing).toBe('complete');
  expect(transport).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
});
test('wire request is fixed no-tools image-only, no canonical answers or silent fallback', async () => {
  const { provider, transport } = setup(); await provider.extract(request());
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0]; const body = JSON.parse(init.body as string);
  expect(url).toBe(OPENROUTER_ENDPOINT); expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(init.redirect).toBe('error'); expect(init.method).toBe('POST'); expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(body.model).toBe('anthropic/claude-haiku-4.5'); expect(body.models).toBeUndefined();
  expect(body.provider).toEqual({ allow_fallbacks: false, require_parameters: true });
  expect(body.tools).toBeUndefined(); expect(body.functions).toBeUndefined();
  expect(body.max_tokens).toBe(EXTRACTION_LIMITS.outputTokens); expect(body.temperature).toBe(0); expect(body.stream).toBe(false);
  expect(body.response_format).toEqual({ type: 'json_object' });
  expect(body.messages[1].content).toHaveLength(1); expect(body.messages[1].content[0].type).toBe('image_url');
  expect(body.messages[0].content).toMatch(/untrusted/i); expect(body.messages[0].content).toMatch(/schemaVersion/);
  expect(JSON.stringify(body)).not.toContain(WARNING_REFERENCE.body); expect(JSON.stringify(body)).not.toContain(WARNING_REFERENCE.heading);
  expect(JSON.stringify(body)).not.toContain(fixtures.application.brand);
});
test('image is snapshotted before awaiting store; hash and wire bytes agree', async () => {
  const { provider, store, transport } = setup(); const req = request(); const original = Buffer.from(req.image);
  const reserve = store.reserve.bind(store); store.reserve = async b => { req.image.fill(0); return reserve(b); };
  const result = await provider.extract(req); expect(result.processing).toBe('complete');
  const wire = JSON.parse(transport.mock.calls[0][1].body as string).messages[1].content[0].image_url.url;
  expect(wire).toBe(`data:image/png;base64,${original.toString('base64')}`);
  if (result.processing === 'complete') expect(result.metadata.imageSha256).toBe(createHash('sha256').update(original).digest('hex'));
});
test.each([
  { id: 'invalid JSON', content: 'invalid JSON' },
  { id: 'missing schema', content: '{}' },
  { id: 'provider verdict', content: JSON.stringify({ ...fixtures.evidence, verdict: 'match' }) },
  { id: 'wrong version', content: JSON.stringify({ ...fixtures.evidence, schemaVersion: 2 }) },
])('invalid evidence never yields comparison or raw error: $id', async ({ content }) => {
  const { provider, store } = setup(vi.fn(async () => response(envelope(content))));
  const result = await provider.extract(request()); expect(result).toEqual({ processing: 'failed', code: 'provider-failed' });
  expect(result).not.toHaveProperty('evidence'); expect(compareApplication(fixtures.application, result).processing).toBe('failed'); expect(store.unresolved).toBe(100);
});
test.each([301, 401, 429, 500])('HTTP %s fails without retries or raw response', async status => {
  const { provider, transport, store } = setup(vi.fn(async () => new Response('private response', { status })));
  expect(await provider.extract(request())).toEqual({ processing: 'failed', code: 'provider-failed' }); expect(transport).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
});
test.each(['length', 'tools', 'multi', 'role', 'null', 'refusal', 'model', 'error', 'unknown'])('invalid envelope %s cannot yield evidence', async fault => {
  const value: any = envelope();
  if (fault === 'length') value.choices[0].finish_reason = 'length';
  if (fault === 'tools') value.choices[0].message.tool_calls = [{ function: { name: 'attack' } }];
  if (fault === 'multi') value.choices.push(value.choices[0]);
  if (fault === 'role') value.choices[0].message.role = 'user';
  if (fault === 'null') value.choices[0].message.content = null;
  if (fault === 'refusal') value.choices[0].message.refusal = 'refused';
  if (fault === 'model') value.model = 'other/model';
  if (fault === 'error') value.error = { message: 'private upstream failure' };
  if (fault === 'unknown') value.verdict = 'match';
  const { provider, store, transport } = setup(vi.fn(async () => response(value)));
  expect(await provider.extract(request())).toEqual({ processing: 'failed', code: 'provider-failed' });
  expect(transport).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
});
test.each(['empty', 'oversized', 'mime', 'extra', 'identity'])('invalid request %s denied before reservation/network', async fault => {
  const req: any = request();
  if (fault === 'empty') req.image = Buffer.alloc(0);
  if (fault === 'oversized') req.image = Buffer.alloc(EXTRACTION_LIMITS.inputBytes + 1);
  if (fault === 'mime') req.mimeType = 'image/svg+xml';
  if (fault === 'extra') req.application = fixtures.application;
  if (fault === 'identity') req.attemptId = 'not-a-uuid';
  const { provider, store, transport } = setup(); expect((await provider.extract(req)).processing).toBe('failed'); expect(store.rows.size).toBe(0); expect(transport).not.toHaveBeenCalled();
});
test('response limit enforced on streamed chunks before complete JSON parsing', async () => {
  const cancel = vi.fn(); let pulled = 0;
  const stream = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(EXTRACTION_LIMITS.responseBytes + 1)); }, cancel });
  const { provider, store } = setup(vi.fn(async () => new Response(stream)));
  expect((await provider.extract(request())).processing).toBe('failed'); expect(cancel).toHaveBeenCalled(); expect(pulled).toBeLessThan(4); expect(store.unresolved).toBe(100);
});
test('extraction timeout matches the planned 20-second limit', () => {
  expect(EXTRACTION_LIMITS.timeoutMs).toBe(20000);
});
test.each(['headers', 'stream'])('timeout includes %s and leaves liability, no same-key retry', async stage => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const transport = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> => stage === 'headers' ? new Promise(() => {}) : new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel })));
  const { provider, store } = setup(transport); const req = request(); const result = provider.extract(req);
  await vi.advanceTimersByTimeAsync(EXTRACTION_LIMITS.timeoutMs + 1);
  expect(await result).toEqual({ processing: 'failed', code: 'provider-failed' }); expect(store.unresolved).toBe(100);
  expect(transport.mock.calls[0][1].signal?.aborted).toBe(true);
  if (stage === 'stream') expect(cancel).toHaveBeenCalled();
  expect((await provider.extract(req)).processing).toBe('failed'); expect(transport).toHaveBeenCalledTimes(1);
});
test('store outages and invalid completion prevent evidence', async () => {
  for (const stage of ['reserve', 'claim', 'complete'] as const) {
    const { provider, store, transport } = setup(); store.fail = stage;
    expect(await provider.extract(request())).toEqual({ processing: 'failed', code: 'spend-unavailable' }); expect(transport).toHaveBeenCalledTimes(stage === 'complete' ? 1 : 0);
  }
});
test('unexpected transport exception sanitized and no fallback', async () => {
  const { provider, transport, store } = setup(vi.fn(async () => { throw new Error('offline-test-key PRIVATE IMAGE'); }));
  expect(await provider.extract(request())).toEqual({ processing: 'failed', code: 'provider-failed' }); expect(transport).toHaveBeenCalledTimes(1); expect(store.unresolved).toBe(100);
});
test('racing provider calls dispatch once; explicit new attempt consumes another hold', async () => {
  const { provider, store, transport } = setup(); const req = request();
  const results = await Promise.all(Array.from({ length: 20 }, () => provider.extract(req)));
  expect(results.filter(r => r.processing === 'complete')).toHaveLength(1); expect(transport).toHaveBeenCalledTimes(1);
  expect((await provider.extract(request())).processing).toBe('complete'); expect(transport).toHaveBeenCalledTimes(2); expect(store.unresolved).toBe(200);
});
test.each(['key', 'store', 'amount'] as const)('missing dependency %s blocks even explicit authorization', async missing => {
  const transport = vi.fn(); const store = new OfflineSpendStore();
  const deps = { authorized: true, apiKey: 'offline', store, maxCostMicrousd: 100, transport };
  delete (deps as Partial<typeof deps>)[{ key: 'apiKey', store: 'store', amount: 'maxCostMicrousd' }[missing] as keyof typeof deps];
  expect((await createOpenRouterProvider(deps).extract(request())).processing).toBe('failed'); expect(transport).not.toHaveBeenCalled();
});
test('authorization configuration is snapshotted and client runtime is denied', async () => {
  const transport = vi.fn(async () => response()); const store = new OfflineSpendStore();
  const deps = { authorized: false, apiKey: 'offline', store, maxCostMicrousd: 100, transport };
  const denied = createOpenRouterProvider(deps); deps.authorized = true;
  expect((await denied.extract(request())).processing).toBe('failed');
  const authorized = createOpenRouterProvider(deps); vi.stubGlobal('window', {});
  try { expect((await authorized.extract(request())).processing).toBe('failed'); expect(transport).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});
test('shared image memory is rejected before dispatch', async () => {
  const { provider, transport } = setup(); const req = request(); req.image = new Uint8Array(new SharedArrayBuffer(20));
  expect((await provider.extract(req)).processing).toBe('failed'); expect(transport).not.toHaveBeenCalled();
});
test.each(['declared size', 'invalid utf8', 'malformed JSON', 'redirected'])('response %s fails with held liability', async fault => {
  const r = fault === 'declared size' ? new Response('{}', { headers: { 'Content-Length': String(EXTRACTION_LIMITS.responseBytes + 1) } }) :
    fault === 'invalid utf8' ? new Response(new Uint8Array([0xff])) : fault === 'malformed JSON' ? new Response('{') : response();
  if (fault === 'redirected') Object.defineProperty(r, 'redirected', { value: true });
  const { provider, store, transport } = setup(vi.fn(async () => r));
  expect(await provider.extract(request())).toEqual({ processing: 'failed', code: 'provider-failed' }); expect(store.unresolved).toBe(100); expect(transport).toHaveBeenCalledTimes(1);
});
test('fixture provider is explicitly offline and cannot claim real extraction', async () => {
  const p = createFixtureProvider(fixtures.evidence); const result = await p.extract(request());
  expect(result.processing).toBe('complete'); if (result.processing !== 'complete') throw new Error('Expected fixture');
  expect(result.metadata.source).toBe('fixture'); expect(result.metadata.model).toBe('offline-fixture'); expect(result.metadata).not.toHaveProperty('reservationId');
  expect(result.evidence).toEqual(fixtures.evidence);
  expect((await createFixtureProvider({}).extract(request())).processing).toBe('failed');
});
