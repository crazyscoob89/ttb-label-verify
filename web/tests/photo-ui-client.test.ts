import {afterEach, expect, test, vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {photoSetCanonical,type PhotoDescriptor} from '../lib/photo-contracts';
import fixtures from './fixtures/comparisons.json';
import {parseApplication} from '../lib/contracts';
import {prepareLiveGroup, executeLiveGroup, type PhotoGroupDeclaration} from '../lib/live-photo-client';
import {buildBatchManifest} from '../lib/batch-manifest';
const application=parseApplication(fixtures.application), code='synthetic-test-only';
function input(){const files=[new File(['front'],'front.png',{type:'image/png'}),new File(['back'],'back.png',{type:'image/png'})]; const group:PhotoGroupDeclaration={schemaVersion:2,groupId:randomUUID(),revision:1,application,photos:files.map((file,i)=>({photoId:randomUUID(),filename:file.name,role:i?'back':'front',mime:'image/png',bytes:file.size}))}; return {files,group};}
function prepared(group:PhotoGroupDeclaration){const photos:PhotoDescriptor[]=group.photos.map((p,i)=>({...p,sourceSha256:String(i+1).repeat(64),normalized:{sha256:'c'.repeat(64),bytes:10,mime:'image/png',width:1,height:1}}));const photoSetSha256=createHash('sha256').update(photoSetCanonical(photos)).digest('hex');return {schemaVersion:2,groupId:group.groupId,revision:group.revision,photoSetSha256,photos,attemptId:randomUUID(),reservationId:randomUUID(),binding:photoSetSha256+'.'+'b'.repeat(64)};}
afterEach(()=>vi.unstubAllEnvs());
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
