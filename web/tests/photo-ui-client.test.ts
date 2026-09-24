import {afterEach, expect, test, vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {photoSetCanonical,type PhotoDescriptor} from '../lib/photo-contracts';
import fixtures from './fixtures/comparisons.json';
import {parseApplication} from '../lib/contracts';
import {prepareLiveGroup, executeLiveGroup,loadReviewPhotoEvidence, type PhotoGroupDeclaration} from '../lib/live-photo-client';
import {createBatchState,transitionBatch,type DispatchCommand} from '../lib/batch-state';
import {preparedGroupSchema} from '../lib/photo-contracts';
import {buildBatchManifest} from '../lib/batch-manifest';
import {groupFixture} from './fixtures/photo-groups';
const application=parseApplication(fixtures.application), code='synthetic-test-only';
function input(){const files=[new File(['front'],'front.png',{type:'image/png'}),new File(['back'],'back.png',{type:'image/png'})]; const group:PhotoGroupDeclaration={schemaVersion:2,groupId:randomUUID(),revision:1,application,photos:files.map((file,i)=>({photoId:randomUUID(),filename:file.name,role:i?'back':'front',mime:'image/png',bytes:file.size}))}; return {files,group};}
function prepared(group:PhotoGroupDeclaration){const photos:PhotoDescriptor[]=group.photos.map((p,i)=>({...p,sourceSha256:String(i+1).repeat(64),normalized:{sha256:'c'.repeat(64),bytes:10,mime:'image/png',width:1,height:1}}));const photoSetSha256=createHash('sha256').update(photoSetCanonical(photos)).digest('hex');return {schemaVersion:2,groupId:group.groupId,revision:group.revision,photoSetSha256,photos,attemptId:randomUUID(),reservationId:randomUUID(),binding:photoSetSha256+'.'+'b'.repeat(64)};}
afterEach(()=>vi.unstubAllEnvs());
test('client admits actual replayable group and rejects invented findings/provenance before render',async()=>{
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');const f=await groupFixture();
 const files=f.input.files.map(p=>new File([new Uint8Array(p.image.bytes)],p.image.filename,{type:p.image.mime}));
 const p=preparedGroupSchema.parse({...prepared(f.input.group),photos:f.record.photos,photoSetSha256:f.record.photoSetSha256,binding:f.record.photoSetSha256+'.'+'b'.repeat(64)});
 const ready={group:f.input.group,files,prepared:p};
 const valid=vi.fn<typeof fetch>().mockResolvedValue(Response.json({result:f.record}));expect((await executeLiveGroup(ready,code,AbortSignal.timeout(5000),valid)).result).toEqual(f.record);
 for(const [rulesRevision,aggregationVersion] of [[4,'photo-set-aggregation-v1'],[6,'photo-set-aggregation-v1'],[4,'photo-set-aggregation-v2'],[7,'photo-set-aggregation-v2'],[6,'photo-set-aggregation-v3'],[undefined,undefined]] as const){
  const unsupported={...f.record,aggregationVersion,comparison:{...f.record.comparison,rulesRevision}};
  await expect(executeLiveGroup(ready,code,AbortSignal.timeout(5000),vi.fn<typeof fetch>().mockResolvedValue(Response.json({result:unsupported})))).rejects.toThrow('invalid-extraction');
 }
 const forged=structuredClone(f.record);forged.comparison.fields.brand.reasons=['Invented explanation not produced by the evaluator.'];
 await expect(executeLiveGroup(ready,code,AbortSignal.timeout(5000),vi.fn<typeof fetch>().mockResolvedValue(Response.json({result:forged})))).rejects.toThrow('invalid-extraction');
 const badDigest={...f.record,photoSetSha256:'a'.repeat(64)};await expect(executeLiveGroup(ready,code,AbortSignal.timeout(5000),vi.fn<typeof fetch>().mockResolvedValue(Response.json({result:badDigest})))).rejects.toThrow('invalid-extraction');
});
test('local group sends exact identified files in prepare then one execute, reusing server IDs',async()=>{
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');const {files,group}=input(), p=prepared(group);const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({prepared:p})).mockResolvedValueOnce(Response.json({result:{processing:'failed',code:'provider-failed'}}));
 const ready=await prepareLiveGroup(group,files,code,AbortSignal.timeout(5000),transport);await executeLiveGroup(ready,code,AbortSignal.timeout(5000),transport);
 expect(transport).toHaveBeenCalledTimes(2);for(const [,init] of transport.mock.calls){const body=init!.body as FormData;expect(JSON.parse(String(body.get('group')))).toEqual(group);expect([...body.keys()]).toEqual(['group','operation',...group.photos.map(p=>'photo:'+p.photoId)]);expect(new Headers(init!.headers).has('x-ttb-batch-intent')).toBe(false);}
 expect(JSON.parse(String((transport.mock.calls[1][1]!.body as FormData).get('operation')))).toEqual({phase:'execute',attemptId:p.attemptId,reservationId:p.reservationId,binding:p.binding});
});
test('invalid photo count, missing file, declaration mutation and crossed preparation reject whole group',async()=>{
 const {files,group}=input(), transport=vi.fn<typeof fetch>();
 for(const bad of [{...group,photos:[]},{...group,photos:Array(5).fill(group.photos[0])},{...group,photos:group.photos.map(p=>({...p,bytes:999}))}])await expect(prepareLiveGroup(bad,files,code,AbortSignal.timeout(5000),transport)).rejects.toThrow();
 await expect(prepareLiveGroup(group,files.slice(0,1),code,AbortSignal.timeout(5000),transport)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 transport.mockResolvedValueOnce(Response.json({prepared:{...prepared(group),revision:2}}));await expect(prepareLiveGroup(group,files,code,AbortSignal.timeout(5000),transport)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(1);
});
test('grouped manifest joins one bottle to two photos and blocks cross-group references without poisoning unrelated bottle',()=>{
 const {files,group}=input();const other={groupId:randomUUID(),application:{...application,applicationId:'OTHER'},photos:[{photoId:randomUUID(),filename:'other.png',role:'other'}]};
 const mapping={schemaVersion:2,groups:[{groupId:group.groupId,application,photos:group.photos.map(({photoId,filename,role})=>({photoId,filename,role}))},other]};const declarations=[...files,new File(['other'],'other.png',{type:'image/png'})].map(f=>({filename:f.name,imageSha256:null}));
 const manifest=buildBatchManifest(declarations,mapping,{live:true});expect(manifest.counts).toEqual({total:2,valid:2,blocked:0});expect(manifest.entries[0]).toMatchObject({groupId:group.groupId,photos:mapping.groups[0].photos});
 const duplicate={...mapping,groups:[mapping.groups[0],{...mapping.groups[0],groupId:randomUUID()},other]};const bad=buildBatchManifest(declarations,duplicate,{live:true});expect(bad.counts).toEqual({total:3,valid:1,blocked:2});
});
test('hosted group uses one issuance, exact credential-free PUTs and one prepare/execute; partial upload never compares',async()=>{
 const {files,group}=input(),p=prepared(group),origin='https://synthetic.supabase.co';vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','supabase-v1');vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin);
 const uploads=group.photos.map(photo=>({photoId:photo.photoId,uploadUrl:`${origin}/storage/v1/object/upload/sign/ttb-uploads/uploads/${photo.photoId}?token=synthetic`})),ticket='one-group-ticket';
 const transport=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({schemaVersion:2,ticket,uploads})).mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(Response.json({prepared:p})).mockResolvedValueOnce(Response.json({result:{processing:'failed',code:'provider-failed'}}));
 const stages:unknown[]=[];const ready=await prepareLiveGroup(group,files,code,AbortSignal.timeout(5000),transport,s=>stages.push(s));await executeLiveGroup(ready,code,AbortSignal.timeout(5000),transport,s=>stages.push(s));
 expect(transport).toHaveBeenCalledTimes(5);for(const index of [1,2]){const request=transport.mock.calls[index][1]!;expect(request.body).toBe(files[index-1]);expect(new Headers(request.headers).has('x-ttb-demo-code')).toBe(false);expect(request.credentials).toBe('omit');}
 expect(JSON.parse(String(transport.mock.calls[3][1]!.body))).toEqual({schemaVersion:2,phase:'prepare',ticket});expect(JSON.parse(String(transport.mock.calls[4][1]!.body))).toEqual({schemaVersion:2,phase:'execute',ticket,attemptId:p.attemptId,reservationId:p.reservationId,binding:p.binding});expect(stages).toHaveLength(6);
 transport.mockReset().mockResolvedValueOnce(Response.json({schemaVersion:2,ticket,uploads})).mockResolvedValueOnce(Response.json({ok:true})).mockResolvedValueOnce(new Response(null,{status:503}));await expect(prepareLiveGroup(group,files,code,AbortSignal.timeout(5000),transport)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(3);
});
test('saved photo selector verifies original bytes, MIME and digest and never substitutes another variant',async()=>{
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');const {group}=input(),p=prepared(group).photos[1],bytes=new TextEncoder().encode('saved original');p.bytes=bytes.length;p.sourceSha256=createHash('sha256').update(bytes).digest('hex');
 const id=randomUUID(),transport=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(bytes,{headers:{'content-type':'image/png'}}));expect(await(await loadReviewPhotoEvidence(id,p,'original',code,AbortSignal.timeout(5000),transport)).text()).toBe('saved original');expect(transport.mock.calls[0][0]).toBe(`/api/reviews/${id}/photos/${p.photoId}/original/evidence`);
 transport.mockReset().mockResolvedValueOnce(new Response(bytes,{headers:{'content-type':'image/png'}}));await expect(loadReviewPhotoEvidence(id,{...p,bytes:p.bytes+1},'original',code,AbortSignal.timeout(5000),transport)).rejects.toThrow('evidence-integrity-mismatch');expect(transport).toHaveBeenCalledTimes(1);
});
test('secondary role edits invalidate whole grouped state, reject stale preparation/settlement, and empty draft blocks dispatch',()=>{
 const {files,group}=input(),manifest=buildBatchManifest(files.map(file=>({filename:file.name,imageSha256:null})),{schemaVersion:2,groups:[{groupId:group.groupId,application,photos:group.photos.map(({photoId,filename,role})=>({photoId,filename,role}))}]},{live:true});
 const state=createBatchState(manifest,{batchId:randomUUID(),live:true}),dispatched=transitionBatch(state,{type:'dispatch',pairId:state.selectedId,attemptId:randomUUID(),reservationId:randomUUID()}),command=dispatched.commands[0] as DispatchCommand;
 const p=preparedGroupSchema.parse(prepared(group)),ready=transitionBatch(dispatched.state,{type:'prepared-group',token:command.token,prepared:p});expect(ready.rejected).toBeNull();
 const edited=transitionBatch(ready.state,{type:'replace-group',pairId:state.selectedId,application,photos:command.group!.photos.map((p,i)=>i?{...p,role:'closeup'}:p)});expect(edited.state.pairs[0]).toMatchObject({revision:2,preparedGroup:null,record:null,intent:null,draft:null,pendingSave:null});expect(edited.state.inFlight).toHaveLength(1);
 expect(transitionBatch(edited.state,{type:'prepared-group',token:command.token,prepared:p}).rejected).not.toBeNull();const settled=transitionBatch(edited.state,{type:'settle',token:command.token,result:{processing:'failed',code:'provider-failed'}});expect(settled.state.pairs[0].processing).toBe('queued');expect(settled.state.inFlight).toHaveLength(0);
 const empty=transitionBatch(settled.state,{type:'replace-group',pairId:state.selectedId,application,photos:[]});expect(empty.state.pairs[0].processing).toBe('blocked');expect(transitionBatch(empty.state,{type:'dispatch',pairId:state.selectedId,attemptId:randomUUID(),reservationId:randomUUID()}).commands).toHaveLength(0);
});
