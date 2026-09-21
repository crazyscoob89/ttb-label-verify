import { z } from 'zod';
import { applicationSchema, MAX_BATCH_PAIRS, type Application } from './contracts';
import { batchImageSchema, unpreparedBatchImageSchema, type BatchManifest, type ManifestIssue } from './batch-manifest';
import { immutable, type CompleteComparison, type FailureCode } from './comparison-record';
import { buildUnsavedDraft, newReviewIntent, reviewBinding, type Outcome, type ReviewIntent, type UnsavedDraft } from './review-policy';

export type AttemptIdentity = { attemptId: string; reservationId: string };
export type AttemptToken = AttemptIdentity & { batchId: string; pairId: string; revision: number };
export type SaveToken = { batchId: string; pairId: string; revision: number; selectionEpoch: number; submissionId: string; bindingKey: string; intentKey: string };
/** Normalized adapter output, NOT the absent Phase 4 repository's wire contract. */
export type ValidatedReviewReceipt = { receiptId: string; token: SaveToken; outcome: Outcome };
export type SaveReviewCommand = { kind: 'save-review'; token: SaveToken; draft: UnsavedDraft };
export type DispatchCommand = {
  /** This is a request to a trusted boundary, NEVER a permit to call a provider.
   * Consumer must authorize + atomically reserve/claim using the supplied fresh IDs
   * on EVERY attempt. Replaying commands must not bypass server deduplication.
   */
  kind: 'authorize-reserve-and-dispatch'; token: AttemptToken; application: Application;
  image: { filename: string; imageSha256: string | null };
};
export type BatchCommand = DispatchCommand | SaveReviewCommand;
export interface ReviewReceiptValidator {
  /** Implement against the actual authenticated server receipt contract. Validate
   * committed persistence, actor/access and exact request/evidence/intent binding.
   * Pure adapter only. Absence, rejection or exception can never mark saved.
   */
  validate(receipt: unknown, expected: SaveReviewCommand): ValidatedReviewReceipt | null;
}
export type PairSnapshot = {
  revision: number; filename: string | null; application: Application | null; imageSha256: string | null;
  processing: 'blocked' | 'queued' | 'running' | 'complete' | 'failed'; issues: ManifestIssue[];
  activeAttempt: AttemptToken | null; failure: FailureCode | null; record: CompleteComparison | null;
  intent: ReviewIntent | null; draft: UnsavedDraft | null; saved: ValidatedReviewReceipt | null;
  pendingSave: SaveReviewCommand | null;
};
export type BatchPairState = PairSnapshot & { id: string; history: PairSnapshot[] };
export type BatchState = {
  mode: 'offline' | 'live';
  batchId: string; concurrency: number; pairs: BatchPairState[]; selectedId: string; selectionEpoch: number;
  inFlight: AttemptToken[]; usedAttemptIds: string[]; usedReservationIds: string[]; usedSubmissionIds: string[];
};
export type ReviewEdits = Partial<Pick<ReviewIntent, 'outcome' | 'notes' | 'physical' | 'resolutions'>>;
export type BatchAction =
  | ({ type: 'dispatch' | 'retry'; pairId: string } & AttemptIdentity)
  | { type: 'dispatch-next'; attempts: AttemptIdentity[] }
  | { type: 'settle'; token: AttemptToken; result: unknown }
  | { type: 'prepared'; token: AttemptToken; imageSha256: string }
  | { type: 'navigate'; target: 'next' | 'previous' | string }
  | { type: 'replace'; pairId: string; application: unknown; image: unknown }
  | { type: 'edit-intent'; pairId: string; edits: ReviewEdits }
  | { type: 'confirm' | 'draft'; pairId: string }
  | { type: 'submit'; pairId: string; submissionId: string };
export type BatchTransition = { state: BatchState; commands: BatchCommand[]; rejected: string | null };

