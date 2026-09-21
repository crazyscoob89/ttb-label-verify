import { test,expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync,rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { exportCustody,importSql } from '../scripts/demo-custody';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { ReviewStore } from '../lib/review-store';
import { privateLedgerDir } from './fixtures/private-ledger';

// Same explicit disposable Unix-socket gate as hosted-postgres.test.ts. No URLs,
// preexisting database names, real source paths, Storage or provider calls.
const socket=process.env.TTB_HOSTED_TEST_SOCKET,psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql)('real PostgreSQL custody footprint: fail closed, retain allocation/quota, exact replay and later drift denial',async()=>{
 if(!socket?.startsWith('/')||!psql?.startsWith('/'))throw Error('Explicit local socket and psql required');
 const database='ttb_custody_test_'+randomUUID().replaceAll('-',''),owner=database+'_owner';
 function sql(query:string,role=owner,db=database):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(psql!,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket!,'-p',process.env.TTB_HOSTED_TEST_PORT??'5432','-d',db],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.end((role?`SET ROLE "${role}"; `:'')+query);
 });}
 const tables=['ledger','quota','uploads','holds','work','snapshot_allocations','snapshots','reviews'];
 const state=()=>sql(tables.map(t=>`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ttb_demo_private.${t} t;`).join('\n'));
 await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres');await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
 const dirs=[privateLedgerDir(),privateLedgerDir()];
 try{
  await sql(readFileSync('db/migrations/002_hosted_demo.sql','utf8'));
  const spendPath=join(dirs[0],'spend.sqlite'),reviewPath=join(dirs[1],'reviews.sqlite');
  SqliteSpendStore.provision(spendPath);ReviewStore.provision(reviewPath);
  const store=new SqliteSpendStore(spendPath),binding={reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:1 as const,rulesVersion:'prototype-seven-fields-v1' as const,promptVersion:'image-observations-v1' as const,model:'anthropic/claude-haiku-4.5' as const,maxCostMicrousd:1000000};
  await store.reserve(binding);store.close();
  const expected={holds:1,unresolved:1000000,incurred:0,remaining:24000000,snapshots:0,reviews:0};
  const sealed=exportCustody({spendPath,reviewPath,writersStopped:true,expected});
  const row={id:randomUUID(),bytes:12345},extra={id:randomUUID(),bytes:77},options={expectedUploads:[row]};
  const empty=await state();
  await expect(sql(importSql(sealed,options))).rejects.toThrow('upload footprint mismatch');expect(await state()).toBe(empty);
  // Default empty import is still valid (roll back this disposable rehearsal).
  await sql(importSql(sealed).replace('COMMIT;','ROLLBACK;'));expect(await state()).toBe(empty);
  await sql(`SELECT public.ttb_demo_review('upload_reserve','${JSON.stringify(row)}');`,'service_role');
  const before=await state();
  for(const opts of [undefined,{expectedUploads:[]},{expectedUploads:[{...row,bytes:row.bytes+1}]},{expectedUploads:[{...row,id:randomUUID()}]},{expectedUploads:[row,extra]}]){
   await expect(sql(importSql(sealed,opts))).rejects.toThrow('upload footprint mismatch');expect(await state()).toBe(before);
  }
  // Existing aggregate invariants are checked inside the import transaction,
  // even when an owner has bypassed the normal reservation RPC in a fixture.
  for(const seed of ['INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),1 FROM generate_series(1,200);','INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),10485760 FROM generate_series(1,13);']){
   await expect(sql('BEGIN; '+seed+importSql(sealed,options))).rejects.toThrow('upload quota inconsistent');expect(await state()).toBe(before);
  }
  for(const seed of ['UPDATE ttb_demo_private.ledger SET ceiling=25000000;','INSERT INTO ttb_demo_private.work VALUES(gen_random_uuid());']){
   await expect(sql('BEGIN; '+seed+importSql(sealed,options))).rejects.toThrow('destination not empty and disabled');expect(await state()).toBe(before);
  }
  // A missing quota sentinel cannot silently remove serialization.
  await sql('DELETE FROM ttb_demo_private.quota WHERE id=1');const missingQuota=await state();
  await expect(sql(importSql(sealed,options))).rejects.toThrow('quota unavailable');expect(await state()).toBe(missingQuota);
  await sql('INSERT INTO ttb_demo_private.quota VALUES(1)');expect(await state()).toBe(before);
  const allocation=await sql('SELECT u::text FROM ttb_demo_private.uploads u; SELECT q::text FROM ttb_demo_private.quota q;');
  await sql(importSql(sealed,options));const imported=await state();
  expect(await sql('SELECT u::text FROM ttb_demo_private.uploads u; SELECT q::text FROM ttb_demo_private.quota q;')).toBe(allocation);
  expect(await sql("SELECT enabled||':'||ceiling||':'||incurred||':'||(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('false:25000000:0:1000000');
  expect(await sql('SELECT binding FROM ttb_demo_private.holds')).toBe(JSON.stringify(binding));
  await sql(importSql(sealed,options));expect(await state()).toBe(imported);
  await expect(sql(importSql(sealed))).rejects.toThrow('upload footprint mismatch');expect(await state()).toBe(imported);
  const changed=exportCustody({spendPath,reviewPath,writersStopped:true,expected});
  await expect(sql(importSql(changed,options))).rejects.toThrow('custody mismatch');expect(await state()).toBe(imported);
  await expect(sql('DELETE FROM ttb_demo_private.uploads')).rejects.toThrow('immutable');
  await expect(sql('UPDATE ttb_demo_private.uploads SET bytes=1')).rejects.toThrow('immutable');
  await sql(`SELECT public.ttb_demo_review('upload_reserve','${JSON.stringify(extra)}');`,'service_role');
  const drifted=await state();await expect(sql(importSql(sealed,options))).rejects.toThrow('upload footprint mismatch');expect(await state()).toBe(drifted);
  // Retained rows still consume count quota: only 198 of 200 slots remain.
  await sql('INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),1 FROM generate_series(1,198)');
  await expect(sql(`SELECT public.ttb_demo_review('upload_reserve','${JSON.stringify({id:randomUUID(),bytes:1})}');`,'service_role')).rejects.toThrow('review-capacity');
  expect(await sql('SELECT count(*) FROM ttb_demo_private.uploads')).toBe('200');
 }finally{
  for(const dir of dirs)rmSync(dir,{recursive:true,force:true});
  await sql(`DROP DATABASE "${database}";`,'','postgres');await sql(`DROP ROLE "${owner}";`,'','postgres');
 }
},60000);
