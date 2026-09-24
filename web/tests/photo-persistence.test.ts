import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ReviewStore} from '../lib/review-store';
import {newReviewIntent} from '../lib/review-policy';
import {groupFixture} from './fixtures/photo-groups';
import {privateLedgerDir} from './fixtures/private-ledger';
import {createHostedStores} from '../lib/persistence/hosted-demo-rpc';
import type {HostedEvidenceObjects} from '../lib/demo-store-contracts';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'offline'};
test('explicit additive SQLite migration; atomic complete original+normalized persistence/reopen, exact quota, no subset fallback',async()=>{
 const f=await groupFixture(4),dir=privateLedgerDir(),path=join(dir,'reviews.sqlite');let store:ReviewStore|undefined;
 try{
  ReviewStore.provision(path);store=new ReviewStore(path);expect(()=>store!.snapshotGroup(f.record,f.photos)).toThrow('photo-migration-required');expect(()=>store!.snapshot(f.record,f.photos[0].normalized,'image/png')).toThrow();store.close();
  ReviewStore.migratePhotos(path);store=new ReviewStore(path);const id=store.snapshotGroup(f.record,f.photos);
  expect(()=>store!.snapshotGroup(f.record,f.photos.slice(0,3))).toThrow();
  const intent={...newReviewIntent(f.record),outcome:'second-review',confirmed:true,notes:'Independent source verification required.'};const request={comparisonId:id,idempotencyKey:randomUUID(),intent};const receipt=store.save(request);store.close();store=new ReviewStore(path);
  expect(store.save(request)).toEqual(receipt);expect(store.detail(receipt.reviewId).record).toEqual(f.record);
  for(const p of f.photos)for(const variant of ['original','normalized'] as const)expect(store.evidence(receipt.reviewId,{photoId:p.photoId,variant}).bytes).toEqual(p[variant]);
  expect(()=>store!.evidence(receipt.reviewId,{photoId:randomUUID(),variant:'original'})).toThrow();
  expect(store.evidence(receipt.reviewId).bytes).toEqual(f.photos[0].normalized);
  const db=new DatabaseSync(path);expect(db.prepare('SELECT COUNT(*) n FROM snapshot_assets').get()!.n).toBe(7);
  expect(db.prepare('SELECT bytes FROM snapshots').get()!.bytes).toBe(Buffer.byteLength(JSON.stringify(f.record))+f.photos.reduce((n,p)=>n+p.original.length+p.normalized.length,0));
  expect(()=>db.exec('DELETE FROM snapshot_assets')).toThrow('immutable');db.close();
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('hosted group reserves ALL media before any write, readback verifies every object; failure never commits',async()=>{
 const f=await groupFixture(3),events:string[]=[],allocations:unknown[]=[];const data=new Map<string,Buffer>();
 const objects:HostedEvidenceObjects={async putEvidence(id,bytes){events.push('put');data.set(`snapshots/${id}`,Buffer.from(bytes));return {key:`snapshots/${id}`};},async getEvidence(key){events.push('get');return data.get(key)!;},async signEvidence(){throw Error('not used');}};
 const fetcher:typeof fetch=async(_url,init)=>{const {p_op,p_input}=JSON.parse(String(init?.body));events.push(p_op);if(p_op==='snapshot_prepare')allocations.push(p_input);return Response.json(null);};
 const reviews=await createHostedStores({env,objects,fetch:fetcher}).openReviews();expect(await reviews.snapshotGroup!(f.record,f.photos)).toMatch(/^[a-f0-9-]{36}$/);
 expect(events[0]).toBe('snapshot_prepare');expect(events.at(-1)).toBe('snapshot_commit');expect(events.filter(e=>e==='put')).toHaveLength(6);expect(events.filter(e=>e==='get')).toHaveLength(6);expect(allocations[0]).toMatchObject({assets:expect.arrayContaining([{photoId:f.photos[0].photoId,variant:'original',key:expect.any(String),sha256:f.record.photos[0].sourceSha256,bytes:f.photos[0].original.length,mime:'image/png'}])});
 events.length=0;let count=0;const broken={...objects,async getEvidence(key:string){if(++count===4)return Buffer.from('bad');return data.get(key)!;}};
 const bad=await createHostedStores({env,objects:broken,fetch:fetcher}).openReviews();await expect(bad.snapshotGroup!(f.record,f.photos)).rejects.toThrow();expect(events).not.toContain('snapshot_commit');
});
