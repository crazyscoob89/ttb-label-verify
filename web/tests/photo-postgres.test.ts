import {test,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {groupFixture} from './fixtures/photo-groups';
import {prepareGroupAssets} from '../lib/group-assets';
import {createHostedStores,createHostedUploadQuota} from '../lib/persistence/hosted-demo-rpc';
import {newReviewIntent} from '../lib/review-policy';
import {finalizeComparison} from '../lib/comparison-record';
import {compareApplication} from '../lib/rules';
import {bindingSchema} from '../lib/spend';
import {checkedPhotoRecord} from '../lib/photo-record';
import {aggregatePhotoEvidence as aggregateV1} from '../lib/photo-evidence-v1';
import {comparePhotoApplication as compareV4} from '../lib/group-rules-v4';
const socket=process.env.TTB_HOSTED_TEST_SOCKET,psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql)('real disposable PostgreSQL 003 to 004: frozen 4/v1 and fresh 6/v2, unchanged ownership/history/budget, strict manifests and durable readback',async()=>{
 if(!socket?.startsWith('/')||!psql?.startsWith('/'))throw Error('Local Unix socket only');
 const database='ttb_photo_test_'+randomUUID().replaceAll('-',''),owner=database+'_owner';
 function sql(query:string,role=owner,db=database):Promise<string>{return new Promise((resolve,reject)=>{
  const child=spawn(psql!,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket!,'-p',process.env.TTB_HOSTED_TEST_PORT??'5432','-d',db],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err)));child.stdin.end((role?`SET ROLE "${role}"; `:'')+query);
 });}
 const quote=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const rpc=(op:string,input:unknown)=>sql(`SELECT public.ttb_demo_review('${op}',${quote(input)});`,'service_role');
 await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres');await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
 try{
  await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
  await sql(readFileSync('db/migrations/002_hosted_demo.sql','utf8'));
  const f=await groupFixture(2),singleton=finalizeComparison(f.record.application,{processing:'complete',evidence:f.record.photoEvidence.photos[0].evidence,metadata:{source:'fixture',model:'offline-fixture',schemaVersion:1,rulesVersion:'prototype-seven-fields-v1',promptVersion:'image-observations-v1',imageSha256:f.record.imageSha256,requestId:randomUUID()}},f.record.imageSha256);
  if(singleton.processing!=='complete'||'recordVersion' in singleton)throw Error('Expected singleton fixture');
  const frozenComparison=compareApplication(singleton.application,singleton.evidence);if(frozenComparison.processing!=='complete')throw Error('Expected frozen comparison');
  const legacy={...singleton,comparison:frozenComparison};
  expect(legacy.comparison.rulesRevision).toBe(2);
  const oldId=randomUUID(),oldSnapshot={id:oldId,key:`snapshots/${oldId}`,record:JSON.stringify(legacy),sha256:f.record.imageSha256,bytes:f.photos[0].normalized.length,mime:'image/png'};
  await rpc('snapshot_prepare',oldSnapshot);await rpc('snapshot_commit',{id:oldId});
  const before=await sql('SELECT row_to_json(s)::text FROM ttb_demo_private.snapshot_allocations s');
  await sql(readFileSync('db/migrations/003_photo_groups.sql','utf8'));
  expect(JSON.parse(await sql("SELECT (to_jsonb(s)-'assets')::text FROM ttb_demo_private.snapshot_allocations s"))).toEqual(JSON.parse(before));
  expect(JSON.parse(await rpc('snapshot_get',{id:oldId})).record).toBe(JSON.stringify(legacy));
  for(const role of ['anon','authenticated'])await expect(sql("SELECT public.ttb_demo_review('list','{\"offset\":0}');",role)).rejects.toThrow('permission denied');
  await expect(sql('SELECT assets FROM ttb_demo_private.snapshot_allocations','service_role')).rejects.toThrow('permission denied');
  expect(await sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ttb_demo_private' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity")).toBe('8');
  const group=prepareGroupAssets(f.record,f.photos),primary=group.assets[1];const payload={id:group.id,record:group.recordText,key:primary.key,sha256:primary.sha256,bytes:primary.bytes,mime:primary.mime,assets:group.assets};
  // A genuine frozen comparator record, not a fresh record relabeled revision 4.
  const oldGroupRecord=checkedPhotoRecord({...f.record,aggregationVersion:'photo-set-aggregation-v1',...aggregateV1(f.record.photoEvidence),comparison:compareV4(f.record.application,f.record.photoEvidence)});
  if(!oldGroupRecord)throw Error('invalid frozen group fixture');
  const oldGroup=prepareGroupAssets(oldGroupRecord,f.photos),oldPrimary=oldGroup.assets[1];
  const oldPayload={id:oldGroup.id,record:oldGroup.recordText,key:oldPrimary.key,sha256:oldPrimary.sha256,bytes:oldPrimary.bytes,mime:oldPrimary.mime,assets:oldGroup.assets};
  await rpc('snapshot_prepare',oldPayload);await rpc('snapshot_commit',{id:oldGroup.id});
  await expect(rpc('snapshot_prepare',payload)).rejects.toThrow('invalid group record');
  const rows=()=>sql('SELECT jsonb_agg(to_jsonb(s) ORDER BY id)::text FROM ttb_demo_private.snapshot_allocations s');
  const catalog=()=>sql("SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ttb_demo_private')");
  const oldRows=await rows(),oldCatalog=await catalog(),oldLedger=await sql('SELECT to_jsonb(l)::text FROM ttb_demo_private.ledger l');
  await sql(readFileSync('db/migrations/004_bottle_semantics.sql','utf8'));
  expect(await rows()).toBe(oldRows);expect(await catalog()).toBe(oldCatalog);
  expect(await sql('SELECT to_jsonb(l)::text FROM ttb_demo_private.ledger l')).toBe(oldLedger);
  expect(JSON.parse(await rpc('snapshot_get',{id:oldId})).record).toBe(JSON.stringify(legacy));
  expect(JSON.parse(await rpc('snapshot_get',{id:oldGroup.id})).record).toBe(oldGroup.recordText);
  // Historical admission still works after 004; allocation keys are not reusable.
  expect(Number(await sql(`SELECT ttb_demo_private.photo_asset_bytes(${quote(oldGroup.recordText)}#>>'{}',${quote(oldGroup.assets)},'${oldGroup.id}','${oldPrimary.key}','${oldPrimary.sha256}',${oldPrimary.bytes},'${oldPrimary.mime}')`))).toBe(oldGroup.assets.reduce((n,a)=>n+a.bytes,0));
  for(const [rulesRevision,aggregationVersion] of [[4,'photo-set-aggregation-v2'],[6,'photo-set-aggregation-v1'],[7,'photo-set-aggregation-v2'],[6,'unknown'],[null,'photo-set-aggregation-v2'],[6,null],[undefined,undefined]]){
   await expect(rpc('snapshot_prepare',{...payload,record:JSON.stringify({...f.record,aggregationVersion,comparison:{...f.record.comparison,rulesRevision}})})).rejects.toThrow('invalid group record');
  }
  for(const bad of [{...payload,record:JSON.stringify({...f.record,photos:f.record.photos.map((p,i)=>i===0?{...p,role:null}:p)})},{...payload,assets:group.assets.map((a,i)=>i===1?{...a,variant:null}:a)},{...payload,assets:group.assets.slice(1)},{...payload,assets:group.assets.map((a,i)=>i===0?{...a,bytes:a.bytes+1}:a)},{...payload,assets:group.assets.map(a=>({...a,key:primary.key}))},{...payload,assets:group.assets.map((a,i)=>i===0?{...a,photoId:randomUUID()}:a)},{...payload,record:JSON.stringify({...f.record,recordVersion:3})}])await expect(rpc('snapshot_prepare',bad)).rejects.toThrow();
  expect(await sql('SELECT count(*) FROM ttb_demo_private.snapshot_allocations')).toBe('2');
  await rpc('snapshot_prepare',payload);await expect(rpc('snapshot_get',{id:group.id})).rejects.toThrow('comparison-not-found');
  // Pending group quota includes all variants, exactly once; old bytes unchanged.
  expect(Number(await sql("SELECT sum(octet_length(record)+CASE WHEN assets IS NULL THEN bytes ELSE (SELECT sum((v->>'bytes')::bigint) FROM jsonb_array_elements(assets) v) END) FROM ttb_demo_private.snapshot_allocations"))).toBe(Buffer.byteLength(oldSnapshot.record)+oldSnapshot.bytes+Buffer.byteLength(oldGroup.recordText)+oldGroup.assets.reduce((n,a)=>n+a.bytes,0)+Buffer.byteLength(group.recordText)+group.assets.reduce((n,a)=>n+a.bytes,0));
  const objects=new Map<string,Buffer>();const fetcher:typeof fetch=async(url,init)=>{const {p_op,p_input}=JSON.parse(String(init?.body));try{return new Response(await sql(`SELECT public.${String(url).split('/').at(-1)}('${p_op}',${quote(p_input)})`,'service_role'));}catch(e){return Response.json({code:'P0001',message:String(e).match(/ERROR:\s+([^\n]+)/)?.[1]},{status:400});}};
  const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'offline'};
  const stores=createHostedStores({env,fetch:fetcher,objects:{async putEvidence(id,b){const key=`snapshots/${id}`;objects.set(key,Buffer.from(b));return {key};},async getEvidence(key){return objects.get(key)!;},async signEvidence(){throw Error('unused');}}});
  const reviews=await stores.openReviews(),id=await reviews.snapshotGroup!(f.record,f.photos);const intent={...newReviewIntent(f.record),outcome:'second-review',confirmed:true,notes:'Synthetic group review only.'};const save={comparisonId:id,idempotencyKey:randomUUID(),intent};const receipt=await reviews.save(save);
  expect(await reviews.save(save)).toEqual(receipt);expect((await reviews.detail(receipt.reviewId)).record).toEqual(f.record);
  const historicalId=await reviews.snapshotGroup!(oldGroupRecord,f.photos);
  const historicalSave={comparisonId:historicalId,idempotencyKey:randomUUID(),intent:{...newReviewIntent(oldGroupRecord),outcome:'second-review' as const,confirmed:true,notes:'Frozen revision four readback after additive migration.'}};
  const historicalReceipt=await reviews.save(historicalSave);expect((await reviews.detail(historicalReceipt.reviewId)).record).toEqual(oldGroupRecord);
  for(const p of f.photos)for(const variant of ['original','normalized'] as const)expect((await reviews.evidence(receipt.reviewId,{photoId:p.photoId,variant})).bytes).toEqual(p[variant]);
  await expect(reviews.evidence(receipt.reviewId,{photoId:randomUUID(),variant:'original'})).rejects.toThrow('review-not-found');
  await expect(sql("UPDATE ttb_demo_private.snapshot_allocations SET assets='[]'")).rejects.toThrow('immutable');
  // Exact nine-key v2 binding accepted alongside v1; no ledger reset by 003.
  expect(await sql('SELECT ceiling||\':\'||enabled FROM ttb_demo_private.ledger')).toBe('0:false');
  await sql(`UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,incurred=7000000,custody_id=gen_random_uuid(),custody_sha256=repeat('a',64);`);
  const fundedLedger=await sql('SELECT to_jsonb(l)::text FROM ttb_demo_private.ledger l');
  await sql(readFileSync('db/migrations/004_bottle_semantics.sql','utf8'));
  expect(await sql('SELECT to_jsonb(l)::text FROM ttb_demo_private.ledger l')).toBe(fundedLedger);
  const spend=await stores.openSpend();for(const version of [1,2] as const){const b=bindingSchema.parse({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:version,rulesVersion:'prototype-seven-fields-v1',promptVersion:version===1?'image-observations-v1':'photo-set-observations-v2',model:'anthropic/claude-haiku-4.5',maxCostMicrousd:1000000});await spend.reserve(b);await expect(spend.reserve(b)).rejects.toThrow();}
  expect(await sql('SELECT incurred FROM ttb_demo_private.ledger')).toBe('7000000');
  const quota=createHostedUploadQuota(env,{fetch:fetcher});await quota.reserveGroup([{id:randomUUID(),bytes:1},{id:randomUUID(),bytes:2}]);
  await sql('INSERT INTO ttb_demo_private.uploads SELECT gen_random_uuid(),1 FROM generate_series(1,195)');
  const uploads=()=>[{id:randomUUID(),bytes:1},{id:randomUUID(),bytes:1}];const results=await Promise.allSettled([quota.reserveGroup(uploads()),quota.reserveGroup(uploads())]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await sql('SELECT count(*) FROM ttb_demo_private.uploads')).toBe('199');
 }finally{await sql(`DROP DATABASE "${database}" WITH(FORCE);`,'','postgres');await sql(`DROP ROLE "${owner}";`,'','postgres');}
},60000);
