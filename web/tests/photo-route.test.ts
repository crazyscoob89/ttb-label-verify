import {test,expect,vi,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {groupInput,photoEvidence} from './fixtures/photo-groups';
import {createDemoHandler} from '../lib/demo-route';
import {createUploadHandler} from '../lib/upload-route';
import {createHostedInputReader} from '../lib/hosted-media';
import {signGroupUploadTicket,verifyGroupUploadTicket} from '../lib/group-media';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import type {DemoSpendStore,DemoStoreFactory} from '../lib/demo-store-contracts';
import {mediaSigningSecret} from '../lib/runtime-env';
const env={TTB_PERSISTENCE:'supabase',TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'demo-only-secret-0123456789abcdef0123456789',TTB_MEDIA_SIGNING_SECRET:'media-only-secret-0123456789abcdef0123456789',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'offline-service-role',TTB_SUPABASE_UPLOAD_BUCKET:'uploads',TTB_SUPABASE_EVIDENCE_BUCKET:'evidence',OPENROUTER_API_KEY:'offline-key'};
const headers={origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET};
function spendStore(){const base=new OfflineSpendStore();base.ceiling=25_000_000;const store=Object.assign(base,{acquireWork:vi.fn(),releaseWork:vi.fn(),hasIntent:async(a:string,r:string)=>base.attempts.has(a)||base.rows.has(r),close:vi.fn()}) satisfies DemoSpendStore;return store;}
async function formRequest(input:Awaited<ReturnType<typeof groupInput>>,operation:unknown,mutate?:(f:FormData)=>void){
 const form=new FormData();form.append('group',JSON.stringify(input.group));form.append('operation',JSON.stringify(operation));for(const f of input.files)form.append(`photo:${f.photoId}`,new Blob([new Uint8Array(f.image.bytes)],{type:f.image.mime}),f.image.filename);mutate?.(form);return new Request(env.TTB_DEMO_ORIGIN+'/api/comparisons',{method:'POST',headers,body:form});
}
function setup(){
 const store=spendStore(),saved=vi.fn(async():Promise<string>=>randomUUID());
 const reviews={snapshot:vi.fn(),snapshotGroup:saved,save:vi.fn(),list:vi.fn(),detail:vi.fn(),evidence:vi.fn(),close:vi.fn()};const stores:DemoStoreFactory={openSpend:()=>store,openReviews:()=>reviews};
 const transport=vi.fn(async(url:string,init:RequestInit)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
  const body=JSON.parse(String(init.body));const ids=body.messages[1].content.filter((c:{type:string})=>c.type==='text').map((c:{text:string})=>JSON.parse(c.text).photoId);
  return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(photoEvidence(ids))}}]});
 });return {store,transport,saved,handler:createDemoHandler({env,stores,transport}),stores};
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
test('concurrent execute for one revision returns one success and one409, one paid POST',async()=>{
 const input=await groupInput(),s=setup();const {prepared}=await(await s.handler(await formRequest(input,{phase:'prepare'}))).json();
 const op={phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};
 const responses=await Promise.all([s.handler(await formRequest(input,op)),s.handler(await formRequest(input,op))]);
 expect(responses.map(r=>r.status).sort()).toEqual([200,409]);expect(s.transport.mock.calls.filter(([url])=>url.endsWith('/chat/completions'))).toHaveLength(1);
});
test('whole-route deadline bounds a stalled hosted read and cancels its signal without spend',async()=>{
 vi.useFakeTimers();const s=setup();let readSignal:AbortSignal|undefined;
 const handler=createDemoHandler({env,stores:s.stores,transport:s.transport,readInput:async(_request,signal)=>{readSignal=signal;return new Promise(()=>{});}});
 const pending=handler(new Request(env.TTB_DEMO_ORIGIN+'/api/comparisons',{method:'POST',headers}));await vi.advanceTimersByTimeAsync(50001);const response=await pending;
 expect(response.status).toBe(408);expect(readSignal?.aborted).toBe(true);expect(s.transport).not.toHaveBeenCalled();expect(s.store.rows.size).toBe(0);
});
test('snapshot deadline returns full UNSAVED result and ignores a late completion',async()=>{
 const input=await groupInput(),s=setup();const {prepared}=await(await s.handler(await formRequest(input,{phase:'prepare'}))).json();
 let finish!:(id:string)=>void,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
 s.saved.mockImplementationOnce(()=>{entered();return new Promise<string>(resolve=>finish=resolve);});
 const request=await formRequest(input,{phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding});
 vi.useFakeTimers();const pending=s.handler(request);await started;await vi.advanceTimersByTimeAsync(10001);
 const response=await pending;const result=await response.json();expect(result.result.photos).toHaveLength(2);expect(result.comparisonId).toBeUndefined();expect(result.reviewAvailability).toBe('snapshot-unavailable');
 finish(randomUUID());await vi.advanceTimersByTimeAsync(1);expect(result.comparisonId).toBeUndefined();
});
test('local v2 prepare/execute round trip: no prepare spend, one joint extraction, all media saved, duplicate identity409',async()=>{
 const input=await groupInput(4),s=setup();const prep=await s.handler(await formRequest(input,{phase:'prepare'}));expect(prep.status).toBe(200);const {prepared}=await prep.json();expect(prepared.photos).toHaveLength(4);expect(s.store.rows.size).toBe(0);expect(s.transport).not.toHaveBeenCalled();
 const op={phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};const response=await s.handler(await formRequest(input,op));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({result:{recordVersion:2,comparison:{rulesRevision:4}},reviewAvailability:'available',comparisonId:expect.any(String)});
 expect(s.transport).toHaveBeenCalledTimes(2);expect(s.saved.mock.calls[0]).toHaveLength(3);expect((s.saved.mock.calls[0] as unknown[])[1]).toHaveLength(4);
 expect((await s.handler(await formRequest(input,op))).status).toBe(409);expect(s.transport).toHaveBeenCalledTimes(2);
});
test.each(['missing','extra','size','role','revision','application','fabricated-id'])('invalid %s group fails before provider reservation',async bad=>{
 const input=await groupInput(),s=setup();const {prepared}=await(await s.handler(await formRequest(input,{phase:'prepare'}))).json();const op={phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};
 if(bad==='size')input.group.photos[1].bytes++;if(bad==='role')input.group.photos[1].role='back';if(bad==='revision')input.group.revision++;if(bad==='application')input.group.application.brand='Changed';if(bad==='fabricated-id')op.attemptId=randomUUID();
 const request=await formRequest(input,op,f=>{if(bad==='missing')f.delete(`photo:${input.files[1].photoId}`);if(bad==='extra')f.append('image',new Blob(['x']),'extra.png');});
 expect((await s.handler(request)).status).toBe(400);expect(s.store.rows.size).toBe(0);expect(s.transport).not.toHaveBeenCalled();
});
test('failed group snapshot keeps paid result whole and UNSAVED',async()=>{
 const input=await groupInput(),s=setup();s.saved.mockRejectedValueOnce(Error('secondary object unavailable'));
 const {prepared}=await(await s.handler(await formRequest(input,{phase:'prepare'}))).json();const response=await s.handler(await formRequest(input,{phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding}));const result=await response.json();expect(result.result.photos).toHaveLength(2);expect(result.reviewAvailability).toBe('snapshot-unavailable');expect(result.comparisonId).toBeUndefined();
});
test('hosted issuance atomically reserves all declarations and returns one ticket; exact source reads',async()=>{
 const input=await groupInput(),quota={reserve:vi.fn(),reserveGroup:vi.fn(async()=>{})};
 const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
  const path=new URL(String(url)).pathname;if(path.includes('/object/upload/sign/'))return Response.json({url:path.replace('/storage/v1','')+'?token=offline'});
  const ticket=lastTicket!;const data=verifyGroupUploadTicket(ticket,env);const index=data.objects.findIndex(o=>path.endsWith(o.key));return new Response(new Uint8Array(input.files[index].image.bytes),{headers:{'content-type':'image/png'}});
 });let lastTicket:string|undefined;vi.stubGlobal('fetch',fetcher);
 const req=new Request(env.TTB_DEMO_ORIGIN+'/api/uploads',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(input.group)});
 const response=await createUploadHandler({env,quota})(req);expect(response.status).toBe(200);const data=await response.json();lastTicket=data.ticket;expect(data.uploads.map((p:{photoId:string})=>p.photoId)).toEqual(input.group.photos.map(p=>p.photoId));expect(quota.reserveGroup).toHaveBeenCalledTimes(1);expect(quota.reserve).not.toHaveBeenCalled();
 const request=()=>new Request(env.TTB_DEMO_ORIGIN+'/api/comparisons',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({schemaVersion:2,phase:'prepare',ticket:data.ticket})});
 const read=await createHostedInputReader(env)(request());expect('schemaVersion' in read).toBe(true);if('schemaVersion' in read)expect(read.files.map(f=>f.image.bytes)).toEqual(input.files.map(f=>f.image.bytes));
 const mixed=request();mixed.headers.set('x-ttb-batch-phase','prepare');await expect(createHostedInputReader(env)(mixed)).rejects.toThrow();
 const parsed=verifyGroupUploadTicket(data.ticket,env);expect(()=>signGroupUploadTicket(input.group,parsed.objects.slice(1),env)).toThrow();expect(()=>verifyGroupUploadTicket(data.ticket,{...env,TTB_MEDIA_SIGNING_SECRET:env.TTB_DEMO_ACCESS_SECRET})).toThrow();expect(mediaSigningSecret(env)).not.toBe(env.TTB_DEMO_ACCESS_SECRET);
});
