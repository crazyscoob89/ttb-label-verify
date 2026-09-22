import { randomUUID } from 'node:crypto';
import { handleGroupComparison,localGroupInput } from './group-route';
import type { GroupRouteInput } from './group-media';
import { demoAccess, boundedBody, InputError } from './demo-security';
import { DEMO_RESERVATION, type DemoStoreFactory, type DemoSpendStore, type DemoReviewStore } from './demo-store-contracts';

import { isAbsolute, join } from 'node:path';
import { MAX_IMAGE_BYTES, parseApplication } from './contracts';
import { createComparisonService, type ComparisonInput } from './compare-service';
import { createOpenRouterProvider,createOpenRouterGroupProvider, OPENROUTER_MODEL, type Transport } from './extraction/openrouter';

import { preparePair, type ImageInput } from './intake';
import { batchAttemptSchema, signBatchBinding, verifyBatchBinding } from './batch-binding';

const BODY_LIMIT = MAX_IMAGE_BYTES + 32768;
let active = 0;

/** Catalog checked immediately before each paid dispatch, inside executeReserved.
 * No retry/cache, no unknown nonzero fees; price/context drift closes the route. */
export function priceCheckedTransport(transport:Transport,outputTokens:3000|6000=3000):Transport {
 return async(url,init)=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
  try {
   const response=await Promise.race([transport('https://openrouter.ai/api/v1/models',{method:'GET',redirect:'error',signal:controller.signal}),new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Catalog timeout')),{once:true}))]);
   if(response.status!==200||response.redirected)throw Error('Catalog unavailable');
   const catalog=JSON.parse((await boundedBody(response,4*1024*1024)).toString('utf8'));
   const matches=Array.isArray(catalog.data)?catalog.data.filter((m:{id?:string})=>m.id===OPENROUTER_MODEL):[];
   if(matches.length!==1)throw Error('Unknown pricing');const model=matches[0];
   if(!Number.isSafeInteger(model.context_length)||model.context_length<1||model.context_length>200000)throw Error('Context drift');
   const pricing=model.pricing;if(!pricing||typeof pricing!=='object')throw Error('Unknown pricing');
   for(const key of ['prompt','completion'])if(typeof pricing[key]!=='string'||!/^\d+(\.\d+)?$/.test(pricing[key]))throw Error('Unknown pricing');
   if(Number(pricing.prompt)>0.000001||Number(pricing.completion)>0.000005)throw Error('Price drift');
   const body=JSON.parse(String(init.body));
   if(body.model!==OPENROUTER_MODEL||body.max_tokens!==outputTokens||body.stream!==false||body.temperature!==0||body.tools!==undefined||body.plugins!==undefined||body.web_search_options!==undefined||body.provider?.allow_fallbacks!==false||body.provider?.require_parameters!==true||body.response_format?.type!=='json_object'||Object.keys(body).some(k=>!['model','max_tokens','temperature','stream','provider','response_format','messages'].includes(k)))throw Error('Unexpected paid request');
   // Conservatively add all known cache tariffs to ordinary input pricing.
   let inputRate=Number(pricing.prompt);
   for(const [key,value] of Object.entries(pricing)){
    if(['prompt','completion'].includes(key))continue;
    if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('Unknown additional fee');
    if(['input_cache_read','input_cache_write','input_cache_write_1h'].includes(key)){if(Number(value)>0.000002)throw Error('Cache price drift');inputRate+=Number(value);}
    else if(key==='web_search'){/* No tools/plugins/online model requested. */}
    else if(Number(value)!==0)throw Error('Unknown additional fee');
   }
   const bound=Math.ceil((200000*inputRate+outputTokens*Number(pricing.completion))*1000000);
   if(!Number.isSafeInteger(bound)||bound>DEMO_RESERVATION)throw Error('Reservation too small');
   if(init.signal?.aborted)throw Error('Expired');
   // Provider-side per-million token caps also bound catalog/dispatch price races.
   body.provider.max_price={prompt:1,completion:5};
   return await transport(url,{...init,body:JSON.stringify(body)});
  } finally {clearTimeout(timer);controller.abort();}
 };
}
export function createDemoHandler({env=process.env,transport=(url,init)=>fetch(url,init),stores,readInput}:{env?:Record<string,string|undefined>;transport?:Transport;stores?:DemoStoreFactory;readInput?:(request:Request,signal?:AbortSignal)=>Promise<ComparisonInput|GroupRouteInput>}={}) {
 return async(request:Request):Promise<Response>=>{
  const started=performance.now();
  const reply=(status:number,code:string)=>Response.json({processing:'failed',code,elapsedMs:Math.round(performance.now()-started)},{status,headers:{'Cache-Control':'no-store'}});
  let path:string|undefined;
  try {
   const secret=env.TTB_DEMO_ACCESS_SECRET;const origin=env.TTB_DEMO_ORIGIN;const dir=env.TTB_DEMO_DATA_DIR;
   if(env.TTB_DEMO_ENABLED!=='true'||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||!env.OPENROUTER_API_KEY||!origin||new URL(origin).origin!==origin)return reply(403,'access-denied');
   if(!demoAccess(request,env))return reply(403,'access-denied');
   if(env.TTB_PERSISTENCE==='supabase'){if(!stores)return reply(403,'access-denied');}
   else if((env.TTB_PERSISTENCE!==undefined&&env.TTB_PERSISTENCE!=='sqlite')||stores||!dir||!isAbsolute(dir)||env.TTB_DEMO_PERSISTENT_VOLUME!=='single-private-volume-v1')return reply(403,'access-denied');
   // SqliteSpendStore below verifies parent + ledger + sidecars using the OS's
   // security model, before any body read/provider work. Do not duplicate POSIX
   // mode checks here: Windows modes are not NTFS ACL evidence.
   if(env.TTB_PERSISTENCE!=='supabase')path=join(dir!,'spend.sqlite');
  } catch {return reply(403,'access-denied');}
  if(active>=2)return reply(429,'busy');active++;
  let store:DemoSpendStore|undefined;const workId=randomUUID();let acquired=false;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),50000);
  const signal=AbortSignal.any([request.signal,controller.signal]);
  const bounded=<T>(work:Promise<T>)=>Promise.race([work,new Promise<never>((_,reject)=>{if(signal.aborted)reject(new InputError(408));else signal.addEventListener('abort',()=>reject(new InputError(408)),{once:true});})]);
  const groupResponse=(input:GroupRouteInput)=>{
   let duplicate=false;
   const guardedStore={
    reserve:async(binding:Parameters<DemoSpendStore['reserve']>[0])=>{
     try{const receipt=await store!.reserve(binding);if(!receipt)duplicate=await store!.hasIntent(binding.attemptId,binding.reservationId);return receipt;}
     catch(error){duplicate=await store!.hasIntent(binding.attemptId,binding.reservationId);throw error;}
    },
    claim:(binding:Parameters<DemoSpendStore['claim']>[0],claimId:string)=>store!.claim(binding,claimId),
    complete:(binding:Parameters<DemoSpendStore['complete']>[0],claimId:string)=>store!.complete(binding,claimId),
   };
   return bounded(handleGroupComparison(input,{request,env,store:store!,provider:createOpenRouterGroupProvider({authorized:true,apiKey:env.OPENROUTER_API_KEY,store:guardedStore,maxCostMicrousd:DEMO_RESERVATION,transport:priceCheckedTransport(transport,6000)}),duplicateAttempt:()=>duplicate,signal,started,openReviews:stores?async()=>stores.openReviews():env.TTB_REVIEW_DATA_DIR?async()=>{const {ReviewStore,reviewPath}=await import('./review-store');return new ReviewStore(reviewPath(env));}:undefined}));
  };
  try {
   try{store=stores?await stores.openSpend():new (await import('./sqlite-spend')).SqliteSpendStore(path!);await store.acquireWork(workId);acquired=true;}catch{return reply(503,'spend-unavailable');}
   let input:ComparisonInput|GroupRouteInput;
   if(readInput)input=await bounded(readInput(request,signal));
   else {
   const contentType=request.headers.get('content-type')??'';
   if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))return reply(415,'invalid-input');
   const bytes=await bounded(boundedBody(request,20*1024*1024+65536));
   // The tagged multipart body determines which admission cap applies. Invalid
   // oversized legacy envelopes still report 413, never a smaller accepted pair.
   let form:FormData;
   try{form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':contentType}}).formData();}
   catch{throw new InputError(bytes.length>BODY_LIMIT?413:400);}
   if(form.has('group')||form.has('operation'))return await groupResponse(await localGroupInput(form));
   if(bytes.length>BODY_LIMIT)return reply(413,'invalid-input');
   if([...form.keys()].length!==2||form.getAll('image').length!==1||form.getAll('application').length!==1)return reply(400,'invalid-input');
   const file=form.get('image');const json=form.get('application');
   if(!(file instanceof File)||typeof json!=='string'||json.length>16384||file.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg'].includes(file.type))return reply(400,'invalid-input');
   let application;try{application=parseApplication(JSON.parse(json));}catch{return reply(400,'invalid-input');}
   input = { file: { filename:file.name,mime:file.type as ImageInput['mime'],bytes:Buffer.from(await file.arrayBuffer()) }, binding: { filename:file.name,application } };
   }
   const phase = request.headers.get('x-ttb-batch-phase');
   if('schemaVersion' in input)return await groupResponse(input);
   const rawIntent = request.headers.get('x-ttb-batch-intent');
   const binding = request.headers.get('x-ttb-batch-binding');
   if (phase !== null && phase !== 'prepare' && phase !== 'execute') return reply(400,'invalid-input');
   if (phase !== 'execute' && (rawIntent !== null || binding !== null)) return reply(400,'invalid-input');
   let intent;
   if (phase === 'execute') {
    if (!rawIntent || rawIntent.length > 4096 || !binding || binding.length !== 129) return reply(400,'invalid-input');
    try { intent = batchAttemptSchema.parse(JSON.parse(rawIntent)); } catch { return reply(400,'invalid-input'); }
    if (await store.hasIntent(intent.attemptId,intent.reservationId)) return reply(409,'attempt-already-recorded');
   }
   if (phase === 'prepare') {
    const pair = await preparePair(input.file,input.binding);
    return Response.json({prepared:{imageSha256:pair.image.sanitizedSha256,binding:signBatchBinding(pair,env.TTB_DEMO_ACCESS_SECRET!)}},{headers:{'Cache-Control':'no-store'}});
   }
   const provider=createOpenRouterProvider({authorized:true,apiKey:env.OPENROUTER_API_KEY,store,maxCostMicrousd:DEMO_RESERVATION,transport:priceCheckedTransport(transport)});
   const identity = intent;
   let comparisonId:string|undefined;
   let reviewAvailability='reviews-disabled';
   const compare=createComparisonService({provider,authorize:()=>true,completed:async(record,pair)=>{
    if(!stores&&!env.TTB_REVIEW_DATA_DIR)return;
    reviewAvailability='snapshot-unavailable';
    let reviews:DemoReviewStore|undefined;
    try {if(stores)reviews=await stores.openReviews();else {const {ReviewStore,reviewPath}=await import('./review-store');reviews=new ReviewStore(reviewPath(env));}comparisonId=await reviews.snapshot(record,pair.image.bytes,pair.image.mime);reviewAvailability='available';}
    catch {reviewAvailability='snapshot-unavailable';}
    finally {await reviews?.close();}
   },preparedAttempt:identity ? pair => {
    if (!verifyBatchBinding(pair,env.TTB_DEMO_ACCESS_SECRET!,binding!)) throw Error('Preparation mismatch');
    return {attemptId:identity.attemptId,reservationId:identity.reservationId};
   } : undefined});
   const result=await compare(input);
   return Response.json({result,comparisonId,reviewAvailability,elapsedMs:Math.round(performance.now()-started)},{status:result.processing==='complete'?200:result.code==='invalid-input'?400:502,headers:{'Cache-Control':'no-store'}});
  }catch(e){if(signal.aborted)return reply(408,request.signal.aborted?'cancelled':'timeout');return reply(e instanceof InputError?e.status:400,'invalid-input');}
  finally{
   clearTimeout(timeout);controller.abort();
   // Best-effort slot cleanup shares the whole-route deadline. A lost cleanup
   // acknowledgment remains conservative; never delay the response past 50s.
   const cleanup=(async()=>{if(store){try{if(acquired)await store.releaseWork(workId);}catch{}try{await store.close();}catch{}}})();
   let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
   try{const remaining=50000-(performance.now()-started);if(remaining>0)await Promise.race([cleanup,new Promise<void>(resolve=>{cleanupTimer=setTimeout(resolve,remaining);})]);}
   finally{clearTimeout(cleanupTimer);active--;}
  }
 };
}
