import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createAzureMistralOcrGroupProvider, AZURE_OCR_ENDPOINT, AZURE_OCR_MODEL, AZURE_OCR_PROMPT_VERSION, azureOcrAnnotationSchema } from '../lib/extraction/azure-mistral-ocr';
import { validateAzureOcrPricing } from '../lib/extraction/azure-ocr-pricing';
import { offlineAzurePricing as offlinePricing, azureEnvelope as body } from './fixtures/azure-ocr';
import archived from './fixtures/azure-ocr-archived-envelope.json';
import type { Transport } from '../lib/extraction/openrouter';
import { groupFixture, evidence } from './fixtures/photo-groups';
import { groupAttemptIds } from '../lib/group-binding';
import { OfflineSpendStore } from './helpers/offline-spend-store';
import { checkedPhotoRecord, finalizePhotoComparison } from '../lib/photo-record';
import { checkedServerRecord } from '../lib/group-assets';


const network = vi.fn(() => { throw Error('External network forbidden'); });
beforeEach(() => { network.mockClear(); vi.stubGlobal('fetch', network); });
afterEach(() => { expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup(count = 2) {
  const f = await groupFixture(count), store = new OfflineSpendStore(); store.ceiling = 25_000_000;
  const request = { schemaVersion: 2 as const, photos: f.prepared.photos.map(p => ({ descriptor: p.descriptor, image: p.normalized.bytes })), photoSetSha256: f.prepared.photoSetSha256, ...groupAttemptIds(f.input.group.groupId, 1) };
  const transport = vi.fn<Transport>(async () => Response.json(body()));
  const onResponse = vi.fn();
  const deps = { authorized: true, apiKey: 'offline', endpoint: AZURE_OCR_ENDPOINT, pricing: offlinePricing(), store, transport, onResponse };
  return { ...f, request, store, transport, deps, onResponse, provider: () => createAzureMistralOcrGroupProvider(deps) };
}

test('Azure payload is isolated native OCR with exact schema; host binds truthful identity and saves/reopens without relabeling history', async () => {
  const s = await setup(), result = await s.provider().extractGroup(s.request);
  expect(result.processing).toBe('complete'); if(result.processing !== 'complete') throw Error('Expected complete');
  expect(s.transport).toHaveBeenCalledTimes(2); expect(s.store.unresolved).toBe(2_000_000);
  s.transport.mock.calls.forEach(([url, init], i) => {
    expect(url).toBe(AZURE_OCR_ENDPOINT); expect(init.redirect).toBe('error'); expect(new Headers(init.headers).get('authorization')).toBe('Bearer offline');
    const request = JSON.parse(String(init.body));
    expect(Object.keys(request).sort()).toEqual(['document', 'document_annotation_format', 'include_image_base64', 'model']);
    expect(request.model).toBe(AZURE_OCR_MODEL); expect(request.include_image_base64).toBe(false);
    expect(request.document).toEqual({type:'image_url',image_url:`data:image/png;base64,${s.request.photos[i].image.toString('base64')}`});
    expect(request.document_annotation_format).toEqual({ type:'json_schema',json_schema:{ name:'ttb_photo_observations_v1',schema:azureOcrAnnotationSchema } });
    for(const p of s.request.photos) expect(String(init.body)).not.toContain(p.descriptor.photoId);
    expect(String(init.body)).not.toContain(s.input.group.application.applicationId);
  });
  expect(s.onResponse).toHaveBeenCalledTimes(2);
  expect(result.metadata).toMatchObject({source:'azure-foundry',model:AZURE_OCR_MODEL,promptVersion:AZURE_OCR_PROMPT_VERSION,schemaVersion:2,...groupAttemptIds(s.input.group.groupId,1)});
  const record = finalizePhotoComparison(s.input.group.application,s.input.group.groupId,1,s.prepared.photos.map(p=>p.descriptor),s.prepared.photoSetSha256,result);
  expect(checkedServerRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  expect(checkedPhotoRecord({...record, source:'openrouter'})).toBeNull();
  expect(checkedPhotoRecord({...record,extraction:{...record.extraction,promptVersion:'photo-set-observations-v2'}})).toBeNull();
  expect(checkedPhotoRecord(s.record)).toEqual(s.record);
  expect(()=>checkedServerRecord({...record,extraction:{...record.extraction,attemptId:randomUUID()}})).toThrow();
});

test.each(['wrong-model','extra-page','missing-annotation','extra-key','old-flat-schema','bad-usage','extra-root','http','oversize','redirect'])('strict %s failure retains liability, audits before evidence validation and never retries', async fault => {
  const s=await setup(1); const d=body();
  s.transport.mockImplementation(async()=> {
    if(fault==='wrong-model') d.model='wrong' as typeof d.model;
    if(fault==='extra-page') d.pages.push(d.pages[0]);
    if(fault==='missing-annotation') d.document_annotation='';
    if(fault==='extra-key') d.document_annotation=JSON.stringify({...evidence(),verdict:'approved'});
    if(fault==='old-flat-schema') d.document_annotation=archived.document_annotation;
    if(fault==='bad-usage') d.usage_info.pages_processed_annotation=2;
    if(fault==='extra-root') Object.assign(d,{choices:[]});
    if(fault==='http') return new Response('denied',{status:429});
    if(fault==='oversize') return new Response('x'.repeat(128*1024+1));
    if(fault==='redirect') return new Response(null,{status:302});
    return Response.json(d);
  });
  expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'provider-failed'});
  expect(s.transport).toHaveBeenCalledTimes(1); expect(s.store.unresolved).toBe(1_000_000);
  if(!['oversize','redirect'].includes(fault)) expect(s.onResponse).toHaveBeenCalledTimes(1);
  expect((await s.provider().extractGroup(s.request)).processing).toBe('failed'); expect(s.transport).toHaveBeenCalledTimes(1);
});

test('unconfigured price/endpoint/auth, stale or unknown fees fail before any reservation', async()=> {
  const s=await setup();
  for(const change of [{authorized:false},{apiKey:''},{endpoint:AZURE_OCR_ENDPOINT+'?x=1'},{pricing:undefined},{pricing:{...offlinePricing(),reviewBy:'2000-01-01T00:00:00.000Z'}},{pricing:{...offlinePricing(),pricingBasis:'unbounded'}}]) {
    expect((await createAzureMistralOcrGroupProvider({...s.deps,...change} as typeof s.deps).extractGroup(s.request)).processing).toBe('failed');
  }
  expect(s.store.rows.size).toBe(0); expect(s.transport).not.toHaveBeenCalled();
  expect(()=>validateAzureOcrPricing({...offlinePricing(),annotationBilling:'unknown'})).toThrow();
  expect(()=>validateAzureOcrPricing({...offlinePricing(),ocrMicrousd:1_000_001})).toThrow();
});

test('parent gates all slots, two at most, drains started sibling, no later wave after failure', async()=> {
  const s=await setup(4), waiting:{resolve:()=>void;reject:()=>void}[]=[];
  s.transport.mockImplementation(async()=>{await new Promise<void>((resolve,reject)=>waiting.push({resolve,reject:()=>reject(Error('offline'))}));return Response.json(body());});
  let settled=false; const pending=s.provider().extractGroup(s.request).then(r=>{settled=true;return r;});
  await vi.waitFor(()=>expect(waiting).toHaveLength(2));
  expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});
  waiting[0].reject(); await new Promise(r=>setTimeout(r,20)); expect(settled).toBe(false);
  expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');
  waiting[1].resolve(); expect((await pending).processing).toBe('failed');
  expect(s.transport).toHaveBeenCalledTimes(2); expect(s.store.unresolved).toBe(2_000_000);
});

