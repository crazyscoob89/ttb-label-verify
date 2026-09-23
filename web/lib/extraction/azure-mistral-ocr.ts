import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { snapshotGroupRequest, type GroupExtractionProvider } from './group-provider';
import { AZURE_OCR_MODEL, AZURE_OCR_PROMPT_VERSION, MAX_GROUP_REQUEST_BYTES, parsePhotoSetEvidence } from '../photo-contracts';
import { executeReserved, type SpendBinding, type SpendStore } from '../spend';
import { RULES_VERSION } from '../rules';
import { sanitizeImage } from '../intake';
import { azureCompactAnnotation, parseAzureAnnotation } from './azure-compact-wire';
import { isolatedPhotoAttemptIds, MAX_PHOTO_RESERVATION_MICROUSD } from './isolated-photo';
import { AZURE_OCR_ENDPOINT, AZURE_OCR_TIMEOUT_MS, approvedAzureOcrEndpoint, checkAzureOcrPayload, validateAzureOcrPricing, type AzureOcrPricing } from './azure-ocr-pricing';
import type { Transport } from './openrouter';
export { AZURE_OCR_MODEL, AZURE_OCR_PROMPT_VERSION, AZURE_OCR_ENDPOINT };

// The annotation wire is private and compact; persisted evidence remains v1/v2.
// No per-field generated reasons, warning templates or bottle-specific answers.
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export const azureOcrAnnotationSchema = freeze(z.toJSONSchema(azureCompactAnnotation));
const RESPONSE_BYTES = 128 * 1024;
const usageSchema = z.object({
  pages_processed: z.number().int().min(0).max(1),
  pages_processed_annotation: z.number().int().min(0).max(1),
  doc_size_bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const pageSchema = z.object({
  index: z.literal(0), markdown: z.string().max(RESPONSE_BYTES),
  images: z.array(z.record(z.string(), z.unknown())).max(256),
  tables: z.array(z.record(z.string(), z.unknown())).max(256).optional(),
  hyperlinks: z.array(z.string().max(4096)).max(256).optional(),
  header: z.string().max(RESPONSE_BYTES).nullable().optional(), footer: z.string().max(RESPONSE_BYTES).nullable().optional(),
  dimensions: z.object({dpi:z.number().positive(),width:z.number().int().positive(),height:z.number().int().positive()}).strict(),
}).strict();
const envelopeSchema = z.object({
  model: z.literal(AZURE_OCR_MODEL), pages: z.array(pageSchema).length(1),
  document_annotation: z.string().min(1).max(32 * 1024), usage_info: usageSchema.optional(), usage: usageSchema.optional(),
  content_filter_results: z.null().optional(),
}).strict().superRefine((value, ctx) => {
  const meters = [value.usage_info, value.usage].filter(v => v !== undefined);
  // Annotation is required. In archived bodies OCR=0, annotation=1: never call
  // that free. These overlapping counters validate bounds, NOT settle a hold.
  if (!meters.length || meters.some(m => m.pages_processed_annotation !== 1)) ctx.addIssue({code:'custom',message:'Unverified annotation usage'});
});

/** Trusted server-only audit sink; invoked with bounded raw bytes before JSON,
 * model/usage or evidence validation, also for bounded HTTP error bodies. Never
 * put this payload in browser results/logs. Sink errors fail the operation closed.
 * The one-shot runner should persist/fsync this together with its dispatch marker. */
export type AzureOcrResponseAudit = { requestId: string; photoId: string; status: number; providerRequestId: string | null; rawBody: Uint8Array; headersMs: number; fullBodyMs: number };
export type AzureMistralOcrDependencies = {
  authorized?: boolean; endpoint?: string; apiKey?: string; pricing?: AzureOcrPricing;
  store?: SpendStore; transport?: Transport; onResponse?: (audit: AzureOcrResponseAudit) => void | Promise<void>;
};
async function boundedResponse(transport: Transport, init: RequestInit, photoId: string, requestId: string, onResponse?: AzureMistralOcrDependencies['onResponse']): Promise<unknown> {
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { controller.abort(); if(reader) void reader.cancel().catch(()=>{}); };
  let timer: ReturnType<typeof setTimeout> | undefined, abort: (()=>void) | undefined;
  const expired = new Promise<never>((_,reject)=>{
    abort=()=>{reject(Error('Azure OCR cancelled'));cancel();};
    if(signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{reject(Error('Azure OCR timeout'));cancel();},AZURE_OCR_TIMEOUT_MS);
  });
  const work = async()=>{
    signal.throwIfAborted(); const start=performance.now();
    const response=await transport(AZURE_OCR_ENDPOINT,{...init,signal});
    if(signal.aborted){void response.body?.cancel().catch(()=>{});throw Error('Expired');}
    const headersMs=performance.now()-start;
    if(response.redirected || (response.url && response.url!==AZURE_OCR_ENDPOINT) || response.status>=300&&response.status<400 || !response.body){void response.body?.cancel().catch(()=>{});throw Error('Invalid Azure OCR response');}
    reader=response.body.getReader();
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>RESPONSE_BYTES))throw Error('Azure OCR response too large');
    const chunks:Uint8Array[]=[];let bytes=0;
    while(true){const chunk=await reader.read();signal.throwIfAborted();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>RESPONSE_BYTES)throw Error('Azure OCR response too large');chunks.push(Uint8Array.from(chunk.value));}
    const raw=Buffer.concat(chunks,bytes);
    await onResponse?.({requestId,photoId,status:response.status,providerRequestId:(response.headers.get('apim-request-id')??response.headers.get('x-request-id'))?.slice(0,512)??null,rawBody:Uint8Array.from(raw),headersMs,fullBodyMs:performance.now()-start});
    signal.throwIfAborted();if(response.status!==200)throw Error('Azure OCR HTTP failure');
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)) as unknown;
  };
  try{return await Promise.race([work(),expired]);}
  finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);cancel();}
}

