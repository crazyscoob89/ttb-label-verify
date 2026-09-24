import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDemoHandler } from '../lib/demo-route';
import { validateRuntimeEnv, mediaSigningSecret, groupExtractionProviderName } from '../lib/runtime-env';
import { azureEnvelope, offlineAzurePricing } from './fixtures/azure-ocr';
import { groupInput } from './fixtures/photo-groups';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import { AZURE_OCR_ENDPOINT } from '../lib/extraction/azure-ocr-pricing';
import { AZURE_OCR_MODEL, AZURE_OCR_PROMPT_VERSION } from '../lib/photo-contracts';
import { checkedServerRecord } from '../lib/group-assets';
import type { DemoSpendStore, DemoStoreFactory } from '../lib/demo-store-contracts';
import type { Transport } from '../lib/extraction/openrouter';

const env = { TTB_PERSISTENCE:'supabase', TTB_SUPABASE_URL:'https://synthetic.supabase.co', TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-secret',
  TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence', TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',
  TTB_DEMO_ENABLED:'true', TTB_DEMO_ORIGIN:'https://demo.example', TTB_DEMO_ACCESS_SECRET:'a'.repeat(43), TTB_MEDIA_SIGNING_SECRET:'b'.repeat(43),
  NEXT_PUBLIC_TTB_MEDIA_TRANSPORT:'supabase-v1', NEXT_PUBLIC_TTB_SUPABASE_ORIGIN:'https://synthetic.supabase.co',
  TTB_GROUP_EXTRACTION_PROVIDER:'azure-foundry', AZURE_FOUNDRY_API_KEY:'offline-azure-key', AZURE_FOUNDRY_ENDPOINT:AZURE_OCR_ENDPOINT };
const network=vi.fn(()=>{throw Error('External network forbidden');});
beforeEach(()=>{network.mockClear();vi.stubGlobal('fetch',network);});
afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();vi.unstubAllEnvs();});

