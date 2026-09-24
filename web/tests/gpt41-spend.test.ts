import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,test,vi} from 'vitest';
import {bindingSchema,executeReserved,type SpendBinding,type SpendReceipt} from '../lib/spend';
import {OfflineSpendStore} from './helpers/offline-spend-store';
const b=():SpendBinding=>({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:'a'.repeat(64),schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',model:'openai/gpt-4.1',promptVersion:'gpt41-photo-observations-v1',maxCostMicrousd:1000000});
const fn=(s:string,name:string)=>s.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name.replaceAll('.','\\.')}\\([\\s\\S]*?END \\$\\$;`))![0];
test('008 is ONLY two additive admission deltas: 007 spend + 005 assets; no data/ceiling/ACL/history rewrite',()=>{
 const migration=readFileSync('db/migrations/008_gpt41_group_provider.sql','utf8'),spend=fn(migration,'public.ttb_demo_spend'),asset=fn(migration,'ttb_demo_private.photo_asset_bytes');
 const add=` OR b @> '{"schemaVersion":2,"rulesVersion":"prototype-seven-fields-v1","promptVersion":"gpt41-photo-observations-v1","model":"openai/gpt-4.1","maxCostMicrousd":1000000}'::jsonb`;
 expect(spend.split(add)).toHaveLength(2);expect(spend.replace(add,'')).toBe(fn(readFileSync('db/migrations/007_isolated_vision_benchmark.sql','utf8'),'public.ttb_demo_spend'));
 const assetAdd=` OR\n  (doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":6},"aggregationVersion":"photo-set-aggregation-v2"}'::jsonb)`;
 const refinedTuple=`(doc @> '{"recordVersion":2,"source":"openrouter","extraction":{"schemaVersion":2,"model":"openai/gpt-4.1","promptVersion":"gpt41-photo-observations-v1"},"comparison":{"rulesRevision":7},"aggregationVersion":"photo-set-aggregation-v2"}'::jsonb)`;
 const refinedGate=` OR ${refinedTuple}`,refinedAdmission=` OR\n  ${refinedTuple}`;
 expect(asset.split(refinedGate)).toHaveLength(2);expect(asset.split(refinedAdmission)).toHaveLength(2);
 expect(asset.split(assetAdd)).toHaveLength(2);expect(asset.replace(assetAdd,'').replace(refinedGate,'').replace(refinedAdmission,'')).toBe(fn(readFileSync('db/migrations/005_azure_ocr_provider.sql','utf8'),'ttb_demo_private.photo_asset_bytes'));
 expect(migration.replace(spend,'').replace(asset,'').replace(/^--.*$/gm,'').replace(/\s/g,'')).toBe('BEGIN;COMMIT;');
});
test('exact genuine tuple and all historical/benchmark tuples, never a cross-product',()=>{
 const rows=[['anthropic/claude-haiku-4.5','image-observations-v1',1],['anthropic/claude-haiku-4.5','photo-set-observations-v2',2],['mistral-document-ai-2512','azure-ocr-photo-observations-v1',2],['openai/gpt-4.1','isolated-vision-benchmark-v1',2],['google/gemini-2.5-flash','isolated-vision-benchmark-v1',2],['google/gemini-2.5-flash-lite','isolated-vision-benchmark-v1',2],['openai/gpt-4.1','gpt41-photo-observations-v1',2]];
 for(const model of [...new Set(rows.map(x=>x[0])),null,'null'])for(const promptVersion of [...new Set(rows.map(x=>x[1])),null,'null'])for(const schemaVersion of [1,2,null,'2'])expect(bindingSchema.safeParse({...b(),model,promptVersion,schemaVersion}).success).toBe(rows.some(r=>r[0]===model&&r[1]===promptVersion&&r[2]===schemaVersion));
});
test.each([{maxCostMicrousd:-0.5},{maxCostMicrousd:-1000000},{maxCostMicrousd:999999},{maxCostMicrousd:'1000000'},{maxCostMicrousd:null},{source:'openrouter'},{rulesVersion:null},{rulesVersion:'null'},{imageSha256:null},{attemptId:'null'}])('malformed genuine binding denied before reserve: %j',async patch=>{
 const store=new OfflineSpendStore();store.ceiling=50000000;const work=vi.fn();expect(await executeReserved(store,{...b(),...patch} as SpendBinding,work)).toEqual({ok:false,code:'spend-unavailable'});expect(store.rows.size).toBe(0);expect(work).not.toHaveBeenCalled();
});
test.each(['reserve','claim','complete'] as const)('model substitution receipt at %s fails closed, unresolved hold retained',async stage=>{
 const store=new OfflineSpendStore();store.ceiling=50000000;store.historical=27000000;const original=store[stage].bind(store);
 store[stage]=async(binding:SpendBinding,claimId?:string)=>{const receipt=await original(binding,claimId!) as SpendReceipt;receipt.binding={...receipt.binding,model:'anthropic/claude-haiku-4.5',promptVersion:'photo-set-observations-v2',schemaVersion:2};return receipt;};
 const work=vi.fn(async()=>true);expect(await executeReserved(store,b(),work)).toEqual({ok:false,code:'spend-unavailable'});expect(work).toHaveBeenCalledTimes(stage==='complete'?1:0);expect(store.unresolved).toBe(1000000);expect(store.historical).toBe(27000000);
});
