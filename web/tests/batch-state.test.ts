import { expect, test } from 'vitest';
import { buildBatchManifest } from '../lib/batch-manifest';
import { createBatchState, transitionBatch, acceptSavedReview, summarizeBatch, type BatchState, type AttemptToken, type ReviewReceiptValidator, type SaveReviewCommand } from '../lib/batch-state';
import { parseApplication } from '../lib/contracts';
import { compareApplication } from '../lib/rules';
import { parseExtractionEvidence } from '../lib/extraction/schema';
import { type CompleteComparison } from '../lib/comparison-record';
import fixtures from './fixtures/comparisons.json';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (n: number) => ({ attemptId: uuid(n), reservationId: uuid(n + 1000) });
const app = (n: number) => parseApplication({ ...fixtures.application, applicationId: `synthetic-${n}` });
const pair = (n: number) => `filename:${n}.png`;
function initial(count = 3, concurrency = 2) {
  return createBatchState(buildBatchManifest(
    Array.from({ length: count }, (_, n) => ({ filename: `${n}.png`, imageSha256: 'a'.repeat(64) })),
    Array.from({ length: count }, (_, n) => ({ filename: `${n}.png`, application: app(n) })),
  ), { batchId: uuid(9999), concurrency });
}
function record(n = 0, imageSha256 = 'a'.repeat(64), application = app(n)): CompleteComparison {
  const evidence = parseExtractionEvidence(fixtures.evidence);
  const comparison = compareApplication(application, evidence);
  if (comparison.processing !== 'complete') throw new Error('Bad test fixture');
  return { processing: 'complete', application, imageSha256, source: 'fixture', evidence, comparison };
}
function dispatched(state = initial(), n = 0, attempt = 1) {
  const transition = transitionBatch(state, { type: 'dispatch', pairId: pair(n), ...ids(attempt) });
  expect(transition.commands).toHaveLength(1);
  const command = transition.commands[0];
  if (command.kind !== 'authorize-reserve-and-dispatch') throw new Error('Expected dispatch boundary');
  return { state: transition.state, token: command.token };
}
function completed(state = initial(), n = 0, attempt = 1) {
  const started = dispatched(state, n, attempt);
  return transitionBatch(started.state, { type: 'settle', token: started.token, result: record(n) }).state;
}
function ready(state = completed(), n = 0) {
  state = transitionBatch(state, { type: 'edit-intent', pairId: pair(n), edits: { outcome: 'correction', notes: `Review correction for record ${n}.` } }).state;
  state = transitionBatch(state, { type: 'confirm', pairId: pair(n) }).state;
  return transitionBatch(state, { type: 'draft', pairId: pair(n) }).state;
}
function submission(state = ready(), submissionId = uuid(5000)) {
  const result = transitionBatch(state, { type: 'submit', pairId: pair(0), submissionId });
  expect(result.commands).toHaveLength(1);
  const command = result.commands[0];
  if (command.kind !== 'save-review') throw new Error('Expected save command');
  return { state: result.state, command };
}
// Test-only stand-in for a future authenticated server-receipt adapter, NOT a wire schema.
const validator: ReviewReceiptValidator = {
  validate(receipt, expected) {
    if (receipt !== 'server-committed') return null;
    return { receiptId: 'server-review-1', token: expected.token, outcome: expected.draft.intent.outcome! };
  },
};
function acknowledge(state: BatchState, command: SaveReviewCommand) {
  return acceptSavedReview(state, command.token, 'server-committed', validator).state;
}

test('300-item bounded queue emits authorization/reservation commands, default and maximum two', () => {
  const state = initial(300);
  const result = transitionBatch(state, { type: 'dispatch-next', attempts: [ids(1), ids(2), ids(3)] });
  expect(result.commands).toHaveLength(2);
  expect(result.commands.map(c => c.kind)).toEqual(['authorize-reserve-and-dispatch', 'authorize-reserve-and-dispatch']);
  expect(result.state.inFlight).toHaveLength(2);
  expect(transitionBatch(result.state, { type: 'dispatch', pairId: pair(2), ...ids(3) }).commands).toEqual([]);
  expect(summarizeBatch(result.state)).toMatchObject({ total: 300, running: 2, queued: 298, reviewed: 0, remaining: 300 });
  const defaultState = createBatchState(buildBatchManifest([{ filename: 'a.png', imageSha256: 'a'.repeat(64) }], [{ filename: 'a.png', application: app(0) }]), { batchId: uuid(9998) });
  expect(defaultState.concurrency).toBe(2);
  expect(transitionBatch(initial(3, 1), { type: 'dispatch-next', attempts: [ids(1), ids(2)] }).commands).toHaveLength(1);
  for (const concurrency of [0, 3, -1, NaN, 1.5]) expect(() => initial(3, concurrency)).toThrow();
});