test('budget denial and abort before dispatch produce zero POSTs',async()=>{
  const s=await setup();s.store.historical=25_000_000;
  expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});
  expect(s.transport).not.toHaveBeenCalled();
  expect((await s.provider().extractGroup(s.request,AbortSignal.abort())).processing).toBe('failed');
  expect(s.transport).not.toHaveBeenCalled();
});

test('uncooperative transport timeout is bounded and retains hold',async()=>{
  const s=await setup(1);s.transport.mockImplementation(()=>new Promise(()=>{}));
  const pending=s.provider().extractGroup(s.request);
  await vi.waitFor(()=>expect(s.transport).toHaveBeenCalledTimes(1));
  // Exercise the actual production deadline with a transport that ignores abort.
  expect(s.store.unresolved).toBe(1_000_000);
  await expect(pending).resolves.toEqual({processing:'failed',code:'provider-failed'});
},25000);

test('successful four-photo waves preserve ordering, deterministic child fences and parent-last completion',async()=>{
  const s=await setup(4),waiting:(()=>void)[]=[];let active=0,peak=0;
  const complete=vi.spyOn(s.store,'complete');
  const claim=s.store.claim.bind(s.store);
  vi.spyOn(s.store,'claim').mockImplementation(async(...args)=>{
    if([...s.store.rows.values()].filter(r=>r.state==='claimed').length>=2)throw Error('Managed two-claim cap');
    return claim(...args);
  });
  s.transport.mockImplementation(async()=>{active++;peak=Math.max(peak,active);await new Promise<void>(r=>waiting.push(r));active--;return Response.json(body());});
  const pending=s.provider().extractGroup(s.request);
  await vi.waitFor(()=>expect(waiting).toHaveLength(2));waiting[1]();waiting[0]();
  await vi.waitFor(()=>expect(waiting).toHaveLength(3));expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');waiting[2]();
  await vi.waitFor(()=>expect(waiting).toHaveLength(4));waiting[3]();
  const r=await pending;expect(r.processing).toBe('complete');expect(peak).toBe(2);
  if(r.processing==='complete')expect(r.evidence.photos.map(p=>p.photoId)).toEqual(s.request.photos.map(p=>p.descriptor.photoId));
  expect(complete.mock.calls.at(-1)?.[0].reservationId).toBe(s.request.reservationId);
  expect(s.store.unresolved).toBe(4_000_000);
  for(const change of [{attemptId:randomUUID()},{reservationId:randomUUID()}])expect((await s.provider().extractGroup({...s.request,...change})).processing).toBe('failed');
  expect(s.transport).toHaveBeenCalledTimes(4);
});