/** Native OCR, group-only. No environment discovery, retries, fallback, remote
 * document URL, shared context, application values or extra parent reservation. */
export function createAzureMistralOcrGroupProvider(dependencies: AzureMistralOcrDependencies = {}): GroupExtractionProvider {
  const { authorized, endpoint, apiKey, store, transport=(url,init)=>fetch(url,init), onResponse }=dependencies;
  // Snapshot the approved retail estimate; caller mutation cannot change it during an await.
  let price: AzureOcrPricing | undefined;
  try { price=validateAzureOcrPricing(dependencies.pricing); } catch { /* default deny */ }
  return {async extractGroup(input,signal){
    try {
      if(typeof window!=='undefined'||authorized!==true||!store||typeof transport!=='function'||typeof apiKey!=='string'||! /^[\x21-\x7e]{1,4096}$/.test(apiKey))throw Error('Unconfigured');
      approvedAzureOcrEndpoint(endpoint);validateAzureOcrPricing(price);
    } catch {return {processing:'failed',code:'unconfigured'};}
    let request:ReturnType<typeof snapshotGroupRequest>,bodies:string[];
    try {
      signal?.throwIfAborted();request=snapshotGroupRequest(input);bodies=[];
      for(const {descriptor,image} of request.photos){
        signal?.throwIfAborted();
        // Reuse full container/single-frame decode validation, but send EXACT
        // normalized input bytes, never the validator's re-encoded output.
        const checked=await sanitizeImage({filename:descriptor.normalized.mime==='image/png'?'photo.png':'photo.jpg',mime:descriptor.normalized.mime,bytes:image});
        if(checked.width!==descriptor.normalized.width||checked.height!==descriptor.normalized.height)throw Error('Image dimensions mismatch');
        const body=JSON.stringify({model:AZURE_OCR_MODEL,document:{type:'image_url',image_url:`data:${descriptor.normalized.mime};base64,${image.toString('base64')}`},include_image_base64:false,document_annotation_format:{type:'json_schema',json_schema:{name:'ttb_photo_observations_v1',schema:azureOcrAnnotationSchema}}});
        if(Buffer.byteLength(body)>MAX_GROUP_REQUEST_BYTES)throw Error('Request too large');bodies.push(body);
      }
      signal?.throwIfAborted();
    }catch{return {processing:'failed',code:'invalid-request'};}
    try {validateAzureOcrPricing(price);}catch{return {processing:'failed',code:'unconfigured'};}
    const metadata={source:'azure-foundry' as const,model:AZURE_OCR_MODEL,schemaVersion:2 as const,promptVersion:AZURE_OCR_PROMPT_VERSION,rulesVersion:RULES_VERSION,
      photoSetSha256:request.photoSetSha256,photos:request.photos.map(p=>({photoId:p.descriptor.photoId,imageSha256:p.descriptor.normalized.sha256})),requestId:request.requestId,attemptId:request.attemptId,reservationId:request.reservationId};
    const bindingFor=(slot:number):SpendBinding=>({...isolatedPhotoAttemptIds(request,slot),requestId:slot===0?request.requestId:randomUUID(),imageSha256:request.photoSetSha256,schemaVersion:2,rulesVersion:RULES_VERSION,promptVersion:AZURE_OCR_PROMPT_VERSION,model:AZURE_OCR_MODEL,maxCostMicrousd:MAX_PHOTO_RESERVATION_MICROUSD});
    const inferPhoto=async(slot:number,requestId:string)=>{
      signal?.throwIfAborted();checkAzureOcrPayload(bodies[slot],azureOcrAnnotationSchema,price);
      const photoId=request.photos[slot].descriptor.photoId;
      const envelope=envelopeSchema.parse(await boundedResponse(transport,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','X-Request-ID':requestId},body:bodies[slot],signal},photoId,requestId,onResponse));
      signal?.throwIfAborted();
      // Expand private compact wire; strict full-v1 replay remains supported.
      // Never mine markdown for replacements or salvage obsolete flat output.
      return {photoId,evidence:parseAzureAnnotation(JSON.parse(envelope.document_annotation))};
    };
    let groupFailure:'execution-failed'|'spend-unavailable'|undefined;
    const group=await executeReserved(store!,bindingFor(0),async()=>{
      const photos:Awaited<ReturnType<typeof inferPhoto>>[]=[];
      // Parent remains claimed until the group drains. The managed ledger caps
      // ALL claims at two, not just HTTP calls: after photos 0/1, later photos
      // must use the single remaining child slot, never claim parent+2 children.
      for(let slot=0;slot<request.photos.length;slot+=slot===0?2:1){
        signal?.throwIfAborted();validateAzureOcrPricing(price);
        const wave=await Promise.allSettled(request.photos.slice(slot,slot+(slot===0?2:1)).map(async(_,index)=>{
          const current=slot+index;
          if(current===0)return {ok:true as const,value:await inferPhoto(0,request.requestId)};
          if(signal?.aborted)return {ok:false as const,code:'execution-failed' as const};
          validateAzureOcrPricing(price);const binding=bindingFor(current);
          return executeReserved(store!,binding,()=>inferPhoto(current,binding.requestId));
        }));
        for(const result of wave){if(result.status==='rejected')groupFailure??='execution-failed';else if(!result.value.ok)groupFailure??=result.value.code;else photos.push(result.value.value);}
        if(groupFailure)throw Error('Photo group failed');
      }
      signal?.throwIfAborted();return parsePhotoSetEvidence({schemaVersion:2,photos},request.photos.map(p=>p.descriptor.photoId));
    });
    if(!group.ok)return {processing:'failed',code:group.code==='spend-unavailable'||groupFailure==='spend-unavailable'?'spend-unavailable':'provider-failed'};
    return {processing:'complete',evidence:group.value,metadata};
  }};
}
