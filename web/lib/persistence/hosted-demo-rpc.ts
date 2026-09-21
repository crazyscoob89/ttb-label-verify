import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { boundedBody } from '../demo-security';
import { MAX_IMAGE_BYTES } from '../contracts';
import { bindingSchema } from '../spend';
import { buildUnsavedDraft, checkedRecord } from '../review-policy';
import { DEMO_RESERVATION, REVIEW_LIMITS, ReviewError, type DemoStoreFactory, type DemoReviewStore, type HostedEvidenceObjects } from '../demo-store-contracts';
import type { CompleteComparison } from '../comparison-record';
import type { SavedReceipt } from '../saved-review-contract';

type Env=Record<string,string|undefined>;
type TransportOptions={fetch?:typeof fetch;timeoutMs?:number};
const unavailable=()=>new Error('Persistence unavailable');
const identity='Shared demo access code — NOT an individually authenticated reviewer' as const;
const saveSchema=z.object({comparisonId:z.uuid(),idempotencyKey:z.uuid(),intent:z.unknown()}).strict();
const receiptSchema=z.object({state:z.literal('SAVED'),reviewId:z.uuid(),comparisonId:z.uuid(),savedAt:z.string().datetime(),identity:z.literal(identity)}).strict();
const descriptorSchema=z.object({key:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(MAX_IMAGE_BYTES),mime:z.enum(['image/png','image/jpeg'])}).strict();
const errors:Record<string,number>={'review-capacity':507,'invalid-offset':400,'comparison-not-found':404,'review-not-found':404,'idempotency-conflict':409,'comparison-already-reviewed':409};
/** Private server factory; no credentials or URLs are accepted from HTTP input.
 * Public-schema RPCs are executable ONLY by service_role. This is deliberately
 * separate from the managed-user foundation and never grants a user identity. */