test('failed item is not reviewed and neither settle nor navigation retries or dispatches', () => {
  const { state, token } = dispatched();
  const failed = transitionBatch(state, { type: 'settle', token, result: { processing: 'failed', code: 'timeout' } });
  expect(failed.commands).toEqual([]);
  expect(failed.state.pairs[0].processing).toBe('failed');
  expect(summarizeBatch(failed.state)).toMatchObject({ reviewed: 0, remaining: 3, failed: 1 });
  let next = failed.state;
  for (const target of ['next', 'previous', pair(2), pair(0)]) {
    const result = transitionBatch(next, { type: 'navigate', target });
    expect(result.commands).toEqual([]);
    next = result.state;
  }
  expect(transitionBatch(next, { type: 'dispatch', pairId: pair(0), ...ids(2) }).commands).toEqual([]);
  const retry = transitionBatch(next, { type: 'retry', pairId: pair(0), ...ids(2) });
  expect(retry.commands).toHaveLength(1);
  expect(retry.state.pairs[1]).toEqual(next.pairs[1]);
  expect(retry.state.inFlight[0]).toMatchObject(ids(2));
});

test('retry requires fresh attempt AND reservation IDs, even after terminal failure', () => {
  const { state, token } = dispatched();
  const failed = transitionBatch(state, { type: 'settle', token, result: { processing: 'failed', code: 'provider-failed' } }).state;
  for (const identity of [ids(1), { ...ids(2), attemptId: ids(1).attemptId }, { ...ids(2), reservationId: ids(1).reservationId }, { attemptId: 'bad', reservationId: 'bad' }]) {
    expect(transitionBatch(failed, { type: 'retry', pairId: pair(0), ...identity }).commands).toEqual([]);
  }
  expect(transitionBatch(initial(), { type: 'retry', pairId: pair(0), ...ids(3) }).commands).toEqual([]);
});

test('stale old attempt cannot complete a fresh retry or free its slot', () => {
  const first = dispatched();
  const failed = transitionBatch(first.state, { type: 'settle', token: first.token, result: { processing: 'failed', code: 'timeout' } }).state;
  const retry = transitionBatch(failed, { type: 'retry', pairId: pair(0), ...ids(2) });
  const stale = transitionBatch(retry.state, { type: 'settle', token: first.token, result: record() });
  expect(stale.state).toEqual(retry.state);
  expect(stale.state.inFlight).toHaveLength(1);
});

test('foreign batch token or forged token cannot settle a pair', () => {
  const started = dispatched();
  for (const token of [{ ...started.token, batchId: uuid(1234) }, { ...started.token, reservationId: uuid(3333) }, { ...started.token, revision: 99 }]) {
    expect(transitionBatch(started.state, { type: 'settle', token, result: record() }).state).toEqual(started.state);
  }
});

test('unrelated application, hash or forged findings fail closed without inheriting sample findings', () => {
  const forged = structuredClone(record()); forged.comparison.fields.abv.status = 'mismatch';
  for (const result of [record(1), record(0, 'b'.repeat(64)), forged, { processing: 'complete' }, null]) {
    const started = dispatched();
    const next = transitionBatch(started.state, { type: 'settle', token: started.token, result }).state;
    expect(next.pairs[0]).toMatchObject({ processing: 'failed', record: null, saved: null });
  }
});

test('unserializable completion is failed without throwing or retaining its queue slot', () => {
  const circular: Record<string, unknown> = {}; circular.self = circular;
  for (const comparison of [1n, circular]) {
    const started = dispatched();
    const next = transitionBatch(started.state, { type: 'settle', token: started.token, result: { ...record(), comparison } });
    expect(next.state.pairs[0]).toMatchObject({ processing: 'failed', failure: 'invalid-extraction', record: null });
    expect(next.state.inFlight).toEqual([]);
    expect(next.commands).toEqual([]);
  }
});

