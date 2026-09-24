import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { validateRuntimeEnv } from '../lib/runtime-env';
import * as comparisons from '../app/api/comparisons/route';
import * as reviews from '../app/api/reviews/[[...path]]/route';
import * as uploads from '../app/api/uploads/route';
import fixtures from './fixtures/comparisons.json';
import { image } from './fixtures/synthetic';
import { newReviewIntent } from '../lib/review-policy';

// A runtime import on the hosted branch must fail this suite, even if no DB opens.
vi.mock('../lib/sqlite-spend',()=>{throw Error('Hosted route imported SQLite spend');});
vi.mock('../lib/review-store',()=>{throw Error('Hosted route imported SQLite reviews');});
const origin='https://synthetic.supabase.co';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:origin,TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-secret',
 TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence',TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',
 TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'a'.repeat(43),
 TTB_MEDIA_SIGNING_SECRET:'b'.repeat(43),OPENROUTER_API_KEY:'synthetic-provider-key',
 NEXT_PUBLIC_TTB_MEDIA_TRANSPORT:'supabase-v1',NEXT_PUBLIC_TTB_SUPABASE_ORIGIN:origin};
function req(path:string,body:unknown={},extra:Record<string,string>={}) {return new Request(`${env.TTB_DEMO_ORIGIN}/api/${path}`,{method:'POST',headers:{origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET,'content-type':'application/json',...extra},body:JSON.stringify(body)});}
beforeEach(()=>{
 for(const key of Object.keys(process.env))if(key.startsWith('TTB_')||key.startsWith('NEXT_PUBLIC_TTB_')||key==='VERCEL'||key==='VERCEL_ENV')vi.stubEnv(key,undefined);
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('exact hosted env, explicit persistence and public/server pairing fail closed',()=>{
 expect(validateRuntimeEnv(env)).toBe('supabase');
 for(const key of Object.keys(env))expect(()=>validateRuntimeEnv({...env,[key]:undefined}),key).toThrow();
 for(const delta of [
  {TTB_PERSISTENCE:'typo'}, {TTB_SUPABASE_URL:origin+'/'}, {TTB_SUPABASE_URL:'http://synthetic.supabase.co'},
  {NEXT_PUBLIC_TTB_SUPABASE_ORIGIN:'https://other.supabase.co'}, {TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-uploads'},
  {TTB_SUPABASE_UPLOAD_BUCKET:'ttb-evidence'}, {TTB_DEMO_ORIGIN:'http://demo.example'},
  {TTB_MEDIA_SIGNING_SECRET:env.TTB_DEMO_ACCESS_SECRET},{TTB_MEDIA_SIGNING_SECRET:'short'},
  {TTB_SUPABASE_SERVICE_ROLE_KEY:'has spaces'}, {VERCEL_ENV:'preview'},
  {TTB_DEMO_DATA_DIR:'/do-not-open'}, {TTB_REVIEW_DATA_DIR:'/do-not-open'},
  {NEXT_PUBLIC_TTB_MEDIA_SIGNING_SECRET:env.TTB_MEDIA_SIGNING_SECRET},
 ])expect(()=>validateRuntimeEnv({...env,...delta})).toThrow();
 expect(()=>validateRuntimeEnv({TTB_PERSISTENCE:'sqlite',VERCEL:'1'})).toThrow();
 expect(validateRuntimeEnv({})).toBe('sqlite');
 expect(validateRuntimeEnv({TTB_PERSISTENCE:'sqlite'})).toBe('sqlite');
 expect(()=>validateRuntimeEnv({NEXT_PUBLIC_TTB_MEDIA_TRANSPORT:'supabase-v1'})).toThrow();
});
test('app routes are Node/60s; unauthenticated and misconfigured requests never read body or perform IO',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const [route,path] of [[comparisons,'comparisons'],[reviews,'reviews/list'],[uploads,'uploads']] as const){
  expect(route.runtime).toBe('nodejs');expect(route.maxDuration).toBe(60);
  const unauthorized=req(path);unauthorized.headers.delete('x-ttb-demo-code');
  expect((await route.POST(unauthorized)).status).toBe(403);expect(unauthorized.bodyUsed).toBe(false);
  vi.stubEnv('TTB_MEDIA_SIGNING_SECRET',undefined);const invalid=req(path);
  const response=await route.POST(invalid);expect(response.status).toBe(503);expect(invalid.bodyUsed).toBe(false);
  expect(await response.text()).not.toContain(env.TTB_SUPABASE_SERVICE_ROLE_KEY);
  vi.stubEnv('TTB_MEDIA_SIGNING_SECRET',env.TTB_MEDIA_SIGNING_SECRET);
 }
 expect(fetcher).not.toHaveBeenCalled();
});
test('composed upload -> batch prepare/execute -> snapshot -> save/list/detail/evidence uses real adapters without SQLite',async()=>{
 const bytes=await image();const calls:string[]=[];const objects=new Map<string,Buffer>();
 let snapshot:any,receipt:any,savedIntent:string;const seen=new Set<string>();let dispatches=0;
 const fetcher=vi.fn<typeof fetch>(async(raw,init)=>{
  const url=new URL(String(raw));expect(init?.redirect).toBe('error');
  if(url.origin==='https://openrouter.ai'){
   if(url.pathname.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005',image:'0',request:'0'}}]});
   dispatches++;return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixtures.evidence)}}]});
  }
  expect(url.origin).toBe(origin);const headers=new Headers(init?.headers);
  expect(headers.get('authorization')).toBe(`Bearer ${env.TTB_SUPABASE_SERVICE_ROLE_KEY}`);
  expect(headers.get('x-ttb-demo-code')).toBeNull();
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const {p_op,p_input}=JSON.parse(String(init?.body));calls.push(p_op);
   if(p_op==='has_intent')return Response.json(seen.has(p_input.attemptId));
   if(['reserve','claim','complete'].includes(p_op)){
    if(p_op==='claim')seen.add(p_input.binding.attemptId);
    return Response.json({binding:p_input.binding,state:{reserve:'reserved',claim:'claimed',complete:'unresolved'}[p_op as 'reserve'|'claim'|'complete'],claimId:p_input.claimId??null,
     ledger:{currency:'USD',ceilingMicrousd:25000000,incurredMicrousd:0,unresolvedMicrousd:1000000}});
   }
   if(p_op==='snapshot_prepare')snapshot=p_input;
   if(p_op==='snapshot_get')return Response.json({record:snapshot.record});
   if(p_op==='save'){
    savedIntent=p_input.intent;
    receipt={state:'SAVED',reviewId:randomUUID(),comparisonId:p_input.comparisonId,savedAt:new Date().toISOString(),identity:'Public demo use — NOT an individually authenticated reviewer'};
    return Response.json(receipt);
   }
   if(p_op==='list')return Response.json([{receipt,application:fixtures.application,outcome:'second-review'}]);
   if(p_op==='detail')return Response.json({receipt,record:snapshot.record,intent:savedIntent});
   if(p_op==='evidence')return Response.json({key:snapshot.key,sha256:snapshot.sha256,bytes:snapshot.bytes,mime:snapshot.mime});
   return Response.json(null);
  }
  const path=url.pathname.replace('/storage/v1','');calls.push(path);
  if(path.startsWith('/object/upload/sign/'))return Response.json({url:path+'?token=synthetic-upload'});
  if(path.startsWith('/object/sign/'))return Response.json({signedURL:path+'?token=synthetic-evidence'});
  if(path.startsWith('/object/authenticated/ttb-uploads/'))return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png'}});
  if(path.startsWith('/object/ttb-evidence/')){expect(headers.get('x-upsert')).toBe('false');objects.set(path.replace('/object/',''),Buffer.from(init?.body as Uint8Array));return Response.json({});}
  if(path.startsWith('/object/authenticated/ttb-evidence/'))return new Response(new Uint8Array(objects.get(path.replace('/object/authenticated/',''))!),{headers:{'content-type':'image/png'}});
  throw Error('Unexpected synthetic request');
 });
 vi.stubGlobal('fetch',fetcher);
 const issued=await uploads.POST(req('uploads',{filename:'label.png',mime:'image/png',bytes:bytes.length,application:fixtures.application}));expect(issued.status).toBe(200);
 const {ticket,uploadUrl}=await issued.json();expect(uploadUrl).toContain(origin+'/storage/v1/object/upload/sign/');
 expect(calls[0]).toBe('upload_reserve');
 const prepared=await comparisons.POST(req('comparisons',{ticket},{'x-ttb-batch-phase':'prepare'}));expect(prepared.status).toBe(200);expect(dispatches).toBe(0);
 const {prepared:binding}=await prepared.json();const intent={attemptId:randomUUID(),reservationId:randomUUID(),batchId:randomUUID(),pairId:'label.png',revision:1};
 const batch={'x-ttb-batch-phase':'execute','x-ttb-batch-intent':JSON.stringify(intent),'x-ttb-batch-binding':binding.binding};
 const response=await comparisons.POST(req('comparisons',{ticket},batch));expect(response.status).toBe(200);
 const result=await response.json();expect(result.result.processing).toBe('complete');expect(result.reviewAvailability).toBe('available');expect(result.comparisonId).toBe(snapshot.id);expect(dispatches).toBe(1);
 expect(calls.indexOf('snapshot_commit')).toBeGreaterThan(calls.indexOf('snapshot_prepare'));
 expect((await comparisons.POST(req('comparisons',{ticket},batch))).status).toBe(409);expect(dispatches).toBe(1);
 const reviewIntent={...newReviewIntent(result.result),outcome:'second-review',confirmed:true,notes:'Synthetic integration requires second review.'};
 const saved=await reviews.POST(req('reviews',{comparisonId:result.comparisonId,idempotencyKey:randomUUID(),intent:reviewIntent}));expect(saved.status).toBe(200);
 expect((await saved.json()).receipt).toEqual(receipt);
 expect((await (await reviews.POST(req('reviews/list'))).json()).reviews).toHaveLength(1);
 expect((await (await reviews.POST(req(`reviews/${receipt.reviewId}`))).json()).record).toEqual(result.result);
 const link=await reviews.POST(req(`reviews/${receipt.reviewId}/evidence-link`));expect(link.status).toBe(200);
 expect(await link.json()).toMatchObject({url:expect.stringContaining(origin+'/storage/v1/object/sign/ttb-evidence/'),sha256:result.result.imageSha256,bytes:snapshot.bytes,mime:'image/png',expiresIn:60});
 const binary=await reviews.POST(req(`reviews/${receipt.reviewId}/evidence`));expect(binary.status).toBe(200);expect(Buffer.from(await binary.arrayBuffer())).toEqual(objects.get('ttb-evidence/'+snapshot.key));
});
test('hosted RPC failure denies comparisons/uploads/reviews without retry or fallback',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({message:'unavailable'},{status:503}));vi.stubGlobal('fetch',fetcher);
 const compare=await comparisons.POST(req('comparisons',{ticket:'invalid'}));expect(compare.status).toBe(503);
 expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockClear();
 expect((await uploads.POST(req('uploads',{filename:'label.png',mime:'image/png',bytes:1,application:fixtures.application}))).status).toBe(503);expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockClear();
 expect((await reviews.POST(req('reviews/list'))).status).toBe(503);expect(fetcher).toHaveBeenCalledTimes(1);
});
