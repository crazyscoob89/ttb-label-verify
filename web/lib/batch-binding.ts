import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { preparePair } from './intake';

export const batchAttemptSchema = z.object({
  attemptId: z.uuid(), reservationId: z.uuid(), batchId: z.uuid(),
  pairId: z.string().min(1).max(300), revision: z.number().int().positive(),
}).strict();
type PreparedPair = Awaited<ReturnType<typeof preparePair>>;

/** A preparation attestation, not provider authorization or a saved receipt.
 * Uses the existing server secret, no new persistence/key provisioning. Re-encode
 * and verify again on execution; never trust a browser's normalized hash.
 */
export function signBatchBinding(pair: PreparedPair, secret: string): string {
  const hash = pair.image.sanitizedSha256;
  const mac = createHmac('sha256', secret).update(JSON.stringify([
    'ttb-batch-preparation-v1', pair.filename, pair.application, hash,
  ])).digest('hex');
  return `${hash}.${mac}`;
}
export function verifyBatchBinding(pair: PreparedPair, secret: string, supplied: string): boolean {
  return /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(signBatchBinding(pair, secret)));
}
