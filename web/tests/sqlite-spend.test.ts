import { expect,test } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import type { SpendBinding } from '../lib/spend';
const binding=():SpendBinding=>({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:1,rulesVersion:'prototype-seven-fields-v1',promptVersion:'image-observations-v1',model:'anthropic/claude-haiku-4.5',maxCostMicrousd:1000000});
test('independent processes share atomic identity and claims; persisted cap mismatch rejects',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ttb-process-'));const path=join(dir,'spend.sqlite');
 try {SqliteSpendStore.provision(path);const bind=binding();
 const run=(action:string)=>new Promise<number>((resolve,reject)=>{const code=`import {SqliteSpendStore} from './lib/sqlite-spend.ts'; const s=new SqliteSpendStore(${JSON.stringify(path)});try {await s.${action};process.exitCode=0;}catch{process.exitCode=2;}finally{s.close();}`;const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{stdio:'ignore'});child.on('error',reject);child.on('exit',c=>resolve(c??9));});
 expect((await Promise.all([run(`reserve(${JSON.stringify(bind)})`),run(`reserve(${JSON.stringify(bind)})`)])).sort()).toEqual([0,2]);
 expect((await Promise.all([run(`claim(${JSON.stringify(bind)},${JSON.stringify(randomUUID())})`),run(`claim(${JSON.stringify(bind)},${JSON.stringify(randomUUID())})`)])).sort()).toEqual([0,2]);
 const restarted=new SqliteSpendStore(path);expect(restarted.totals().unresolvedMicrousd).toBe(1000000);restarted.close();
 const db=new DatabaseSync(path);db.exec('UPDATE ledger SET ceiling=50000000');db.close();expect(()=>new SqliteSpendStore(path)).toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('atomic dedup, single winner claim, retained holds, restart and hard cap',async()=>{const dir=mkdtempSync(join(tmpdir(),'ttb-ledger-'));const path=join(dir,'spend.sqlite');try{expect(()=>new SqliteSpendStore(path)).toThrow();SqliteSpendStore.provision(path);const a=new SqliteSpendStore(path),b=new SqliteSpendStore(path);const bind=binding();expect((await Promise.allSettled([a.reserve(bind),b.reserve(bind)])).filter(x=>x.status==='fulfilled')).toHaveLength(1);const claim=randomUUID();expect((await Promise.allSettled([a.claim(bind,claim),b.claim(bind,randomUUID())])).filter(x=>x.status==='fulfilled')).toHaveLength(1);await a.complete(bind,claim);expect(a.totals().unresolvedMicrousd).toBe(1000000);a.close();b.close();const c=new SqliteSpendStore(path);for(let i=1;i<25;i++)await c.reserve(binding());await expect(c.reserve(binding())).rejects.toThrow();expect(c.totals()).toEqual({currency:'USD',ceilingMicrousd:25000000,incurredMicrousd:0,unresolvedMicrousd:25000000});c.close();expect(()=>SqliteSpendStore.provision(path)).toThrow();}finally{rmSync(dir,{recursive:true,force:true});}});