const identitySchema = z.object({ attemptId: z.uuid(), reservationId: z.uuid() }).strict();
const attemptSchema = identitySchema.extend({ batchId: z.uuid(), pairId: z.string().min(1), revision: z.number().int().positive() }).strict();
const saveTokenSchema = z.object({
  batchId: z.uuid(), pairId: z.string().min(1), revision: z.number().int().positive(),
  selectionEpoch: z.number().int().nonnegative(), submissionId: z.uuid(), bindingKey: z.string().min(1), intentKey: z.string().min(1),
}).strict();
const receiptSchema = z.object({ receiptId: z.string().min(1).max(256).refine(v => v.trim() === v && !/[\u0000-\u001f\u007f]/.test(v)), token: saveTokenSchema, outcome: z.enum(['pass', 'correction', 'second-review']) }).strict();
const failureSchema = z.object({ processing: z.literal('failed'), code: z.enum(['access-denied', 'invalid-input', 'invalid-extraction', 'provider-failed', 'timeout', 'cancelled', 'unconfigured']) }).strict();
const equalAttempt = (a: AttemptToken, b: AttemptToken) => a.batchId === b.batchId && a.pairId === b.pairId && a.revision === b.revision && a.attemptId === b.attemptId && a.reservationId === b.reservationId;
const equalSave = (a: SaveToken, b: SaveToken) => a.batchId === b.batchId && a.pairId === b.pairId && a.revision === b.revision && a.selectionEpoch === b.selectionEpoch && a.submissionId === b.submissionId && a.bindingKey === b.bindingKey && a.intentKey === b.intentKey;
const result = (state: BatchState, commands: BatchCommand[] = [], rejected: string | null = null): BatchTransition => immutable({ state, commands, rejected });
const reject = (state: BatchState, reason: string) => result(state, [], reason);
const blank = () => ({ activeAttempt: null, failure: null, record: null, intent: null, draft: null, saved: null, pendingSave: null });

/** Caller owns this immutable snapshot. Do not use untrusted hydrated state or
 * concurrent stale snapshots as an authority store. The server owns global caps.
 */
export function createBatchState(manifest: BatchManifest, options: { batchId: string; concurrency?: number; live?: boolean }): BatchState {
  const batchId = z.uuid().parse(options.batchId);
  const concurrency = z.number().int().min(1).max(2).parse(options.concurrency ?? 2);
  if (!manifest.entries.length || manifest.entries.length > MAX_BATCH_PAIRS || new Set(manifest.entries.map(e => e.id)).size !== manifest.entries.length) throw new Error('Invalid batch manifest');
  const pairs: BatchPairState[] = manifest.entries.map(entry => ({
    id: entry.id, filename: entry.filename, issues: [...entry.issues], revision: 1, history: [], ...blank(),
    processing: entry.status === 'valid' ? 'queued' : 'blocked',
    application: entry.status === 'valid' ? applicationSchema.parse(entry.application) : null,
    imageSha256: entry.status === 'valid' ? (options.live ? unpreparedBatchImageSchema : batchImageSchema).parse({ filename: entry.filename, imageSha256: entry.imageSha256 }).imageSha256 : null,
  }));
  return immutable({ mode: options.live ? 'live' : 'offline', batchId, concurrency, pairs, selectedId: pairs[0].id, selectionEpoch: 0, inFlight: [], usedAttemptIds: [], usedReservationIds: [], usedSubmissionIds: [] });
}

function dispatch(state: BatchState, pairId: string, identity: AttemptIdentity, retry: boolean): BatchTransition {
  const parsed = identitySchema.safeParse(identity);
  const pair = state.pairs.find(p => p.id === pairId);
  if (!parsed.success || !pair || pair.processing !== (retry ? 'failed' : 'queued') || !pair.application || !pair.filename || (!pair.imageSha256 && state.mode !== 'live')) return reject(state, 'Pair or attempt is not dispatchable');
  if (state.inFlight.length >= state.concurrency) return reject(state, 'Queue is at capacity');
  if (state.usedAttemptIds.includes(identity.attemptId) || state.usedReservationIds.includes(identity.reservationId)) return reject(state, 'Fresh attempt and reservation identities are required');
  const token: AttemptToken = { ...parsed.data, batchId: state.batchId, pairId, revision: pair.revision };
  const next = structuredClone(state);
  const current = next.pairs.find(p => p.id === pairId)!;
  current.processing = 'running'; current.activeAttempt = token; current.failure = null;
  next.inFlight.push(token); next.usedAttemptIds.push(token.attemptId); next.usedReservationIds.push(token.reservationId);
  return result(next, [{ kind: 'authorize-reserve-and-dispatch', token, application: structuredClone(pair.application), image: { filename: pair.filename, imageSha256: pair.imageSha256 } }]);
}

/** Validate complete records through the existing policy, including recomputation
 * of findings. The temporary intent is solely a validation probe, not a human vote.
 */
function checkedCompletion(pair: BatchPairState, input: unknown): CompleteComparison | null {
  try {
    const probe = buildUnsavedDraft(input, { ...newReviewIntent(input), outcome: 'second-review', notes: 'Internal record validation probe only.', confirmed: true });
    if (!probe || probe.record.imageSha256 !== pair.imageSha256 || JSON.stringify(probe.record.application) !== JSON.stringify(pair.application)) return null;
    return probe.record;
  } catch { return null; } // Unknown async input must not strand the queue on serialization errors.
}