test('drafts are independent and card/next/previous switching resets confirmation only', () => {
  let state = ready();
  state = completed(state, 1, 2);
  state = transitionBatch(state, { type: 'navigate', target: 'next' }).state;
  state = ready(state, 1);
  const draft0 = state.pairs[0].draft;
  const draft1 = state.pairs[1].draft;
  expect(draft0?.intent.notes).not.toEqual(draft1?.intent.notes);
  expect(draft0?.state).toBe('UNSAVED');
  for (const target of ['previous', pair(1), pair(0)]) {
    const next = transitionBatch(state, { type: 'navigate', target });
    expect(next.commands).toEqual([]);
    state = next.state;
    expect(state.pairs.every(p => !p.intent?.confirmed)).toBe(true);
  }
  expect(state.pairs[0].draft).toEqual(draft0);
  expect(state.pairs[1].draft).toEqual(draft1);
  expect(summarizeBatch(state)).toMatchObject({ reviewed: 0, drafts: 2, remaining: 3, complete: false });
});

test('editing review choices resets confirmation and does not invent saved state', () => {
  const state = ready();
  const edited = transitionBatch(state, { type: 'edit-intent', pairId: pair(0), edits: { notes: 'Changed correction details.' } }).state;
  expect(edited.pairs[0].intent?.confirmed).toBe(false);
  expect(edited.pairs[0].draft).toBeNull();
  expect(transitionBatch(edited, { type: 'submit', pairId: pair(0), submissionId: uuid(5000) }).commands).toEqual([]);
  expect(summarizeBatch(edited).reviewed).toBe(0);
});

test('real review policy blocks pass without physical assessment and confirmed drafts', () => {
  let state = completed();
  state = transitionBatch(state, { type: 'edit-intent', pairId: pair(0), edits: { outcome: 'pass' } }).state;
  state = transitionBatch(state, { type: 'confirm', pairId: pair(0) }).state;
  expect(transitionBatch(state, { type: 'draft', pairId: pair(0) }).state.pairs[0].draft).toBeNull();
  expect(transitionBatch(initial(), { type: 'confirm', pairId: pair(0) }).state.pairs[0].intent).toBeNull();
});

test('saved outcome requires validated server receipt, never a draft, HTTP-like object or absent validator', () => {
  const { state, command } = submission();
  expect(summarizeBatch(state).reviewed).toBe(0);
  for (const receipt of [{ ok: true }, {}, null, { state: 'saved' }]) {
    expect(acceptSavedReview(state, command.token, receipt, validator).state.pairs[0].saved).toBeNull();
  }
  expect(acceptSavedReview(state, command.token, 'server-committed').state.pairs[0].saved).toBeNull();
  const saved = acknowledge(state, command);
  expect(saved.pairs[0].saved).toMatchObject({ receiptId: 'server-review-1', outcome: 'correction' });
  expect(summarizeBatch(saved)).toMatchObject({ reviewed: 1, remaining: 2, outcomes: { pass: 0, correction: 1, 'second-review': 0 } });
  const away = transitionBatch(saved, { type: 'navigate', target: 'next' }).state;
  const back = transitionBatch(away, { type: 'navigate', target: 'previous' }).state;
  expect(back.pairs[0].saved).toEqual(saved.pairs[0].saved);
  expect(back.pairs[0].intent?.confirmed).toBe(false);
});

test('receipt adapter exception, mismatched binding or outcome fail closed', () => {
  const { state, command } = submission();
  const bad: ReviewReceiptValidator[] = [
    { validate() { throw new Error('bad'); } },
    { validate: () => ({ receiptId: 'r', token: { ...command.token, revision: 99 }, outcome: 'correction' }) },
    { validate: () => ({ receiptId: 'r', token: command.token, outcome: 'pass' }) },
    { validate: () => ({ receiptId: '', token: command.token, outcome: 'correction' }) },
  ];
  for (const adapter of bad) expect(acceptSavedReview(state, command.token, {}, adapter).state.pairs[0].saved).toBeNull();
});

test('A to B to A navigation fences delayed review-save receipt, never reactivates confirmation', () => {
  const { state, command } = submission();
  const away = transitionBatch(state, { type: 'navigate', target: pair(1) }).state;
  const back = transitionBatch(away, { type: 'navigate', target: pair(0) }).state;
  expect(acceptSavedReview(back, command.token, 'server-committed', validator).state.pairs[0].saved).toBeNull();
  expect(back.selectionEpoch).toBeGreaterThan(state.selectionEpoch);
  expect(back.pairs[0].intent?.confirmed).toBe(false);
});

