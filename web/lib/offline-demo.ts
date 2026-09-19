import catalog from './offline-samples.json';
import { parseApplication, MAX_IMAGE_BYTES } from './contracts';
import { RULES_VERSION } from './rules';
import { finalizeComparison, immutable, type ComparisonRecord } from './comparison-record';

export const samples = immutable(catalog);
export type Scenario = keyof typeof samples;
/** Browser-only fixture path; no uploads/API/provider authority. Exact committed
 * normalized PNG bytes must match before fixed evidence can be displayed. */
export async function compareOfflineSample(id: Scenario, input: unknown, image: Uint8Array): Promise<ComparisonRecord> {
  try {
    const application = parseApplication(input);
    const sample = samples[id];
    if (!sample || image.byteLength > MAX_IMAGE_BYTES) return { processing: 'failed', code: 'invalid-input' };
    const bytes = new Uint8Array(image);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== sample.imageSha256) return { processing: 'failed', code: 'invalid-input' };
    if (sample.failure) return { processing: 'failed', code: 'provider-failed' };
    return finalizeComparison(application, { processing: 'complete', evidence: sample.evidence, metadata: { source: 'fixture', model: 'offline-fixture', schemaVersion: 1, rulesVersion: RULES_VERSION, promptVersion: 'image-observations-v1', imageSha256: hash, requestId: crypto.randomUUID() } }, hash);
  } catch { return { processing: 'failed', code: 'invalid-input' }; }
}
