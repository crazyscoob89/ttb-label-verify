import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { samples, compareOfflineSample } from '../lib/offline-demo';
import { createComparisonService } from '../lib/compare-service';
import { createFixtureProvider } from '../lib/extraction/fixture-provider';

it.each(['match','discrepancy','uncertainty','failure'] as const)('binds %s to exact normalized PNG and independently fixed evidence', async (id: keyof typeof samples) => {
  const sample = samples[id];
  const bytes = await readFile(`public${sample.imagePath}`);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(sample.imageSha256);
  const result = await compareOfflineSample(id, sample.application, bytes);
  if (id === 'failure') { expect(result).toEqual({ processing: 'failed', code: 'provider-failed' }); return; }
  expect(result.processing).toBe('complete');
  if (result.processing !== 'complete') return;
  expect(result.comparison.fields.abv.status).toBe(({match:'match',discrepancy:'mismatch',uncertainty:'needs-review'})[id]);
  const service = await createComparisonService({ authorize: () => true, provider: createFixtureProvider(sample.evidence) })({ file:{ filename:`${id}.png`, mime:'image/png', bytes }, binding:{filename:`${id}.png`, application:sample.application} });
  expect(service).toEqual(result);
});
it('rejects unrelated image bytes and missing application; applicant edits never rewrite observations', async () => {
  const sample = samples.match;
  expect(await compareOfflineSample('match', sample.application, new Uint8Array([1,2]))).toMatchObject({processing:'failed'});
  const bytes = await readFile(`public${sample.imagePath}`);
  expect(await compareOfflineSample('match', {}, bytes)).toMatchObject({processing:'failed'});
  const result = await compareOfflineSample('match', {...sample.application, abv:99}, bytes);
  expect(result.processing).toBe('complete');
  if (result.processing === 'complete') { expect(result.evidence.abv.text).toBe('40%'); expect(result.comparison.fields.abv.status).toBe('mismatch'); }
});
