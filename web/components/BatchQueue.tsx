'use client';
import { summarizeBatch, type BatchState } from '../lib/batch-state';

export default function BatchQueue({state,onCompare,onRetry}:{state:BatchState;onCompare:()=>void;onRetry:()=>void}) {
  const summary = summarizeBatch(state);
  const selected = state.pairs.find(pair=>pair.id===state.selectedId)!;
  return <section aria-label="Batch queue" className="notice">
    <h2>Batch queue</h2>
    <div data-testid="batch-summary" role="status">
      <p>Total: {summary.total} · Compared: {summary.compared} · Failed: {summary.failed} · Blocked: {summary.blocked} · Queued: {summary.queued} · Running: {summary.running}</p>
      <p>Saved reviews: {summary.reviewed} · UNSAVED drafts: {summary.drafts} · Remaining: {summary.remaining} · Attempts: {state.usedAttemptIds.length} · Occupied slots: {state.inFlight.length}</p>
      <p>Saved outcomes — Pass: {summary.outcomes.pass} · Correction: {summary.outcomes.correction} · Second review: {summary.outcomes['second-review']}</p>
    </div>
    <p>Local queue concurrency: {state.concurrency} (default / maximum 2). No automatic retry. Failed and blocked entries are still remaining; compared is not reviewed or saved. No durable history.</p>
    {state.mode==='live' && <p>Live start may incur a $1 hold per attempted pair, within the shared $25 ceiling. Failures, duplicates and timeouts may already have incurred spend. Retry explicitly starts a NEW paid intent; it does not recover an old result. Nothing is saved.</p>}
    <div className="actions"><button onClick={onCompare} disabled={!summary.queued||state.inFlight.length>0}>{state.mode==='live'?'Start live batch':'Compare queued fixtures'}</button><button onClick={onRetry} disabled={selected.processing!=='failed'||state.inFlight.length>=state.concurrency}>{state.mode==='live'?'Retry selected pair (new paid intent)':'Retry selected fixture'}</button></div>
  </section>;
}
