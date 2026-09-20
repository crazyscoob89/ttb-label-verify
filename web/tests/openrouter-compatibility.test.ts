import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createOpenRouterProvider } from '../lib/extraction/openrouter';
import { parseExtractionEvidence } from '../lib/extraction/schema';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import captured from './fixtures/openrouter-captured-completion.json';
import fixtures from './fixtures/comparisons.json';

// Exact completion envelope from the synthetic-label live acceptance on 2026-09-20.
// Only the completion JSON value was copied from transport.jsonl; no requests,
// credentials, catalog or production ledger. Replay uses an in-memory test store.
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in offline replay'); })));
afterEach(() => vi.unstubAllGlobals());

const json = JSON.stringify(fixtures.evidence);
const fence = (body: string) => `\`\`\`json\n${body}\n\`\`\``;
const envelope = (content: string) => ({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }] });
async function replay(value: unknown) {
  const store = new OfflineSpendStore();
  const transport = vi.fn(async () => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
  const provider = createOpenRouterProvider({ authorized: true, apiKey: 'offline-test-key', maxCostMicrousd: 100, store, transport });
  const request = { image: Buffer.from('offline synthetic image'), mimeType: 'image/png' as const, reservationId: randomUUID(), attemptId: randomUUID() };
  const result = await provider.extract(request);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(store.unresolved).toBe(100); // Usage/cost metadata never releases liability.
  expect((await provider.extract(request)).processing).toBe('failed');
  expect(transport).toHaveBeenCalledTimes(1); // No retry, even after a parsing failure.
  return result;
}

test('exact captured OpenRouter completion replays offline without changing its content or metadata', async () => {
  expect(captured.service_tier).toBe('default');
  expect(captured.choices[0].native_finish_reason).toBe('end_turn');
  expect(captured.choices[0].message.reasoning).toBeNull();
  const result = await replay(captured);
  expect(result.processing).toBe('complete');
  if (result.processing !== 'complete') throw new Error('Expected captured evidence');
  // Independently remove the known fixture wrapper to check ALL evidence verbatim.
  const expected = parseExtractionEvidence(JSON.parse(captured.choices[0].message.content.slice('```json\n'.length, -'\n```'.length)));
  expect(result.evidence).toEqual(expected);
  expect(result).not.toHaveProperty('usage');
  expect(result).not.toHaveProperty('service_tier');
  expect(result.metadata).not.toHaveProperty('reasoning');
});

test('captured metadata is accepted independently of fenced-content support', async () => {
  const value = structuredClone(captured);
  value.choices[0].message.content = json;
  expect(await replay(value)).toMatchObject({ processing: 'complete', evidence: fixtures.evidence });
});

test.each([
  { id: 'bare JSON', content: json },
  { id: 'bare JSON with whitespace', content: ` \r\n${json}\t\n` },
  { id: 'single json fence', content: fence(json) },
  { id: 'single untagged fence', content: `\`\`\`\n${json}\n\`\`\`` },
  { id: 'single fence with CRLF and surrounding whitespace', content: ` \r\n\`\`\`json\r\n${json}\r\n\`\`\`\t\r\n` },
])('accepts only complete JSON: $id', async ({ content }) => {
  expect(await replay(envelope(content))).toMatchObject({ processing: 'complete', evidence: fixtures.evidence });
});

test.each([
  { id: 'multiple fences', content: `${fence(json)}\n${fence(json)}` },
  { id: 'prose before fence', content: `Here is the result:\n${fence(json)}` },
  { id: 'prose after fence', content: `${fence(json)}\nApproved.` },
  { id: 'prose around bare JSON', content: `Result: ${json}` },
  { id: 'two bare objects', content: `${json}\n${json}` },
  { id: 'two objects inside fence', content: fence(`${json}\n${json}`) },
  { id: 'wrong fence language', content: `\`\`\`javascript\n${json}\n\`\`\`` },
  { id: 'inline fence', content: `\`\`\`json ${json}\`\`\`` },
  { id: 'nested fence', content: fence(fence(json)) },
  { id: 'unclosed fence', content: `\`\`\`json\n${json}` },
  { id: 'truncated closing fence', content: `\`\`\`json\n${json}\n\`\`` },
  { id: 'truncated bare JSON despite stop', content: json.slice(0, -1) },
  { id: 'truncated fenced JSON despite stop', content: fence(json.slice(0, -1)) },
  { id: 'malformed bare JSON', content: '{"schemaVersion":1,}' },
  { id: 'malformed fenced JSON', content: fence('{"schemaVersion":1,}') },
  { id: 'unknown extraction key', content: fence(JSON.stringify({ ...fixtures.evidence, verdict: 'match' })) },
  { id: 'unknown nested extraction key', content: fence(JSON.stringify({ ...fixtures.evidence, brand: { ...fixtures.evidence.brand, verdict: 'match' } })) },
  { id: 'missing evidence', content: fence('{}') },
  { id: 'array instead of object', content: fence(`[${json}]`) },
  { id: 'null instead of object', content: fence('null') },
  { id: 'empty content', content: '' },
])('fails closed without salvaging content: $id', async ({ content }) => {
  expect(await replay(envelope(content))).toEqual({ processing: 'failed', code: 'provider-failed' });
});

type MutableEnvelope = { service_tier?: unknown; error?: unknown; choices: { native_finish_reason?: unknown; finish_reason?: unknown; error?: unknown; message: Record<string, unknown> }[] };
const invalidEnvelopes: { id: string; change: (value: MutableEnvelope) => void }[] = [
  { id: 'truncated finish reason with valid fenced content', change: v => { v.choices[0].finish_reason = 'length'; } },
  { id: 'native truncation despite stop', change: v => { v.choices[0].native_finish_reason = 'max_tokens'; } },
  { id: 'native refusal despite stop', change: v => { v.choices[0].native_finish_reason = 'refusal'; } },
  { id: 'native error despite stop', change: v => { v.choices[0].native_finish_reason = 'error'; } },
  { id: 'refusal with valid content', change: v => { v.choices[0].message.refusal = 'Cannot comply'; } },
  { id: 'root error with valid content', change: v => { v.error = { message: 'upstream failure' }; } },
  { id: 'choice error with valid content', change: v => { v.choices[0].error = { message: 'upstream failure' }; } },
  { id: 'message error with valid content', change: v => { v.choices[0].message.error = { message: 'upstream failure' }; } },
  { id: 'missing content', change: v => { delete v.choices[0].message.content; } },
  { id: 'null content', change: v => { v.choices[0].message.content = null; } },
  { id: 'structured content', change: v => { v.choices[0].message.content = [{ type: 'text', text: json }]; } },
  { id: 'non-null reasoning', change: v => { v.choices[0].message.reasoning = 'unrequested reasoning'; } },
  { id: 'invalid service tier type', change: v => { v.service_tier = {}; } },
  { id: 'oversized service tier', change: v => { v.service_tier = 'x'.repeat(257); } },
  { id: 'invalid native finish type', change: v => { v.choices[0].native_finish_reason = {}; } },
  { id: 'oversized native finish reason', change: v => { v.choices[0].native_finish_reason = 'x'.repeat(257); } },
];
test.each(invalidEnvelopes)('captured envelope still rejects $id', async ({ change }) => {
  const value: MutableEnvelope = structuredClone(captured);
  change(value);
  expect(await replay(value)).toEqual({ processing: 'failed', code: 'provider-failed' });
});
