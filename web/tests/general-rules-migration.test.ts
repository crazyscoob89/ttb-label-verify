import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import { newReviewIntent } from '../lib/review-policy';
import bacardi from './fixtures/bacardi-live-v7.json';
import jose from './fixtures/jose-live-v7.json';

const definition = (text: string) => text.match(/CREATE OR REPLACE FUNCTION ttb_demo_private\.photo_asset_bytes\([\s\S]*?END \$\$;/)![0];
const migration = readFileSync('db/migrations/009_general_group_semantics.sql','utf8');
test('009 is exactly two typed v8/v3 admission additions, no spend, history, ACL or custody changes', () => {
  const previous = definition(readFileSync('db/migrations/008_gpt41_group_provider.sql','utf8'));
  const tuple = `(doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":8},"aggregationVersion":"photo-set-aggregation-v3"}'::jsonb)`;
  const fn=definition(migration);
  expect(fn.split(` OR ${tuple}`)).toHaveLength(2); expect(fn.split(` OR\n  ${tuple}`)).toHaveLength(2);
  expect(fn.replace(` OR ${tuple}`,'').replace(` OR\n  ${tuple}`,'')).toBe(previous);
  expect(migration.replace(fn,'').replace(/^--.*$/gm,'').replace(/\s/g,'')).toBe('BEGIN;COMMIT;');
});

const socket=process.env.TTB_HOSTED_TEST_SOCKET, psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql)('real disposable PostgreSQL 008 -> 009 RED/GREEN, exact historical reviews, unchanged rows/ACL/ledger and strict v8 pair admission', async () => {
  if (!socket?.startsWith('/opt/data/ttb-general-rules-pg/') || !psql?.startsWith('/opt/data/tools/')) throw Error('Own disposable Unix-socket harness only');
  const database='ttb_rules_'+randomUUID().replaceAll('-',''), owner=database+'_owner';
  function sql(query: string, role=owner, db=database): Promise<string> {
    return new Promise((resolve,reject)=>{
      const child=spawn(psql!,['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket!,'-p',process.env.TTB_HOSTED_TEST_PORT??'5432','-d',db],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},stdio:['pipe','pipe','pipe']});
      let out='',err=''; child.stdout.on('data',b=>out+=b); child.stderr.on('data',b=>err+=b); child.on('error',reject); child.on('close',code=>code===0?resolve(out.trim()):reject(Error(err))); child.stdin.end((role?`SET ROLE "${role}"; `:'')+query);
    });
  }
  const text=(v:string)=>`'${v.replaceAll("'","''")}'`, json=(v:unknown)=>`${text(JSON.stringify(v))}::jsonb`;
  const rpc=(op:string,input:unknown)=>sql(`SELECT public.ttb_demo_review('${op}',${json(input)});`,'service_role');
  function payload(record:CompletePhotoComparison) {
    const id=randomUUID(); const assets=record.photos.flatMap((p,i)=>(['original','normalized'] as const).map(variant=>({photoId:p.photoId,variant,key:'snapshots/'+(i===0&&variant==='normalized'?id:randomUUID()),sha256:variant==='original'?p.sourceSha256:p.normalized.sha256,bytes:variant==='original'?p.bytes:p.normalized.bytes,mime:variant==='original'?p.mime:p.normalized.mime})));
    const anchor=assets[1]; return {id,record:JSON.stringify(record),key:anchor.key,sha256:anchor.sha256,bytes:anchor.bytes,mime:anchor.mime,assets};
  }
  const old=bacardi.result as CompletePhotoComparison;
  const application={...old.application,imported:false,origin:{kind:'domestic' as const,country:'Puerto Rico'}};
  const fresh=finalizePhotoComparison(application,old.groupId,old.revision,old.photos,old.photoSetSha256,{processing:'complete',evidence:old.photoEvidence,metadata:{...old.extraction,source:old.source,rulesVersion:old.comparison.rulesVersion,photoSetSha256:old.photoSetSha256,photos:old.photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))}});
  const next=payload(fresh);
  const asset=(record:unknown,assets=next.assets)=>sql(`SELECT ttb_demo_private.photo_asset_bytes(${text(JSON.stringify(record))},${json(assets)},'${next.id}','${next.key}','${next.sha256}',${next.bytes},'${next.mime}');`);
  await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres'); await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
  try {
    await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
    for(const file of ['002_hosted_demo.sql','003_photo_groups.sql','004_bottle_semantics.sql','005_azure_ocr_provider.sql']) await sql(readFileSync('db/migrations/'+file,'utf8'));
    await sql(`UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,incurred=3000000,custody_id=gen_random_uuid(),custody_sha256=repeat('c',64);`);
    for(const file of ['006_budget_50.sql','007_isolated_vision_benchmark.sql','008_gpt41_group_provider.sql']) await sql(readFileSync('db/migrations/'+file,'utf8'));
    const frozen=[];
    for(const record of [old,jose.result as CompletePhotoComparison]) {
      expect(checkedPhotoRecord(record)).toEqual(record);
      const p=payload(record); await rpc('snapshot_prepare',p); await rpc('snapshot_commit',{id:p.id});
      const intent={...newReviewIntent(record),outcome:'second-review',confirmed:true,notes:'Exact retained live response, local migration replay; no new scan or media upload.'};
      const request={comparisonId:p.id,idempotencyKey:randomUUID(),intent};
      const receipt=JSON.parse(await rpc('save',{...request,request:JSON.stringify(request),intent:JSON.stringify(intent)})); frozen.push({record,p,receipt});
    }

    const binding={reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',model:'openai/gpt-4.1',promptVersion:'gpt41-photo-observations-v1',maxCostMicrousd:1000000};
    await sql(`SELECT public.ttb_demo_spend('reserve',${json({binding})});`,'service_role');
    const rows=()=>sql("SELECT jsonb_build_object('ledger',(SELECT jsonb_agg(to_jsonb(t)) FROM ttb_demo_private.ledger t),'holds',(SELECT jsonb_agg(to_jsonb(t)) FROM ttb_demo_private.holds t),'snapshots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ttb_demo_private.snapshot_allocations t),'reviews',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ttb_demo_private.reviews t));");
    const catalog=()=>sql("SELECT jsonb_agg(CASE WHEN p.proname='photo_asset_bytes' THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ttb_demo_private');");
    const acl=()=>sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ttb_demo_private';");
    const before=await rows(), beforeCatalog=await catalog(), beforeAcl=await acl();
    await expect(rpc('snapshot_prepare',next)).rejects.toThrow('invalid group record'); // RED, actual DB
    await sql(migration);
    expect(await rows()).toBe(before); expect(await catalog()).toBe(beforeCatalog); expect(await acl()).toBe(beforeAcl);
    for(const {record,p} of frozen) expect(JSON.parse(await rpc('snapshot_get',{id:p.id})).record).toBe(JSON.stringify(record));
    expect(Number(await asset(fresh))).toBe(next.assets.reduce((n,a)=>n+a.bytes,0)); // GREEN
    for(const [rulesRevision,aggregationVersion] of [[8,'photo-set-aggregation-v2'],[7,'photo-set-aggregation-v3'],[6,'photo-set-aggregation-v3'],['8','photo-set-aggregation-v3'],[null,'photo-set-aggregation-v3'],[8,null],[8,undefined]]) await expect(asset({...fresh,aggregationVersion,comparison:{...fresh.comparison,rulesRevision}})).rejects.toThrow('invalid group record');
    for(const patch of [{source:'fixture'},{recordVersion:'2'},{extraction:{...fresh.extraction,model:'anthropic/claude-haiku-4.5'}},{extraction:{...fresh.extraction,promptVersion:'photo-set-observations-v2'}},{extraction:{...fresh.extraction,schemaVersion:'2'}}]) await expect(asset({...fresh,...patch})).rejects.toThrow('invalid group record');
    await expect(asset(fresh,next.assets.slice(1))).rejects.toThrow();
    await expect(asset(fresh,next.assets.map((a,i)=>i===0?{...a,bytes:a.bytes+1}:a))).rejects.toThrow();
    expect(await rows()).toBe(before);
    await rpc('snapshot_prepare',next); await rpc('snapshot_commit',{id:next.id});
    expect(checkedPhotoRecord(JSON.parse(JSON.parse(await rpc('snapshot_get',{id:next.id})).record))).toEqual(fresh);
    const intent={...newReviewIntent(fresh),outcome:'second-review',confirmed:true,notes:'Domestic PR v8 replay, class extraction still GOLD only; no physical approval.'};
    const request={comparisonId:next.id,idempotencyKey:randomUUID(),intent};
    const save={...request,request:JSON.stringify(request),intent:JSON.stringify(intent)};
    const receipt=await rpc('save',save); expect(await rpc('save',save)).toBe(receipt);
    expect(await sql(`SELECT record FROM ttb_demo_private.snapshot_allocations WHERE id='${next.id}'`)).toBe(JSON.stringify(fresh));
    for(const role of ['anon','authenticated']) await expect(sql("SELECT public.ttb_demo_review('list','{\"offset\":0}');",role)).rejects.toThrow('permission denied');
    await expect(sql('SELECT * FROM ttb_demo_private.ledger','service_role')).rejects.toThrow('permission denied');
    await sql(migration); // idempotent reapplication; no row rewrite
    for(const {record,p} of frozen) expect(JSON.parse(await rpc('snapshot_get',{id:p.id})).record).toBe(JSON.stringify(record));
  } finally { await sql(`DROP DATABASE "${database}" WITH(FORCE);`,'','postgres'); await sql(`DROP ROLE "${owner}";`,'','postgres'); }
},30000);
