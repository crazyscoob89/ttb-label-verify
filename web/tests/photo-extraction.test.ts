import {test,expect,vi} from 'vitest';
import {groupFixture,photoEvidence} from './fixtures/photo-groups';
import {groupAttemptIds} from '../lib/group-binding';
import {createOpenRouterGroupProvider} from '../lib/extraction/openrouter';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import {createGroupComparisonService} from '../lib/group-compare-service';
import {checkedRecord,newReviewIntent,evaluateReview,reviewBinding} from '../lib/review-policy';
import {checkedServerRecord} from '../lib/group-assets';
import {verifyPhotoRecordDigest} from '../lib/photo-record';
import type {GroupExtractionRequest} from '../lib/extraction/group-provider';
const envelope=(evidence:unknown)=>Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(evidence)}}]});
async function setup(){
 const fixture=await groupFixture(4),store=new OfflineSpendStore();store.ceiling=25_000_000;
 const request:GroupExtractionRequest={schemaVersion:2,photos:fixture.prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),photoSetSha256:fixture.prepared.photoSetSha256,...groupAttemptIds(fixture.input.group.groupId,1)};
 const transport=vi.fn(async()=>envelope(photoEvidence(request.photos.map(p=>p.descriptor.photoId))));
 const provider=createOpenRouterGroupProvider({authorized:true,apiKey:'offline-only',store,maxCostMicrousd:1_000_000,transport});
 return {...fixture,request,store,transport,provider};
}
test('one guarded completion contains all four tagged images; v2 honest binding, permanent duplicate fence',async()=>{
 const s=await setup();const result=await s.provider.extractGroup(s.request);expect(result.processing).toBe('complete');expect(s.transport).toHaveBeenCalledTimes(1);
 const [,init]=s.transport.mock.calls[0] as unknown as [string,RequestInit];const body=JSON.parse(String(init.body));expect(body.max_tokens).toBe(6000);expect(body.messages[1].content).toHaveLength(8);
 for(let i=0;i<4;i++){expect(JSON.parse(body.messages[1].content[i*2].text).photoId).toBe(s.request.photos[i].descriptor.photoId);expect(body.messages[1].content[i*2+1].image_url.url).toContain(Buffer.from(s.request.photos[i].image).toString('base64'));}
 const hold=[...s.store.rows.values()][0];expect(hold.binding).toMatchObject({schemaVersion:2,promptVersion:'photo-set-observations-v2',imageSha256:s.request.photoSetSha256});expect(hold.state).toBe('unresolved');
 expect((await s.provider.extractGroup(s.request)).processing).toBe('failed');expect(s.transport).toHaveBeenCalledTimes(1);
});
test.each(['missing','duplicate','unknown','truncated','legacy','formatting'])('whole group fails %s output with no repair and liability retained',async bad=>{
 const s=await setup(),e=photoEvidence(s.request.photos.map(p=>p.descriptor.photoId));
 if(bad==='missing')e.photos.pop();if(bad==='duplicate')e.photos[1].photoId=e.photos[0].photoId;if(bad==='unknown')e.photos[1].photoId='11111111-1111-4111-8111-111111111111';
 if(bad==='formatting')e.photos[0].evidence.warning.body.status='unreadable';
 s.transport.mockImplementation(async()=>bad==='truncated'?Response.json({choices:[{index:0,finish_reason:'length',message:{role:'assistant',content:JSON.stringify(e)}}]}):envelope(bad==='legacy'?e.photos[0].evidence:e));
 expect((await s.provider.extractGroup(s.request)).processing).toBe('failed');expect(s.transport).toHaveBeenCalledTimes(1);expect(s.store.unresolved).toBe(1_000_000);
});
test('input trust boundary rejects changed hash/shared memory before reservation',async()=>{
 const s=await setup();s.request.photos[3].image=Buffer.from(s.request.photos[3].image);s.request.photos[3].image[0]^=1;
 expect(await s.provider.extractGroup(s.request)).toMatchObject({processing:'failed',code:'invalid-request'});expect(s.store.rows.size).toBe(0);expect(s.transport).not.toHaveBeenCalled();
});
test('invalid secondary never reaches provider; originals are snapshotted before asynchronous auth',async()=>{
 const s=await setup();let release!:(ok:boolean)=>void;const authorize=()=>new Promise<boolean>(r=>release=r);const completed=vi.fn();
 const compare=createGroupComparisonService({provider:s.provider,authorize,completed});const pending=compare(s.input);s.input.files[0].image.bytes.fill(0);s.input.group.application.brand='MUTATED';release(true);
 const record=await pending;expect(record.processing).toBe('complete');if(record.processing==='complete'){expect(record.application.brand).not.toBe('MUTATED');expect(checkedRecord(record)).not.toBeNull();}expect(completed).toHaveBeenCalledTimes(1);
 s.transport.mockClear();expect(await createGroupComparisonService({provider:s.provider,authorize:()=>true})(s.input)).toMatchObject({processing:'failed',code:'invalid-input'});expect(s.transport).not.toHaveBeenCalled();
});
test('server integrity validation preserves exact full-record confirmation serialization',async()=>{
 const {record}=await groupFixture();const reordered=Object.fromEntries(Object.entries(record).reverse());
 expect(checkedRecord(reordered)).not.toBeNull();
 expect(reviewBinding(checkedServerRecord(reordered))).toBe(reviewBinding(reordered));
});
test('record replay detects derived/raw provenance mutation and server digest tampering',async()=>{
 const {record}=await groupFixture();expect(record.comparison.rulesRevision).toBe(4);expect(checkedRecord(record)).not.toBeNull();expect(await verifyPhotoRecordDigest(record)).toBe(true);
 for(const mutate of [(r:typeof record)=>r.provenance.brand.sourcePhotoIds.pop(),(r:typeof record)=>r.evidence.brand.text='wrong',(r:typeof record)=>r.photoEvidence.photos.pop(),(r:typeof record)=>r.comparison.fields.brand.status='match']){
  const altered=structuredClone(record);mutate(altered);if(JSON.stringify(altered)!==JSON.stringify(record))expect(checkedRecord(altered)).toBeNull();
 }
 const altered=structuredClone(record);altered.photos[1].role='back';expect(()=>checkedServerRecord(altered)).toThrow();
 const intent={...newReviewIntent(record),outcome:'pass' as const,confirmed:true};expect(evaluateReview(record,intent).canSubmit).toBe(false);
});
