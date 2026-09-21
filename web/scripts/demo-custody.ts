// Operator-only custody tooling. Never imported by application routes.
import { DatabaseSync } from 'node:sqlite';
import { createHash,randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { bindingSchema } from '../lib/spend';
import { checkedRecord,buildUnsavedDraft } from '../lib/review-policy';
import { DEMO_CEILING,DEMO_RESERVATION,REVIEW_LIMITS,type HostedEvidenceObjects } from '../lib/demo-store-contracts';
const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text=z.string().refine(s=>!s.includes('\0'));
const schema=z.object({version:z.literal(1),transferId:z.uuid(),exportedAt:z.string().datetime(),
 ledger:z.object({id:z.literal(1),version:z.literal(1),ceiling:z.literal(DEMO_CEILING),incurred:integer}).strict(),
 holds:z.array(z.object({reservation:z.uuid(),attempt:z.uuid(),binding:text,amount:z.literal(DEMO_RESERVATION),state:z.enum(['reserved','claimed','unresolved']),claim:z.uuid().nullable()}).strict()).max(25),
 work:z.array(z.object({id:z.uuid()}).strict()).max(2),
 snapshots:z.array(z.object({id:z.uuid(),record:text,image:z.string(),mime:z.enum(['image/png','image/jpeg']),bytes:integer}).strict()).max(REVIEW_LIMITS.snapshots),
 reviews:z.array(z.object({id:z.uuid(),comparison_id:z.uuid(),key:z.uuid(),request:text,intent:text,saved_at:z.string().datetime()}).strict()).max(REVIEW_LIMITS.snapshots),
}).strict();
export type Custody=z.infer<typeof schema>;
export type SealedCustody={sha256:string;payload:string};
export type CustodyTotals={holds:number;unresolved:number;incurred:number;remaining:number;snapshots:number;reviews:number};
function validate(input:unknown):Custody {
 const d=schema.parse(input),unique=(values:unknown[])=>{if(new Set(values).size!==values.length)throw Error('Custody duplicate');};
 unique(d.holds.map(h=>h.reservation));unique(d.holds.map(h=>h.attempt));unique(d.holds.filter(h=>h.claim).map(h=>h.claim));
 unique(d.snapshots.map(s=>s.id));unique(d.reviews.map(r=>r.id));unique(d.reviews.map(r=>r.key));unique(d.reviews.map(r=>r.comparison_id));unique(d.work.map(w=>w.id));
 const held=d.holds.reduce((n,h)=>n+h.amount,0);if(d.ledger.incurred+held>DEMO_CEILING)throw Error('Custody liabilities');
 for(const h of d.holds){const b=bindingSchema.parse(JSON.parse(h.binding));if(b.reservationId!==h.reservation||b.attemptId!==h.attempt||b.maxCostMicrousd!==h.amount||(h.state==='reserved')!==(h.claim===null))throw Error('Custody binding');}
 let total=0;
 for(const s of d.snapshots){const record=JSON.parse(s.record),image=Buffer.from(s.image,'base64');if(!checkedRecord(record)||s.image!==image.toString('base64')||image.length<1||image.length>10485760||Buffer.byteLength(s.record)>REVIEW_LIMITS.recordBytes||digest(image)!==record.imageSha256||s.bytes!==Buffer.byteLength(s.record)+image.length)throw Error('Custody snapshot');total+=s.bytes;}
 if(total>REVIEW_LIMITS.totalBytes)throw Error('Custody capacity');
 for(const r of d.reviews){const s=d.snapshots.find(s=>s.id===r.comparison_id);if(!s||Buffer.byteLength(r.request)>REVIEW_LIMITS.requestBytes)throw Error('Custody review');const draft=buildUnsavedDraft(JSON.parse(s.record),JSON.parse(r.intent));if(!draft||r.request!==JSON.stringify({comparisonId:r.comparison_id,intent:draft.intent}))throw Error('Custody review policy');}
 return d;
}
export function verifyCustody(sealed:SealedCustody):Custody {
 if(typeof sealed.payload!=='string'||Buffer.byteLength(sealed.payload)>200*1024*1024||!/^[a-f0-9]{64}$/.test(sealed.sha256)||digest(sealed.payload)!==sealed.sha256)throw Error('Custody checksum');
 return validate(JSON.parse(sealed.payload));
}
export function exportCustody({spendPath,reviewPath,writersStopped,expected}:{spendPath:string;reviewPath:string;writersStopped:boolean;expected:CustodyTotals}):SealedCustody {
 if(writersStopped!==true||!isAbsolute(spendPath)||!isAbsolute(reviewPath)||spendPath===reviewPath)throw Error('Stop and fence all source writers before export');
 // readOnly is essential: do not instantiate either writable runtime store.
 const spend=new DatabaseSync(spendPath,{readOnly:true});let reviews:DatabaseSync|undefined;
 try {
  reviews=new DatabaseSync(reviewPath,{readOnly:true});
  spend.exec('PRAGMA query_only=ON; BEGIN;');reviews.exec('PRAGMA query_only=ON; BEGIN;');
  const ledgers=spend.prepare('SELECT * FROM ledger').all(),meta=reviews.prepare('SELECT version FROM review_meta').all();
  if(ledgers.length!==1||meta.length!==1||meta[0].version!==1)throw Error('Custody schema');
  const data=validate({version:1,transferId:randomUUID(),exportedAt:new Date().toISOString(),ledger:ledgers[0],holds:spend.prepare('SELECT * FROM holds ORDER BY reservation').all(),work:spend.prepare('SELECT * FROM work ORDER BY id').all(),snapshots:reviews.prepare('SELECT * FROM snapshots ORDER BY id').all().map(s=>({...s,image:Buffer.from(s.image as Uint8Array).toString('base64')})),reviews:reviews.prepare('SELECT * FROM reviews ORDER BY id').all()});
  // Stranded work/claimed dispatch requires explicit reconciliation, never deletion.
  if(data.work.length||data.holds.some(h=>h.state==='claimed'))throw Error('Unaccounted source work; reconcile before transfer');
  const unresolved=data.holds.reduce((n,h)=>n+h.amount,0),actual:CustodyTotals={holds:data.holds.length,unresolved,incurred:data.ledger.incurred,remaining:DEMO_CEILING-data.ledger.incurred-unresolved,snapshots:data.snapshots.length,reviews:data.reviews.length};
  if(Object.keys(actual).some(k=>actual[k as keyof CustodyTotals]!==expected[k as keyof CustodyTotals]))throw Error('Custody totals mismatch');
  const payload=JSON.stringify(data);return {sha256:digest(payload),payload};
 }finally{reviews?.close();spend.close();}
}
/** Create-only object transfer. A restart can explicitly VERIFY existing objects
 * instead of rewriting them. Lost upload acknowledgment never triggers overwrite. */
export async function stageCustody(sealed:SealedCustody,objects:HostedEvidenceObjects,verifyOnly=false) {
 const d=verifyCustody(sealed);
 for(const s of d.snapshots){const image=Buffer.from(s.image,'base64'),sha=digest(image),key=`snapshots/${s.id}`;
  if(!verifyOnly&&(await objects.putEvidence(s.id,image,s.mime,sha)).key!==key)throw Error('Custody object key');
  const check=await objects.getEvidence(key,sha,image.length,s.mime);if(check.length!==image.length||digest(check)!==sha)throw Error('Custody object mismatch');
 }
}
/** Generates owner-executed SQL only, never opens a destination connection. This
 * transaction preserves all source text and remains disabled after import.
 * Same manifest replay is a no-op; changed custody/nonempty target is refused.
 * The operator MUST stage/verify all objects first and independently reconcile
 * destination rows plus exclusive source fencing before any separate activation. */
export function importSql(sealed:SealedCustody):string {
 const d=verifyCustody(sealed),q=(value:string|number|null)=>value===null?'NULL':typeof value==='number'?String(value):`'${value.replaceAll("'","''")}'`;
 const rows:string[]=[];
 for(const h of d.holds)rows.push(`INSERT INTO ttb_demo_private.holds VALUES(${[h.reservation,h.attempt,h.binding,h.amount,h.state,h.claim].map(q).join(',')});`);
 for(const w of d.work)rows.push(`INSERT INTO ttb_demo_private.work VALUES(${q(w.id)});`);
 for(const s of d.snapshots){const image=Buffer.from(s.image,'base64');rows.push(`INSERT INTO ttb_demo_private.snapshot_allocations VALUES(${[s.id,s.record,`snapshots/${s.id}`,digest(image),image.length,s.mime].map(q).join(',')}); INSERT INTO ttb_demo_private.snapshots VALUES(${q(s.id)});`);}
 for(const r of d.reviews)rows.push(`INSERT INTO ttb_demo_private.reviews VALUES(${[r.id,r.comparison_id,r.key,r.request,r.intent,r.saved_at].map(q).join(',')});`);
 // Random dollar delimiter avoids record content terminating the DO body.
 const tag=`$custody_${d.transferId.replaceAll('-','')}$`;if(rows.some(r=>r.includes(tag)))throw Error('Custody delimiter');
 return `BEGIN; SET LOCAL standard_conforming_strings=on; SET LOCAL lock_timeout='5s';\nDO ${tag}\nDECLARE l ttb_demo_private.ledger;\nBEGIN\nSELECT * INTO STRICT l FROM ttb_demo_private.ledger WHERE id=1 FOR UPDATE;\nPERFORM 1 FROM ttb_demo_private.quota WHERE id=1 FOR UPDATE;\nIF l.custody_id IS NOT NULL THEN\n IF l.custody_id<>${q(d.transferId)}::uuid OR l.custody_sha256<>${q(sealed.sha256)} THEN RAISE EXCEPTION 'custody mismatch'; END IF;\n RETURN;\nEND IF;\nIF l.enabled OR l.ceiling<>0 OR l.incurred<>0 OR EXISTS(SELECT 1 FROM ttb_demo_private.holds) OR EXISTS(SELECT 1 FROM ttb_demo_private.work) OR EXISTS(SELECT 1 FROM ttb_demo_private.snapshot_allocations) OR EXISTS(SELECT 1 FROM ttb_demo_private.uploads) THEN RAISE EXCEPTION 'destination not empty and disabled'; END IF;\n${rows.join('\n')}\nUPDATE ttb_demo_private.ledger SET enabled=false,ceiling=${d.ledger.ceiling},incurred=${d.ledger.incurred},custody_id=${q(d.transferId)},custody_sha256=${q(sealed.sha256)} WHERE id=1;\nEND ${tag};\nCOMMIT;\n`;
}
