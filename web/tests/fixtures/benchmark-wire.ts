// TEST ONLY: local copy of the isolated benchmark wire, never app dispatch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {BENCHMARK_MODELS,benchmarkBindingSchema,executeReserved,type SpendBinding,type SpendStore} from '../../lib/spend';
import requestFixture from './gpt41-benchmark-request-redacted.json';
// Freeze the old experiment independently of later production prompt refinement.
const PROMPT=requestFixture.messages[0].content;
const text=z.string().min(1).max(2000).nullable();
const wireSchema=z.object({brand:text,classType:text,abv:text,netContents:text,
 producer:z.object({name:text,address:text,roleEvidence:text,otherEntityText:text}).strict(),origin:text,
 warning:z.object({heading:text,body:text,headingBold:z.boolean().nullable(),bodyBold:z.boolean().nullable()}).strict(),
 uncertainties:z.array(z.object({field:z.enum(['brand','classType','abv','netContents','producer','origin','warning']),reason:z.string().min(1).max(300)}).strict()).max(7),
}).strict();
const jsonSchema=z.toJSONSchema(wireSchema,{target:'draft-7'});
export {BENCHMARK_MODELS};
export function parseWire(value:unknown){const v=wireSchema.parse(value);for(const k of ['heading','body'] as const)if(v.warning[k]===null)assert.equal(v.warning[`${k}Bold`],null);return v;}
export type Plan={model:typeof BENCHMARK_MODELS[number];provider:string;promptPrice:number;completionPrice:number;ceilingUsd:number;at:string};
export function makeRequest(plan:Plan,image:Buffer){
 assert(BENCHMARK_MODELS.includes(plan.model));assert(plan.ceilingUsd<=1&&plan.ceilingUsd>0);assert(image.length<=120000);
 const google=plan.model.startsWith('google/');assert.equal(plan.provider,google?'google-ai-studio':'openai');
 const body={model:plan.model,messages:[{role:'system',content:PROMPT},{role:'user',content:[{type:'text',text:'Read this one photograph independently.'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image.toString('base64'),...(google?{}:{detail:'high'})}}]}],
 response_format:{type:'json_schema',json_schema:{name:'isolated_label_transcription',strict:true,schema:jsonSchema}},max_tokens:3200,temperature:0,stream:false,
 provider:{only:[plan.provider],order:[plan.provider],allow_fallbacks:false,require_parameters:true,max_price:{prompt:plan.promptPrice*1e6,completion:plan.completionPrice*1e6}},...(google?{reasoning:{enabled:false}}:{})};
 assert(Buffer.byteLength(JSON.stringify(body))+32768+4096<=230000);
 assert.equal(plan.ceilingUsd,2*(230000*plan.promptPrice+3200*plan.completionPrice));return body;
}
export function createBenchmarkProvider(o:{authorized:true;plan:Plan;store:SpendStore;transport:(body:ReturnType<typeof makeRequest>,binding:SpendBinding)=>Promise<unknown>}){
 assert.equal(o.authorized,true);assert(BENCHMARK_MODELS.includes(o.plan.model));assert(o.store&&['reserve','claim','complete'].every(k=>typeof o.store[k as keyof SpendStore]==='function'));
 return {async extract(binding:SpendBinding,image:Buffer){const b=benchmarkBindingSchema.parse(binding);assert.equal(b.model,o.plan.model);assert.equal(b.imageSha256,createHash('sha256').update(image).digest('hex'));const body=makeRequest(o.plan,image);return executeReserved(o.store,b,async()=>parseWire(await o.transport(body,b)));}};
}
