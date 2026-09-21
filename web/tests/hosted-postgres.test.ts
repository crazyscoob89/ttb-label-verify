import { test,expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync,rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createHostedStores,createHostedUploadQuota } from '../lib/persistence/hosted-demo-rpc';
import { executeReserved,type SpendBinding } from '../lib/spend';
import { exportCustody,importSql } from '../scripts/demo-custody';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { ReviewStore } from '../lib/review-store';
import { privateLedgerDir } from './fixtures/private-ledger';
import { samples,compareOfflineSample } from '../lib/offline-demo';
import { newReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';
import { createDemoHandler } from '../lib/demo-route';
import fixture from './fixtures/comparisons.json';
// Opt-in, private Unix socket only. This test creates its OWN random database;
// never accepts a remote URL, canonical path or preexisting database name.
const socket=process.env.TTB_HOSTED_TEST_SOCKET,psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql)('real PostgreSQL: restricted RPCs, exact SQLite custody, races, policy/replay, durable quotas and failure fences',async()=>{
 if(!socket?.startsWith('/')||!psql?.startsWith('/'))throw Error('Explicit local socket and psql required');
 const database='ttb_hosted_test_'+randomUUID().replaceAll('-',''),owner=database+'_owner';
 function sql(query:string,role=owner,db=database):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(psql!,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket!,'-p',process.env.TTB_HOSTED_TEST_PORT??'5432','-d',db],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.end((role?`SET ROLE "${role}"; `:'')+query);
 });}
 const quote=(x:unknown)=>`'${JSON.stringify(x).replaceAll("'","''")}'::jsonb`;
 const bind=():SpendBinding=>({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:1,rulesVersion:'prototype-seven-fields-v1',promptVersion:'image-observations-v1',model:'anthropic/claude-haiku-4.5',maxCostMicrousd:1000000});
 await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres');await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
 const dirs=[privateLedgerDir(),privateLedgerDir()];
 try{
  // Simulate Supabase's broad defaults: migration must explicitly remove them.
  await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
  await sql(readFileSync('db/migrations/002_hosted_demo.sql','utf8'));
  for(const role of ['anon','authenticated'])await expect(sql(`SELECT public.ttb_demo_review('list','{"offset":0}');`,role)).rejects.toThrow('permission denied');
  await expect(sql('SELECT * FROM ttb_demo_private.ledger','service_role')).rejects.toThrow('permission denied');
  await expect(sql("UPDATE ttb_demo_private.ledger SET enabled=true",'service_role')).rejects.toThrow('permission denied');
  await expect(sql(`SELECT public.ttb_demo_spend('acquire',${quote({id:randomUUID()})})`,'service_role')).rejects.toThrow('spend unavailable');
  const spendPath=join(dirs[0],'spend.sqlite'),reviewPath=join(dirs[1],'reviews.sqlite');SqliteSpendStore.provision(spendPath);ReviewStore.provision(reviewPath);
  const local=new SqliteSpendStore(spendPath);for(let i=0;i<7;i++){const b=bind(),c=randomUUID();await local.reserve(b);await local.claim(b,c);await local.complete(b,c);}local.close();
  const image=readFileSync(`public${samples.match.imagePath}`),record=await compareOfflineSample('match',samples.match.application,image) as CompleteComparison;
  const localReviews=new ReviewStore(reviewPath),comparisonId=localReviews.snapshot(record,image,'image/png'),intent={...newReviewIntent(record),outcome:'second-review',confirmed:true,notes:'Synthetic historical record'};
  const saveInput={comparisonId,idempotencyKey:randomUUID(),intent},saved=localReviews.save(saveInput);localReviews.close();
  const sealed=exportCustody({spendPath,reviewPath,writersStopped:true,expected:{holds:7,unresolved:7000000,incurred:0,remaining:18000000,snapshots:1,reviews:1}});
  await sql(importSql(sealed));await sql(importSql(sealed));
  const changed=exportCustody({spendPath,reviewPath,writersStopped:true,expected:{holds:7,unresolved:7000000,incurred:0,remaining:18000000,snapshots:1,reviews:1}});
  await expect(sql(importSql(changed))).rejects.toThrow('custody mismatch');
  expect(await sql("SELECT enabled||':'||ceiling||':'||(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger")).toBe('false:25000000:7000000');
  const objectMap=new Map<string,Buffer>([[`snapshots/${comparisonId}`,image]]);
  const objects={async putEvidence(id:string,bytes:Buffer){const key=`snapshots/${id}`;if(objectMap.has(key))throw Error('overwrite');objectMap.set(key,bytes);return {key};},async getEvidence(key:string){return objectMap.get(key)!;},async signEvidence(){throw Error('not used');}};
  let calls=0;
  const transport:typeof fetch=async(url,init)=>{calls++;const {p_op,p_input}=JSON.parse(String(init?.body)),name=String(url).split('/').at(-1);if(!['ttb_demo_spend','ttb_demo_review'].includes(name!))throw Error('RPC name');
   try{return new Response(await sql(`SELECT public.${name}('${p_op}',${quote(p_input)})`,'service_role'),{status:200});}
   catch(e){const message=String(e).match(/ERROR:\s+([^\n]+)/)?.[1];return Response.json({code:'P0001',message},{status:400});}
  };
  const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic'};
  let stores=createHostedStores({env,objects,fetch:transport}),reviews=await stores.openReviews();
  expect(await reviews.save(saveInput)).toEqual(saved);expect((await reviews.detail(saved.reviewId)).record).toEqual(record);expect((await reviews.evidence(saved.reviewId)).bytes).toEqual(image);expect(await reviews.list()).toHaveLength(1);
  await expect(reviews.save({...saveInput,intent:{...intent,confirmed:false}})).rejects.toThrow('review-policy-or-stale-binding');
  await expect(reviews.save({...saveInput,intent:{...intent,notes:'Changed synthetic review decision'}})).rejects.toThrow('idempotency-conflict');
  await expect(sql('DELETE FROM ttb_demo_private.reviews')).rejects.toThrow('immutable');
  await expect(sql('DELETE FROM ttb_demo_private.holds')).rejects.toThrow('permanent liability');
  // Synthetic owner activation ONLY in this disposable DB, never production.
  await sql('UPDATE ttb_demo_private.ledger SET enabled=true WHERE id=1');
  const routeEnv={...env,TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'synthetic-only-access-code-0123456789abcdef',OPENROUTER_API_KEY:'synthetic'};
  let syntheticDispatches=0;
  const handler=createDemoHandler({env:routeEnv,stores,readInput:async()=>({file:{filename:'label.png',mime:'image/png',bytes:image},binding:{filename:'label.png',application:samples.match.application}}),transport:async(url)=>{
   if(url.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
   syntheticDispatches++;return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixture.evidence)}}]});
  }});
  const response=await handler(new Request('https://demo.example/api/comparisons',{method:'POST',headers:{origin:routeEnv.TTB_DEMO_ORIGIN,'x-ttb-demo-code':routeEnv.TTB_DEMO_ACCESS_SECRET}}));
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({result:{processing:'complete'},comparisonId:expect.any(String),reviewAvailability:'available'});expect(syntheticDispatches).toBe(1);
  const spend=await stores.openSpend(),work=[randomUUID(),randomUUID(),randomUUID()];
  const admits=await Promise.allSettled(work.map(id=>spend.acquireWork(id)));expect(admits.filter(x=>x.status==='fulfilled')).toHaveLength(2);
  for(let i=0;i<3;i++)if(admits[i].status==='fulfilled')await spend.releaseWork(work[i]);
  const b=bind();await spend.reserve(b);const claimResults=await Promise.allSettled([spend.claim(b,randomUUID()),spend.claim(b,randomUUID())]);expect(claimResults.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  const claimReceipt=(claimResults.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>).value;await spend.complete(b,claimReceipt.claimId);
  await expect(spend.reserve(b)).rejects.toThrow();await expect(spend.claim(b,randomUUID())).rejects.toThrow();
  let dispatched=0;const lost=bind();const lossy:typeof fetch=async(url,init)=>{const result=await transport(url,init);if(JSON.parse(String(init?.body)).p_op==='claim')throw Error('lost claim acknowledgment');return result;};
  expect(await executeReserved(await createHostedStores({env,objects,fetch:lossy}).openSpend(),lost,async()=>++dispatched)).toEqual({ok:false,code:'spend-unavailable'});expect(dispatched).toBe(0);
  stores=createHostedStores({env,objects,fetch:transport});expect(await executeReserved(await stores.openSpend(),lost,async()=>++dispatched)).toEqual({ok:false,code:'spend-unavailable'});expect(dispatched).toBe(0);
  // Byte capacity independently of count (transaction rolls back on denial).
  await expect(sql("BEGIN; INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),10485760 FROM generate_series(1,12); INSERT INTO ttb_demo_private.uploads VALUES(gen_random_uuid(),8388607); SET LOCAL ROLE service_role; SELECT public.ttb_demo_review('upload_reserve',jsonb_build_object('id',gen_random_uuid(),'bytes',2));")).rejects.toThrow('review-capacity');
  const quota=createHostedUploadQuota(env,{fetch:transport});await Promise.all([quota.reserve(randomUUID(),10*1024*1024),quota.reserve(randomUUID(),10*1024*1024)]);
  // Seed near capacity as owner to test exact transactional race at the boundary.
  await sql('INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),1 FROM generate_series(1,197)');
  const tickets=await Promise.allSettled([quota.reserve(randomUUID(),1),quota.reserve(randomUUID(),1)]);expect(tickets.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  reviews=await stores.openReviews();const snapshots=await Promise.all([reviews.snapshot(record,image,'image/png'),reviews.snapshot(record,image,'image/png')]);
  const candidate={comparisonId:snapshots[0],idempotencyKey:randomUUID(),intent};const receipts=await Promise.all([reviews.save(candidate),reviews.save(candidate)]);expect(receipts[0]).toEqual(receipts[1]);
  // Aggregate snapshot count race counts pending allocations as well as committed.
  await sql("INSERT INTO ttb_demo_private.snapshot_allocations SELECT v.id,sa.record,'snapshots/'||v.id::text,sa.sha256,sa.bytes,sa.mime FROM (SELECT gen_random_uuid() id FROM generate_series(1,199-(SELECT count(*)::integer FROM ttb_demo_private.snapshot_allocations))) v CROSS JOIN LATERAL (SELECT * FROM ttb_demo_private.snapshot_allocations LIMIT 1) sa");
  const finalSnapshots=await Promise.allSettled([reviews.snapshot(record,image,'image/png'),reviews.snapshot(record,image,'image/png')]);expect(finalSnapshots.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(await sql('SELECT count(*) FROM ttb_demo_private.snapshot_allocations')).toBe('200');
  // A lost completion acknowledgment retains both the dispatched attempt and hold.
  const completedLost=bind();const lostCompletion:typeof fetch=async(url,init)=>{const response=await transport(url,init);if(JSON.parse(String(init?.body)).p_op==='complete')throw Error('lost completion acknowledgment');return response;};
  expect(await executeReserved(await createHostedStores({env,objects,fetch:lostCompletion}).openSpend(),completedLost,async()=>++dispatched)).toEqual({ok:false,code:'spend-unavailable'});expect(dispatched).toBe(1);
  expect(await executeReserved(await stores.openSpend(),completedLost,async()=>++dispatched)).toEqual({ok:false,code:'spend-unavailable'});expect(dispatched).toBe(1);
  const more=[bind(),bind()];await spend.reserve(more[0]);await spend.reserve(more[1]);await spend.claim(more[0],randomUUID());await expect(spend.claim(more[1],randomUUID())).rejects.toThrow();
  const count=Number(await sql('SELECT count(*) FROM ttb_demo_private.holds'));for(let i=count;i<24;i++)await spend.reserve(bind());
  const lastBudget=await Promise.allSettled([spend.reserve(bind()),spend.reserve(bind())]);expect(lastBudget.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(await sql('SELECT sum(amount) FROM ttb_demo_private.holds')).toBe('25000000');await expect(spend.reserve(bind())).rejects.toThrow();
  expect(calls).toBeGreaterThan(20);
 }finally{for(const d of dirs)rmSync(d,{recursive:true,force:true});await sql(`DROP DATABASE "${database}";`,'','postgres');await sql(`DROP ROLE "${owner}";`,'','postgres');}
},60000);
