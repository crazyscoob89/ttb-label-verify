import {test,expect,vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {BENCHMARK_MODELS,createBenchmarkProvider,makeRequest,parseWire,type Plan} from './fixtures/benchmark-wire';
import {benchmarkBindingSchema} from '../lib/spend';
import {OfflineSpendStore} from './helpers/offline-spend-store';
const image=Buffer.from('synthetic offline fixture, not photo');
const b=(model:typeof BENCHMARK_MODELS[number])=>benchmarkBindingSchema.parse({reservationId:randomUUID(),attemptId:randomUUID(),requestId:randomUUID(),imageSha256:createHash('sha256').update(image).digest('hex'),schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',promptVersion:'isolated-vision-benchmark-v1',model,maxCostMicrousd:1000000});
const plan=(model:typeof BENCHMARK_MODELS[number]):Plan=>({model,provider:model.startsWith('google/')?'google-ai-studio':'openai',promptPrice:0.000002,completionPrice:0.000008,ceilingUsd:2*(230000*0.000002+3200*0.000008),at:new Date().toISOString()});
const fixture={brand:'Synthetic',classType:null,abv:null,netContents:null,producer:{name:null,address:null,roleEvidence:null,otherEntityText:null},origin:null,warning:{heading:null,body:null,headingBold:null,bodyBold:null},uncertainties:[]};
test('all three official JSON envelopes are single-photo, bounded, no fallback; Gemini explicitly disables reasoning',()=>{
 for(const model of BENCHMARK_MODELS){const r=makeRequest(plan(model),image);expect(r.model).toBe(model);expect(r.response_format.type).toBe('json_schema');expect(r.response_format.json_schema.strict).toBe(true);expect(r.provider.allow_fallbacks).toBe(false);expect(r.provider.require_parameters).toBe(true);expect(r.provider.only).toHaveLength(1);expect(r.max_tokens).toBe(3200);expect(r.messages[1].content).toHaveLength(2);expect(r.reasoning).toEqual(model.startsWith('google/')?{enabled:false}:undefined);expect(JSON.stringify(r)).not.toMatch(/La Rojeña|No. 73|40%|1.75|GOVERNMENT WARNING/);}
});
test('exact constructor and preflight gate precedes reserve; executeReserved holds before transport and no retries',async()=>{
 const store=new OfflineSpendStore();store.ceiling=50000000;store.historical=27000000;const transport=vi.fn(async()=>fixture),model=BENCHMARK_MODELS[0],binding=b(model);
 const provider=createBenchmarkProvider({authorized:true,plan:plan(model),store,transport});
 await expect(provider.extract({...binding,imageSha256:'a'.repeat(64)},image)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(0);expect(store.unresolved).toBe(0);
 expect(await provider.extract(binding,image)).toEqual({ok:true,value:fixture});expect((await provider.extract(binding,image)).ok).toBe(false);expect(transport).toHaveBeenCalledTimes(1);expect(store.unresolved).toBe(1000000);
 const failed=vi.fn(async()=>{throw Error('no retry');});expect((await createBenchmarkProvider({authorized:true,plan:plan(model),store,transport:failed}).extract(b(model),image)).ok).toBe(false);expect(failed).toHaveBeenCalledTimes(1);expect(store.unresolved).toBe(2000000);
 expect(()=>createBenchmarkProvider({authorized:false as true,plan:plan(model),store,transport})).toThrow();
});
test('schema failures never count as correctness and never repaired; absent warning has null typography',async()=>{
 expect(parseWire(fixture)).toEqual(fixture);for(const bad of [{...fixture,extra:1},{...fixture,abv:40},{...fixture,warning:{...fixture.warning,headingBold:true}},{...fixture,producer:{name:'invented'}}])expect(()=>parseWire(bad)).toThrow();
 const store=new OfflineSpendStore();store.ceiling=50000000;const model=BENCHMARK_MODELS[0];const p=createBenchmarkProvider({authorized:true,plan:plan(model),store,transport:async()=>({...fixture,extra:1})});expect(await p.extract(b(model),image)).toEqual({ok:false,code:'execution-failed'});expect(store.unresolved).toBe(1000000);
});
