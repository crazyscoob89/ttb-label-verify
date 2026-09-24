import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {checkedRecord,newReviewIntent} from '../lib/review-policy';
import {finalizePhotoComparison,verifyPhotoRecordDigest} from '../lib/photo-record';
import {photoDescriptorsSchema,photoGroupDeclarationSchema,MAX_GROUP_RECORD_BYTES,parsePhotoSetEvidence} from '../lib/photo-contracts';
import {REVIEW_LIMITS} from '../lib/demo-store-contracts';
import {groupFixture} from './fixtures/photo-groups';
import cases from './fixtures/photo-contract-cases.json';
test('offline published source-covered cases replay; malformed IDs rejected; legacy bytes untouched',async()=>{
 for(const name of ['complementary-front-back','conflicting-abv','warning-closeup','one-photo'] as const){const r=checkedRecord(cases[name].record);expect(r).not.toBeNull();if(r&&'recordVersion' in r)expect(await verifyPhotoRecordDigest(r)).toBe(true);}
 expect(cases['complementary-front-back'].record.comparison.fields.brand.sourcePhotoIds).toHaveLength(1);
 expect(cases['conflicting-abv'].record.comparison.fields.abv.conflict).toBe(true);
 expect(()=>parsePhotoSetEvidence(cases['malformed-source-coverage'].response,cases['malformed-source-coverage'].expectedPhotoIds)).toThrow();
});
test('group original, normalized and pixel aggregate limits never depend on primary only',async()=>{
 const f=await groupFixture(4);const group=structuredClone(f.input.group);
 group.photos.forEach(p=>p.bytes=6*1024*1024);expect(photoGroupDeclarationSchema.safeParse(group).success).toBe(false);
 let photos=structuredClone(f.record.photos);photos.forEach(p=>p.normalized.bytes=6*1024*1024);expect(photoDescriptorsSchema.safeParse(photos).success).toBe(false);
 photos=structuredClone(f.record.photos);photos.forEach(p=>{p.normalized.width=4000;p.normalized.height=3000;});expect(photoDescriptorsSchema.safeParse(photos).success).toBe(false);
 photos=structuredClone(f.record.photos);photos[3].normalized.width=6000;photos[3].normalized.height=4000;expect(photoDescriptorsSchema.safeParse(photos).success).toBe(false);
});
test('96 KiB finalization cap rejects entire output; bounded worst-escaping intent fits existing save envelope',async()=>{
 const f=await groupFixture(4);let accepted=f.record,rejected=false;
 for(let n=100;n<=1900;n+=100){
  const ex=structuredClone(f.extraction);
  for(const [i,p] of ex.evidence.photos.entries()){
   const text=(String(i)+'"\\').repeat(n).slice(0,2000);
   for(const key of ['brand','classType','abv','netContents','origin'] as const)p.evidence[key]={status:'uncertain',text,reason:'"\\'.repeat(200)};
   p.evidence.producer.name={status:'uncertain',text,reason:'"\\'.repeat(200)};p.evidence.producer.address={status:'uncertain',text,reason:'"\\'.repeat(200)};
  }
  try{accepted=finalizePhotoComparison(f.record.application,f.record.groupId,1,f.record.photos,f.record.photoSetSha256,ex);}catch{rejected=true;break;}
 }
 expect(rejected).toBe(true);expect(Buffer.byteLength(JSON.stringify(accepted))).toBeLessThanOrEqual(MAX_GROUP_RECORD_BYTES);
 const intent={...newReviewIntent(accepted),confirmed:true,outcome:'second-review',notes:'"\\'.repeat(1000)};
 expect(Buffer.byteLength(JSON.stringify({comparisonId:randomUUID(),idempotencyKey:randomUUID(),intent}))).toBeLessThanOrEqual(REVIEW_LIMITS.requestBytes);
});