/** Pure reducer. Only explicit dispatch/retry/dispatch-next and submit actions
 * emit commands. No automatic retry, navigation dispatch, transport or storage.
 */
export function transitionBatch(state: BatchState, action: BatchAction): BatchTransition {
  if (action.type === 'dispatch' || action.type === 'retry') return dispatch(state, action.pairId, { attemptId: action.attemptId, reservationId: action.reservationId }, action.type === 'retry');
  if (action.type === 'dispatch-next') {
    let next = state;
    const commands: BatchCommand[] = [];
    for (const identity of action.attempts) {
      const pair = next.pairs.find(p => p.processing === 'queued');
      if (!pair || next.inFlight.length >= next.concurrency) break;
      const step = dispatch(next, pair.id, identity, false);
      if (step.rejected) return result(next, commands, step.rejected);
      next = step.state; commands.push(...step.commands);
    }
    return result(next, commands);
  }
  if (action.type === 'navigate') {
    const index = state.pairs.findIndex(p => p.id === state.selectedId);
    const target = action.target === 'next' ? state.pairs[Math.min(index + 1, state.pairs.length - 1)]?.id
      : action.target === 'previous' ? state.pairs[Math.max(index - 1, 0)]?.id : action.target;
    if (!state.pairs.some(p => p.id === target)) return reject(state, 'Unknown navigation target');
    if (target === state.selectedId) return result(state);
    const next = structuredClone(state);
    next.selectedId = target; next.selectionEpoch++;
    for (const pair of next.pairs) {
      if (pair.intent) pair.intent.confirmed = false;
      pair.pendingSave = null;
    }
    return result(next);
  }
  if (action.type === 'prepared') {
    const token = attemptSchema.safeParse(action.token);
    const pair = token.success ? state.pairs.find(p => p.id === token.data.pairId) : undefined;
    if (state.mode !== 'live' || !token.success || !pair?.activeAttempt || pair.revision !== token.data.revision || !equalAttempt(pair.activeAttempt, token.data) || !state.inFlight.some(t => equalAttempt(t, token.data)) || !/^[a-f0-9]{64}$/.test(action.imageSha256) || (pair.imageSha256 !== null && pair.imageSha256 !== action.imageSha256)) return reject(state, 'Unknown, stale or inconsistent preparation');
    const next = structuredClone(state);
    next.pairs.find(p => p.id === pair.id)!.imageSha256 = action.imageSha256;
    return result(next);
  }
  if (action.type === 'settle') {
    const parsed = attemptSchema.safeParse(action.token);
    if (!parsed.success || !state.inFlight.some(t => equalAttempt(t, parsed.data))) return reject(state, 'Unknown or stale attempt');
    const next = structuredClone(state);
    next.inFlight = next.inFlight.filter(t => !equalAttempt(t, parsed.data));
    const pair = next.pairs.find(p => p.id === parsed.data.pairId);
    // A superseded attempt still occupies a slot until its executor settles it.
    if (!pair || pair.revision !== parsed.data.revision || !pair.activeAttempt || !equalAttempt(pair.activeAttempt, parsed.data)) return result(next);
    pair.activeAttempt = null;
    const complete = checkedCompletion(pair, action.result);
    if (complete) {
      pair.record = complete; pair.processing = 'complete'; pair.intent = newReviewIntent(complete);
    } else {
      const failure = failureSchema.safeParse(action.result);
      pair.processing = 'failed'; pair.failure = failure.success ? failure.data.code : 'invalid-extraction';
      pair.record = null; pair.intent = null; pair.draft = null; pair.saved = null;
    }
    return result(next);
  }
  const pair = state.pairs.find(p => p.id === action.pairId);
  if (!pair) return reject(state, 'Unknown pair');
  if (action.type === 'replace') {
    const application = applicationSchema.safeParse(action.application);
    const image = (state.mode === 'live' ? unpreparedBatchImageSchema : batchImageSchema).safeParse(action.image);
    if (pair.processing === 'blocked' || !application.success || !image.success || image.data.filename !== pair.filename || state.pairs.some(p => p.id !== pair.id && p.application?.applicationId === application.data.applicationId && p.application.applicationVersion === application.data.applicationVersion)) return reject(state, 'Invalid or ambiguous replacement; rebuild blocked manifests explicitly');
    const next = structuredClone(state);
    const current = next.pairs.find(p => p.id === pair.id)!;
    const { id: _id, history: _history, ...snapshot } = structuredClone(pair);
    current.history.push(snapshot);
    Object.assign(current, blank(), { application: application.data, imageSha256: image.data.imageSha256, revision: pair.revision + 1, processing: 'queued' });
    return result(next);
  }
  if (state.selectedId !== pair.id || pair.processing !== 'complete' || !pair.record || !pair.intent) return reject(state, 'Select a complete pair before reviewing');
  const next = structuredClone(state);
  const current = next.pairs.find(p => p.id === pair.id)!;
  if (action.type === 'edit-intent') {
    // Explicitly copy only editable policy fields: no receipt, binding or confirmation injection.
    const edits = action.edits;
    current.intent = { ...pair.intent,
      outcome: edits.outcome === undefined ? pair.intent.outcome : edits.outcome,
      notes: edits.notes === undefined ? pair.intent.notes : edits.notes,
      physical: structuredClone(edits.physical === undefined ? pair.intent.physical : edits.physical),
      resolutions: structuredClone(edits.resolutions === undefined ? pair.intent.resolutions : edits.resolutions),
      confirmed: false,
    };
    current.draft = null; current.pendingSave = null;
    return result(next);
  }
  if (action.type === 'confirm') { current.intent!.confirmed = true; return result(next); }
  if (action.type === 'draft') {
    const draft = buildUnsavedDraft(pair.record, pair.intent);
    if (!draft) return reject(state, 'Review policy does not permit this draft');
    current.draft = draft;
    return result(next);
  }
  if (action.type === 'submit') {
    const draft = buildUnsavedDraft(pair.record, pair.intent);
    if (!draft || !pair.draft || reviewBinding(pair.draft) !== reviewBinding(draft) || pair.pendingSave || !z.uuid().safeParse(action.submissionId).success || state.usedSubmissionIds.includes(action.submissionId)) return reject(state, 'A current confirmed draft and fresh submission identity are required');
    const token: SaveToken = { batchId: state.batchId, pairId: pair.id, revision: pair.revision, selectionEpoch: state.selectionEpoch, submissionId: action.submissionId, bindingKey: pair.intent.bindingKey, intentKey: reviewBinding(pair.intent) };
    const command: SaveReviewCommand = { kind: 'save-review', token, draft };
    current.pendingSave = command; next.usedSubmissionIds.push(token.submissionId);
    return result(next, [command]);
  }
  return reject(state, 'Unknown action');
}

