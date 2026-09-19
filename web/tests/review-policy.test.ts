import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { samples, compareOfflineSample } from '../lib/offline-demo';
import { evaluateReview, newReviewIntent, buildUnsavedDraft, reviewBinding, type ReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';

async function record(id: keyof typeof samples = 'match') {
  const s = samples[id]; return await compareOfflineSample(id, s.application, await readFile(`public${s.imagePath}`)) as CompleteComparison;
}
function intent(r: CompleteComparison): ReviewIntent { return { ...newReviewIntent(r), outcome:'pass', confirmed:true, physical:{ checked:true, note:'Measured physical print using a scale reference outside this image.' } }; }
it('requires explicit physical assessment and human confirmation even for seven matching fields', async () => {
  const r = await record(); const i = newReviewIntent(r);
  expect(evaluateReview(r,i).passReasons.join(' ')).toMatch(/physical/i);
  expect(evaluateReview(r,i).canSubmit).toBe(false);
  const valid = intent(r); valid.confirmed = false;
  expect(evaluateReview(r,valid).canSubmit).toBe(false);
  valid.confirmed = true;
  expect(evaluateReview(r,valid).canSubmit).toBe(true);
});
it('readable mismatch blocks Pass until explicit supported resolution; never edits machine findings', async () => {
  const r = await record('discrepancy'); const i = intent(r);
  expect(evaluateReview(r,i).passAllowed).toBe(false);
  expect(evaluateReview(r,i).passReasons.join(' ')).toMatch(/abv.*mismatch/i);
  i.resolutions.abv = { decision:'verified-match', note:'Manually checked original print; recorded extraction mistake.', evidence:'Original physical label verified as 40%; synthetic resolution exercise only.' };
  expect(evaluateReview(r,i).canSubmit).toBe(true);
  const d = buildUnsavedDraft(r,i)!;
  expect(d.state).toBe('UNSAVED');
  expect(d.record.comparison.fields.abv.status).toBe('mismatch');
  expect(d.record.comparison.fields.abv.reasons).toEqual(r.comparison.fields.abv.reasons);
  expect(d.intent.resolutions.abv).toEqual(i.resolutions.abv);
  expect(d).not.toHaveProperty('reviewer'); expect(d).not.toHaveProperty('timestamp'); expect(d).not.toHaveProperty('receiptId');
  i.resolutions.abv.note = 'changed';
  expect(d.intent.resolutions.abv?.note).not.toBe('changed'); expect(Object.isFrozen(d.intent.resolutions.abv)).toBe(true);
});
it.each(['unresolved','confirmed-mismatch'] as const)('a %s resolution cannot permit Pass', async (decision: 'unresolved'|'confirmed-mismatch') => {
  const r=await record('discrepancy'); const i=intent(r); i.resolutions.abv={decision,note:'Human review notes recorded here.',evidence:'Original label still shows 45%.'};
  expect(evaluateReview(r,i).passAllowed).toBe(false); expect(buildUnsavedDraft(r,i)).toBeNull();
});
it('uncertainty remains needs-review without a supported human assessment', async () => {
  const r=await record('uncertainty'); const i=intent(r);
  expect(evaluateReview(r,i).passReasons.join(' ')).toMatch(/abv.*needs-review/i);
  i.resolutions.abv={decision:'verified-match',note:' ',evidence:' '}; expect(evaluateReview(r,i).canSubmit).toBe(false);
});
it.each(['correction','second-review'] as const)('%s needs relevant notes but not a pretend physical Pass assessment', async (outcome: 'correction'|'second-review') => {
  const r=await record('uncertainty'); const i={...newReviewIntent(r),outcome,confirmed:true};
  expect(evaluateReview(r,i).canSubmit).toBe(false);
  i.notes=outcome==='correction'?'Request a new image showing the obscured ABV.':'Second reviewer should assess the obscured ABV.';
  expect(evaluateReview(r,i).canSubmit).toBe(true);
});
it('changing evidence, applicant declaration, or version invalidates old confirmation', async () => {
  const r=await record(); const i=intent(r);
  const replacements = [await record('discrepancy'), {...r,application:{...r.application,applicationVersion:'2'}}, {...r,application:{...r.application,abv:45}}, {...r,imageSha256:'b'.repeat(64)}];
  for (const changed of replacements) { expect(reviewBinding(changed)).not.toBe(i.bindingKey); expect(evaluateReview(changed,i).canSubmit).toBe(false); }
});
it.each([null,{}, {processing:'failed',code:'provider-failed'}, {processing:'complete'}, {processing:'complete',application:null}])('failed, missing or unmapped records cannot submit %j', async r => {
  const valid=await record(); const i=intent(valid);
  expect(evaluateReview(r,i).canSubmit).toBe(false); expect(buildUnsavedDraft(r,i)).toBeNull();
});
it('rejects a forged passing field, extra identity properties and malformed review state', async () => {
  const r=await record('discrepancy'); const bad=structuredClone(r); bad.comparison.fields.abv.status='match';
  expect(evaluateReview(bad,intent(bad)).canSubmit).toBe(false);
  expect(evaluateReview(r,{...intent(r),reviewer:'invented'}).canSubmit).toBe(false);
  expect(evaluateReview(r,{...intent(r),outcome:'government-approval'}).canSubmit).toBe(false);
});
