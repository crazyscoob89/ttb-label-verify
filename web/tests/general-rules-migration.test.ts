import { expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import { newReviewIntent } from '../lib/review-policy';
import bacardi from './fixtures/bacardi-live-v7.json';
import jose from './fixtures/jose-live-v7.json';
import composite from './fixtures/bacardi-live-v8-composite.json';
import { aggregatePhotoEvidence as aggregateV3 } from '../lib/photo-evidence-v3';
import { comparePhotoApplicationV8 } from '../lib/group-rules-v8';
import { aggregatePhotoEvidence as aggregateV4 } from '../lib/photo-evidence-v4';
import { comparePhotoApplicationV9 } from '../lib/group-rules-v9';
import corroboration from './fixtures/bacardi-live-v9-corroboration.json';

const definition = (text: string) => text.match(/CREATE OR REPLACE FUNCTION ttb_demo_private\.photo_asset_bytes\([\s\S]*?END \$\$;/)![0];
const versions = [
  { file:'009_general_group_semantics.sql', previous:'008_gpt41_group_provider.sql', revision:8, aggregation:'photo-set-aggregation-v3' },
  { file:'010_composite_class_semantics.sql', previous:'009_general_group_semantics.sql', revision:9, aggregation:'photo-set-aggregation-v4' },
  { file:'011_same_photo_class_corroboration.sql', previous:'010_composite_class_semantics.sql', revision:10, aggregation:'photo-set-aggregation-v5' },
];
test.each(versions)('$file is exactly two typed admissions, no spend, history, ACL or custody changes', ({file,previous: predecessor,revision,aggregation}) => {
  const migration=readFileSync('db/migrations/'+file,'utf8');
  const previous = definition(readFileSync('db/migrations/'+predecessor,'utf8'));
  const tuple = `(doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":${revision}},"aggregationVersion":"${aggregation}"}'::jsonb)`;
  const fn=definition(migration);
  expect(fn.split(` OR ${tuple}`)).toHaveLength(2); expect(fn.split(` OR\n  ${tuple}`)).toHaveLength(2);
  expect(fn.replace(` OR ${tuple}`,'').replace(` OR\n  ${tuple}`,'')).toBe(previous);
  expect(migration.replace(fn,'').replace(/^--.*$/gm,'').replace(/\s/g,'')).toBe('BEGIN;COMMIT;');
});

const socket=process.env.TTB_HOSTED_TEST_SOCKET, psql=process.env.TTB_HOSTED_TEST_PSQL;
test.skipIf(!socket||!psql).each(versions)('real disposable PostgreSQL $file RED/GREEN, exact historical reviews, unchanged rows/ACL/ledger and strict pair admission', async ({file,revision,aggregation}) => {
  const migration=readFileSync('db/migrations/'+file,'utf8');
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
  const old=(revision===10?corroboration.record:(revision===9?composite:bacardi).result) as CompletePhotoComparison;
  const application={...old.application,imported:false,origin:{kind:'domestic' as const,country:'Puerto Rico'}};
  const current=finalizePhotoComparison(application,old.groupId,old.revision,old.photos,old.photoSetSha256,{processing:'complete',evidence:old.photoEvidence,metadata:{...old.extraction,source:old.source,rulesVersion:old.comparison.rulesVersion,photoSetSha256:old.photoSetSha256,photos:old.photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))}});
  const fresh:CompletePhotoComparison=revision===10?current:revision===9?{...current,aggregationVersion:'photo-set-aggregation-v4',...aggregateV4(old.photoEvidence),comparison:comparePhotoApplicationV9(application,old.photoEvidence)}:{...current,aggregationVersion:'photo-set-aggregation-v3',...aggregateV3(old.photoEvidence),comparison:comparePhotoApplicationV8(application,old.photoEvidence)};
  expect(checkedPhotoRecord(fresh)).toEqual(fresh);
  if(revision>=9)expect(fresh.comparison.fields.classType).toMatchObject({status:'match',conflict:false});
  const next=payload(fresh);
  const asset=(record:unknown,assets=next.assets)=>sql(`SELECT ttb_demo_private.photo_asset_bytes(${text(JSON.stringify(record))},${json(assets)},'${next.id}','${next.key}','${next.sha256}',${next.bytes},'${next.mime}');`);
  await sql(`CREATE ROLE "${owner}" NOLOGIN;`,'','postgres'); await sql(`CREATE DATABASE "${database}" OWNER "${owner}";`,'','postgres');
  try {
    await sql('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');
    for(const file of ['002_hosted_demo.sql','003_photo_groups.sql','004_bottle_semantics.sql','005_azure_ocr_provider.sql']) await sql(readFileSync('db/migrations/'+file,'utf8'));
    await sql(`UPDATE ttb_demo_private.ledger SET enabled=true,ceiling=25000000,incurred=3000000,custody_id=gen_random_uuid(),custody_sha256=repeat('c',64);`);
    for(const file of ['006_budget_50.sql','007_isolated_vision_benchmark.sql','008_gpt41_group_provider.sql']) await sql(readFileSync('db/migrations/'+file,'utf8'));
    if(revision>=9)await sql(readFileSync('db/migrations/009_general_group_semantics.sql','utf8'));
    if(revision===10)await sql(readFileSync('db/migrations/010_composite_class_semantics.sql','utf8'));
    if(revision>=9){
      // LOCAL disposable baseline only: production already has an independently
      // installed $100 spend ceiling. 010 must preserve this non-008 state too.
      const spend=readFileSync('db/migrations/008_gpt41_group_provider.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.ttb_demo_spend\([\s\S]*?END \$\$;/)![0];
      await sql(spend.replace('l.ceiling<>50000000','l.ceiling<>100000000'));
      await sql(`ALTER TABLE ttb_demo_private.ledger DROP CONSTRAINT ledger_ceiling_check, DROP CONSTRAINT ledger_check1;
        UPDATE ttb_demo_private.ledger SET ceiling=100000000,incurred=0;
        ALTER TABLE ttb_demo_private.ledger ADD CONSTRAINT ledger_ceiling_check CHECK(ceiling IN(0,100000000)),
        ADD CONSTRAINT ledger_check1 CHECK(NOT enabled OR (ceiling=100000000 AND custody_id IS NOT NULL AND custody_sha256 IS NOT NULL));`);
    }
    const frozen=[];
    for(const record of [old,...(revision===10?[composite.result as CompletePhotoComparison]:[]),bacardi.result as CompletePhotoComparison,jose.result as CompletePhotoComparison]) {
      expect(checkedPhotoRecord(record)).toEqual(record);
      const p=payload(record); await rpc('snapshot_prepare',p); await rpc('snapshot_commit',{id:p.id});
      const intent={...newReviewIntent(record),outcome:'second-review',confirmed:true,notes:'Exact retained live response, local migration replay; no new scan or media upload.'};
      const request={comparisonId:p.id,idempotencyKey:randomUUID(),intent};
      const receipt=JSON.parse(await rpc('save',{...request,request:JSON.stringify(request),intent:JSON.stringify(intent)})); frozen.push({record,p,receipt});
    }

    const binding={reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',model:'openai/gpt-4.1',promptVersion:'gpt41-photo-observations-v1',maxCostMicrousd:1000000};
    for(let i=0;i<(revision===9?53:1);i++)await sql(`SELECT public.ttb_demo_spend('reserve',${json({binding:{...binding,reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID()}})});`,'service_role');
    if(revision===9)expect(await sql("SELECT ceiling-(SELECT sum(amount) FROM ttb_demo_private.holds) FROM ttb_demo_private.ledger;")).toBe('47000000');
    const rows=()=>sql("SELECT jsonb_build_object('ledger',(SELECT jsonb_agg(to_jsonb(t)) FROM ttb_demo_private.ledger t),'holds',(SELECT jsonb_agg(to_jsonb(t)) FROM ttb_demo_private.holds t),'snapshots',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ttb_demo_private.snapshot_allocations t),'reviews',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM ttb_demo_private.reviews t));");
    const catalog=()=>sql("SELECT jsonb_agg(CASE WHEN p.proname='photo_asset_bytes' THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p) END ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','ttb_demo_private');");
    const acl=()=>sql("SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ttb_demo_private';");
    const before=await rows(), beforeCatalog=await catalog(), beforeAcl=await acl();
    await expect(rpc('snapshot_prepare',next)).rejects.toThrow('invalid group record'); // RED, actual DB
    await sql(migration);
    expect(await rows()).toBe(before); expect(await catalog()).toBe(beforeCatalog); expect(await acl()).toBe(beforeAcl);
    for(const {record,p,receipt} of frozen) {
      expect(JSON.parse(await rpc('snapshot_get',{id:p.id})).record).toBe(JSON.stringify(record));
      const detail=JSON.parse(await rpc('detail',{id:receipt.reviewId}));
      expect(detail.record).toBe(JSON.stringify(record)); expect(detail.receipt).toEqual(receipt);
      expect(checkedPhotoRecord(JSON.parse(detail.record))).toEqual(record);
    }
    expect(Number(await asset(fresh))).toBe(next.assets.reduce((n,a)=>n+a.bytes,0)); // GREEN
    for(const [rulesRevision,aggregationVersion] of [[revision,'photo-set-aggregation-v2'],[revision,revision===9?'photo-set-aggregation-v3':'photo-set-aggregation-v4'],[7,aggregation],[6,aggregation],[revision===9?8:9,aggregation],[String(revision),aggregation],[null,aggregation],[revision,null],[revision,undefined],...(revision===10?[[10,'photo-set-aggregation-v3'],[8,aggregation],[4,aggregation]]:[])]) await expect(asset({...fresh,aggregationVersion,comparison:{...fresh.comparison,rulesRevision}})).rejects.toThrow('invalid group record');
    for(const patch of [{source:'fixture'},{recordVersion:'2'},{extraction:{...fresh.extraction,model:'anthropic/claude-haiku-4.5'}},{extraction:{...fresh.extraction,promptVersion:'photo-set-observations-v2'}},{extraction:{...fresh.extraction,schemaVersion:'2'}}]) await expect(asset({...fresh,...patch})).rejects.toThrow('invalid group record');
    await expect(asset(fresh,next.assets.slice(1))).rejects.toThrow();
    await expect(asset(fresh,next.assets.map((a,i)=>i===0?{...a,bytes:a.bytes+1}:a))).rejects.toThrow();
    expect(await rows()).toBe(before);
    await rpc('snapshot_prepare',next); await rpc('snapshot_commit',{id:next.id});
    expect(checkedPhotoRecord(JSON.parse(JSON.parse(await rpc('snapshot_get',{id:next.id})).record))).toEqual(fresh);
    const intent={...newReviewIntent(fresh),outcome:'second-review',confirmed:true,notes:`Domestic PR v${revision} unchanged-observation replay; no physical approval or fresh scan.`};
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