/** Default-deny saved projection. This function cannot persist a review. An
 * authenticated repository adapter is a deliberately unimplemented dependency.
 * Late/ambiguous server commits need authoritative reconciliation, not UI replay.
 */
export function acceptSavedReview(state: BatchState, tokenInput: SaveToken, receipt: unknown, validator?: ReviewReceiptValidator): BatchTransition {
  const parsed = saveTokenSchema.safeParse(tokenInput);
  if (!validator || !parsed.success) return reject(state, 'Validated server receipt is required');
  const token = parsed.data;
  const pair = state.pairs.find(p => p.id === token.pairId);
  if (!pair?.pendingSave || !equalSave(pair.pendingSave.token, token) || token.batchId !== state.batchId || token.revision !== pair.revision || token.selectionEpoch !== state.selectionEpoch || state.selectedId !== pair.id || token.intentKey !== reviewBinding(pair.intent) || token.bindingKey !== reviewBinding(pair.record)) return reject(state, 'Stale review receipt');
  try {
    const verified = receiptSchema.safeParse(validator.validate(receipt, pair.pendingSave));
    if (!verified.success || !equalSave(verified.data.token, token) || verified.data.outcome !== pair.pendingSave.draft.intent.outcome) return reject(state, 'Invalid server receipt');
    const next = structuredClone(state);
    const current = next.pairs.find(p => p.id === pair.id)!;
    current.saved = verified.data; current.pendingSave = null; current.intent!.confirmed = false;
    return result(next);
  } catch { return reject(state, 'Receipt validation failed'); }
}

export function summarizeBatch(state: BatchState) {
  const outcomes: Record<Outcome, number> = { pass: 0, correction: 0, 'second-review': 0 };
  const summary = { total: state.pairs.length, reviewed: 0, remaining: 0, blocked: 0, queued: 0, running: 0, failed: 0, compared: 0, drafts: 0, complete: false, outcomes };
  for (const pair of state.pairs) {
    if (pair.processing === 'complete') summary.compared++; else summary[pair.processing]++;
    if (pair.draft) summary.drafts++;
    if (pair.saved && pair.processing === 'complete') { summary.reviewed++; outcomes[pair.saved.outcome]++; }
  }
  summary.remaining = summary.total - summary.reviewed; // Blocked and failed are still remaining.
  summary.complete = summary.total > 0 && summary.remaining === 0;
  return immutable(summary);
}
