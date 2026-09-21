import { test,expect,vi } from 'vitest';
import { join } from 'node:path';
import { readFileSync,rmSync,mkdtempSync,writeFileSync,existsSync,statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { ReviewStore } from '../lib/review-store';
import { privateLedgerDir } from './fixtures/private-ledger';
import { samples,compareOfflineSample } from '../lib/offline-demo';
import { newReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';
import { exportCustody,verifyCustody,stageCustody,importSql,type SealedCustody } from '../scripts/demo-custody';

function emptyCustody():SealedCustody {
 const payload=JSON.stringify({version:1,transferId:randomUUID(),exportedAt:new Date().toISOString(),ledger:{id:1,version:1,ceiling:25000000,incurred:0},holds:[],work:[],snapshots:[],reviews:[]});
 return {payload,sha256:createHash('sha256').update(payload).digest('hex')};
}
test('operator footprint defaults empty; exact UUID/bytes preflight precedes replay under quota lock',()=>{
 const sealed=emptyCustody(),row={id:randomUUID(),bytes:12345};
 const sql=importSql(sealed,{expectedUploads:[row]});
 expect(sql).toContain(row.id);expect(sql).toContain(String(row.bytes));
 expect(importSql(sealed)).toBe(importSql(sealed,{expectedUploads:[]}));
 expect(sql.indexOf('upload footprint mismatch')).toBeGreaterThan(sql.indexOf('quota WHERE id=1 FOR UPDATE'));
 expect(sql.indexOf('upload footprint mismatch')).toBeLessThan(sql.indexOf('IF l.custody_id IS NOT NULL'));
 expect(sql).toContain('quota unavailable');
 expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM|INSERT INTO|TRUNCATE) ttb_demo_private\.(?:uploads|quota)\b/);
});
test('operator footprint rejects malformed, duplicate (including UUID case), unknown fields and over-quota manifests',()=>{
 const sealed=emptyCustody(),row={id:randomUUID(),bytes:1};
 const bad:unknown[]=[null,{},[{...row,id:'not-a-uuid'}],[{...row,bytes:0}],[{...row,bytes:-1}],[{...row,bytes:1.5}],[{...row,bytes:'1'}],[{...row,bytes:10485761}],[{...row,other:true}],[row,row],[row,{...row,id:row.id.toUpperCase()}],Array.from({length:201},()=>({id:randomUUID(),bytes:1})),Array.from({length:13},()=>({id:randomUUID(),bytes:10485760}))];
 for(const expectedUploads of bad)expect(()=>importSql(sealed,{expectedUploads:expectedUploads as {id:string;bytes:number}[]})).toThrow();
 expect(()=>importSql(sealed,{expectedUploads:[{...row,bytes:10485760}]})).not.toThrow();
 expect(()=>importSql(sealed,{expectedUploads:Array.from({length:200},()=>({id:randomUUID(),bytes:1}))})).not.toThrow();
});
test('CLI accepts optional approved footprint; rejects bad input before loading object module',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ttb-custody-cli-'));
 try{
  const sealed=emptyCustody(),row={id:randomUUID(),bytes:12345},manifest=join(dir,'sealed.json'),footprint=join(dir,'uploads.json'),module=join(dir,'objects.mjs'),marker=join(dir,'loaded');
  writeFileSync(manifest,JSON.stringify(sealed));writeFileSync(footprint,JSON.stringify([row]));
  writeFileSync(module,`import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'loaded'); export const createSupabaseObjects=()=>({});`);
  const run=(out:string,args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/import-demo-custody.ts',manifest,out,module,...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'}});
  for(const mode of ['--verify-existing','--stage-authorized']){
   const out=join(dir,mode+'.sql'),result=run(out,[mode,'--expected-uploads',footprint]);
   expect(result.status,result.stderr).toBe(0);expect(readFileSync(out,'utf8')).toBe(importSql(sealed,{expectedUploads:[row]}));
   if(process.platform!=='win32')expect(statSync(out).mode&0o777).toBe(0o600);
   expect(run(out,[mode,'--expected-uploads',footprint]).status).not.toBe(0);
  }
  const out=join(dir,'default.sql');expect(run(out,['--verify-existing']).status).toBe(0);expect(readFileSync(out,'utf8')).toBe(importSql(sealed));
  rmSync(marker);writeFileSync(footprint,JSON.stringify([{...row,bytes:0}]));
  for(const args of [['--verify-existing','--expected-uploads',footprint],['--verify-existing','--expected-uploads'],['--verify-existing','--typo',footprint]]){
   const badOut=join(dir,randomUUID()+'.sql');expect(run(badOut,args).status).not.toBe(0);expect(existsSync(badOut)).toBe(false);expect(existsSync(marker)).toBe(false);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

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
