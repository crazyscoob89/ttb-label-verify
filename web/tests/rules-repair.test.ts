import { describe, expect, it } from 'vitest';
import { compareApplication } from '../lib/rules';
import { checkedRecord, evaluateReview, newReviewIntent } from '../lib/review-policy';
import fixtures from './fixtures/comparisons.json';
import historical from './fixtures/rules-v1-records.json';

function compare(abv = '13.5% BY VOL.', origin = 'PRODUCT OF NEW ZEALAND', imported = true) {
 const application = {...fixtures.application, abv:12.5, imported, origin:{kind:imported?'imported':'domestic',country:imported?'New Zealand':'USA'}};
 const evidence = {...fixtures.evidence,abv:{...fixtures.evidence.abv,text:abv},origin:{...fixtures.evidence.origin,text:origin}};
 const comparison=compareApplication(application,evidence);
 if(comparison.processing!=='complete')throw Error('Expected comparison');
 return {processing:'complete' as const,application,evidence,comparison,source:'fixture' as const,imageSha256:'a'.repeat(64)};
}
describe('bounded printed notation repair',()=>{
 it.each(['13.5% BY VOL','13.5% BY VOL.','13.5 % by vol.','13.5% BY\nVOL.'])('%s exposes the real numeric mismatch',text=>{
  const r=compare(text);expect(r.comparison.fields.abv.status).toBe('mismatch');expect(r.comparison.fields.abv.observed.text).toBe(text);
 });
 it.each(['12.5% BY VOL','12.500% BY VOL.'])('%s compares exact decimals',text=>expect(compare(text).comparison.fields.abv.status).toBe('match'));
 it.each(['12.5% BY VOL. / 13.5%','12.5% BY VOL..','12.5 BY VOL','12.5% BY VOLUME','approx 12.5% BY VOL.','12.5% BY VOL. 25 proof','12,5% BY VOL.'])('unsupported %s remains review',text=>expect(compare(text).comparison.fields.abv.status).toBe('needs-review'));
 it('new comparisons carry an explicit revision without changing the deployed spend-contract family',()=>{
  expect(compare().comparison).toMatchObject({rulesVersion:'prototype-seven-fields-v1',rulesRevision:2});
 });
});
describe('origin context and printed prefix',()=>{
 it.each(['PRODUCT OF NEW ZEALAND','product of New Zealand',' PRODUCT\nOF  New Zealand '])('normalizes only bounded prefix %s',text=>{
  const r=compare('12.5%',text);expect(r.comparison.fields.origin.status).toBe('match');expect(r.comparison.fields.origin.observed.text).toBe(text);
 });
 it.each(['wine','distilled-spirits','malt-beverage'])('flags domestic contradiction for %s without an import-statement requirement',commodity=>{
  const r=compare('12.5%','PRODUCT OF NEW ZEALAND',false);
  const result=compareApplication({...r.application,commodity},r.evidence);
  expect(result).toMatchObject({fields:{origin:{status:'mismatch'}}});
 });
 it('does not conceal a readable unequal imported country',()=>expect(compare('12.5%','PRODUCT OF AUSTRALIA').comparison.fields.origin.status).toBe('mismatch'));
 it.each(['USA','U.S.A.','United States','PRODUCT OF UNITED STATES OF AMERICA'])('domestic evidence %s remains N/A',text=>expect(compare('12.5%',text,false).comparison.fields.origin.status).toBe('not-applicable'));
 it.each(['PRODUCT OF','PRODUCT OF NEW ZEALAND / AUSTRALIA','PRODUCT OF NEW ZEALAND OR AUSTRALIA','PRODUCT OF PRODUCT OF NEW ZEALAND','PRODUCT OF NEW ZEALAND?'])('ambiguous %s requires review',text=>{
  for(const imported of [true,false])expect(compare('12.5%',text,imported).comparison.fields.origin.status).toBe('needs-review');
 });
 it.each(['uncertain','unreadable','missing'])('%s does not become a known contradiction or invented origin',status=>{
  for(const imported of [true,false]){
   const r=compare('12.5%','PRODUCT OF NEW ZEALAND',imported);
   const result=compareApplication(r.application,{...r.evidence,origin:{...r.evidence.origin,status,text:status==='missing'?null:r.evidence.origin.text}});
   expect(result).toMatchObject({fields:{origin:{status:!imported&&status==='missing'?'not-applicable':'needs-review'}}});
  }
 });
});
describe('original snapshots remain pinned, never silently reinterpreted',()=>{
 it.each(historical)('$name retains exact original findings and binding',({record})=>{
  const before=JSON.stringify(record);
  expect(checkedRecord(record)).toEqual(record);expect(JSON.stringify(record)).toBe(before);
  const intent={...newReviewIntent(record),outcome:'second-review',confirmed:true,notes:'Historical synthetic review for compatibility.'};
  expect(evaluateReview(record,intent).canSubmit).toBe(true);
  const fresh={...record,comparison:compareApplication(record.application,record.evidence)};
  expect(evaluateReview(fresh,intent).canSubmit).toBe(false);
 });
 it.each(historical)('$name rejects modified findings, reasons, version and revision',({record})=>{
  for(const mutate of [
   (r:typeof record)=>{r.comparison.fields.abv.status='match';r.comparison.fields.origin.status='match';},
   (r:typeof record)=>{r.comparison.fields.origin.reasons=['tampered'];},
   (r:typeof record)=>{r.comparison.rulesVersion='unknown';},
   (r:typeof record)=>{Object.assign(r.comparison,{rulesRevision:999});},
   (r:typeof record)=>{Object.assign(r.comparison,{rulesRevision:2});},
  ]){const forged=structuredClone(record);mutate(forged);expect(checkedRecord(forged)).toBeNull();}
 });
 it('an old domestic Pass cannot be applied to repaired contradictory evidence',()=>{
  const record=historical.find(r=>r.name==='domestic-contradiction')!.record;
  const intent={...newReviewIntent(record),outcome:'pass',confirmed:true,physical:{checked:true,note:'Synthetic physical assessment recorded for compatibility only.'}};
  expect(evaluateReview(record,intent).canSubmit).toBe(true);
  const fresh={...record,comparison:compareApplication(record.application,record.evidence)};
  expect(evaluateReview(fresh,intent).canSubmit).toBe(false);
  expect(evaluateReview(fresh,{...intent,bindingKey:newReviewIntent(fresh).bindingKey}).canSubmit).toBe(false);
 });
});
