import { RULES_VERSION } from '../rules';
import { extractionEvidenceSchema, parseExtractionEvidence } from './schema';
import { PROMPT_VERSION, snapshotRequest, type ExtractionProvider } from './provider';

/** Explicit deterministic OFFLINE fixture; no OCR, inference, transport or spend.
 * Not selected automatically or used as fallback by the real adapter/UI.
 */
export function createFixtureProvider(input: unknown): ExtractionProvider {
  const fixture = extractionEvidenceSchema.safeParse(input);
  return {
    async extract(request) {
      if (!fixture.success) return { processing: 'failed', code: 'invalid-fixture' };
      try {
        const snapshot = snapshotRequest(request);
        return {
          processing: 'complete', evidence: parseExtractionEvidence(fixture.data),
          metadata: { source: 'fixture', model: 'offline-fixture', schemaVersion: 1, rulesVersion: RULES_VERSION, promptVersion: PROMPT_VERSION, imageSha256: snapshot.imageSha256, requestId: snapshot.requestId },
        };
      } catch { return { processing: 'failed', code: 'invalid-request' }; }
    },
  };
}
