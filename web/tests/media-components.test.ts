import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { createHash } from 'node:crypto';
import {photoSetCanonical,type PhotoGroupDeclaration,type PhotoDescriptor} from '../lib/photo-contracts';
import {compareApplication} from '../lib/rules';
import {parseApplication} from '../lib/contracts';
import PhotoInput from '../components/PhotoInput';
import fixtures from './fixtures/comparisons.json';
// Exercise the actual component callbacks with a tiny deterministic hook host.
// No DOM package, server, database, real Storage or paid provider is involved.
const hooks=vi.hoisted(()=>({values:[] as unknown[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<typeof import('react')>('react');
 return {...actual,useCallback:(callback:unknown)=>callback,useState:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.values))hooks.values[index]=typeof initial==='function'?initial():initial;return [hooks.values[index],(value:unknown)=>{hooks.values[index]=typeof value==='function'?value(hooks.values[index]):value;}];},
 useRef:(initial:unknown)=>{const index=hooks.cursor++;if(!(index in hooks.values))hooks.values[index]={current:initial};return hooks.values[index];},useEffect:()=>{}};
});
vi.mock('../components/SessionAccess',()=>({useSessionAccess:()=>({code:'synthetic-code',reviewEpoch:0})}));
import PairInput from '../components/PairInput';
import SavedReviewHistory from '../components/SavedReviewHistory';
type Element=ReactElement<Record<string,unknown>>;
function nodes(value:ReactNode):Element[]{
 if(Array.isArray(value))return value.flatMap(nodes);
 if(!value||typeof value!=='object'||!('props' in value))return [];
 const element=value as Element;return [element,...nodes(element.props.children as ReactNode)];
}
function render(component:()=>ReactNode){hooks.cursor=0;return nodes(component());}
function node(tree:Element[],type:string,label?:string){const found=tree.find(n=>n.type===type&&(!label||JSON.stringify(n.props.children).includes(label)));if(!found)throw Error('missing control');return found;}
const origin='https://synthetic-ref.supabase.co',uploadUrl=origin+'/storage/v1/object/upload/sign/ttb-uploads/uploads/00000000-0000-4000-8000-000000000001?token=synthetic';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{hooks.values=[];hooks.cursor=0;vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','supabase-v1');vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin);vi.stubGlobal('requestAnimationFrame',()=>0);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
function formEvent(live=true){
 const form=new FormData();for(const [key,value] of Object.entries(fixtures.application))if(key!=='origin')form.set(key,String(value));
 form.set('originKind',fixtures.application.origin.kind);form.set('country',fixtures.application.origin.country);form.set('image',new File(['synthetic'],'label.png',{type:'image/png'}));form.set('accessCode','synthetic-code');
 const Native=FormData;vi.stubGlobal('FormData',class extends Native{constructor(input?:FormData){super();if(input)for(const [key,value] of input.entries())this.set(key,value);}});
 return {preventDefault(){},nativeEvent:{submitter:{getAttribute:()=>live?'live':null}},currentTarget:form};
}
function selected(){const tree=render(PairInput),picker=tree.find(n=>n.type===PhotoInput)!;(picker.props.onChange as (v:unknown)=>void)([{photoId:id,file:new File(['synthetic'],'label.png',{type:'image/png'}),role:'other',url:'blob:synthetic-local-preview'}]);}
function groupTransport(){let group:PhotoGroupDeclaration;return vi.fn<typeof fetch>(async(url,init)=>{if(url==='/api/uploads'){group=JSON.parse(String(init?.body));return Response.json({schemaVersion:2,ticket:'signed-ticket',uploads:[{photoId:group.photos[0].photoId,uploadUrl}]});}if(String(url).startsWith(origin))return Response.json({Key:'ok'});if(JSON.parse(String(init?.body)).phase==='execute')throw Error('lost paid response');const photos:PhotoDescriptor[]=group!.photos.map(p=>({...p,sourceSha256:'a'.repeat(64),normalized:{sha256:'b'.repeat(64),bytes:9,mime:'image/png',width:1,height:1}})),photoSetSha256=createHash('sha256').update(photoSetCanonical(photos)).digest('hex');return Response.json({prepared:{schemaVersion:2,groupId:group!.groupId,revision:group!.revision,photos,photoSetSha256,attemptId:id,reservationId:id,binding:photoSetSha256+'.'+'a'.repeat(64)}});});}
test('PairInput local check never uploads; actual live handler uses group ticket and does not retry lost paid response',async()=>{
 const fetcher=groupTransport();vi.stubGlobal('fetch',fetcher);selected();
 const submit=node(render(PairInput),'form').props.onSubmit as (event:unknown)=>Promise<void>;
 await submit(formEvent(false));expect(fetcher).not.toHaveBeenCalled();
 await submit(formEvent());expect(fetcher).toHaveBeenCalledTimes(4);expect(fetcher.mock.calls[2][0]).toBe('/api/comparisons');expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({schemaVersion:2,phase:'prepare',ticket:'signed-ticket'});
 expect(JSON.stringify(render(PairInput))).toContain('No automatic retry');
});
test('PairInput synchronously fences duplicate submission while hosted upload is in flight',async()=>{
 const fetcher=groupTransport();vi.stubGlobal('fetch',fetcher);selected();
 const submit=node(render(PairInput),'form').props.onSubmit as (event:unknown)=>Promise<void>,event=formEvent();
 await Promise.all([submit(event),submit(event)]);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/comparisons')).toHaveLength(2);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/uploads')).toHaveLength(1);
});
test('SavedReviewHistory uses evidence-link helper and discards late evidence after clear',async()=>{
 const bytes=Buffer.from('evidence'),sha256=createHash('sha256').update(bytes).digest('hex');
 const receipt={state:'SAVED',reviewId:id,comparisonId:id,savedAt:'2026-01-01T00:00:00Z',identity:'Public demo use — NOT an individually authenticated reviewer'};
 let finish!:(response:Response)=>void;
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({reviews:[{receipt,application:fixtures.application,outcome:'second-review'}]}))
 .mockResolvedValueOnce(Response.json({receipt,record:{processing:'complete',source:'fixture',application:parseApplication(fixtures.application),evidence:fixtures.evidence,imageSha256:sha256,comparison:compareApplication(parseApplication(fixtures.application),fixtures.evidence)},intent:{}}))
 .mockResolvedValueOnce(Response.json({url:origin+`/storage/v1/object/sign/ttb-evidence/snapshots/${id}?token=synthetic`,sha256,bytes:bytes.length,mime:'image/png',expiresIn:60}))
 .mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 vi.stubGlobal('fetch',fetcher);const create=vi.spyOn(URL,'createObjectURL');
 let tree=render(SavedReviewHistory);await(node(tree,'button','Load saved reviews').props.onClick as ()=>Promise<void>)();
 // The JSX onClick uses void, so wait on the visible state update instead.
 await vi.waitFor(()=>expect(JSON.stringify(render(SavedReviewHistory))).toContain('Reopen'));
 tree=render(SavedReviewHistory);(node(tree,'button','Reopen').props.onClick as ()=>void)();
 await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(4));
 expect(fetcher.mock.calls[2][0]).toBe(`/api/reviews/${id}/evidence-link`);expect(new Headers(fetcher.mock.calls[3][1]?.headers).has('x-ttb-demo-code')).toBe(false);
 (node(render(SavedReviewHistory),'button','Clear private history').props.onClick as ()=>void)();finish(new Response(bytes,{headers:{'content-type':'image/png'}}));
 await new Promise(resolve=>setTimeout(resolve,30));expect(create).not.toHaveBeenCalled();expect(JSON.stringify(render(SavedReviewHistory))).not.toContain('reopened-review');
});