test('image/application A to B to A replacement fences old extraction and retains history', () => {
  const { state, token } = dispatched();
  const b = transitionBatch(state, { type: 'replace', pairId: pair(0), application: { ...app(0), applicationVersion: 'B' }, image: { filename: '0.png', imageSha256: 'b'.repeat(64) } }).state;
  const a = transitionBatch(b, { type: 'replace', pairId: pair(0), application: app(0), image: { filename: '0.png', imageSha256: 'a'.repeat(64) } }).state;
  expect(a.pairs[0].revision).toBe(3);
  expect(a.pairs[0].history).toHaveLength(2);
  expect(a.inFlight).toHaveLength(1); // Replacement cannot free an unresolved dispatch slot.
  const stale = transitionBatch(a, { type: 'settle', token, result: record() });
  expect(stale.state.pairs[0]).toMatchObject({ processing: 'queued', record: null, saved: null, intent: null });
  expect(stale.state.inFlight).toHaveLength(0);
  expect(stale.commands).toEqual([]);
});

test('replacement clears current result/confirmation/saved count but preserves historical saved outcome', () => {
  const { state, command } = submission();
  const saved = acknowledge(state, command);
  const next = transitionBatch(saved, { type: 'replace', pairId: pair(0), application: { ...app(0), applicationVersion: '2' }, image: { filename: '0.png', imageSha256: 'a'.repeat(64) } }).state;
  expect(next.pairs[0]).toMatchObject({ record: null, saved: null, draft: null, intent: null });
  expect(next.pairs[0].history[0].saved).toEqual(saved.pairs[0].saved);
  expect(summarizeBatch(next).reviewed).toBe(0);
  expect(acceptSavedReview(next, command.token, 'server-committed', validator).state).toEqual(next);
});

test('replacement cannot bypass invalid application, filename or duplicate identity checks', () => {
  const state = initial();
  for (const application of [{ ...app(0), abv: undefined }, app(1)]) {
    expect(transitionBatch(state, { type: 'replace', pairId: pair(0), application, image: { filename: '0.png', imageSha256: 'a'.repeat(64) } }).state).toEqual(state);
  }
});

test('blocked rows never dispatch; counters and completion summary derive from same snapshot', () => {
  const manifest = buildBatchManifest([{ filename: '0.png', imageSha256: 'a'.repeat(64) }, { filename: 'blocked.png', imageSha256: 'a'.repeat(64) }], [{ filename: '0.png', application: app(0) }]);
  const state = createBatchState(manifest, { batchId: uuid(9999) });
  const submitted = submission(ready(completed(state)));
  const saved = acknowledge(submitted.state, submitted.command);
  expect(summarizeBatch(saved)).toMatchObject({ total: 2, reviewed: 1, remaining: 1, blocked: 1, complete: false });
  expect(transitionBatch(saved, { type: 'dispatch', pairId: 'filename:blocked.png', ...ids(3) }).commands).toEqual([]);
  const single = submission(ready(completed(initial(1))));
  expect(summarizeBatch(acknowledge(single.state, single.command))).toMatchObject({ total: 1, reviewed: 1, remaining: 0, complete: true });
});

test('navigation does not abandon correctly keyed background pair results', () => {
  const start = dispatched();
  const away = transitionBatch(start.state, { type: 'navigate', target: 'next' }).state;
  const done = transitionBatch(away, { type: 'settle', token: start.token, result: record() });
  expect(done.state.selectedId).toBe(pair(1));
  expect(done.state.pairs[0].processing).toBe('complete');
  expect(done.state.pairs[1].record).toBeNull();
  expect(done.commands).toEqual([]);
});

test('outputs are immutable snapshots; state instances share no mutable queue or review data', () => {
  const one = initial(); const two = initial();
  const edits = { notes: 'Independent review notes', physical: { checked: false, note: '' } };
  const changed = transitionBatch(completed(one), { type: 'edit-intent', pairId: pair(0), edits }).state;
  edits.physical.note = 'external mutation';
  expect(changed.pairs[0].intent?.physical.note).toBe('');
  expect(Object.isFrozen(changed.pairs[0].intent)).toBe(true);
  expect(two.inFlight).toEqual([]);
  expect(one.pairs[0].processing).toBe('queued');
});
