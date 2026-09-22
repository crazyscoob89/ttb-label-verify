'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { UiComparisonRecord as ComparisonRecord } from '../lib/live-photo-client';
import { FIELD_KEYS } from '../lib/rules';
import { newReviewIntent, evaluateReview, buildUnsavedDraft, type ReviewIntent, type HumanResolution, type UnsavedDraft } from '../lib/review-policy';
import OutcomeCards, { outcomeLabels } from './OutcomeCards';
import { useDurableReview } from '../lib/use-durable-review';
import type { SavedReceipt } from '../lib/saved-review-contract';
import EvidenceReview, { fieldLabels as labels, type GalleryProps } from './EvidenceReview';
import { useSessionAccess } from './SessionAccess';
export type ControlledReview = {
  intent: ReviewIntent; draft: UnsavedDraft | null;
  resolutionEdits?:ReviewIntent['resolutions']; onResolutionEdit?:(field:typeof FIELD_KEYS[number],value:HumanResolution)=>void;
  onEdit: (intent: ReviewIntent) => void; onConfirm: (checked: boolean) => void; onDraft: () => void;
};
/** Callers key by the exact pairing generation; switching records clears confirmation. */
export default function ReviewConfirmation({record, controlled, comparisonId, accessCode, onSaved, preview, previewNote,photos,loadPhoto}:{record:ComparisonRecord|null;controlled?:ControlledReview;comparisonId?:string;accessCode?:string;onSaved?:(receipt:SavedReceipt)=>void;preview?:string|null;previewNote?:string}&GalleryProps) {
  const id = useId();
  const [localIntent,setIntent]=useState(()=>newReviewIntent(record));
  const [localDraft,setDraft]=useState<UnsavedDraft|null>(null);
  const [localResolutionEdits,setResolutionEdits]=useState<ReviewIntent['resolutions']>({});
  const resolutionEdits=controlled?.resolutionEdits??localResolutionEdits;
  const intent=controlled?.intent??localIntent;
  const draft=controlled?controlled.draft:localDraft;
  const {reviewEpoch}=useSessionAccess();
  const previousEpoch=useRef(reviewEpoch);
  useEffect(()=>{
    if(previousEpoch.current!==reviewEpoch){previousEpoch.current=reviewEpoch;if(controlled)controlled.onConfirm(false);else setIntent(previous=>({...previous,confirmed:false}));}
  },[reviewEpoch,controlled]);
  const durable=useDurableReview(comparisonId,accessCode,intent,onSaved);
  const eligibility=evaluateReview(record,intent);
  const complete=record?.processing==='complete';
  function change(next:ReviewIntent) { if(controlled){controlled.onEdit({...next,confirmed:false});return;} setIntent({...next,confirmed:false});setDraft(null); }
  function resolve(field:typeof FIELD_KEYS[number],patch:Partial<HumanResolution>) {
    const value={decision:'unresolved' as const,note:'',evidence:'',...(resolutionEdits[field]??intent.resolutions[field]),...patch};
    if(controlled?.onResolutionEdit)controlled.onResolutionEdit(field,value);else setResolutionEdits(previous=>({...previous,[field]:value}));
    change({...intent,resolutions:{...intent.resolutions,[field]:{decision:'unresolved',note:'',evidence:''}}});
  }
  function submit() {
    if(comparisonId){if(eligibility.canSubmit)void durable.save();return;}
    if (draft) return;
    if (controlled) { controlled.onDraft(); return; }
    const candidate=buildUnsavedDraft(record,intent);if(candidate)setDraft(candidate);
  }
  function resolution(key:typeof FIELD_KEYS[number]) {
    if(!complete||!['mismatch','needs-review'].includes(record.comparison.fields[key].status))return null;
    const chosen=resolutionEdits[key]??intent.resolutions[key]??{decision:'unresolved',note:'',evidence:''};
    const confirmed=intent.resolutions[key]?.decision&&intent.resolutions[key]?.decision!=='unresolved';
    const canConfirm=chosen.decision!=='unresolved'&&chosen.note.trim().length>=10&&(chosen.decision!=='verified-match'||chosen.evidence.trim().length>=10);
    return <>{confirmed&&<span className="status resolved" data-testid={`resolved-${key}`}>Resolved · {intent.resolutions[key]?.decision==='confirmed-mismatch'?'confirmed mismatch — blocks Pass':'human verified match'} · {durable.receipt?'server saved':'locally confirmed, UNSAVED'}</span>}<details className="inline-resolution"><summary>Resolve this field</summary><fieldset disabled={durable.pending||!!durable.receipt}><legend>{labels[key]} — human assessment</legend><p className="help">Original AI finding is unchanged. Selecting a choice does not resolve it: add a reason (at least 10 characters), supporting evidence for a verified match, then explicitly confirm. Confirmed defects still block Pass.</p>
      <label htmlFor={`${id}-resolve-${key}`}>Human resolution for {labels[key]}</label><select id={`${id}-resolve-${key}`} value={chosen.decision} onChange={e=>resolve(key,{decision:e.target.value as HumanResolution['decision']})}><option value="unresolved">Unresolved — blocks Pass</option><option value="confirmed-mismatch">Confirmed mismatch — blocks Pass</option><option value="verified-match">Human verified match — evidence required</option></select>
      <label htmlFor={`${id}-reason-${key}`}>Resolution reason for {labels[key]}</label><textarea id={`${id}-reason-${key}`} maxLength={2000} value={chosen.note} onChange={e=>resolve(key,{note:e.target.value})}/>
      <label htmlFor={`${id}-evidence-${key}`}>Supporting evidence for {labels[key]}</label><textarea id={`${id}-evidence-${key}`} maxLength={2000} value={chosen.evidence} onChange={e=>resolve(key,{evidence:e.target.value})}/>
      <button type="button" disabled={!canConfirm||!!confirmed} onClick={()=>change({...intent,resolutions:{...intent.resolutions,[key]:{...chosen}}})}>Confirm resolution for {labels[key]}</button>
    </fieldset></details></>;
  }
  const decision=<section className="decision" aria-labelledby={`${id}-decision-title`}>
    <p className="eyebrow">Selected record only · no bulk approval</p><h2 id={`${id}-decision-title`}>Human confirmation & outcome</h2>
    <p className="help">{durable.receipt?'SAVED — original review is read-only.':comparisonId?'UNSAVED until a server receipt confirms save.':'UNSAVED: no server snapshot. Only a page-memory draft is available.'} Shared demo identity, not an individually authenticated reviewer. No government submission.</p>
    <fieldset disabled={durable.pending||!!durable.receipt} className="decision-controls">
      {complete&&<details className="physical"><summary>Physical print/type size — {intent.physical.checked?'human assessment recorded':'unverified; required for Pass'}</summary><p className="help">An image has no reliable physical scale. Document actual independent measurement or assessment required by policy. Do not invent measurements. This is not automated legal certification.</p><label htmlFor={`${id}-physical-notes`}>Physical assessment notes</label><textarea id={`${id}-physical-notes`} maxLength={2000} value={intent.physical.note} onChange={e=>change({...intent,physical:{...intent.physical,note:e.target.value}})}/><label className="check-label"><input type="checkbox" checked={intent.physical.checked} onChange={e=>change({...intent,physical:{...intent.physical,checked:e.target.checked}})}/>I assessed physical print/type size outside this image</label></details>}
      <OutcomeCards value={intent.outcome} onChange={outcome=>change({...intent,outcome})} passReasons={eligibility.passReasons} disabled={!complete}/>
      <label htmlFor={`${id}-review-notes`}>Correction / escalation notes</label><textarea id={`${id}-review-notes`} maxLength={2000} disabled={!complete} value={intent.notes} onChange={e=>change({...intent,notes:e.target.value})}/>
      <div className="submit-row"><label className="check-label"><input type="checkbox" checked={intent.confirmed} disabled={!complete||!!draft} onChange={e=>controlled?controlled.onConfirm(e.target.checked):setIntent({...intent,confirmed:e.target.checked})}/>I reviewed this exact evidence and application and confirm this internal outcome</label><button onClick={submit} disabled={!eligibility.canSubmit||!!draft||(!!comparisonId&&!accessCode)} aria-describedby={`${id}-submit-help`}>{durable.pending?'Saving…':'Submit review'}</button><p id={`${id}-submit-help`} className="help">{draft?'Draft prepared in memory only. Change a decision to prepare another draft.':eligibility.canSubmit?(comparisonId?'Ready to save this exact internal review.':'Ready to prepare an UNSAVED internal draft.'):eligibility.reasons.join(' ')}</p></div>
    </fieldset>
    {durable.error&&<p role="alert" className="notice error">{durable.error}</p>}
    {durable.elapsedMs!==null&&<p className="help" role="status">Review save request: {durable.elapsedMs} ms · {durable.receipt?'server receipt verified':'receipt not confirmed'}. This is separate from photo processing.</p>}
    {durable.receipt&&<div data-testid="saved-review" role="status" className="notice"><strong>SAVED — durable internal review</strong><p>Receipt {durable.receipt.reviewId} · Server time {durable.receipt.savedAt}</p><p>{durable.receipt.identity}</p><p>Reopen the original application and normalized label in Saved review history. This review cannot be edited.</p></div>}
    {draft&&<div data-testid="unsaved-draft" role="status" className="notice"><strong>UNSAVED draft — {outcomeLabels[draft.intent.outcome!]}</strong><p>Not committed to a server. Reload or changing evidence clears this draft. No authenticated reviewer, timestamp, durable receipt or external notification.</p><p>Application {draft.record.application.applicationId} / version {draft.record.application.applicationVersion}</p><p>{draft.intent.notes}</p>{draft.intent.physical.checked&&<p>Human physical assessment: {draft.intent.physical.note}</p>}{Object.entries(draft.intent.resolutions).map(([key,r])=><p key={key}>{labels[key as keyof typeof labels]}: {r.decision} — {r.note} Supporting evidence: {r.evidence}. Machine finding retained: {draft.record.comparison.fields[key as keyof typeof labels].status}.</p>)}</div>}
  </section>;
  return complete?<EvidenceReview record={record} preview={preview} previewNote={previewNote} photos={photos} loadPhoto={loadPhoto} resolution={resolution}>{decision}</EvidenceReview>:decision;
}
