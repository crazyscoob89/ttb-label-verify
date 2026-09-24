import { DatabaseSync } from 'node:sqlite';
import { prepareGroupAssets,checkedServerRecord,assetExpected,type GroupPhotoBytes } from './group-assets';
import type { CompletePhotoComparison } from './comparison-record';
import type { PhotoSelector } from './photo-contracts';
import { closeSync, openSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { assertPrivateLedger, assertPrivateLedgerCreation } from './ledger-security';
import { buildUnsavedDraft, checkedRecord } from './review-policy';
import { MAX_IMAGE_BYTES } from './contracts';
import type { CompleteComparison } from './comparison-record';
import type { SavedReceipt } from './saved-review-contract';

import { REVIEW_LIMITS, ReviewError } from './demo-store-contracts';
export { REVIEW_LIMITS, ReviewError } from './demo-store-contracts';
const requestSchema=z.object({comparisonId:z.uuid(),idempotencyKey:z.uuid(),intent:z.unknown()}).strict();
export function reviewPath(env:Record<string,string|undefined>):string {
 const dir=env.TTB_REVIEW_DATA_DIR;
 if(!dir||!isAbsolute(dir)||resolve(dir)!==dir||dir===env.TTB_DEMO_DATA_DIR) throw new ReviewError(503,'reviews-disabled');
 return join(dir,'reviews.sqlite');
}
/** Separate, bounded, single-host private demo store. No startup creation/migration/reset.
 * Snapshots and reviews are append-only, including at the SQL layer. One review
 * per immutable comparison; a changed review requires a fresh comparison. */
export class ReviewStore {
 private db:DatabaseSync;
 static provision(path:string) {
  assertPrivateLedgerCreation(path);
  closeSync(openSync(path,'wx',0o600)); assertPrivateLedger(path);
  const db=new DatabaseSync(path);
  try {
   db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA max_page_count=40960;
    BEGIN IMMEDIATE;
    CREATE TABLE review_meta(version INTEGER NOT NULL CHECK(version=1)); INSERT INTO review_meta VALUES(1);
    CREATE TABLE snapshots(id TEXT PRIMARY KEY, record TEXT NOT NULL, image BLOB NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL);
    CREATE TABLE reviews(id TEXT PRIMARY KEY, comparison_id TEXT NOT NULL UNIQUE REFERENCES snapshots(id), key TEXT NOT NULL UNIQUE, request TEXT NOT NULL, intent TEXT NOT NULL, saved_at TEXT NOT NULL);
    CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER snapshots_no_delete BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER reviews_no_update BEFORE UPDATE ON reviews BEGIN SELECT RAISE(ABORT,'append-only'); END;
    CREATE TRIGGER reviews_no_delete BEFORE DELETE ON reviews BEGIN SELECT RAISE(ABORT,'append-only'); END;
    COMMIT;`);
   assertPrivateLedger(path);
  } finally {db.close();}
 }
 constructor(path:string) {
  assertPrivateLedger(path); this.db=new DatabaseSync(path);
  try {
   this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA max_page_count=40960;');
   const meta=this.db.prepare('SELECT version FROM review_meta').all();
   if(meta.length!==1||meta[0].version!==1)throw Error('Review store version mismatch');
   assertPrivateLedger(path);
  } catch(e){this.db.close();throw e;}
 }
 close(){this.db.close();}
 private transaction<T>(work:()=>T):T {
  this.db.exec('BEGIN IMMEDIATE');try{const result=work();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 snapshot(record:CompleteComparison,image:Buffer,mime:string):string {
  if('recordVersion' in record)throw new ReviewError(400,'invalid-snapshot');
  const json=JSON.stringify(record);
  if(!checkedRecord(record)||!Buffer.isBuffer(image)||image.length<1||image.length>MAX_IMAGE_BYTES||Buffer.byteLength(json)>REVIEW_LIMITS.recordBytes||!['image/png','image/jpeg'].includes(mime)||createHash('sha256').update(image).digest('hex')!==record.imageSha256)throw new ReviewError(400,'invalid-snapshot');
  return this.transaction(()=>{
   const totals=this.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(bytes),0) bytes FROM snapshots').get()!;
   const bytes=Buffer.byteLength(json)+image.length;
   if(Number(totals.n)>=REVIEW_LIMITS.snapshots||Number(totals.bytes)+bytes>REVIEW_LIMITS.totalBytes)throw new ReviewError(507,'review-capacity');
   const id=randomUUID();this.db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(id,json,image,mime,bytes);return id;
  });
 }
 snapshotGroup(record:CompletePhotoComparison,photos:GroupPhotoBytes[]):string {
  const group=prepareGroupAssets(record,photos);
  return this.transaction(()=>{
   if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='snapshot_assets'").get())throw new ReviewError(503,'photo-migration-required');
   const totals=this.db.prepare('SELECT COUNT(*) n,COALESCE(SUM(bytes),0) bytes FROM snapshots').get()!;
   const bytes=Buffer.byteLength(group.recordText)+group.assets.reduce((sum,a)=>sum+a.bytes,0);
   if(Number(totals.n)>=REVIEW_LIMITS.snapshots||Number(totals.bytes)+bytes>REVIEW_LIMITS.totalBytes)throw new ReviewError(507,'review-capacity');
   this.db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(group.id,group.recordText,group.buffers[1],group.assets[1].mime,bytes);
   for(const [i,a] of group.assets.entries())if(i!==1)this.db.prepare('INSERT INTO snapshot_assets VALUES(?,?,?,?,?,?,?)').run(group.id,a.photoId,a.variant,group.buffers[i],a.mime,a.sha256,a.bytes);
   return group.id;
  });
 }
 /** Explicit owner-run additive migration; NEVER called by the constructor. */
 static migratePhotos(path:string){
  assertPrivateLedger(path);const db=new DatabaseSync(path);
  try{db.exec(`PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
   CREATE TABLE snapshot_assets(comparison_id TEXT NOT NULL REFERENCES snapshots(id),photo_id TEXT NOT NULL,variant TEXT NOT NULL CHECK(variant IN('original','normalized')),image BLOB NOT NULL,mime TEXT NOT NULL CHECK(mime IN('image/png','image/jpeg')),sha256 TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 10485760 AND bytes=length(image)),PRIMARY KEY(comparison_id,photo_id,variant));
   CREATE TRIGGER snapshot_assets_no_update BEFORE UPDATE ON snapshot_assets BEGIN SELECT RAISE(ABORT,'immutable'); END;
   CREATE TRIGGER snapshot_assets_no_delete BEFORE DELETE ON snapshot_assets BEGIN SELECT RAISE(ABORT,'immutable'); END;
   COMMIT;`);assertPrivateLedger(path);}finally{db.close();}
 }
 private receipt(row:Record<string,unknown>):SavedReceipt {
  return {state:'SAVED',reviewId:String(row.id),comparisonId:String(row.comparison_id),savedAt:String(row.saved_at),identity:'Public demo use — NOT an individually authenticated reviewer'};
 }
 save(input:unknown):SavedReceipt {
  const parsed=requestSchema.safeParse(input);
  if(!parsed.success||Buffer.byteLength(JSON.stringify(input))>REVIEW_LIMITS.requestBytes)throw new ReviewError(400,'invalid-review');
  const {comparisonId,idempotencyKey,intent}=parsed.data;
  return this.transaction(()=>{
   const snapshot=this.db.prepare('SELECT record FROM snapshots WHERE id=?').get(comparisonId);
   if(!snapshot)throw new ReviewError(404,'comparison-not-found');
   const record=checkedServerRecord(JSON.parse(String(snapshot.record)));
   const draft=buildUnsavedDraft(record,intent);
   if(!draft)throw new ReviewError(409,'review-policy-or-stale-binding');
   // Parsed policy shape canonicalizes keys. Replay with exactly the same intent
   // returns the original receipt even after process restart or response loss.
   const request=JSON.stringify({comparisonId,intent:draft.intent});
   const prior=this.db.prepare('SELECT * FROM reviews WHERE key=?').get(idempotencyKey);
   if(prior){if(prior.request!==request)throw new ReviewError(409,'idempotency-conflict');return this.receipt(prior);}
   if(this.db.prepare('SELECT 1 FROM reviews WHERE comparison_id=?').get(comparisonId))throw new ReviewError(409,'comparison-already-reviewed');
   const id=randomUUID();
   this.db.prepare("INSERT INTO reviews VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(id,comparisonId,idempotencyKey,request,JSON.stringify(draft.intent));
   return this.receipt(this.db.prepare('SELECT * FROM reviews WHERE id=?').get(id)!);
  });
 }
 list(offset=0){
  if(!Number.isInteger(offset)||offset<0||offset>REVIEW_LIMITS.snapshots)throw new ReviewError(400,'invalid-offset');
  return this.db.prepare('SELECT r.*, s.record FROM reviews r JOIN snapshots s ON s.id=r.comparison_id ORDER BY r.saved_at DESC,r.id DESC LIMIT 50 OFFSET ?').all(offset).map(row=>({receipt:this.receipt(row),application:JSON.parse(String(row.record)).application,outcome:JSON.parse(String(row.intent)).outcome}));
 }
 detail(id:string){
  if(!z.uuid().safeParse(id).success)throw new ReviewError(404,'review-not-found');
  const row=this.db.prepare('SELECT r.*, s.record FROM reviews r JOIN snapshots s ON s.id=r.comparison_id WHERE r.id=?').get(id);
  if(!row)throw new ReviewError(404,'review-not-found');
  const record=checkedServerRecord(JSON.parse(String(row.record))),intent=JSON.parse(String(row.intent));
  if(!buildUnsavedDraft(record,intent))throw new ReviewError(503,'reviews-unavailable');
  return {receipt:this.receipt(row),record,intent};
 }
 evidence(id:string,selector?:PhotoSelector){
  const detail=this.detail(id),record=detail.record;
  let row;
  if(selector){
   if(!('recordVersion' in record))throw new ReviewError(404,'review-not-found');
   assetExpected(record,selector);
   if(selector.photoId!==record.photos[0].photoId||selector.variant!=='normalized')row=this.db.prepare('SELECT image,mime FROM snapshot_assets WHERE comparison_id=? AND photo_id=? AND variant=?').get(detail.receipt.comparisonId,selector.photoId,selector.variant);
   else row=this.db.prepare('SELECT image,mime FROM snapshots WHERE id=?').get(detail.receipt.comparisonId);
  }else row=this.db.prepare('SELECT image,mime FROM snapshots WHERE id=?').get(detail.receipt.comparisonId);
  if(!row)throw new ReviewError(404,'review-not-found');
  const bytes=Buffer.from(row.image as Uint8Array),mime=String(row.mime);
  const expected='recordVersion' in record?assetExpected(record,selector??{photoId:record.photos[0].photoId,variant:'normalized'}):{sha256:record.imageSha256,bytes:bytes.length,mime};
  if(expected.bytes!==bytes.length||expected.mime!==mime||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw new ReviewError(503,'reviews-unavailable');
  return {bytes,mime};
 }
}
