import { describe, it, expect, vi } from 'vitest';
import { createComparisonService } from '../lib/compare-service';
import { POST } from '../app/api/comparisons/route';
import { fixtureDemoEnabled } from '../lib/access';
import { createFixtureProvider } from '../lib/extraction/fixture-provider';
import { image, application } from './fixtures/synthetic';
import fixture from './fixtures/comparisons.json';

const input = async () => ({ file: { filename: 'label.png', mime: 'image/png' as const, bytes: await image() }, binding: { filename: 'label.png', application: structuredClone(application) } });
const provider = () => createFixtureProvider(fixture.evidence);
const trusted = () => true;
describe('offline comparison composition', () => {
  it('denies by default without provider dispatch or touching input', async () => {
    const extract = vi.fn();
    const run = createComparisonService({ provider: { extract } });
    expect(await run({ get file() { throw Error('must not read'); } } as never)).toMatchObject({ processing: 'failed', code: 'access-denied' });
    expect(extract).not.toHaveBeenCalled();
  });
  it('route denies before request body parsing, including forged authorization', async () => {
    const request = new Request('http://localhost/api/comparisons', { method: 'POST', body: '{"authorized":true}', headers: { authorization: 'Bearer forged' } });
    const response = await POST(request);
    expect(response.status).toBe(403); expect(request.bodyUsed).toBe(false);
  });
  it('production can never enable the fixture demonstration', () => {
    expect(fixtureDemoEnabled('production', '1')).toBe(false);
    expect(fixtureDemoEnabled('development', '1')).toBe(true);
    expect(fixtureDemoEnabled('development', undefined)).toBe(false);
  });
  it('composes sanitized image, strict application and rules with retained binding', async () => {
    const result = await createComparisonService({ authorize: trusted, provider: provider() })(await input());
    expect(result.processing).toBe('complete');
    if (result.processing !== 'complete') return;
    expect(result.application.applicationVersion).toBe('v1');
    expect(result.imageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.source).toBe('fixture');
    expect(Object.keys(result.comparison.fields)).toHaveLength(7);
    expect(result.comparison.fields.brand.status).toBe('mismatch');
    expect(Object.isFrozen(result.comparison.fields.brand.observed)).toBe(true);
  });
  it('snapshots application and bytes before asynchronous access', async () => {
    let release!: (value: boolean) => void;
    const gate = new Promise<boolean>(r => { release = r; });
    const data = await input();
    const promise = createComparisonService({ authorize: () => gate, provider: provider() })(data);
    data.binding.application.brand = 'Mutated'; data.file.bytes.fill(0); release(true);
    const result = await promise;
    expect(result.processing).toBe('complete');
    if (result.processing === 'complete') expect(result.application.brand).toBe('Sample Brand');
  });
  it.each(['hash', 'extra', 'evidence', 'source'])('rejects provider %s corruption', async (kind: string) => {
    const base = provider();
    const run = createComparisonService({ authorize: trusted, provider: { async extract(req) {
      const result = await base.extract(req);
      if (result.processing === 'complete') {
        if (kind === 'hash') result.metadata.imageSha256 = '0'.repeat(64);
        if (kind === 'source') result.metadata.source = 'openrouter';
        if (kind === 'extra') Object.assign(result.metadata, { verdict: 'pass' });
        if (kind === 'evidence') Object.assign(result.evidence, { verdict: 'pass' });
      }
      return result;
    } } });
    expect(await run(await input())).toMatchObject({ processing: 'failed', code: 'invalid-extraction' });
  });
  it('handles corrupt image with no content leak or provider call', async () => {
    const extract = vi.fn(); const data = await input(); data.file.bytes = Buffer.from('private payload');
    const result = await createComparisonService({ authorize: trusted, provider: { extract } })(data);
    expect(result).toEqual({ processing: 'failed', code: 'invalid-input' }); expect(extract).not.toHaveBeenCalled();
  });
  it('bounds a hung provider, distinguishes cancellation and never creates fields on failure', async () => {
    const run = createComparisonService({ authorize: trusted, provider: { extract: () => new Promise(() => {}) }, timeoutMs: 15 });
    expect(await run(await input())).toEqual({ processing: 'failed', code: 'timeout' });
    const abort = new AbortController(); abort.abort();
    expect(await run(await input(), abort.signal)).toEqual({ processing: 'failed', code: 'cancelled' });
  });
  it('awaits async snapshot acknowledgment without losing completed extraction to its old deadline', async () => {
    let committed=false;
    const run=createComparisonService({authorize:trusted,provider:provider(),timeoutMs:100,completed:async()=>{await new Promise(r=>setTimeout(r,150));committed=true;}});
    expect((await run(await input())).processing).toBe('complete');expect(committed).toBe(true);
  });
  it('snapshot rejection preserves complete comparison and late provider completion never snapshots', async () => {
    expect((await createComparisonService({authorize:trusted,provider:provider(),completed:async()=>{throw Error('storage');}})(await input())).processing).toBe('complete');
    const completed=vi.fn();const base=provider();
    const run=createComparisonService({authorize:trusted,timeoutMs:10,provider:{extract:async(req)=>{await new Promise(r=>setTimeout(r,40));return base.extract(req);}},completed});
    expect(await run(await input())).toMatchObject({code:'timeout'});await new Promise(r=>setTimeout(r,60));expect(completed).not.toHaveBeenCalled();
  });
  it('maps thrown provider errors to content-free processing failure', async () => {
    expect(await createComparisonService({ authorize: trusted, provider: { extract: async () => { throw Error('secret payload'); } } })(await input())).toEqual({ processing: 'failed', code: 'provider-failed' });
  });
});
