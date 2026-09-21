import { DatabaseSync } from 'node:sqlite';
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
  const json=JSON.stringify(record);
  if(!checkedRecord(record)||!Buffer.isBuffer(image)||image.length<1||image.length>MAX_IMAGE_BYTES||Buffer.byteLength(json)>REVIEW_LIMITS.recordBytes||!['image/png','image/jpeg'].includes(mime)||createHash('sha256').update(image).digest('hex')!==record.imageSha256)throw new ReviewError(400,'invalid-snapshot');
  return this.transaction(()=>{
   const totals=this.db.prepare('SELECT COUNT(*) n, COALESCE(SUM(bytes),0) bytes FROM snapshots').get()!;
   const bytes=Buffer.byteLength(json)+image.length;
   if(Number(totals.n)>=REVIEW_LIMITS.snapshots||Number(totals.bytes)+bytes>REVIEW_LIMITS.totalBytes)throw new ReviewError(507,'review-capacity');
   const id=randomUUID();this.db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(id,json,image,mime,bytes);return id;
  });
 }
 private receipt(row:Record<string,unknown>):SavedReceipt {
  return {state:'SAVED',reviewId:String(row.id),comparisonId:String(row.comparison_id),savedAt:String(row.saved_at),identity:'Shared demo access code — NOT an individually authenticated reviewer'};
 }
 save(input:unknown):SavedReceipt {
  const parsed=requestSchema.safeParse(input);
  if(!parsed.success||Buffer.byteLength(JSON.stringify(input))>REVIEW_LIMITS.requestBytes)throw new ReviewError(400,'invalid-review');
  const {comparisonId,idempotencyKey,intent}=parsed.data;
  return this.transaction(()=>{
   const snapshot=this.db.prepare('SELECT record FROM snapshots WHERE id=?').get(comparisonId);
   if(!snapshot)throw new ReviewError(404,'comparison-not-found');
   const record=JSON.parse(String(snapshot.record));
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
  return {receipt:this.receipt(row),record:JSON.parse(String(row.record)) as CompleteComparison,intent:JSON.parse(String(row.intent))};
 }
 evidence(id:string){
  this.detail(id);
  const row=this.db.prepare('SELECT s.image,s.mime FROM snapshots s JOIN reviews r ON r.comparison_id=s.id WHERE r.id=?').get(id)!;
  return {bytes:Buffer.from(row.image as Uint8Array),mime:String(row.mime)};
 }
}
