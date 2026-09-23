import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createGpt41GroupProvider,parseGpt41Envelope,GPT41_MODEL,GPT41_PROMPT_VERSION} from '../lib/extraction/gpt41';
import {makeGpt41Request,GPT41_CATALOG_URL} from '../lib/extraction/gpt41-pricing';
import {parseGpt41Wire} from '../lib/extraction/gpt41-wire';
import {groupAttemptIds} from '../lib/group-binding';
import {aggregatePhotoEvidence as aggregateV1} from '../lib/photo-evidence-v1';
import {comparePhotoApplication as compareV4} from '../lib/group-rules-v4';
import {checkedPhotoRecord,finalizePhotoComparison,groupExtractionEnvelope} from '../lib/photo-record';
import {checkedServerRecord,prepareGroupAssets,validateAssetManifest} from '../lib/group-assets';
import {groupFixture} from './fixtures/photo-groups';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import type {Transport} from '../lib/extraction/openrouter';
import catalog from './fixtures/gpt41-catalog.json';
import requestFixture from './fixtures/gpt41-benchmark-request-redacted.json';
import front from './fixtures/gpt41-benchmark-envelope-0.json';
import back from './fixtures/gpt41-benchmark-envelope-1.json';
const wire=()=>({brand:'SYNTHETIC',classType:null,abv:null,netContents:null,producer:{name:null,address:null,roleEvidence:null,otherEntityText:null},origin:null,warning:{heading:null,body:null,headingBold:null,bodyBold:null},uncertainties:[]});
const envelope=()=>({...structuredClone(front),choices:[{...front.choices[0],message:{...front.choices[0].message,content:JSON.stringify(wire())}}]});
const network=vi.fn(()=>{throw Error('Network forbidden');});
beforeEach(()=>{network.mockClear();vi.stubGlobal('fetch',network);});
afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(count=2){
 const f=await groupFixture(count),store=new OfflineSpendStore();store.ceiling=50000000;store.historical=27000000;
 const request={schemaVersion:2 as const,photos:f.prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),photoSetSha256:f.prepared.photoSetSha256,...groupAttemptIds(f.input.group.groupId,1)};
 const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:envelope()));
 const deps={authorized:true,apiKey:'offline',store,transport};return {...f,store,request,transport,deps,provider:()=>createGpt41GroupProvider(deps)};
}
test('production payload retains original benchmark schema and routing; archived baseline prompt remains intact',()=>{
 const body=makeGpt41Request(Buffer.from('offline'),'image/jpeg');const content=body.messages[1].content;if(!Array.isArray(content)||!content[1].image_url)throw Error('Expected image');content[1].image_url.url='[IMAGE OMITTED]';
 body.messages[0].content=requestFixture.messages[0].content;
 expect(body).toEqual(requestFixture);
 for(const saved of [front,back])expect(()=>parseGpt41Envelope(saved)).not.toThrow();
 const stop=structuredClone(front);stop.choices[0].native_finish_reason='stop';expect(()=>parseGpt41Envelope(stop)).not.toThrow();
});
test('truthful exact tuple survives finalized record/assets/replay, preserving old history',async()=>{
 const s=await setup(),result=await s.provider().extractGroup(s.request);expect(result.processing).toBe('complete');if(result.processing!=='complete')throw Error('Expected complete');
 expect(result.metadata).toMatchObject({source:'openrouter',model:GPT41_MODEL,promptVersion:GPT41_PROMPT_VERSION,schemaVersion:2});
 const posts=s.transport.mock.calls.filter(([u])=>u!==GPT41_CATALOG_URL);expect(posts).toHaveLength(2);
 posts.forEach(([,init],i)=>{const b=JSON.parse(String(init.body));expect(b.messages[1].content).toHaveLength(2);expect(b.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${s.request.photos[i].image.toString('base64')}`);expect(JSON.stringify(b)).not.toContain(s.input.group.application.applicationId);});
 const r=finalizePhotoComparison(s.input.group.application,s.input.group.groupId,1,s.prepared.photos.map(p=>p.descriptor),s.prepared.photoSetSha256,result);
 expect(checkedServerRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);expect(checkedPhotoRecord(s.record)).toEqual(s.record);
 const assets=prepareGroupAssets(r,s.photos);expect(validateAssetManifest(r,assets.id,assets.assets)).toEqual(assets.assets);expect(JSON.parse(assets.recordText)).toEqual(r);
 for(const source of ['azure-foundry','fixture',null,'null'])expect(checkedPhotoRecord({...r,source})).toBeNull();
 for(const change of [{model:'anthropic/claude-haiku-4.5'},{promptVersion:'photo-set-observations-v2'},{promptVersion:'isolated-vision-benchmark-v1'},{schemaVersion:1},{model:null}]){
  expect(checkedPhotoRecord({...r,extraction:{...r.extraction,...change}})).toBeNull();expect(groupExtractionEnvelope.safeParse({...result,metadata:{...result.metadata,...change}}).success).toBe(false);
 }
 expect(()=>checkedServerRecord({...r,extraction:{...r.extraction,attemptId:randomUUID()}})).toThrow();
 const calls=s.transport.mock.calls.length;expect((await s.provider().extractGroup(s.request)).processing).toBe('failed');expect(s.transport).toHaveBeenCalledTimes(calls);expect(s.store.unresolved).toBe(2000000);expect(s.store.historical).toBe(27000000);
});
test('compact field states and exact negative-number strings are not repaired or coerced',()=>{
 const v={...wire(),brand:null,classType:'partial text',abv:'-12.5% Alc./Vol.',netContents:'-0.5 L',uncertainties:[{field:'brand' as const,reason:'Visible but unreadable'},{field:'classType' as const,reason:'Edge cropped'}]};
 const e=parseGpt41Wire(v);expect(e.brand.status).toBe('unreadable');expect(e.classType).toMatchObject({status:'uncertain',text:'partial text'});expect(e.origin.status).toBe('missing');expect(e.abv).toMatchObject({status:'readable',text:v.abv});expect(e.netContents.text).toBe(v.netContents);
 for(const change of [{abv:-12.5},{netContents:-0.5},{brand:'null'},{brand:'undefined'},{brand:''},{brand:'  '},{brand:'x\u0000'},{warning:{...wire().warning,headingBold:true}},{uncertainties:[...v.uncertainties,...v.uncertainties]}])expect(()=>parseGpt41Wire({...wire(),...change})).toThrow();
 expect(()=>parseGpt41Wire(null)).toThrow();expect(()=>parseGpt41Wire('null')).toThrow();
});
test.each(['model','provider','native','finish','refusal','extra','malformed','null-string','null-root','http','oversize','redirect'])('strict %s failure retains hold and never retries/falls back',async fault=>{
 const s=await setup(1),d=envelope();s.transport.mockImplementation(async url=>{
  if(url===GPT41_CATALOG_URL)return Response.json(catalog);
  if(fault==='model')d.model='anthropic/claude-haiku-4.5';if(fault==='provider')d.provider='Azure';
  if(fault==='native')d.choices[0].native_finish_reason='length';if(fault==='finish')d.choices[0].finish_reason='length';
  if(fault==='refusal')Object.assign(d.choices[0].message,{refusal:'refused'});if(fault==='extra')Object.assign(d,{verdict:'approved'});
  if(fault==='malformed')d.choices[0].message.content='{';if(fault==='null-string')d.choices[0].message.content=JSON.stringify({...wire(),brand:'null'});
  if(fault==='null-root')return Response.json(null);if(fault==='http')return new Response('bad',{status:429});if(fault==='redirect')return new Response(null,{status:302});if(fault==='oversize')return new Response('x'.repeat(128*1024+1));return Response.json(d);
 });
 expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'provider-failed'});expect(s.transport).toHaveBeenCalledTimes(2);expect(s.store.unresolved).toBe(1000000);expect((await s.provider().extractGroup(s.request)).processing).toBe('failed');expect(s.transport).toHaveBeenCalledTimes(2);
});
test('actual max-two claims: first pair parallel, retained parent + serial remaining, parent completes last',async()=>{
 const s=await setup(4),waiting:(()=>void)[]=[];let peak=0;const original=s.store.claim.bind(s.store),complete=vi.spyOn(s.store,'complete');
 vi.spyOn(s.store,'claim').mockImplementation(async(...args)=>{const n=[...s.store.rows.values()].filter(r=>r.state==='claimed').length;if(n>=2)throw Error('Max2');const result=await original(...args);peak=Math.max(peak,n+1);return result;});
 s.transport.mockImplementation(async url=>{if(url===GPT41_CATALOG_URL)return Response.json(catalog);await new Promise<void>(r=>waiting.push(r));return Response.json(envelope());});
 const pending=s.provider().extractGroup(s.request);await vi.waitFor(()=>expect(waiting).toHaveLength(2));
 expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});
 waiting[0]();waiting[1]();await vi.waitFor(()=>expect(waiting).toHaveLength(3));expect(s.store.rows.get(s.request.reservationId)?.state).toBe('claimed');waiting[2]();await vi.waitFor(()=>expect(waiting).toHaveLength(4));waiting[3]();
 const result=await pending;expect(result.processing).toBe('complete');expect(peak).toBe(2);expect(complete.mock.calls.at(-1)?.[0].reservationId).toBe(s.request.reservationId);expect(s.store.unresolved).toBe(4000000);
 if(result.processing==='complete')expect(result.evidence.photos.map(p=>p.photoId)).toEqual(s.request.photos.map(p=>p.descriptor.photoId));
});
test('failed first photo drains sibling, stops remaining children; abort uncooperative body promptly',async()=>{
 const s=await setup(4),waiting:{resolve:()=>void;reject:()=>void}[]=[];
 s.transport.mockImplementation(async url=>{if(url===GPT41_CATALOG_URL)return Response.json(catalog);await new Promise<void>((resolve,reject)=>waiting.push({resolve,reject:()=>reject(Error('offline'))}));return Response.json(envelope());});
 let done=false;const pending=s.provider().extractGroup(s.request).then(r=>{done=true;return r;});await vi.waitFor(()=>expect(waiting).toHaveLength(2));waiting[0].reject();await new Promise(r=>setTimeout(r,10));expect(done).toBe(false);waiting[1].resolve();expect((await pending).processing).toBe('failed');expect(waiting).toHaveLength(2);
 const one=await setup(1),controller=new AbortController();one.transport.mockImplementation(async url=>url===GPT41_CATALOG_URL?Response.json(catalog):new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));},cancel:()=>new Promise(()=>{})})));
 const aborted=one.provider().extractGroup(one.request,controller.signal);await vi.waitFor(()=>expect(one.transport).toHaveBeenCalledTimes(2));controller.abort();expect((await aborted).processing).toBe('failed');expect(one.store.unresolved).toBe(1000000);
});
test('auth, corrupted bytes, descriptor lies, full historical budget deny before any network',async()=>{
 const s=await setup(1);expect((await createGpt41GroupProvider({...s.deps,authorized:false}).extractGroup(s.request)).processing).toBe('failed');
 for(const apiKey of ['',undefined,'null','undefined'])expect(await createGpt41GroupProvider({...s.deps,apiKey}).extractGroup(s.request)).toEqual({processing:'failed',code:'unconfigured'});
 const bad=structuredClone(s.request);bad.photos[0].image[0]^=255;expect((await s.provider().extractGroup(bad)).processing).toBe('failed');
 s.store.historical=50000000;expect(await s.provider().extractGroup(s.request)).toEqual({processing:'failed',code:'spend-unavailable'});expect(s.transport).not.toHaveBeenCalled();expect(s.store.rows.size).toBe(0);
});
test('Haiku v2/v4 history and Azure v2/v6 history remain exact, never relabeled to selected GPT',async()=>{
 const f=await groupFixture(1),ids=groupAttemptIds(f.input.group.groupId,1);
 for(const tuple of [{source:'openrouter',model:'anthropic/claude-haiku-4.5',promptVersion:'photo-set-observations-v2'},{source:'azure-foundry',model:'mistral-document-ai-2512',promptVersion:'azure-ocr-photo-observations-v1'}]){
  const record=finalizePhotoComparison(f.input.group.application,f.input.group.groupId,1,f.prepared.photos.map(p=>p.descriptor),f.prepared.photoSetSha256,{...f.extraction,metadata:{...f.extraction.metadata,...tuple,...ids}});
  const serialized=JSON.stringify(record);expect(JSON.stringify(checkedServerRecord(JSON.parse(serialized)))).toBe(serialized);
  const old={...record,aggregationVersion:'photo-set-aggregation-v1',...aggregateV1(record.photoEvidence),comparison:compareV4(record.application,record.photoEvidence)};
  if(tuple.source==='openrouter')expect(JSON.stringify(checkedServerRecord(old))).toBe(JSON.stringify(old));else expect(checkedPhotoRecord(old)).toBeNull();
 }
});
