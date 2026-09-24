import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {finalizeComparison} from '../lib/comparison-record';
import {compareApplication} from '../lib/rules';
import {compareApplicationV3} from '../lib/wine-rules';
import {comparePhotoApplication} from '../lib/group-rules';
import {checkedRecord,evaluateReview,newReviewIntent} from '../lib/review-policy';
import {parseApplication} from '../lib/contracts';
import {parseExtractionEvidence} from '../lib/extraction/schema';
import {groupFixture} from './fixtures/photo-groups';
import fixtures from './fixtures/comparisons.json';
import historical from './fixtures/rules-v1-records.json';
const application=parseApplication({...fixtures.application,commodity:'wine',classType:'Wine',imported:false,origin:{kind:'domestic',country:'US'}});
const evidence=parseExtractionEvidence({...fixtures.evidence,classType:{...fixtures.evidence.classType,status:'readable',text:'Cabernet Sauvignon'},origin:{...fixtures.evidence.origin,status:'readable',text:'Lodi, CA'}});
function fresh(){return finalizeComparison(application,{processing:'complete',evidence,metadata:{source:'fixture',model:'offline-fixture',schemaVersion:1,rulesVersion:'prototype-seven-fields-v1',promptVersion:'image-observations-v1',imageSha256:'a'.repeat(64),requestId:randomUUID()}},'a'.repeat(64));}
test('new singleton finalization and explicit replay use revision 5 while revisions 1/2/3 remain frozen',()=>{
 const r=fresh();expect(r.processing).toBe('complete');if(r.processing!=='complete')throw Error('fixture');
 expect(r.comparison.rulesRevision).toBe(5);expect(r.comparison.fields.classType.status).toBe('match');expect(r.comparison.fields.origin.status).toBe('not-applicable');expect(checkedRecord(r)).not.toBeNull();
 const old={...r,comparison:compareApplication(application,evidence)};expect(checkedRecord(old)).not.toBeNull();expect(old.comparison.processing==='complete'&&old.comparison.fields.classType.status).toBe('mismatch');
 const v3={...r,comparison:compareApplicationV3(application,evidence)};expect(checkedRecord(v3)).not.toBeNull();expect(checkedRecord({...v3,comparison:{...v3.comparison,rulesRevision:2}})).toBeNull();
 for(const value of Object.values(historical)){if(value&&typeof value==='object'&&'record' in value)expect(checkedRecord(value.record)).not.toBeNull();}
});
test('group revision 6 retains wine V3 compatibility in aggregate AND individual photo findings',()=>{
 const r=comparePhotoApplication(application,{schemaVersion:2,photos:[{photoId:randomUUID(),evidence}]});expect(r.rulesRevision).toBe(6);expect(r.fields.classType.status).toBe('match');expect(r.fields.origin.status).toBe('not-applicable');expect(r.fields.warning.reasons.join(' ')).toContain('physical');
});
test('confirmed genuine defects cannot pass; supported human correction preserves original AI findings',async()=>{
 const {record}=await groupFixture();const intent={...newReviewIntent(record),outcome:'pass' as const,confirmed:true,physical:{checked:true,note:'Synthetic external physical assessment only.'},resolutions:{abv:{decision:'confirmed-mismatch' as const,note:'Confirmed defect on original label.',evidence:'Original label physical inspection.'}}};
 expect(evaluateReview(record,intent).passAllowed).toBe(false);expect(evaluateReview(record,{...intent,outcome:'correction',notes:'Correct the independently confirmed defect.'}).canSubmit).toBe(true);
});
