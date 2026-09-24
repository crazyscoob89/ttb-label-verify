import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { snapshotGroupRequest, type GroupExtractionProvider } from './group-provider';
import { GPT41_MODEL, GPT41_PROMPT_VERSION, parsePhotoSetEvidence } from '../photo-contracts';
import { executeReserved, type SpendBinding, type SpendStore } from '../spend';
import { RULES_VERSION } from '../rules';
import { sanitizeImage } from '../intake';
import { parseGpt41Wire } from './gpt41-wire';
import { gpt41ImageTokenBound, gpt41PriceCheckedTransport, prepareGpt41Request } from './gpt41-pricing';
import { isolatedPhotoAttemptIds, MAX_PHOTO_RESERVATION_MICROUSD } from './isolated-photo';
import { OPENROUTER_ENDPOINT, type Transport } from './openrouter';
export { GPT41_MODEL, GPT41_PROMPT_VERSION };

const RESPONSE_BYTES=128*1024;
export const GPT41_TIMEOUT_MS=20000;
// The saved GPT benchmark returned native 'completed' (Responses upstream).
// Chat Completions upstream returns 'stop'. Neither Claude end_turn nor a native
// truncation/refusal is accepted even if the normalized finish_reason says stop.
const envelopeSchema=z.object({
  id:z.string().max(512).optional(),object:z.literal('chat.completion').optional(),created:z.number().int().nonnegative().optional(),
  model:z.literal(GPT41_MODEL),provider:z.literal('OpenAI'),system_fingerprint:z.string().max(512).nullable().optional(),
  service_tier:z.string().min(1).max(256).optional(),usage:z.record(z.string(),z.unknown()).optional(),
  choices:z.array(z.object({index:z.literal(0),finish_reason:z.literal('stop'),native_finish_reason:z.enum(['stop','completed']),logprobs:z.null().optional(),
    message:z.object({role:z.literal('assistant'),content:z.string().min(1).max(RESPONSE_BYTES),refusal:z.null().optional(),reasoning:z.null().optional()}).strict(),
  }).strict()).length(1),
}).strict();
export function parseGpt41Envelope(value:unknown){
  const envelope=envelopeSchema.parse(value);
  // Bare JSON only, as in measured structured-output requests; no prose salvage.
  return parseGpt41Wire(JSON.parse(envelope.choices[0].message.content));
}
export type Gpt41Dependencies={authorized?:boolean;apiKey?:string;store?:SpendStore;transport?:Transport};
async function boundedResponse(transport:Transport,init:RequestInit):Promise<unknown>{
  const controller=new AbortController(),signal=init.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,abort:(()=>void)|undefined;
  const cancel=()=>{controller.abort();if(reader)void reader.cancel().catch(()=>{});};
  const expired=new Promise<never>((_,reject)=>{abort=()=>{reject(Error('GPT cancelled'));cancel();};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
  const timer=setTimeout(cancel,GPT41_TIMEOUT_MS);
  const work=async()=>{
    signal.throwIfAborted();const response=await transport(OPENROUTER_ENDPOINT,{...init,signal});
    if(signal.aborted||response.status!==200||response.redirected||(response.url&&response.url!==OPENROUTER_ENDPOINT)||!response.body){void response.body?.cancel().catch(()=>{});throw Error('Invalid GPT response');}
    reader=response.body.getReader();const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>RESPONSE_BYTES))throw Error('Response too large');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const chunk=await reader.read();signal.throwIfAborted();if(chunk.done)break;size+=chunk.value.byteLength;if(size>RESPONSE_BYTES)throw Error('Response too large');chunks.push(Uint8Array.from(chunk.value));}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size))) as unknown;
  };
  try{return await Promise.race([work(),expired]);}
  finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);cancel();}
}

/** Provisional group-only candidate. No retries/fallback, shared conversation,
 * application fields, environment discovery or synthetic parent-only hold. */
