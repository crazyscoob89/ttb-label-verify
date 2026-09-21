import { randomUUID } from 'node:crypto';
import { demoAccess, boundedBody, InputError } from './demo-security';
import { ReviewStore, reviewPath } from './review-store';

import { isAbsolute, join } from 'node:path';
import { MAX_IMAGE_BYTES, parseApplication } from './contracts';
import { createComparisonService } from './compare-service';
import { createOpenRouterProvider, OPENROUTER_MODEL, type Transport } from './extraction/openrouter';
import { SqliteSpendStore, DEMO_RESERVATION } from './sqlite-spend';
import { preparePair, type ImageInput } from './intake';
import { batchAttemptSchema, signBatchBinding, verifyBatchBinding } from './batch-binding';

const BODY_LIMIT = MAX_IMAGE_BYTES + 32768;
let active = 0;

/** Catalog checked immediately before each paid dispatch, inside executeReserved.
 * No retry/cache, no unknown nonzero fees; price/context drift closes the route. */
function priceCheckedTransport(transport:Transport):Transport {
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
   if(body.model!==OPENROUTER_MODEL||body.max_tokens!==3000||body.stream!==false||body.tools!==undefined||body.plugins!==undefined||body.web_search_options!==undefined||body.provider?.allow_fallbacks!==false)throw Error('Unexpected paid request');
   // Conservatively add all known cache tariffs to ordinary input pricing.
   let inputRate=Number(pricing.prompt);
   for(const [key,value] of Object.entries(pricing)){
    if(['prompt','completion'].includes(key))continue;
    if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('Unknown additional fee');
    if(['input_cache_read','input_cache_write','input_cache_write_1h'].includes(key)){if(Number(value)>0.000002)throw Error('Cache price drift');inputRate+=Number(value);}
    else if(key==='web_search'){/* No tools/plugins/online model requested. */}
    else if(Number(value)!==0)throw Error('Unknown additional fee');
   }
   const bound=Math.ceil((200000*inputRate+3000*Number(pricing.completion))*1000000);
   if(!Number.isSafeInteger(bound)||bound>DEMO_RESERVATION)throw Error('Reservation too small');
   if(init.signal?.aborted)throw Error('Expired');
   // Provider-side per-million token caps also bound catalog/dispatch price races.
   body.provider.max_price={prompt:1,completion:5};
   return await transport(url,{...init,body:JSON.stringify(body)});
  } finally {clearTimeout(timer);controller.abort();}
 };
}
export function createDemoHandler({env=process.env,transport=(url,init)=>fetch(url,init)}:{env?:Record<string,string|undefined>;transport?:Transport}={}) {
 return async(request:Request):Promise<Response>=>{
  const started=performance.now();
  const reply=(status:number,code:string)=>Response.json({processing:'failed',code,elapsedMs:Math.round(performance.now()-started)},{status,headers:{'Cache-Control':'no-store'}});
  let path:string;
  try {
   const secret=env.TTB_DEMO_ACCESS_SECRET;const origin=env.TTB_DEMO_ORIGIN;const dir=env.TTB_DEMO_DATA_DIR;
   if(env.TTB_DEMO_ENABLED!=='true'||!secret||!/^[A-Za-z0-9_-]{32,256}$/.test(secret)||!env.OPENROUTER_API_KEY||!origin||new URL(origin).origin!==origin||!dir||!isAbsolute(dir)||env.TTB_DEMO_PERSISTENT_VOLUME!=='single-private-volume-v1')return reply(403,'access-denied');
   if(!demoAccess(request,env))return reply(403,'access-denied');
   // SqliteSpendStore below verifies parent + ledger + sidecars using the OS's
   // security model, before any body read/provider work. Do not duplicate POSIX
   // mode checks here: Windows modes are not NTFS ACL evidence.
   path=join(dir,'spend.sqlite');
  } catch {return reply(403,'access-denied');}
  if(active>=2)return reply(429,'busy');active++;
  let store:SqliteSpendStore|undefined;const workId=randomUUID();let acquired=false;
  try {
   try{store=new SqliteSpendStore(path);store.acquireWork(workId);acquired=true;}catch{return reply(503,'spend-unavailable');}
   const contentType=request.headers.get('content-type')??'';
   if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))return reply(415,'invalid-input');
   const bytes=await boundedBody(request,BODY_LIMIT);
   const form=await new Response(new Uint8Array(bytes),{headers:{'Content-Type':contentType}}).formData();
   if([...form.keys()].length!==2||form.getAll('image').length!==1||form.getAll('application').length!==1)return reply(400,'invalid-input');
   const file=form.get('image');const json=form.get('application');
   if(!(file instanceof File)||typeof json!=='string'||json.length>16384||file.size>MAX_IMAGE_BYTES||!['image/png','image/jpeg'].includes(file.type))return reply(400,'invalid-input');
   let application;try{application=parseApplication(JSON.parse(json));}catch{return reply(400,'invalid-input');}
   const phase = request.headers.get('x-ttb-batch-phase');
   const rawIntent = request.headers.get('x-ttb-batch-intent');
   const binding = request.headers.get('x-ttb-batch-binding');
   if (phase !== null && phase !== 'prepare' && phase !== 'execute') return reply(400,'invalid-input');
   if (phase !== 'execute' && (rawIntent !== null || binding !== null)) return reply(400,'invalid-input');
   let intent;
   if (phase === 'execute') {
    if (!rawIntent || rawIntent.length > 4096 || !binding || binding.length !== 129) return reply(400,'invalid-input');
    try { intent = batchAttemptSchema.parse(JSON.parse(rawIntent)); } catch { return reply(400,'invalid-input'); }
    if (store.hasIntent(intent.attemptId,intent.reservationId)) return reply(409,'attempt-already-recorded');
   }
   const input = { file: { filename:file.name,mime:file.type as ImageInput['mime'],bytes:Buffer.from(await file.arrayBuffer()) }, binding: { filename:file.name,application } };
   if (phase === 'prepare') {
    const pair = await preparePair(input.file,input.binding);
    return Response.json({prepared:{imageSha256:pair.image.sanitizedSha256,binding:signBatchBinding(pair,env.TTB_DEMO_ACCESS_SECRET!)}},{headers:{'Cache-Control':'no-store'}});
   }
   const provider=createOpenRouterProvider({authorized:true,apiKey:env.OPENROUTER_API_KEY,store,maxCostMicrousd:DEMO_RESERVATION,transport:priceCheckedTransport(transport)});
   const identity = intent;
   let comparisonId:string|undefined;
   let reviewAvailability='reviews-disabled';
   const compare=createComparisonService({provider,authorize:()=>true,completed:(record,pair)=>{
    if(!env.TTB_REVIEW_DATA_DIR)return;
    let reviews:ReviewStore|undefined;
    try {reviews=new ReviewStore(reviewPath(env));comparisonId=reviews.snapshot(record,pair.image.bytes,pair.image.mime);reviewAvailability='available';}
    catch {reviewAvailability='snapshot-unavailable';}
    finally {reviews?.close();}
   },preparedAttempt:identity ? pair => {
    if (!verifyBatchBinding(pair,env.TTB_DEMO_ACCESS_SECRET!,binding!)) throw Error('Preparation mismatch');
    return {attemptId:identity.attemptId,reservationId:identity.reservationId};
   } : undefined});
   const result=await compare(input);
   return Response.json({result,comparisonId,reviewAvailability,elapsedMs:Math.round(performance.now()-started)},{status:result.processing==='complete'?200:result.code==='invalid-input'?400:502,headers:{'Cache-Control':'no-store'}});
  }catch(e){return reply(e instanceof InputError?e.status:400,'invalid-input');}
  finally{if(store){try{if(acquired)store.releaseWork(workId);}catch{}try{store.close();}catch{}}active--;}
 };
}
