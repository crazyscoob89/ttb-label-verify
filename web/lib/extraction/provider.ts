export type {GroupExtractionRequest,GroupExtractionResult,GroupExtractionMetadata,GroupExtractionProvider} from './group-provider';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RULES_VERSION } from '../rules';
import type { ExtractionEvidence } from './schema';

export const PROMPT_VERSION = 'image-observations-v1';
export const EXTRACTION_LIMITS = Object.freeze({ inputBytes: 10 * 1024 * 1024, responseBytes: 128 * 1024, outputTokens: 3000, timeoutMs: 20000 });
export type ExtractionRequest = { image: Uint8Array; mimeType: 'image/png' | 'image/jpeg'; reservationId: string; attemptId: string };
export type ExtractionMetadata = { source: 'openrouter' | 'fixture'; model: string; schemaVersion: 1; rulesVersion: typeof RULES_VERSION; promptVersion: typeof PROMPT_VERSION; imageSha256: string; requestId: string; reservationId?: string; attemptId?: string };
export type ExtractionResult = { processing: 'complete'; evidence: ExtractionEvidence; metadata: ExtractionMetadata } | { processing: 'failed'; code: 'unconfigured' | 'invalid-request' | 'provider-failed' | 'spend-unavailable' | 'daily-limit-reached' | 'invalid-fixture' };
export interface ExtractionProvider { extract(request: ExtractionRequest): Promise<ExtractionResult> }

const requestSchema = z.object({
  image: z.custom<Uint8Array>(v => v instanceof Uint8Array && !(v.buffer instanceof SharedArrayBuffer) && v.byteLength > 0 && v.byteLength <= EXTRACTION_LIMITS.inputBytes),
  mimeType: z.enum(['image/png', 'image/jpeg']), reservationId: z.uuid(), attemptId: z.uuid(),
}).strict();
/** Internal preparation utility; no network authority. Caller must supply bytes
 * already decoded/sanitized by intake. This is NOT an image decoder or route.
 * Copy synchronously before any async store/transport boundary; reject shared memory.
 */
export function snapshotRequest(input: ExtractionRequest) {
  const parsed = requestSchema.parse(input);
  const image = Buffer.from(parsed.image);
  return { ...parsed, image, imageSha256: createHash('sha256').update(image).digest('hex'), requestId: randomUUID() };
}
