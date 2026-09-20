import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildBatchManifest } from '../lib/batch-manifest';
import { createBatchState, summarizeBatch, transitionBatch, type DispatchCommand } from '../lib/batch-state';
import { executeLivePair } from '../lib/live-batch-client';
import fixtures from './fixtures/comparisons.json';
import { createComparisonService } from '../lib/compare-service';
import { createFixtureProvider } from '../lib/extraction/fixture-provider';
import { image } from './fixtures/synthetic';
const ids = () => ({ attemptId: randomUUID(), reservationId: randomUUID() });
function batch() {
  return createBatchState(buildBatchManifest(['a.png','b.png','c.png'].map(filename => ({ filename, imageSha256: null })), ['a.png','b.png','c.png'].map(filename => ({ filename, application: { ...fixtures.application, applicationId: filename } })), { live: true }), { batchId: randomUUID(), live: true });
}

test('live slots start unprepared; edited revision and out-of-order preparation/completion cannot replace current evidence', async () => {
  const initial = batch();
  const step = transitionBatch(initial, { type: 'dispatch-next', attempts: [ids(),ids(),ids()] });
  let state = step.state;
  const [a,b] = step.commands as DispatchCommand[];
  expect(step.commands).toHaveLength(2); expect(state.inFlight).toHaveLength(2);
  expect(a.image.imageSha256).toBeNull();
  state = transitionBatch(state, { type: 'replace', pairId: a.token.pairId, application: { ...a.application, applicationVersion: 'v2' }, image: { filename: 'a.png', imageSha256: null } }).state;
  expect(state.pairs[0].revision).toBe(2); expect(state.inFlight).toHaveLength(2);
  expect(transitionBatch(state, { type: 'prepared', token: a.token, imageSha256: 'a'.repeat(64) }).rejected).toBeTruthy();
  // Other slot completes first with real local rules and synthetic evidence.
  const compare = createComparisonService({ provider: createFixtureProvider(fixtures.evidence), authorize: () => true });
  const synthetic = await compare({ file: { filename: 'b.png', mime: 'image/png', bytes: await image() }, binding: { filename: 'b.png', application: b.application } });
  expect(synthetic.processing).toBe('complete'); if (synthetic.processing !== 'complete') throw Error('fixture');
  // Synthetic-only observations with the real route's source discriminator.
  const record = { ...synthetic, source: 'openrouter' as const };
  state = transitionBatch(state, { type: 'prepared', token: b.token, imageSha256: record.imageSha256 }).state;
  state = transitionBatch(state, { type: 'settle', token: b.token, result: record }).state;
  state = transitionBatch(state, { type: 'settle', token: a.token, result: record }).state;
  expect(state.pairs[0].record).toBeNull(); expect(state.pairs[0].processing).toBe('queued');
  expect(state.pairs[1].record).toEqual(record); expect(state.inFlight).toHaveLength(0);
  state = transitionBatch(state, { type: 'navigate', target: b.token.pairId }).state;
  state = transitionBatch(state, { type: 'edit-intent', pairId: b.token.pairId, edits: { outcome: 'second-review', notes: 'Independent review needed.' } }).state;
  state = transitionBatch(state, { type: 'confirm', pairId: b.token.pairId }).state;
  state = transitionBatch(state, { type: 'draft', pairId: b.token.pairId }).state;
  expect(state.pairs[1].draft).not.toBeNull(); expect(state.pairs[1].saved).toBeNull();
  expect(summarizeBatch(state)).toMatchObject({ reviewed: 0, drafts: 1, remaining: 3 });
  const next = transitionBatch(state, { type: 'dispatch', pairId: a.token.pairId, ...ids() });
  expect((next.commands[0] as DispatchCommand).token.revision).toBe(2);
});

test('client preserves File, exact application and stable intent; preparation failure/staleness never executes', async () => {
  const original = transitionBatch(batch(), { type: 'dispatch-next', attempts: [ids()] }).commands[0] as DispatchCommand;
  const command = { ...original, image: { ...original.image, filename: 'label-酒%.png' }, token: { ...original.token, pairId: 'filename:label-酒%.png' } };
  const file = new File(['file-reference'], command.image.filename, { type: 'image/png' });
  const prepared = { imageSha256: 'a'.repeat(64), binding: 'a'.repeat(64)+'.'+'b'.repeat(64) };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    expect(() => new Headers(init!.headers)).not.toThrow();
    const body = init!.body as FormData;
    expect(body.get('image')).toBe(file);
    expect(JSON.parse(String(body.get('application')))).toEqual(command.application);
    return (init!.headers as Record<string,string>)['x-ttb-batch-phase'] === 'prepare'
      ? Response.json({ prepared }) : Response.json({ code: 'attempt-already-recorded' }, { status: 409 });
  });
  const accept = vi.fn(() => true);
  expect(await executeLivePair(command, file, 'synthetic-code', accept, fetcher)).toEqual({ processing:'failed',code:'provider-failed' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse((fetcher.mock.calls[1][1]!.headers as Record<string,string>)['x-ttb-batch-intent'])).toEqual(command.token);
  expect(accept).toHaveBeenCalledWith(command.token, prepared.imageSha256);
  fetcher.mockClear(); await executeLivePair(command, file, 'synthetic-code', () => false, fetcher); expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear(); fetcher.mockResolvedValue(Response.json({code:'invalid-input'},{status:400}));
  expect(await executeLivePair(command, file, 'synthetic-code', accept, fetcher)).toEqual({ processing:'failed',code:'invalid-input' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear(); fetcher.mockRejectedValue(Error('network timeout'));
  await executeLivePair(command, file, 'synthetic-code', accept, fetcher); expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockClear();
  fetcher.mockResolvedValueOnce(Response.json({ prepared })).mockRejectedValueOnce(Error('lost execute response'));
  expect(await executeLivePair(command, file, 'synthetic-code', accept, fetcher)).toEqual({ processing:'failed',code:'provider-failed' });
  expect(fetcher).toHaveBeenCalledTimes(2); // Never fetch a fresh paid intent after uncertainty.
});
