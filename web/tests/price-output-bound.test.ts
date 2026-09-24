import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { priceCheckedTransport } from '../lib/demo-route';
import { OPENROUTER_ENDPOINT, OPENROUTER_MODEL } from '../lib/extraction/openrouter';

const network = vi.fn(() => { throw Error('External network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

function request(max_tokens: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify({ model: OPENROUTER_MODEL, max_tokens, temperature: 0, stream: false, provider: { allow_fallbacks: false, require_parameters: true }, response_format: { type: 'json_object' }, messages: [] }) };
}
function setup(cap: 3000 | 6000) {
  const transport = vi.fn(async (url: string, _init: RequestInit) => url.endsWith('/models')
    ? Response.json({ data: [{ id: OPENROUTER_MODEL, context_length: 200000, pricing: { prompt: '0.000001', completion: '0.000005' } }] })
    : Response.json({ offline: true }));
  return { transport, guarded: priceCheckedTransport(transport, cap) };
}

test.each([3000, 6000] as const)('pricing cap %s accepts only bounded positive integer output allowances', async cap => {
  for (const tokens of [1, 1700, cap]) {
    const s = setup(cap);
    await expect(s.guarded(OPENROUTER_ENDPOINT, request(tokens))).resolves.toBeInstanceOf(Response);
    expect(s.transport).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(s.transport.mock.calls[1][1].body));
    expect(payload.max_tokens).toBe(tokens);
    expect(payload.provider.max_price).toEqual({ prompt: 1, completion: 5 });
  }
});

test.each([3000, 6000] as const)('pricing cap %s rejects malformed/unbounded output without dispatch', async cap => {
  for (const tokens of [undefined, null, true, '1700', 0, -1, 1.5, cap + 1, Number.MAX_SAFE_INTEGER + 1]) {
    const s = setup(cap);
    await expect(s.guarded(OPENROUTER_ENDPOINT, request(tokens))).rejects.toThrow('Unexpected paid request');
    expect(s.transport).toHaveBeenCalledTimes(1);
    expect(s.transport.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/models');
  }
});