export function createGpt41GroupProvider(dependencies:Gpt41Dependencies={}):GroupExtractionProvider {
  const {authorized,apiKey,store,transport=(url,init)=>fetch(url,init)}=dependencies;
  const checkedTransport=gpt41PriceCheckedTransport(transport);
  return {async extractGroup(input,signal){
    if(typeof window!=='undefined'||authorized!==true||!store||typeof transport!=='function'||typeof apiKey!=='string'||/^(?:null|undefined)$/i.test(apiKey)||! /^[\x21-\x7e]{1,4096}$/.test(apiKey))return {processing:'failed',code:'unconfigured'};
    let request:ReturnType<typeof snapshotGroupRequest>,bodies:string[];
    try {
      signal?.throwIfAborted();request=snapshotGroupRequest(input);bodies=[];
      for(const {descriptor,image} of request.photos){
        signal?.throwIfAborted();
        const decoded=await sanitizeImage({filename:descriptor.normalized.mime==='image/png'?'photo.png':'photo.jpg',mime:descriptor.normalized.mime,bytes:image});
        if(decoded.width!==descriptor.normalized.width||decoded.height!==descriptor.normalized.height)throw Error('Image dimension mismatch');
        gpt41ImageTokenBound(decoded.width,decoded.height);
        // Send exact immutable normalized bytes, never the validator's re-encode.
        bodies.push(JSON.stringify(await prepareGpt41Request(image,descriptor.normalized.mime,descriptor.photoId,signal)));
      }
      signal?.throwIfAborted();
    }catch{return {processing:'failed',code:'invalid-request'};}
    const metadata={source:'openrouter' as const,model:GPT41_MODEL,schemaVersion:2 as const,promptVersion:GPT41_PROMPT_VERSION,rulesVersion:RULES_VERSION,
      photoSetSha256:request.photoSetSha256,photos:request.photos.map(p=>({photoId:p.descriptor.photoId,imageSha256:p.descriptor.normalized.sha256})),requestId:request.requestId,attemptId:request.attemptId,reservationId:request.reservationId};
    const bindingFor=(slot:number):SpendBinding=>({...isolatedPhotoAttemptIds(request,slot),requestId:slot===0?request.requestId:randomUUID(),imageSha256:request.photoSetSha256,schemaVersion:2,rulesVersion:RULES_VERSION,promptVersion:GPT41_PROMPT_VERSION,model:GPT41_MODEL,maxCostMicrousd:MAX_PHOTO_RESERVATION_MICROUSD});
    const inferPhoto=async(slot:number,requestId:string)=>{
      signal?.throwIfAborted();
      const raw=await boundedResponse(checkedTransport,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Request-ID':requestId},body:bodies[slot],signal});
      signal?.throwIfAborted();
      return {photoId:request.photos[slot].descriptor.photoId,evidence:parseGpt41Envelope(raw)};
    };
    let groupFailure:'execution-failed'|'spend-unavailable'|'daily-limit-reached'|undefined;
    const group=await executeReserved(store,bindingFor(0),async()=>{
      const photos:Awaited<ReturnType<typeof inferPhoto>>[]=[];
      // Parent is both exclusive group gate and photo 0's actual claim. Retain it
      // until drain; photos 0/1 overlap, then only one remaining child may claim.
      for(let slot=0;slot<request.photos.length;slot+=slot===0?2:1){
        signal?.throwIfAborted();
        const wave=await Promise.allSettled(request.photos.slice(slot,slot+(slot===0?2:1)).map(async(_,index)=>{
          const current=slot+index;
          if(current===0)return {ok:true as const,value:await inferPhoto(0,request.requestId)};
          if(signal?.aborted)return {ok:false as const,code:'execution-failed' as const};
          const binding=bindingFor(current);return executeReserved(store,binding,()=>inferPhoto(current,binding.requestId));
        }));
        for(const result of wave){if(result.status==='rejected')groupFailure??='execution-failed';else if(!result.value.ok)groupFailure??=result.value.code;else photos.push(result.value.value);}
        if(groupFailure)throw Error('Photo group failed');
      }
      signal?.throwIfAborted();return parsePhotoSetEvidence({schemaVersion:2,photos},request.photos.map(p=>p.descriptor.photoId));
    });
    if(!group.ok)return {processing:'failed',code:group.code==='daily-limit-reached'||groupFailure==='daily-limit-reached'?'daily-limit-reached':group.code==='spend-unavailable'||groupFailure==='spend-unavailable'?'spend-unavailable':'provider-failed'};
    return {processing:'complete',evidence:group.value,metadata};
  }};
}
