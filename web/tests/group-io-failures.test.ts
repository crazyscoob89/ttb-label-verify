import {afterEach,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createUploadHandler} from '../lib/upload-route';
import {readGroupUploadTicket,signGroupUploadTicket} from '../lib/group-media';
import {prepareLiveGroup} from '../lib/live-photo-client';
import {createHostedStores} from '../lib/persistence/hosted-demo-rpc';
import type {HostedEvidenceObjects} from '../lib/demo-store-contracts';
import {groupFixture,groupInput} from './fixtures/photo-groups';
const origin='https://synthetic.supabase.co';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:origin,TTB_SUPABASE_SERVICE_ROLE_KEY:'offline',
 TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence',TTB_DEMO_ENABLED:'true',
 TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'a'.repeat(43),TTB_MEDIA_SIGNING_SECRET:'b'.repeat(43)};
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

test.each(['auth','quota'] as const)('group %s failure permits no signing I/O',async failure=>{
 const input=await groupInput(4),fetcher=vi.fn(()=>{throw Error('No network');});vi.stubGlobal('fetch',fetcher);
 const quota={reserve:vi.fn(),reserveGroup:vi.fn(async()=>{throw Error('Quota denied');})};
 const headers={origin:env.TTB_DEMO_ORIGIN,'content-type':'application/json','x-ttb-demo-code':failure==='auth'?'wrong':env.TTB_DEMO_ACCESS_SECRET};
 const request=new Request(env.TTB_DEMO_ORIGIN+'/api/uploads',{method:'POST',headers,body:JSON.stringify(input.group)});
 expect((await createUploadHandler({env,quota})(request)).status).toBe(failure==='auth'?403:503);
 expect(quota.reserveGroup).toHaveBeenCalledTimes(failure==='auth'?0:1);expect(fetcher).not.toHaveBeenCalled();
});
test('failed browser PUT drains sibling before returning; no later PUT, prepare or retry',async()=>{
 const input=await groupInput(4);vi.useFakeTimers();vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','supabase-v1');vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin);
 const uploads=input.group.photos.map(p=>({photoId:p.photoId,uploadUrl:`${origin}/storage/v1/object/upload/sign/ttb-uploads/uploads/${p.photoId}?token=offline`}));
 let puts=0,drained=false,settled=false;
 const transport=vi.fn<typeof fetch>(async(raw,init)=>{
  if(raw==='/api/uploads')return Response.json({schemaVersion:2,ticket:'offline',uploads});
  expect(init?.method).toBe('PUT');if(++puts===1)return new Response(null,{status:503});
  await wait(50);drained=true;return Response.json({});
 });
 const files=input.files.map(p=>new File([new Uint8Array(p.image.bytes)],p.image.filename,{type:p.image.mime}));
 const pending=prepareLiveGroup(input.group,files,'code',new AbortController().signal,transport).then(()=>{throw Error('Unexpected success');},()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);expect(puts).toBe(2);
 await vi.advanceTimersByTimeAsync(30);await pending;expect(drained).toBe(true);expect(settled).toBe(true);expect(transport).toHaveBeenCalledTimes(3);
});
test('ticket verification precedes all reads; failed read drains sibling without starting next wave',async()=>{
 const input=await groupInput(4),objects=input.group.photos.map(p=>{const id=randomUUID();return {photoId:p.photoId,id,key:`uploads/${id}`};});
 const ticket=signGroupUploadTicket(input.group,objects,env);vi.useFakeTimers();let reads=0,drained=false,settled=false;
 const fetcher=vi.fn<typeof fetch>(async()=>{
  if(++reads===1)return new Response(null,{status:503});
  await wait(50);drained=true;return new Response(new Uint8Array(input.files[1].image.bytes),{headers:{'content-type':'image/png'}});
 });vi.stubGlobal('fetch',fetcher);
 await expect(readGroupUploadTicket('forged',env,{phase:'prepare'})).rejects.toThrow();expect(reads).toBe(0);
 const pending=readGroupUploadTicket(ticket,env,{phase:'prepare'}).then(()=>{throw Error('Unexpected success');},()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);expect(reads).toBe(2);
 await vi.advanceTimersByTimeAsync(30);await pending;expect(drained).toBe(true);expect(reads).toBe(2);expect(settled).toBe(true);
});
test.each(['put','hash','abort'] as const)('snapshot %s failure drains two asset chains, stops later assets and never commits',async failure=>{
 const f=await groupFixture(4);vi.useFakeTimers();const controller=new AbortController();
 let puts=0,gets=0,drained=false,settled=false;const data=new Map<string,Buffer>(),events:string[]=[];
 const objects:HostedEvidenceObjects={
  async putEvidence(id,bytes){
   const slot=puts++;data.set(`snapshots/${id}`,Buffer.from(bytes));
   if(slot===0&&failure==='put')throw Error('Storage failed');
   await wait(slot===0?10:50);if(slot===1)drained=true;if(slot===0&&failure==='abort')controller.abort();
   return {key:`snapshots/${id}`};
  },
  async getEvidence(key){gets++;return failure==='hash'&&gets===1?Buffer.from('corrupt'):data.get(key)!;},
  async signEvidence(){throw Error('Unexpected signing');},
 };
 const fetcher:typeof fetch=async(_raw,init)=>{events.push(JSON.parse(String(init?.body)).p_op);return Response.json(null);};
 const reviews=await createHostedStores({env,objects,fetch:fetcher}).openReviews();
 const pending=Promise.resolve(reviews.snapshotGroup!(f.record,f.photos,controller.signal)).then(()=>{throw Error('Unexpected success');},()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(20);expect(settled).toBe(false);expect(puts).toBe(2);
 await vi.advanceTimersByTimeAsync(30);await pending;expect(drained).toBe(true);expect(settled).toBe(true);expect(puts).toBe(2);expect(events).toEqual(['snapshot_prepare']);
});
test('snapshot copies exact serialized record and ALL asset bytes before quota await',async()=>{
 const f=await groupFixture(2),text=JSON.stringify(f.record),expected=f.photos.flatMap(p=>[Buffer.from(p.original),Buffer.from(p.normalized)]);
 const data=new Map<string,Buffer>();let slot=0,recordText='';
 const objects:HostedEvidenceObjects={async putEvidence(id,bytes){expect(bytes).toEqual(expected[slot++]);data.set(`snapshots/${id}`,bytes);return {key:`snapshots/${id}`};},async getEvidence(key){return data.get(key)!;},async signEvidence(){throw Error('Unexpected');}};
 const fetcher:typeof fetch=async(_raw,init)=>{
  const {p_op,p_input}=JSON.parse(String(init?.body));if(p_op==='snapshot_prepare'){
   recordText=p_input.record;f.record.application.brand='MUTATED';for(const p of f.photos){p.original.fill(0);p.normalized.fill(0);}
  }return Response.json(null);
 };
 const reviews=await createHostedStores({env,objects,fetch:fetcher}).openReviews();await reviews.snapshotGroup!(f.record,f.photos);
 expect(recordText).toBe(text);expect(slot).toBe(4);
});
