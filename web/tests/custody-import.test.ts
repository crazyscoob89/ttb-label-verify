import { test,expect,vi } from 'vitest';
import { join } from 'node:path';
import { readFileSync,rmSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { ReviewStore } from '../lib/review-store';
import { privateLedgerDir } from './fixtures/private-ledger';
import { samples,compareOfflineSample } from '../lib/offline-demo';
import { newReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';
import { exportCustody,verifyCustody,stageCustody,importSql } from '../scripts/demo-custody';
test('read-only consistent SQLite export, exact original bindings/bytes/receipts, sealed mismatch refusal and disabled import',async()=>{
 const spendDir=privateLedgerDir(),reviewDir=privateLedgerDir(),spendPath=join(spendDir,'spend.sqlite'),reviewPath=join(reviewDir,'reviews.sqlite');
 try{
 SqliteSpendStore.provision(spendPath);ReviewStore.provision(reviewPath);
 const b={reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:1 as const,rulesVersion:'prototype-seven-fields-v1' as const,promptVersion:'image-observations-v1' as const,model:'anthropic/claude-haiku-4.5' as const,maxCostMicrousd:1000000};
 const spend=new SqliteSpendStore(spendPath);await spend.reserve(b);const claim=randomUUID();await spend.claim(b,claim);await spend.complete(b,claim);spend.close();
 const bytes=readFileSync(`public${samples.match.imagePath}`),record=await compareOfflineSample('match',samples.match.application,bytes) as CompleteComparison;
 const reviews=new ReviewStore(reviewPath),id=reviews.snapshot(record,bytes,'image/png'),intent={...newReviewIntent(record),outcome:'second-review',confirmed:true,notes:'Synthetic migration proof'};
 const receipt=reviews.save({comparisonId:id,idempotencyKey:randomUUID(),intent});reviews.close();
 const before=createHash('sha256').update(readFileSync(spendPath)).digest('hex');
 const expected={holds:1,unresolved:1000000,incurred:0,remaining:24000000,snapshots:1,reviews:1};
 const sealed=exportCustody({spendPath,reviewPath,writersStopped:true,expected});
 expect(createHash('sha256').update(readFileSync(spendPath)).digest('hex')).toBe(before);
 const data=verifyCustody(sealed);expect(data.holds[0].binding).toBe(JSON.stringify(b));expect(data.holds[0].claim).toBe(claim);expect(data.reviews[0].id).toBe(receipt.reviewId);expect(data.reviews[0].saved_at).toBe(receipt.savedAt);expect(Buffer.from(data.snapshots[0].image,'base64')).toEqual(bytes);
 expect(()=>verifyCustody({...sealed,payload:sealed.payload+' '})).toThrow('Custody checksum');
 expect(()=>exportCustody({spendPath,reviewPath,writersStopped:true,expected:{...expected,holds:7}})).toThrow('Custody totals');
 const objects={putEvidence:vi.fn(async(i:string)=>({key:`snapshots/${i}`})),getEvidence:vi.fn(async()=>bytes),signEvidence:vi.fn()};
 await stageCustody(sealed,objects);expect(objects.putEvidence).toHaveBeenCalledTimes(1);
 objects.getEvidence.mockResolvedValueOnce(Buffer.from('corrupt'));await expect(stageCustody(sealed,objects)).rejects.toThrow();
 const sql=importSql(sealed);expect(sql).toContain('enabled=false');expect(sql).not.toContain('enabled=true');expect(sql).toContain('custody mismatch');expect(sql).toContain(receipt.savedAt);
 }finally{rmSync(spendDir,{recursive:true,force:true});rmSync(reviewDir,{recursive:true,force:true});}
});
