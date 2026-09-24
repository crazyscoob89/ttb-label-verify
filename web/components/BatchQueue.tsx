'use client';
import { summarizeBatch, type BatchState } from '../lib/batch-state';
import type { Outcome } from '../lib/review-policy';

export default function BatchQueue({state,onCompare,onRetry,saved=[]}:{state:BatchState;onCompare:()=>void;onRetry:()=>void;saved?:Outcome[]}) {
  const summary = summarizeBatch(state);
  const selected = state.pairs.find(pair=>pair.id===state.selectedId)!;
  return <section aria-label="Batch queue" className="notice">
    <h2>Batch queue</h2>
    <div data-testid="batch-summary" role="status">
      <p>Total: {summary.total} · Compared: {summary.compared} · Failed: {summary.failed} · Blocked: {summary.blocked} · Queued: {summary.queued} · Running: {summary.running}</p>
      <p>Saved reviews: {saved.length} · UNSAVED drafts: {summary.drafts} · Remaining: {summary.remaining-saved.length} · Attempts: {state.usedAttemptIds.length} · Occupied slots: {state.inFlight.length}</p>
      <p>Saved outcomes — Pass: {saved.filter(o=>o==='pass').length} · Correction: {saved.filter(o=>o==='correction').length} · Second review: {saved.filter(o=>o==='second-review').length}</p>
    </div>
    <p>Local queue concurrency: {state.concurrency} (default / maximum 2). No automatic retry. Failed and blocked entries are still remaining; compared is not reviewed or saved. Counts cover current revisions with confirmed server receipts in this page. Reopen durable reviews in private history.</p>
    {state.mode==='live' && <p>Live start may incur paid scan holds for the bottle photos analyzed, within the 50 scans/day public demo quota and durable spend ledger. Failures, duplicates and timeouts may already have incurred spend. Rechecking a group keeps its revision and server attempt identity; it cannot create another paid extraction for that revision or recover a lost result. Check saved history first. Editing inputs creates a new revision requiring explicit queue start. Review-save retries do not call the provider.</p>}
    <div className="actions"><button onClick={onCompare} disabled={!summary.queued||state.inFlight.length>0}>{state.mode==='live'?'Start live batch':'Compare queued fixtures'}</button><button onClick={onRetry} disabled={selected.processing!=='failed'||state.inFlight.length>=state.concurrency}>{state.mode==='live'?(selected.groupId?'Recheck selected group (same revision)':'Retry selected pair (new paid intent)'):'Retry selected fixture'}</button></div>
  </section>;
}
