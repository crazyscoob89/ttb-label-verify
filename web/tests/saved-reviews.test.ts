import { it, expect, vi } from 'vitest';
import { readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ReviewStore, REVIEW_LIMITS } from '../lib/review-store';
import { privateLedgerDir } from './fixtures/private-ledger';
vi.setConfig({testTimeout:60000});
import { samples, compareOfflineSample } from '../lib/offline-demo';
import { newReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';

it('real private SQLite: explicit provisioning, immutable evidence, policy, dedup, conflicts and reopen', async () => {
 const dir=privateLedgerDir(); const path=join(dir,'reviews.sqlite');
 try {
  expect(()=>new ReviewStore(path)).toThrow(); expect(existsSync(path)).toBe(false);
  ReviewStore.provision(path); expect(()=>ReviewStore.provision(path)).toThrow();
  const bytes=readFileSync(`public${samples.match.imagePath}`);
  const record=await compareOfflineSample('match',samples.match.application,bytes) as CompleteComparison;
  let store=new ReviewStore(path);
  const comparisonId=store.snapshot(record,bytes,'image/png');
  const intent={...newReviewIntent(record),outcome:'second-review' as const,confirmed:true,notes:'Synthetic escalation for independent review.'};
  expect(()=>store.save({comparisonId,idempotencyKey:randomUUID(),intent:{...intent,confirmed:false}})).toThrow();
  expect(()=>store.save({comparisonId,idempotencyKey:randomUUID(),intent:{...intent,bindingKey:'stale'}})).toThrow();
  expect(()=>store.save({comparisonId,idempotencyKey:randomUUID(),intent,record})).toThrow();
  const request={comparisonId,idempotencyKey:randomUUID(),intent};
  const receipt=store.save(request); expect(receipt.state).toBe('SAVED');
  expect(store.save(request)).toEqual(receipt);
  expect(()=>store.save({...request,intent:{...intent,notes:'Different decision payload'}})).toThrow();
  expect(()=>store.save({...request,idempotencyKey:randomUUID()})).toThrow();
  store.close(); store=new ReviewStore(path);
  expect(store.save(request)).toEqual(receipt);
  expect(store.detail(receipt.reviewId)).toMatchObject({receipt,record,intent});
  expect(store.evidence(receipt.reviewId).bytes).toEqual(bytes);
  expect(store.list()).toHaveLength(1); store.close();
  const db=new DatabaseSync(path);
  expect(()=>db.exec('DELETE FROM reviews')).toThrow();
  expect(()=>db.exec("UPDATE snapshots SET record='{}'")).toThrow(); db.close();
  if(process.platform!=='win32'){chmodSync(path,0o644); expect(()=>new ReviewStore(path)).toThrow();}
 } finally {rmSync(dir,{recursive:true,force:true});}
});

it('bounds snapshot count and rejects mismatched/oversized image or record without partial insertion',async()=>{
 const dir=privateLedgerDir(),path=join(dir,'reviews.sqlite');let store:ReviewStore|undefined;
 try{
  ReviewStore.provision(path);store=new ReviewStore(path);
  const bytes=readFileSync(`public${samples.match.imagePath}`),record=await compareOfflineSample('match',samples.match.application,bytes) as CompleteComparison;
  expect(()=>store!.snapshot(record,Buffer.from('wrong bytes'),'image/png')).toThrow();
  expect(()=>store!.snapshot(record,Buffer.alloc(10*1024*1024+1),'image/png')).toThrow();
  expect(()=>store!.snapshot({...record,comparison:{...record.comparison,extra:'x'.repeat(REVIEW_LIMITS.recordBytes)}} as unknown as CompleteComparison,bytes,'image/png')).toThrow();
  for(let i=0;i<REVIEW_LIMITS.snapshots;i++)store.snapshot(record,bytes,'image/png');
  expect(()=>store!.snapshot(record,bytes,'image/png')).toThrow('review-capacity');
  const db=new DatabaseSync(path,{readOnly:true});expect(db.prepare('SELECT COUNT(*) n FROM snapshots').get()!.n).toBe(REVIEW_LIMITS.snapshots);db.close();
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
