import { z } from 'zod';
import { parseApplication, type Application } from './contracts';
import { compareApplication, RULES_VERSION, type ComparisonResult } from './rules';
import { extractionEvidenceSchema, type ExtractionEvidence } from './extraction/schema';

export type FailureCode = 'access-denied' | 'invalid-input' | 'invalid-extraction' | 'provider-failed' | 'timeout' | 'cancelled' | 'unconfigured';
export type { CompletePhotoComparison } from './photo-record';
import type { CompletePhotoComparison } from './photo-record';
export type CompleteComparison = LegacyCompleteComparison | CompletePhotoComparison;
export type LegacyCompleteComparison = { processing: 'complete'; application: Application; imageSha256: string; source: 'fixture' | 'openrouter'; evidence: ExtractionEvidence; comparison: Extract<ComparisonResult, { processing: 'complete' }> };
export type ComparisonRecord = CompleteComparison | { processing: 'failed'; code: FailureCode };
export function immutable<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
const envelope = z.object({
  processing: z.literal('complete'), evidence: extractionEvidenceSchema,
  metadata: z.union([
    z.object({ source: z.literal('fixture'), model: z.literal('offline-fixture'), schemaVersion: z.literal(1), rulesVersion: z.literal(RULES_VERSION), promptVersion: z.literal('image-observations-v1'), imageSha256: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid() }).strict(),
    z.object({ source: z.literal('openrouter'), model: z.literal('anthropic/claude-haiku-4.5'), schemaVersion: z.literal(1), rulesVersion: z.literal(RULES_VERSION), promptVersion: z.literal('image-observations-v1'), imageSha256: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.uuid(), reservationId: z.uuid(), attemptId: z.uuid() }).strict(),
  ]),
}).strict();
/** Shared strict finalization, never authority to run a provider. */
export function finalizeComparison(application: unknown, extraction: unknown, imageSha256: string): ComparisonRecord {
  try {
    const parsed = envelope.parse(extraction);
    if (parsed.metadata.imageSha256 !== imageSha256) return { processing: 'failed', code: 'invalid-extraction' };
    const app = parseApplication(application);
    const comparison = compareApplication(app, parsed.evidence);
    if (comparison.processing !== 'complete') return { processing: 'failed', code: 'invalid-extraction' };
    return immutable({ processing: 'complete', application: app, imageSha256, source: parsed.metadata.source, evidence: parsed.evidence, comparison });
  } catch { return { processing: 'failed', code: 'invalid-extraction' }; }
}