test('actual app composition selects Azure with managed RPC/media adapters and saves/reopens original tuple',async()=>{
  const {createAppRoute}=await import('../lib/app-runtime');
  const {signGroupUploadTicket}=await import('../lib/group-media');
  const {newReviewIntent}=await import('../lib/review-policy');
  const input=await groupInput(2),ledger=new OfflineSpendStore();ledger.ceiling=25_000_000;
  const configured={...env,TTB_AZURE_OCR_PRICING_JSON:JSON.stringify(offlineAzurePricing())};
  for(const key of Object.keys(process.env))if(key.startsWith('TTB_')||key.startsWith('NEXT_PUBLIC_TTB_')||['VERCEL','VERCEL_ENV','OPENROUTER_API_KEY'].includes(key))vi.stubEnv(key,undefined);
  for(const [key,value] of Object.entries(configured))vi.stubEnv(key,value);
  const objects=input.group.photos.map(p=>{const id=randomUUID();return {photoId:p.photoId,id,key:`uploads/${id}`};});
  const ticket=signGroupUploadTicket(input.group,objects,configured),stored=new Map<string,Buffer>();
  let snapshot:any,receipt:any,savedIntent:any,posts=0;
  const fetcher=vi.fn<typeof fetch>(async(raw,init)=>{
    const url=new URL(String(raw));expect(init?.redirect).toBe('error');
    if(url.href===AZURE_OCR_ENDPOINT){posts++;expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${env.AZURE_FOUNDRY_API_KEY}`);return Response.json(azureEnvelope());}
    expect(url.origin).toBe(env.TTB_SUPABASE_URL);
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const {p_op,p_input}=JSON.parse(String(init?.body));
      if(p_op==='has_intent')return Response.json(ledger.attempts.has(p_input.attemptId)||ledger.rows.has(p_input.reservationId));
      if(p_op==='reserve')return Response.json(await ledger.reserve(p_input.binding));
      if(p_op==='claim')return Response.json(await ledger.claim(p_input.binding,p_input.claimId));
      if(p_op==='complete')return Response.json(await ledger.complete(p_input.binding,p_input.claimId));
      if(p_op==='snapshot_prepare')snapshot=p_input;
      if(p_op==='snapshot_get')return Response.json({record:snapshot.record,assets:snapshot.assets});
      if(p_op==='save'){savedIntent=p_input.intent;receipt={state:'SAVED',reviewId:randomUUID(),comparisonId:p_input.comparisonId,savedAt:new Date().toISOString(),identity:'Public demo use — NOT an individually authenticated reviewer'};return Response.json(receipt);}
      if(p_op==='detail')return Response.json({receipt,record:snapshot.record,intent:savedIntent,assets:snapshot.assets});
      return Response.json(null);
    }
    const path=url.pathname.replace('/storage/v1','');
    if(path.startsWith('/object/authenticated/ttb-uploads/')){const i=objects.findIndex(o=>path.endsWith(o.key));return new Response(new Uint8Array(input.files[i].image.bytes),{headers:{'content-type':'image/png'}});}
    if(path.startsWith('/object/ttb-evidence/')){expect(new Headers(init?.headers).get('x-upsert')).toBe('false');stored.set(path.replace('/object/',''),Buffer.from(init?.body as Uint8Array));return Response.json({});}
    if(path.startsWith('/object/authenticated/ttb-evidence/'))return new Response(new Uint8Array(stored.get(path.replace('/object/authenticated/',''))!),{headers:{'content-type':'image/png'}});
    throw Error('Unexpected offline request');
  });vi.stubGlobal('fetch',fetcher);
  const req=(path:string,body:unknown)=>new Request(`${env.TTB_DEMO_ORIGIN}/api/${path}`,{method:'POST',headers:{origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET,'content-type':'application/json'},body:JSON.stringify(body)});
  const compare=createAppRoute('comparisons'),reviews=createAppRoute('reviews');
  const preparedResponse=await compare(req('comparisons',{schemaVersion:2,phase:'prepare',ticket}));expect(preparedResponse.status).toBe(200);
  const {prepared}=await preparedResponse.json();expect(posts).toBe(0);
  const resultResponse=await compare(req('comparisons',{schemaVersion:2,phase:'execute',ticket,attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding}));
  expect(resultResponse.status).toBe(200);const result=await resultResponse.json();expect(posts).toBe(2);expect(result.reviewAvailability).toBe('available');
  expect(ledger.unresolved).toBe(2_000_000);expect(JSON.parse(snapshot.record).source).toBe('azure-foundry');
  const intent={...newReviewIntent(result.result),outcome:'second-review',confirmed:true,notes:'Offline Azure integration; human review required.'};
  const saved=await reviews(req('reviews',{comparisonId:result.comparisonId,idempotencyKey:randomUUID(),intent}));expect(saved.status).toBe(200);
  const detail=await reviews(req(`reviews/${receipt.reviewId}`,{}));expect(detail.status).toBe(200);expect((await detail.json()).record).toEqual(result.result);
  // Authentic saved snapshot and request-time shared-code auth, not a mocked route.
  const stale={...offlineAzurePricing(),verifiedAt:'2000-01-01T00:00:00.000Z'};
  vi.stubEnv('TTB_AZURE_OCR_PRICING_JSON',JSON.stringify(stale));posts=0;
  const staleDetail=await reviews(req(`reviews/${receipt.reviewId}`,{}));
  expect(staleDetail.status).toBe(200);expect((await staleDetail.json()).record).toEqual(result.result);
  const denied=await compare(req('comparisons',{schemaVersion:2,phase:'prepare',ticket}));
  expect(denied.status).toBe(403);expect(posts).toBe(0);expect(ledger.rows.size).toBe(2);expect(ledger.unresolved).toBe(2_000_000);
});

async function setup(count=2) {
  const input=await groupInput(count), base=new OfflineSpendStore();base.ceiling=25_000_000;
  const store=Object.assign(base,{acquireWork:vi.fn(),releaseWork:vi.fn(),hasIntent:async(a:string,r:string)=>base.attempts.has(a)||base.rows.has(r),close:vi.fn()}) satisfies DemoSpendStore;
  const saved=vi.fn(async(record:unknown)=>{checkedServerRecord(record);return randomUUID();});
  const stores:DemoStoreFactory={openSpend:()=>store,openReviews:()=>({snapshot:vi.fn(),snapshotGroup:saved,save:vi.fn(),list:vi.fn(),detail:vi.fn(),evidence:vi.fn(),close:vi.fn()})};
  const transport=vi.fn<Transport>(async(url)=>{expect(url).toBe(AZURE_OCR_ENDPOINT);return Response.json(azureEnvelope());});
  const configured={...env,TTB_AZURE_OCR_PRICING_JSON:JSON.stringify(offlineAzurePricing())};
  const handler=createDemoHandler({env:configured,stores,transport});
  const request=(operation:unknown)=>{
    const form=new FormData();form.append('group',JSON.stringify(input.group));form.append('operation',JSON.stringify(operation));
    for(const p of input.files)form.append(`photo:${p.photoId}`,new Blob([new Uint8Array(p.image.bytes)],{type:p.image.mime}),p.image.filename);
    return new Request(`${env.TTB_DEMO_ORIGIN}/api/comparisons`,{method:'POST',headers:{origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET},body:form});
  };
  return {input,store,stores,transport,saved,configured,handler,request};
}

test.each([1,2])('selected Azure %s-photo group prepare/execute uses no OpenRouter credential/catalog and truthful saved identity',async count=>{
  const s=await setup(count);
  expect(validateRuntimeEnv(s.configured)).toBe('supabase');
  const prep=await s.handler(s.request({phase:'prepare'}));expect(prep.status).toBe(200);expect(s.transport).not.toHaveBeenCalled();
  const {prepared}=await prep.json(),op={phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};
  const response=await s.handler(s.request(op));expect(response.status).toBe(200);
  const result=await response.json();expect(result.reviewAvailability).toBe('available');expect(result.result.source).toBe('azure-foundry');
  expect(result.result.extraction).toMatchObject({model:AZURE_OCR_MODEL,promptVersion:AZURE_OCR_PROMPT_VERSION,attemptId:prepared.attemptId,reservationId:prepared.reservationId});
  expect(result.result.comparison.rulesRevision).toBe(6);expect(result.result.aggregationVersion).toBe('photo-set-aggregation-v2');
  expect(s.transport).toHaveBeenCalledTimes(count);expect(s.store.rows.size).toBe(count);expect(s.saved).toHaveBeenCalledTimes(1);
  expect((await s.handler(s.request(op))).status).toBe(409);expect(s.transport).toHaveBeenCalledTimes(count);
});

test('selection, endpoint, price, managed persistence and credential gates deny before input/store/POST',async()=>{
  const s=await setup();
  for(const change of [{TTB_GROUP_EXTRACTION_PROVIDER:''},{TTB_GROUP_EXTRACTION_PROVIDER:'mistral'},{AZURE_FOUNDRY_API_KEY:undefined},{AZURE_FOUNDRY_ENDPOINT:'https://evil.invalid/ocr'},{TTB_AZURE_OCR_PRICING_JSON:undefined},{TTB_AZURE_OCR_PRICING_JSON:'{}'},{TTB_PERSISTENCE:'sqlite'}]) {
    const readInput=vi.fn();const openSpend=vi.fn();const handler=createDemoHandler({env:{...s.configured,...change},stores:{...s.stores,openSpend},readInput,transport:s.transport});
    expect((await handler(s.request({phase:'prepare'}))).status).toBe(403);expect(openSpend).not.toHaveBeenCalled();expect(readInput).not.toHaveBeenCalled();
    if('TTB_AZURE_OCR_PRICING_JSON' in change)expect(validateRuntimeEnv({...s.configured,...change})).toBe('supabase');
    else expect(()=>validateRuntimeEnv({...s.configured,...change})).toThrow();
  }
  expect(s.transport).not.toHaveBeenCalled();
  expect(groupExtractionProviderName({})).toBe('openrouter');expect(groupExtractionProviderName({TTB_GROUP_EXTRACTION_PROVIDER:'openrouter'})).toBe('openrouter');
  expect(()=>mediaSigningSecret({...s.configured,TTB_MEDIA_SIGNING_SECRET:s.configured.AZURE_FOUNDRY_API_KEY.padEnd(43,'x'),AZURE_FOUNDRY_API_KEY:s.configured.AZURE_FOUNDRY_API_KEY.padEnd(43,'x')})).toThrow();
});

test('Azure failure cannot fall back to configured OpenRouter; legacy singleton without its own credential is denied',async()=>{
  const s=await setup(1);s.transport.mockResolvedValue(new Response('failed',{status:500}));
  const handler=createDemoHandler({env:{...s.configured,OPENROUTER_API_KEY:'also-offline'},stores:s.stores,transport:s.transport});
  const {prepared}=await(await handler(s.request({phase:'prepare'}))).json();
  const response=await handler(s.request({phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding}));
  expect(response.status).toBe(502);expect(s.transport).toHaveBeenCalledTimes(1);expect(s.transport.mock.calls[0][0]).toBe(AZURE_OCR_ENDPOINT);
  const singleton=createDemoHandler({env:s.configured,stores:s.stores,transport:s.transport,readInput:async()=>({file:s.input.files[0].image,binding:{filename:s.input.files[0].image.filename,application:s.input.group.application}})});
  expect((await singleton(s.request({phase:'prepare'}))).status).toBe(403);expect(s.transport).toHaveBeenCalledTimes(1);
});
