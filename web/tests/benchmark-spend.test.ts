import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
import { BENCHMARK_MODELS, benchmarkBindingSchema, bindingSchema, executeReserved } from '../lib/spend';
import { OfflineSpendStore } from './helpers/offline-spend-store';
const migration=readFileSync('db/migrations/007_isolated_vision_benchmark.sql','utf8');
const definition=(s:string)=>s.match(/CREATE OR REPLACE FUNCTION public.ttb_demo_spend\([\s\S]*?END \$\$;/)![0];
const bind=(model:typeof BENCHMARK_MODELS[number]=BENCHMARK_MODELS[0])=>benchmarkBindingSchema.parse({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',promptVersion:'isolated-vision-benchmark-v1',model,maxCostMicrousd:1000000});
test('007 exactly three additive tuples; no other function/data/ACL/ceiling delta',()=>{
 let s=definition(migration);
 for(const model of BENCHMARK_MODELS){const b=bind(model);const tuple=JSON.stringify({schemaVersion:b.schemaVersion,rulesVersion:b.rulesVersion,promptVersion:b.promptVersion,model,maxCostMicrousd:b.maxCostMicrousd});const add=` OR b @> '${tuple}'::jsonb`;expect(s.split(add)).toHaveLength(2);s=s.replace(add,'');}
 expect(s).toBe(definition(readFileSync('db/migrations/006_budget_50.sql','utf8')));
 expect(migration.replace(definition(migration),'').replace(/^--.*$/gm,'').trim()).toBe('BEGIN;\n\nCOMMIT;');
});
test('exact benchmark binding + generic execution fails closed; old tuples intact',async()=>{
 const s=new OfflineSpendStore();s.ceiling=50000000;s.historical=27000000;const work=vi.fn(async()=>1);
 for(const m of BENCHMARK_MODELS){const b=bind(m);expect(bindingSchema.parse(b)).toEqual(b);expect((await executeReserved(s,b,work)).ok).toBe(true);expect((await executeReserved(s,b,work)).ok).toBe(false);}
 for(const patch of [{schemaVersion:1},{promptVersion:'photo-set-observations-v2'},{model:'other'},{maxCostMicrousd:999999},{source:'openrouter'},{rulesVersion:'other'}])expect(benchmarkBindingSchema.safeParse({...bind(),...patch}).success).toBe(false);
 expect(work).toHaveBeenCalledTimes(3);
});
const socket=process.env.TTB_HOSTED_TEST_SOCKET,psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql)('real disposable PG: 007 row/ACL preservation, exact cross-product admission, legacy tuples, locks, max2claims, exhaustion/replay',async()=>{
 if(socket!='/opt/data/ttb-alternative-pg'||process.env.TTB_HOSTED_TEST_PORT!=='55487')throw Error('Dedicated disposable cluster only');
 const database='ttb_benchmark_'+randomUUID().replaceAll('-',''),owner=database+'_owner';
 function sql(q:string,role=owner,db=database):Promise<string>{return new Promise((resolve,reject)=>{const c=spawn(psql!,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket!,'-p','55487','-d',db],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',n=>n===0?resolve(out.trim()):reject(Error(err)));c.stdin.end((role?`SET ROLE "${role}"; `:'')+q);});}
 const quote=(x:unknown)=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
 const rpc=(op:string,input:unknown)=>sql(`SELECT public.ttb_demo_spend('${op}',${quote(input)});`,'service_role');
 await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres');await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
 try{
  await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
  for(const f of ['002_hosted_demo.sql','003_photo_groups.sql','004_bottle_semantics.sql','005_azure_ocr_provider.sql'])await sql(readFileSync('db/migrations/'+f,'utf8'));
  await sql("UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,custody_id=gen_random_uuid(),custody_sha256=repeat('a',64)");
  const legacy=[{...bind(),schemaVersion:1,promptVersion:'image-observations-v1',model:'anthropic/claude-haiku-4.5'},{...bind(),promptVersion:'photo-set-observations-v2',model:'anthropic/claude-haiku-4.5'},{...bind(),promptVersion:'azure-ocr-photo-observations-v1',model:'mistral-document-ai-2512'}];
  for(const b of legacy){const claimId=randomUUID();await rpc('reserve',{binding:b});await rpc('claim',{binding:b,claimId});await rpc('complete',{binding:b,claimId});}
  await sql(readFileSync('db/migrations/006_budget_50.sql','utf8'));
  const inventory=()=>sql("SELECT jsonb_build_object("+['ledger','holds','work','reviews','snapshots','snapshot_allocations','quota','uploads'].map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]') FROM ttb_demo_private.${t} r)`).join(',')+")");
  const catalog=()=>sql("SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','ttb_demo_private')");
  const definitions=()=>sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','ttb_demo_private')");
  const before=await inventory(),acl=await catalog(),defs=JSON.parse(await definitions());
  await expect(rpc('reserve',{binding:bind()})).rejects.toThrow('invalid binding');await sql(migration);
  expect(await inventory()).toBe(before);expect(await catalog()).toBe(acl);const after=JSON.parse(await definitions());expect(Object.keys(after).filter(k=>after[k]!==defs[k])).toEqual(['ttb_demo_spend(text,jsonb)']);
  for(const model of [...BENCHMARK_MODELS,'anthropic/claude-haiku-4.5','mistral-document-ai-2512','other',null])for(const schemaVersion of [1,2,null])for(const promptVersion of ['image-observations-v1','photo-set-observations-v2','azure-ocr-photo-observations-v1','isolated-vision-benchmark-v1',null]){
   const b={...bind(),model,schemaVersion,promptVersion},call=sql(`BEGIN; SELECT public.ttb_demo_spend('reserve',${quote({binding:b})}); ROLLBACK;`,'service_role');
   if(bindingSchema.safeParse(b).success)expect(JSON.parse(await call).binding).toEqual(b);else await expect(call).rejects.toThrow('invalid binding');
  }
  for(const patch of [{maxCostMicrousd:999999},{maxCostMicrousd:1000001},{maxCostMicrousd:'1000000'},{rulesVersion:null},{requestId:null},{imageSha256:null},{source:'openrouter'},{schemaVersion:'2'}])await expect(rpc('reserve',{binding:{...bind(),...patch}})).rejects.toThrow();
  expect(await inventory()).toBe(before);
  for(const role of ['anon','authenticated'])await expect(sql("SELECT public.ttb_demo_spend('has_intent','{}')",role)).rejects.toThrow('permission denied');
  await expect(sql('SELECT * FROM ttb_demo_private.ledger','service_role')).rejects.toThrow('permission denied');
  const store={reserve:async(binding:any)=>JSON.parse(await rpc('reserve',{binding})),claim:async(binding:any,claimId:string)=>JSON.parse(await rpc('claim',{binding,claimId})),complete:async(binding:any,claimId:string)=>JSON.parse(await rpc('complete',{binding,claimId}))};
  let calls=0;for(const m of BENCHMARK_MODELS){const b=bind(m);expect((await executeReserved(store,b,async()=>++calls)).ok).toBe(true);expect((await executeReserved(store,b,async()=>++calls)).ok).toBe(false);}expect(calls).toBe(3);
  const workIds=[randomUUID(),randomUUID(),randomUUID()];for(const id of workIds.slice(0,2))await rpc('acquire',{id});await expect(rpc('acquire',{id:workIds[2]})).rejects.toThrow('busy');for(const id of workIds.slice(0,2))await rpc('release',{id});
  const bs=[bind(),bind(),bind()],cs=[randomUUID(),randomUUID()];for(const b of bs)await store.reserve(b);for(let i=0;i<2;i++)await store.claim(bs[i],cs[i]);await expect(store.claim(bs[2],randomUUID())).rejects.toThrow('busy');for(let i=0;i<2;i++)await store.complete(bs[i],cs[i]);
  await expect(store.claim(bs[0],randomUUID())).rejects.toThrow('claim denied');
  const count=Number(await sql('SELECT count(*) FROM ttb_demo_private.holds'));for(let i=count;i<50;i++)await store.reserve(bind());await expect(store.reserve(bind())).rejects.toThrow('exhausted');
  expect(await sql("SELECT ceiling||':'||(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('50000000:50000000');
 }finally{await sql(`DROP DATABASE "${database}";`,'','postgres');await sql(`DROP ROLE "${owner}";`,'','postgres');}
},120000);