function client(env:Env,options:TransportOptions={}) {
 if(typeof window!=='undefined'||env.TTB_PERSISTENCE!=='supabase')throw unavailable();
 const origin=env.TTB_SUPABASE_URL??'',key=env.TTB_SUPABASE_SERVICE_ROLE_KEY??'';
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(origin)||!key||key.length>8192||/[\s\x00-\x1f\x7f]/.test(key))throw unavailable();
 const timeout=z.number().int().min(1).max(10000).parse(options.timeoutMs??5000),transport=options.fetch??globalThis.fetch;
 return async(name:'spend'|'review',op:string,input:unknown={}):Promise<unknown>=>{
  if(typeof window!=='undefined')throw unavailable();
  const body=JSON.stringify({p_op:op,p_input:input});
  // SQL carries canonical request/intent as text. Budget JSON escaping and both
  // copies without shrinking the existing 384 KiB save / 256 KiB record limits.
  if(Buffer.byteLength(body)>2*1024*1024)throw unavailable();
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
   return await Promise.race([(async()=>{
    const response=await transport(`${origin}/rest/v1/rpc/ttb_demo_${name}`,{method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Authorization:`Bearer ${key}`,apikey:key,'Content-Type':'application/json','Accept-Profile':'public','Content-Profile':'public'},body});
    if(response.redirected)throw unavailable();
    const result=JSON.parse((await boundedBody(response,2*1024*1024,timeout)).toString('utf8'));
    if(!response.ok){if(name==='review'&&result.code==='P0001'&&Object.hasOwn(errors,result.message))throw new ReviewError(errors[result.message],result.message);throw unavailable();}
    return result;
   })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable());},timeout);})]);
  }catch(e){if(e instanceof ReviewError)throw e;throw unavailable();}
  finally{clearTimeout(timer);controller.abort();}
 };
}
export function createHostedStores({env,objects,...options}:{env:Env;objects:HostedEvidenceObjects}&TransportOptions):DemoStoreFactory {
 const rpc=client(env,options);
 const spend={
  async acquireWork(id:string){await rpc('spend','acquire',{id:z.uuid().parse(id)});},
  async releaseWork(id:string){await rpc('spend','release',{id:z.uuid().parse(id)});},
  async hasIntent(attemptId:string,reservationId:string){return z.boolean().parse(await rpc('spend','has_intent',{attemptId:z.uuid().parse(attemptId),reservationId:z.uuid().parse(reservationId)}));},
  async reserve(input:Parameters<typeof bindingSchema.parse>[0]){const binding=bindingSchema.parse(input);if(binding.maxCostMicrousd!==DEMO_RESERVATION)throw unavailable();return rpc('spend','reserve',{binding});},
  async claim(input:Parameters<typeof bindingSchema.parse>[0],claimId:string){return rpc('spend','claim',{binding:bindingSchema.parse(input),claimId:z.uuid().parse(claimId)});},
  async complete(input:Parameters<typeof bindingSchema.parse>[0],claimId:string){return rpc('spend','complete',{binding:bindingSchema.parse(input),claimId:z.uuid().parse(claimId)});},
  close(){},
 };
 async function descriptor(id:string){
  const d=descriptorSchema.parse(await rpc('review','evidence',{id:z.uuid().parse(id)}));
  if(!/^snapshots\/[0-9a-f-]{36}$/.test(d.key))throw unavailable();return d;
 }
 const reviews:DemoReviewStore={
  async snapshot(record,image,mime){
   const recordText=JSON.stringify(record);
   if(!checkedRecord(record)||!Buffer.isBuffer(image)||image.length<1||image.length>MAX_IMAGE_BYTES||Buffer.byteLength(recordText)>REVIEW_LIMITS.recordBytes||!['image/png','image/jpeg'].includes(mime)||createHash('sha256').update(image).digest('hex')!==record.imageSha256)throw new ReviewError(400,'invalid-snapshot');
   // Hold quota before object creation; crashes/lost acknowledgments retain quota.
   // No overwrite/retry: only verified bytes can become a committed comparison.
   const id=randomUUID(),key=`snapshots/${id}`,sha256=record.imageSha256,bytes=Buffer.from(image);
   await rpc('review','snapshot_prepare',{id,record:recordText,key,sha256,bytes:bytes.length,mime});
   const stored=await objects.putEvidence(id,bytes,mime,sha256);if(stored.key!==key)throw unavailable();
   const verified=await objects.getEvidence(key,sha256,bytes.length,mime);
   if(verified.length!==bytes.length||createHash('sha256').update(verified).digest('hex')!==sha256)throw unavailable();
   await rpc('review','snapshot_commit',{id});return id;
  },
  async save(input):Promise<SavedReceipt>{
   const parsed=saveSchema.safeParse(input);
   if(!parsed.success||Buffer.byteLength(JSON.stringify(input))>REVIEW_LIMITS.requestBytes)throw new ReviewError(400,'invalid-review');
   const {comparisonId,idempotencyKey,intent}=parsed.data;
   const row=z.object({record:z.string()}).strict().parse(await rpc('review','snapshot_get',{id:comparisonId}));
   const draft=buildUnsavedDraft(JSON.parse(row.record),intent);
   if(!draft)throw new ReviewError(409,'review-policy-or-stale-binding');
   return receiptSchema.parse(await rpc('review','save',{comparisonId,idempotencyKey,request:JSON.stringify({comparisonId,intent:draft.intent}),intent:JSON.stringify(draft.intent)}));
  },
  async list(offset=0){
   if(!Number.isInteger(offset)||offset<0||offset>REVIEW_LIMITS.snapshots)throw new ReviewError(400,'invalid-offset');
   const rows=z.array(z.object({receipt:receiptSchema,application:z.unknown(),outcome:z.string()}).strict()).max(50).parse(await rpc('review','list',{offset}));
   return rows as Awaited<ReturnType<DemoReviewStore['list']>>;
  },
  async detail(id){
   if(!z.uuid().safeParse(id).success)throw new ReviewError(404,'review-not-found');
   const row=z.object({receipt:receiptSchema,record:z.string(),intent:z.string()}).strict().parse(await rpc('review','detail',{id}));
   const record=JSON.parse(row.record) as CompleteComparison,intent=JSON.parse(row.intent);
   if(!checkedRecord(record)||!buildUnsavedDraft(record,intent))throw unavailable();
   return {receipt:row.receipt,record,intent};
  },
  async evidence(id){const d=await descriptor(id);const bytes=await objects.getEvidence(d.key,d.sha256,d.bytes,d.mime);if(bytes.length!==d.bytes||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw unavailable();return {bytes,mime:d.mime};},
  async evidenceLink(id){const d=await descriptor(id);return objects.signEvidence(d.key,d.sha256,d.bytes,d.mime);},
  close(){},
 };
 return {openSpend:()=>spend,openReviews:()=>reviews};
}
export function createHostedUploadQuota(env:Env,options:TransportOptions={}) {
 const rpc=client(env,options);
 return {async reserve(ticketId:string,bytes:number){await rpc('review','upload_reserve',{id:z.uuid().parse(ticketId),bytes:z.number().int().min(1).max(MAX_IMAGE_BYTES).parse(bytes)});}};
}
