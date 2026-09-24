import { expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ReviewStore } from '../lib/review-store';
import { createHostedStores } from '../lib/persistence/hosted-demo-rpc';
import { checkedRecord, newReviewIntent } from '../lib/review-policy';
import { compareApplication } from '../lib/rules';
import { verifyCustody } from '../scripts/demo-custody';
import { privateLedgerDir } from './fixtures/private-ledger';
import historical from './fixtures/rules-v1-records.json';

const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const bytes=readFileSync('public/offline-samples/match.png');
const savedAt='2026-09-01T12:00:00.000Z';
function legacy(name:string) {
 const original=historical.find(r=>r.name===name)!.record;
 const record=checkedRecord({...original,imageSha256:digest(bytes)});
 if(!record)throw Error('Historical snapshot rejected');
 const intent={...newReviewIntent(record),outcome:'second-review' as 'second-review'|'pass',confirmed:true,notes:'Synthetic historical review only.'};
 if(name==='domestic-contradiction'){
  intent.outcome='pass';intent.physical={checked:true,note:'Synthetic historical assessment outside the image; not a real inspection.'};
 }
 const comparisonId=randomUUID(),reviewId=randomUUID(),idempotencyKey=randomUUID();
 const receipt={state:'SAVED' as const,reviewId,comparisonId,savedAt,identity:'Shared demo access code — NOT an individually authenticated reviewer' as const};
 return {record,intent,comparisonId,reviewId,idempotencyKey,receipt};
}
it.each(historical.map(r=>r.name))('SQLite reopens original %s review and replays its original receipt unchanged',name=>{
 const dir=privateLedgerDir(),path=join(dir,'reviews.sqlite');let store:ReviewStore|undefined;
 try{
  const {record,intent,comparisonId,reviewId,idempotencyKey,receipt}=legacy(name);
  ReviewStore.provision(path);
  // Seed the original on-disk format, not a freshly recomputed comparison.
  const db=new DatabaseSync(path),json=JSON.stringify(record);
  db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(comparisonId,json,bytes,'image/png',Buffer.byteLength(json)+bytes.length);
  db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?)').run(reviewId,comparisonId,idempotencyKey,JSON.stringify({comparisonId,intent}),JSON.stringify(intent),savedAt);
  db.close();
  const originalBytes=readFileSync(path);
  store=new ReviewStore(path);
  expect(store.detail(reviewId)).toEqual({receipt,record,intent});
  expect(store.evidence(reviewId).bytes).toEqual(bytes);
  expect(store.save({comparisonId,idempotencyKey,intent})).toEqual(receipt);
  const fresh={...record,comparison:compareApplication(record.application,record.evidence)};
  expect(()=>store!.save({comparisonId,idempotencyKey,intent:{...intent,bindingKey:newReviewIntent(fresh).bindingKey}})).toThrow('review-policy-or-stale-binding');
  store.close();store=undefined;
  expect(readFileSync(path)).toEqual(originalBytes);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
it.each(historical.map(r=>r.name))('hosted detail validates original %s findings; rejects altered results or changed approval binding',async name=>{
 const {record,intent,receipt,reviewId}=legacy(name);
 const row={receipt,record:JSON.stringify(record),intent:JSON.stringify(intent)};
 const fetch=vi.fn(async()=>Response.json(row));
 const objects={putEvidence:vi.fn(),getEvidence:vi.fn(),signEvidence:vi.fn()};
 const reviews=await createHostedStores({env:{TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'},objects,fetch}).openReviews();
 expect(await reviews.detail(reviewId)).toEqual({receipt,record,intent});
 const altered=structuredClone(record);altered.comparison.fields.origin.reasons=['Tampered reason'];
 row.record=JSON.stringify(altered);
 await expect(reviews.detail(reviewId)).rejects.toThrow('Persistence unavailable');
 row.record=JSON.stringify({...record,comparison:compareApplication(record.application,record.evidence)});
 await expect(reviews.detail(reviewId)).rejects.toThrow('Persistence unavailable');
 expect(objects.putEvidence).not.toHaveBeenCalled();
});
it('custody validation preserves an original domestic Pass, without upgrading it or tolerating tampered findings',()=>{
 const {record,intent,comparisonId,reviewId,idempotencyKey}=legacy('domestic-contradiction');
 const json=JSON.stringify(record);
 const data={version:1,transferId:randomUUID(),exportedAt:savedAt,ledger:{id:1,version:1,ceiling:25000000,incurred:0},holds:[],work:[],
  snapshots:[{id:comparisonId,record:json,image:bytes.toString('base64'),mime:'image/png',bytes:Buffer.byteLength(json)+bytes.length}],
  reviews:[{id:reviewId,comparison_id:comparisonId,key:idempotencyKey,request:JSON.stringify({comparisonId,intent}),intent:JSON.stringify(intent),saved_at:savedAt}]};
 const seal=()=>{const payload=JSON.stringify(data);return {payload,sha256:digest(payload)};};
 expect(verifyCustody(seal()).snapshots[0].record).toBe(json);
 const altered=structuredClone(record);altered.comparison.fields.origin.status='match';
 data.snapshots[0].record=JSON.stringify(altered);
 data.snapshots[0].bytes=Buffer.byteLength(data.snapshots[0].record)+bytes.length;
 expect(()=>verifyCustody(seal())).toThrow('Custody snapshot');
});