test('cancellation races an uncooperative body reader and does not wait for a failed cancel promise',async()=>{
  const s=await setup(1),controller=new AbortController(),cancel=vi.fn(()=>new Promise<void>(()=>{}));
  s.transport.mockImplementation(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel})));
  const pending=s.provider().extractGroup(s.request,controller.signal);
  await vi.waitFor(()=>expect(s.transport).toHaveBeenCalledTimes(1));controller.abort();
  expect(await pending).toEqual({processing:'failed',code:'provider-failed'});expect(cancel).toHaveBeenCalledTimes(1);expect(s.store.unresolved).toBe(1_000_000);
});

test('unknown bold stays null, split role evidence stays unchanged, invalid roles are not repaired from application',async()=>{
  const s=await setup(1),e=evidence();e.warning.headingBold=null;e.warning.bodyBold=null;
  e.producer.name={status:'uncertain',text:'Visible Distributor',reason:'The printed role is DISTRIBUTED BY, not producer.'};
  e.producer.address={status:'missing',text:null,reason:'No address visible in this photograph.'};
  s.transport.mockResolvedValue(Response.json(body(e)));
  const r=await s.provider().extractGroup(s.request);expect(r.processing).toBe('complete');
  if(r.processing==='complete')expect(r.evidence.photos[0].evidence).toEqual(e);
});

test('price expiry while claim is pending closes dispatch, never pretends hold is a tariff',async()=>{
  const s=await setup(1),claim=s.store.claim.bind(s.store);const until=Date.parse(s.deps.pricing.reviewBy);
  const clock=vi.spyOn(Date,'now');
  vi.spyOn(s.store,'claim').mockImplementation(async(...args)=>{const result=await claim(...args);clock.mockReturnValue(until);return result;});
  try {expect((await s.provider().extractGroup(s.request)).processing).toBe('failed');expect(s.transport).not.toHaveBeenCalled();expect(s.store.unresolved).toBe(1_000_000);}
  finally {clock.mockRestore();}
});

test('mutated tariff after constructor cannot change dispatch price; audit callback failure remains unresolved',async()=>{
  const s=await setup(1),provider=s.provider();s.deps.pricing.ocrMicrousd=1_000_001;
  s.onResponse.mockImplementation(()=>{throw Error('Audit unavailable');});
  expect(await provider.extractGroup(s.request)).toEqual({processing:'failed',code:'provider-failed'});expect(s.transport).toHaveBeenCalledTimes(1);expect(s.store.unresolved).toBe(1_000_000);
});

test('missing completion acknowledgment drains children and retains parent liability',async()=>{
  const s=await setup(4);s.store.fail='complete';
  expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});
  expect(s.transport).toHaveBeenCalledTimes(2);expect(s.store.unresolved).toBe(2_000_000);
});
