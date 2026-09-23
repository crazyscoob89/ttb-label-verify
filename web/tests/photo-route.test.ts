import {test,expect,vi,afterEach} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {groupInput,photoEvidence} from './fixtures/photo-groups';
import {createDemoHandler} from '../lib/demo-route';
import {createUploadHandler} from '../lib/upload-route';
import {createHostedInputReader} from '../lib/hosted-media';
import {signGroupUploadTicket,verifyGroupUploadTicket} from '../lib/group-media';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import type {DemoSpendStore,DemoStoreFactory} from '../lib/demo-store-contracts';
import {mediaSigningSecret} from '../lib/runtime-env';
import {prepareLiveGroup,executeLiveGroup,photoRecord} from '../lib/live-photo-client';
import {bottleIncident,incidentSources,reportedWarning} from './fixtures/bottle-incident';
import {comparePhotoApplication} from '../lib/group-rules';
import {readable} from './fixtures/jose-cuervo';
import type {preparePhotoGroup} from '../lib/intake';
const env={TTB_PERSISTENCE:'supabase',TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'demo-only-secret-0123456789abcdef0123456789',TTB_MEDIA_SIGNING_SECRET:'media-only-secret-0123456789abcdef0123456789',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'offline-service-role',TTB_SUPABASE_UPLOAD_BUCKET:'uploads',TTB_SUPABASE_EVIDENCE_BUCKET:'evidence',OPENROUTER_API_KEY:'offline-key'};
const headers={origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET};
function spendStore(){const base=new OfflineSpendStore();base.ceiling=25_000_000;const store=Object.assign(base,{acquireWork:vi.fn(),releaseWork:vi.fn(),hasIntent:async(a:string,r:string)=>base.attempts.has(a)||base.rows.has(r),close:vi.fn()}) satisfies DemoSpendStore;return store;}
async function formRequest(input:Awaited<ReturnType<typeof groupInput>>,operation:unknown,mutate?:(f:FormData)=>void){
 const form=new FormData();form.append('group',JSON.stringify(input.group));form.append('operation',JSON.stringify(operation));for(const f of input.files)form.append(`photo:${f.photoId}`,new Blob([new Uint8Array(f.image.bytes)],{type:f.image.mime}),f.image.filename);mutate?.(form);return new Request(env.TTB_DEMO_ORIGIN+'/api/comparisons',{method:'POST',headers,body:form});
}
function setup(observe=photoEvidence){
 const store=spendStore(),saved=vi.fn(async():Promise<string>=>randomUUID());
 const reviews={snapshot:vi.fn(),snapshotGroup:saved,save:vi.fn(),list:vi.fn(),detail:vi.fn(),evidence:vi.fn(),close:vi.fn()};const stores:DemoStoreFactory={openSpend:()=>store,openReviews:()=>reviews};
 const transport=vi.fn(async(url:string,init:RequestInit)=>{
  if(url.endsWith('/models'))return Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]});
  const body=JSON.parse(String(init.body));const ids=body.messages[1].content.filter((c:{type:string})=>c.type==='text').map((c:{text:string})=>JSON.parse(c.text).photoId);
  return Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(observe(ids))}}]});
 });return {store,transport,saved,handler:createDemoHandler({env,stores,transport}),stores};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

