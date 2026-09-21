'use client';
import { useId, useState } from 'react';
import type { ComparisonRecord } from '../lib/comparison-record';
import { FIELD_KEYS } from '../lib/rules';
import { newReviewIntent, evaluateReview, buildUnsavedDraft, type ReviewIntent, type HumanResolution, type UnsavedDraft } from '../lib/review-policy';
import OutcomeCards, { outcomeLabels } from './OutcomeCards';
import { useDurableReview } from '../lib/use-durable-review';
import type { SavedReceipt } from '../lib/saved-review-contract';

const labels = { brand:'Brand name', classType:'Class / type', abv:'Alcohol by volume', netContents:'Net contents', producer:'Producer name and address', origin:'Country of origin', warning:'Government warning' };
/** Parent remounts this component on ANY pairing/evidence generation change. */
export type ControlledReview = {
  intent: ReviewIntent; draft: UnsavedDraft | null;
  onEdit: (intent: ReviewIntent) => void; onConfirm: (checked: boolean) => void; onDraft: () => void;
};
export default function ReviewConfirmation({record, controlled, comparisonId, accessCode, onSaved}:{record:ComparisonRecord|null;controlled?:ControlledReview;comparisonId?:string;accessCode?:string;onSaved?:(receipt:SavedReceipt)=>void}) {
  const id = useId(); // Single and Batch remain mounted; all label targets must be unique.
  const [localIntent,setIntent]=useState(()=>newReviewIntent(record));
  const [localDraft,setDraft]=useState<UnsavedDraft|null>(null);
  const intent=controlled?.intent??localIntent;
  const draft=controlled?controlled.draft:localDraft;
  const durable=useDurableReview(comparisonId,accessCode,intent,onSaved);
  const eligibility=evaluateReview(record,intent);
  const complete=record?.processing==='complete';
  function change(next:ReviewIntent) { if(controlled){controlled.onEdit(next);return;} setIntent({...next,confirmed:false});setDraft(null); }
  function resolve(field:typeof FIELD_KEYS[number],patch:Partial<HumanResolution>) {
    change({...intent,resolutions:{...intent.resolutions,[field]:{decision:'unresolved',note:'',evidence:'',...intent.resolutions[field],...patch}}});
  }
  function submit() {
    if(comparisonId){if(eligibility.canSubmit)void durable.save();return;}
    if (draft) return;
    if (controlled) { controlled.onDraft(); return; }
    const candidate=buildUnsavedDraft(record,intent);
    if (candidate) setDraft(candidate);
  }
  return <section className="decision" aria-labelledby={`${id}-decision-title`}>
    <h2 id={`${id}-decision-title`}>Human review</h2>
    <p>{comparisonId?'UNSAVED until the server confirms a durable receipt. Shared demo access code — NOT an individually authenticated reviewer.':'UNSAVED: no server snapshot is available. This demonstration can only prepare a page-memory draft; reviewer identity is unknown.'} No government submission.</p>
    <fieldset disabled={durable.pending||!!durable.receipt} style={{border:0,padding:0}}>
    {complete && <>
      <p className="help">Machine observations and reasons above remain unchanged. A confirmed mismatch blocks Pass. Only a documented, supported human verification that the check actually matches can resolve an extraction/rules error. Do not mark an actual defect verified.</p>
      {FIELD_KEYS.filter(key=>record.comparison.fields[key].status==='mismatch'||record.comparison.fields[key].status==='needs-review').map(key=><fieldset className="resolution" key={key}>
        <legend>{labels[key]} — human assessment</legend>
        <label htmlFor={`${id}-resolve-${key}`}>Human resolution for {labels[key]}</label>
        <select id={`${id}-resolve-${key}`} value={intent.resolutions[key]?.decision??'unresolved'} onChange={e=>resolve(key,{decision:e.target.value as HumanResolution['decision']})}>
          <option value="unresolved">Unresolved — blocks Pass</option><option value="confirmed-mismatch">Confirmed mismatch — blocks Pass</option><option value="verified-match">Human verified match — supporting evidence required</option>
        </select>
        <label htmlFor={`${id}-reason-${key}`}>Resolution reason for {labels[key]}</label><textarea id={`${id}-reason-${key}`} maxLength={2000} value={intent.resolutions[key]?.note??''} onChange={e=>resolve(key,{note:e.target.value})} />
        <label htmlFor={`${id}-evidence-${key}`}>Supporting evidence for {labels[key]}</label><textarea id={`${id}-evidence-${key}`} maxLength={2000} value={intent.resolutions[key]?.evidence??''} onChange={e=>resolve(key,{evidence:e.target.value})} />
      </fieldset>)}
      <fieldset className="physical"><legend>Physical print/type size — not verified by image analysis</legend>
        <p className="help">An image has no reliable physical scale. Document an independent assessment before any Pass draft. Checking this box is a human statement, not automated legal certification.</p>
        <label htmlFor={`${id}-physical-notes`}>Physical assessment notes</label><textarea id={`${id}-physical-notes`} maxLength={2000} value={intent.physical.note} onChange={e=>change({...intent,physical:{...intent.physical,note:e.target.value}})} />
        <label className="check-label"><input type="checkbox" checked={intent.physical.checked} onChange={e=>change({...intent,physical:{...intent.physical,checked:e.target.checked}})} />I assessed physical print/type size outside this image</label>
      </fieldset>
    </>}
    <OutcomeCards value={intent.outcome} onChange={outcome=>change({...intent,outcome})} passReasons={eligibility.passReasons} disabled={!complete} />
    <label htmlFor={`${id}-review-notes`}>Correction / escalation notes</label><textarea id={`${id}-review-notes`} maxLength={2000} disabled={!complete} value={intent.notes} onChange={e=>change({...intent,notes:e.target.value})} />
    <div className="submit-row">
      <label className="check-label"><input type="checkbox" checked={intent.confirmed} disabled={!complete||!!draft} onChange={e=>controlled?controlled.onConfirm(e.target.checked):setIntent({...intent,confirmed:e.target.checked})} />I reviewed this exact evidence and application and confirm this internal outcome</label>
      <button onClick={submit} disabled={!eligibility.canSubmit||!!draft||(!!comparisonId&&!accessCode)} aria-describedby={`${id}-submit-help`}>{durable.pending?'Saving…':'Submit review'}</button>
      <p id={`${id}-submit-help`} className="help">{draft?'Draft prepared in memory only. Change a decision to prepare another draft.':eligibility.canSubmit?(comparisonId?'Ready to save this exact internal review.':'Ready to prepare an UNSAVED internal draft.'):eligibility.reasons.join(' ')}</p>
    </div>
    </fieldset>
    {durable.error&&<p role="alert" className="notice error">{durable.error}</p>}
    {durable.receipt&&<div data-testid="saved-review" role="status" className="notice"><strong>SAVED — durable internal review</strong><p>Receipt {durable.receipt.reviewId} · Server time {durable.receipt.savedAt}</p><p>{durable.receipt.identity}</p><p>Reopen the original application and normalized label in Saved review history. This review cannot be edited.</p></div>}
    {draft && <div data-testid="unsaved-draft" role="status" className="notice"><strong>UNSAVED draft — {outcomeLabels[draft.intent.outcome!]}</strong><p>Not committed to a server. Reload or changing evidence clears this draft. No authenticated reviewer, timestamp, durable receipt, history or external notification.</p><p>Application {draft.record.application.applicationId} / version {draft.record.application.applicationVersion}</p>{draft.intent.notes&&<p>Notes: {draft.intent.notes}</p>}{draft.intent.physical.checked&&<p>Human physical assessment: {draft.intent.physical.note}</p>}{Object.entries(draft.intent.resolutions).map(([key,resolution])=><p key={key}>{labels[key as keyof typeof labels]}: {resolution.decision} — {resolution.note} Supporting evidence: {resolution.evidence}. Machine finding retained: {draft.record.comparison.fields[key as keyof typeof labels].status}.</p>)}</div>}
  </section>;
}
