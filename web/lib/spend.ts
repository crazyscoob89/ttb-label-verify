import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const units = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const legacyBindingSchema = z.object({
  reservationId: z.uuid(), attemptId: z.uuid(), requestId: z.uuid(),
  imageSha256: z.string().regex(/^[a-f0-9]{64}$/), schemaVersion: z.literal(1),
  rulesVersion: z.literal('prototype-seven-fields-v1'), promptVersion: z.literal('image-observations-v1'),
  model: z.literal('anthropic/claude-haiku-4.5'), maxCostMicrousd: units.positive(),
}).strict();
// Add a truthful OCR tuple without broadening either historical Haiku branch.
// Source belongs to the saved record; spend bindings retain exactly nine keys.
const azureOcrBindingSchema = legacyBindingSchema.extend({
  schemaVersion: z.literal(2), promptVersion: z.literal('azure-ocr-photo-observations-v1'),
  model: z.literal('mistral-document-ai-2512'), maxCostMicrousd: z.literal(1000000),
});
// Benchmark-only admission; not a saved-record model or an app-engine switch.
export const BENCHMARK_MODELS = ['openai/gpt-4.1', 'google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite'] as const;
export const benchmarkBindingSchema = legacyBindingSchema.extend({
  schemaVersion: z.literal(2), promptVersion: z.literal('isolated-vision-benchmark-v1'),
  model: z.enum(BENCHMARK_MODELS), maxCostMicrousd: z.literal(1000000),
});
export const bindingSchema = z.union([
  legacyBindingSchema,
  legacyBindingSchema.extend({ schemaVersion: z.literal(2), promptVersion: z.literal('photo-set-observations-v2') }),
  azureOcrBindingSchema,
  benchmarkBindingSchema,
  legacyBindingSchema.extend({schemaVersion:z.literal(2),promptVersion:z.literal('gpt41-photo-observations-v1'),model:z.literal('openai/gpt-4.1'),maxCostMicrousd:z.literal(1000000)}),
]);
const receiptSchema = z.object({
  binding: bindingSchema, state: z.enum(['reserved', 'claimed', 'unresolved']), claimId: z.uuid().nullable(),
  ledger: z.object({ currency: z.literal('USD'), ceilingMicrousd: units, incurredMicrousd: units, unresolvedMicrousd: units }).strict(),
}).strict();
export type SpendBinding = z.infer<typeof bindingSchema>;
export type SpendReceipt = z.infer<typeof receiptSchema>;

/** Trusted SHARED-store contract, not an implementation or distributed lock.
 * Each method MUST commit atomically before acknowledging. reserve must retain
 * all historical incurred + unresolved liabilities, enforce its persisted total
 * ceiling, and permanently deduplicate BOTH reservationId and attemptId.
 * claim is a single-winner CAS reserved -> claimed, binding all fields and the
 * fresh claimId. Replays/expired/crashed claims MUST NOT be reclaimed.
 * complete only marks unresolved; it MUST NOT release or settle any liability.
 * A separate privileged, externally verified reconciliation is required to settle.
 * Reconciliation must retain incurred history and permanent identity tombstones.
 */
export interface SpendStore {
  reserve(binding: Readonly<SpendBinding>): Promise<unknown>;
  claim(binding: Readonly<SpendBinding>, claimId: string): Promise<unknown>;
  complete(binding: Readonly<SpendBinding>, claimId: string): Promise<unknown>;
}
export type SpendResult<T> = { ok: true; value: T } | { ok: false; code: 'spend-unavailable' | 'execution-failed' };

function receipt(input: unknown, binding: SpendBinding, state: SpendReceipt['state'], claimId: string | null, previous?: SpendReceipt): SpendReceipt {
  const parsed = receiptSchema.parse(input);
  if (Object.keys(binding).some(key => parsed.binding[key as keyof SpendBinding] !== binding[key as keyof SpendBinding]) ||
      parsed.state !== state || parsed.claimId !== claimId) throw new Error('Invalid receipt');
  const ledger = parsed.ledger;
  const total = BigInt(ledger.incurredMicrousd) + BigInt(ledger.unresolvedMicrousd);
  if (total > BigInt(ledger.ceilingMicrousd) || ledger.unresolvedMicrousd < binding.maxCostMicrousd ||
      (previous && (ledger.ceilingMicrousd !== previous.ledger.ceilingMicrousd ||
        ledger.incurredMicrousd < previous.ledger.incurredMicrousd ||
        total < BigInt(previous.ledger.incurredMicrousd) + BigInt(previous.ledger.unresolvedMicrousd)))) throw new Error('Invalid ledger');
  return parsed;
}

/** No raw store/execution exceptions escape. Failure never releases the hold.
 * This generic helper grants no provider authorization; the adapter has its own
 * default-deny gate and no exported alternate dispatch function.
 */
export async function executeReserved<T>(store: SpendStore | undefined, input: SpendBinding, work: () => Promise<T>): Promise<SpendResult<T>> {
  const unavailable = { ok: false, code: 'spend-unavailable' } as const;
  if (!store || typeof window !== 'undefined') return unavailable;
  let binding: Readonly<SpendBinding>, claimId: string, claimed: SpendReceipt;
  try {
    binding = Object.freeze(bindingSchema.parse(input));
    const reserved = receipt(await store.reserve(binding), binding, 'reserved', null);
    claimId = randomUUID();
    claimed = receipt(await store.claim(binding, claimId), binding, 'claimed', claimId, reserved);
  } catch { return unavailable; }
  let result: SpendResult<T>;
  try { result = { ok: true, value: await work() }; }
  catch { result = { ok: false, code: 'execution-failed' }; }
  try { receipt(await store.complete(binding, claimId), binding, 'unresolved', claimId, claimed); }
  catch { return unavailable; }
  return result;
}
