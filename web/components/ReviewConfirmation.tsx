'use client';
import { useState } from 'react';
import type { ComparisonRecord } from '../lib/comparison-record';
import { FIELD_KEYS } from '../lib/rules';
import { newReviewIntent, evaluateReview, buildUnsavedDraft, type ReviewIntent, type HumanResolution, type UnsavedDraft } from '../lib/review-policy';
import OutcomeCards, { outcomeLabels } from './OutcomeCards';

const labels = { brand:'Brand name', classType:'Class / type', abv:'Alcohol by volume', netContents:'Net contents', producer:'Producer name and address', origin:'Country of origin', warning:'Government warning' };
/** Parent remounts this component on ANY pairing/evidence generation change. */
export default function ReviewConfirmation({record}:{record:ComparisonRecord|null}) {
  const [intent,setIntent]=useState(()=>newReviewIntent(record));
  const [draft,setDraft]=useState<UnsavedDraft|null>(null);
  const eligibility=evaluateReview(record,intent);
  const complete=record?.processing==='complete';
  function change(next:ReviewIntent) { setIntent({...next,confirmed:false});setDraft(null); }
  function resolve(field:typeof FIELD_KEYS[number],patch:Partial<HumanResolution>) {
    change({...intent,resolutions:{...intent.resolutions,[field]:{decision:'unresolved',note:'',evidence:'',...intent.resolutions[field],...patch}}});
  }
  function submit() {
    if (draft) return;
    const candidate=buildUnsavedDraft(record,intent);
    if (candidate) setDraft(candidate);
  }
  return <section className="decision" aria-labelledby="decision-title">
    <h2 id="decision-title">Human review</h2>
    <p>UNSAVED until a Phase 4 server commit exists. This demonstration records only a page-memory draft; reviewer identity is unknown. No government submission.</p>
    {complete && <>
      <p className="help">Machine observations and reasons above remain unchanged. A confirmed mismatch blocks Pass. Only a documented, supported human verification that the check actually matches can resolve an extraction/rules error. Do not mark an actual defect verified.</p>
      {FIELD_KEYS.filter(key=>record.comparison.fields[key].status==='mismatch'||record.comparison.fields[key].status==='needs-review').map(key=><fieldset className="resolution" key={key}>
        <legend>{labels[key]} — human assessment</legend>
        <label htmlFor={`resolve-${key}`}>Human resolution for {labels[key]}</label>
        <select id={`resolve-${key}`} value={intent.resolutions[key]?.decision??'unresolved'} onChange={e=>resolve(key,{decision:e.target.value as HumanResolution['decision']})}>
          <option value="unresolved">Unresolved — blocks Pass</option><option value="confirmed-mismatch">Confirmed mismatch — blocks Pass</option><option value="verified-match">Human verified match — supporting evidence required</option>
        </select>
        <label htmlFor={`reason-${key}`}>Resolution reason for {labels[key]}</label><textarea id={`reason-${key}`} maxLength={2000} value={intent.resolutions[key]?.note??''} onChange={e=>resolve(key,{note:e.target.value})} />
        <label htmlFor={`evidence-${key}`}>Supporting evidence for {labels[key]}</label><textarea id={`evidence-${key}`} maxLength={2000} value={intent.resolutions[key]?.evidence??''} onChange={e=>resolve(key,{evidence:e.target.value})} />
      </fieldset>)}
      <fieldset className="physical"><legend>Physical print/type size — not verified by image analysis</legend>
        <p className="help">An image has no reliable physical scale. Document an independent assessment before any Pass draft. Checking this box is a human statement, not automated legal certification.</p>
        <label htmlFor="physical-notes">Physical assessment notes</label><textarea id="physical-notes" maxLength={2000} value={intent.physical.note} onChange={e=>change({...intent,physical:{...intent.physical,note:e.target.value}})} />
        <label className="check-label"><input type="checkbox" checked={intent.physical.checked} onChange={e=>change({...intent,physical:{...intent.physical,checked:e.target.checked}})} />I assessed physical print/type size outside this image</label>
      </fieldset>
    </>}
    <OutcomeCards value={intent.outcome} onChange={outcome=>change({...intent,outcome})} passReasons={eligibility.passReasons} disabled={!complete} />
    <label htmlFor="review-notes">Correction / escalation notes</label><textarea id="review-notes" maxLength={2000} disabled={!complete} value={intent.notes} onChange={e=>change({...intent,notes:e.target.value})} />
    <div className="submit-row">
      <label className="check-label"><input type="checkbox" checked={intent.confirmed} disabled={!complete||!!draft} onChange={e=>setIntent({...intent,confirmed:e.target.checked})} />I reviewed this exact evidence and application and confirm this internal outcome</label>
      <button onClick={submit} disabled={!eligibility.canSubmit||!!draft} aria-describedby="submit-help">Submit review</button>
      <p id="submit-help" className="help">{draft?'Draft prepared in memory only. Change a decision to prepare another draft.':eligibility.canSubmit?'Ready to prepare an UNSAVED internal draft.':eligibility.reasons.join(' ')}</p>
    </div>
    {draft && <div data-testid="unsaved-draft" role="status" className="notice"><strong>UNSAVED draft — {outcomeLabels[draft.intent.outcome!]}</strong><p>Not committed to a server. Reload or changing evidence clears this draft. No authenticated reviewer, timestamp, durable receipt, history or external notification.</p><p>Application {draft.record.application.applicationId} / version {draft.record.application.applicationVersion}</p>{draft.intent.notes&&<p>Notes: {draft.intent.notes}</p>}{draft.intent.physical.checked&&<p>Human physical assessment: {draft.intent.physical.note}</p>}{Object.entries(draft.intent.resolutions).map(([key,resolution])=><p key={key}>{labels[key as keyof typeof labels]}: {resolution.decision} — {resolution.note} Supporting evidence: {resolution.evidence}. Machine finding retained: {draft.record.comparison.fields[key as keyof typeof labels].status}.</p>)}</div>}
  </section>;
}