async function clientBottleRoundTrip(input:Parameters<typeof preparePhotoGroup>[0],raw:ReturnType<typeof photoEvidence>){
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');vi.stubGlobal('fetch',()=>{throw Error('External network forbidden in offline regression');});
 const s=setup(ids=>{expect(ids).toEqual(raw.photos.map(p=>p.photoId));return structuredClone(raw);});
 const transport:typeof fetch=async(url,init)=>{const h=new Headers(init?.headers);h.set('origin',env.TTB_DEMO_ORIGIN);return s.handler(new Request(new URL(String(url),env.TTB_DEMO_ORIGIN),{...init,headers:h}));};
 const files=input.files.map(p=>new File([new Uint8Array(p.image.bytes)],p.image.filename,{type:p.image.mime}));
 const ready=await prepareLiveGroup(input.group,files,env.TTB_DEMO_ACCESS_SECRET,AbortSignal.timeout(10000),transport);
 const response=await executeLiveGroup(ready,env.TTB_DEMO_ACCESS_SECRET,AbortSignal.timeout(10000),transport);
 if(response.result.processing!=='complete')throw Error('Expected complete group');
 const record=photoRecord(response.result);if(!record)throw Error('Expected photo record');
 expect(record.comparison.rulesRevision).toBe(6);expect(record.aggregationVersion).toBe('photo-set-aggregation-v2');
 expect(record.photoEvidence).toEqual(raw);expect(s.saved).toHaveBeenCalledTimes(1);
 expect(response.reviewAvailability).toBe('available');expect(s.transport.mock.calls.filter(([url])=>url.endsWith('/chat/completions'))).toHaveLength(1);
 return record;
}
test.each([false,true])('reported bottle incident through real adapter/route/client; fictional=%s',async fictional=>{
 const f=bottleIncident(fictional),input=await groupInput();input.group.application=f.application;
 f.evidence.photos.forEach((p,i)=>p.photoId=input.group.photos[i].photoId);
 const record=await clientBottleRoundTrip(input,f.evidence);
 for(const key of ['brand','classType','netContents','origin'] as const)expect(record.comparison.fields[key].status).toBe('match');
 for(const key of ['abv','producer','warning'] as const)expect(record.comparison.fields[key].status).toBe('needs-review');
 expect(record.provenance.origin.conflict).toBe(false);expect(record.provenance.origin.sourcePhotoIds).toEqual(input.group.photos.map(p=>p.photoId));
 expect(record.evidence.classType.text).toBe('Tequila Gold');expect(record.evidence.warning.heading.text).toBe('GOVERNMENT WARNING:');
 expect(record.evidence.warning.body.text).toBe(reportedWarning.slice('GOVERNMENT WARNING: '.length));
 expect(record.evidence.warning.bodyBold).toBeNull();expect(record.photoEvidence.photos[1].evidence.warning.body.text).toBeNull();
 expect(record.provenance['warning.body'].derivations).toEqual([{photoId:input.group.photos[1].photoId,sourcePath:'warning.heading',operation:'split-visible-warning-prefix'}]);
 expect(record.comparison.physicalPrintSize.status).toBe('unverified');
});
test('different-name fixture does not grant unsupported origin, subtype, warning or entity policies',()=>{
 const f=bottleIncident(true),compare=()=>comparePhotoApplication(f.application,f.evidence);
 for(const p of f.evidence.photos)p.evidence.origin=readable('IMPORTED FROM MEXICO');expect(compare().fields.origin.status).toBe('needs-review');
 f.application.classType='Vodka';expect(compare().fields.classType.status).toBe('mismatch');f.application.classType='Tequila Silver';expect(compare().fields.classType.status).toBe('mismatch');
 const w=f.evidence.photos[1].evidence.warning;w.heading=readable(reportedWarning.replace('SHOULD NOT','SHOULD'));expect(compare().fields.warning.status).toBe('mismatch');
 w.heading=readable(reportedWarning.replace('GOVERNMENT WARNING:','Government Warning:'));expect(compare().fields.warning.status).toBe('mismatch');
 w.heading=readable(reportedWarning);w.headingBold=false;expect(compare().fields.warning.status).toBe('mismatch');
 for(const p of f.evidence.photos)p.evidence.producer.name=readable('UNRELATED IMPORTER');expect(compare().fields.producer.status).not.toBe('match');
});
const groundTruthPath=process.env.TTB_BOTTLE_GROUND_TRUTH;
test.skipIf(!groundTruthPath)('exact local JPEG hashes and independent ground truth traverse real route/client without a provider call',async()=>{
 const truth=JSON.parse(readFileSync(groundTruthPath!,'utf8'));
 expect(truth.inputs.map((p:{sha256:string})=>p.sha256)).toEqual([...incidentSources.map(p=>p.sha256),'b48880a234fccaa6531bac97794baf26cece5e41fbcd6f2c4fbd2cdbf7340e43']);
 for(const source of truth.inputs)expect(createHash('sha256').update(readFileSync(source.path)).digest('hex')).toBe(source.sha256);
 const f=bottleIncident(),files=incidentSources.map((p,i)=>({photoId:f.evidence.photos[i].photoId,image:{filename:p.filename,mime:'image/jpeg' as const,bytes:readFileSync(truth.inputs[i].path)}}));
 const group={schemaVersion:2 as const,groupId:randomUUID(),revision:1,application:f.application,photos:files.map((p,i)=>({photoId:p.photoId,filename:p.image.filename,mime:p.image.mime,bytes:p.image.bytes.length,role:incidentSources[i].role}))};
 const reported=await clientBottleRoundTrip({schemaVersion:2,group,files},f.evidence);
 expect(reported.photos.map(p=>p.sourceSha256)).toEqual(incidentSources.map(p=>p.sha256));expect(reported.photos.map(p=>p.bytes)).toEqual(incidentSources.map(p=>p.bytes));
 // Separate inspection-style mock, explicitly not proof of future model accuracy.
 const front=f.evidence.photos[0].evidence,back=f.evidence.photos[1].evidence;
 front.abv=readable(truth.fields.abv.front);front.producer.name=readable('FABRICA LA ROJENA');
 back.abv={status:'missing',text:null,reason:'No ABV visible in inspected back view.'};back.producer.name=readable(truth.fields.producer.back.establishmentName);back.producer.address=readable(truth.fields.producer.back.address);
 back.warning={heading:readable(truth.fields.warning.backHeading),body:readable(truth.fields.warning.backBody),headingBold:truth.fields.warning.headingBold,bodyBold:truth.fields.warning.bodyBoldPreferred};
 const inspected=await clientBottleRoundTrip({schemaVersion:2,group:{...group,groupId:randomUUID()},files},f.evidence);
 for(const key of ['brand','classType','abv','netContents','origin','warning'] as const)expect(inspected.comparison.fields[key].status).toBe('match');
 expect(inspected.comparison.fields.producer.status).toBe('needs-review');expect(inspected.comparison.physicalPrintSize.status).toBe('unverified');
});
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
 const op={phase:'execute',attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};const response=await s.handler(await formRequest(input,op));expect(response.status).toBe(200);expect(await response.json()).toMatchObject({result:{recordVersion:2,aggregationVersion:'photo-set-aggregation-v2',comparison:{rulesRevision:6}},reviewAvailability:'available',comparisonId:expect.any(String)});
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
