import {afterEach, expect, test, vi} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import * as parallel from '../lib/parallel-io';
import {createUploadHandler} from '../lib/upload-route';
import {readGroupUploadTicket,verifyGroupUploadTicket} from '../lib/group-media';
import {prepareLiveGroup,executeLiveGroup,type StageMeasurement} from '../lib/live-photo-client';
import {createHostedStores} from '../lib/persistence/hosted-demo-rpc';
import {createSupabaseObjects} from '../lib/persistence/supabase-storage';
import {groupFixture} from './fixtures/photo-groups';

const origin='https://synthetic.supabase.co';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:origin,TTB_SUPABASE_SERVICE_ROLE_KEY:'offline-only',
  TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence',
  TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'a'.repeat(43),TTB_MEDIA_SIGNING_SECRET:'b'.repeat(43)};
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});

// Profile the real changed call sites + real Storage adapter under deterministic
// 100ms I/O. The 2900ms extraction boundary is a mock, NOT live GPT performance;
// CPU normalization and spend latency are intentionally not modeled here.
async function profile(f:Awaited<ReturnType<typeof groupFixture>>,serial:boolean){
  // Keep genuine SHA-256 checks, but avoid advancing the fake clock while a
  // real WebCrypto worker waits for CPU under concurrent test-suite load.
  vi.spyOn(crypto.subtle,'digest').mockImplementation(async(algorithm,data)=>{
    expect(algorithm).toBe('SHA-256');
    const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
  });
  if(serial)vi.spyOn(parallel,'mapTwoIO').mockImplementation(async(items,work,signal)=>{
    const results=[];for(let i=0;i<items.length;i++){signal?.throwIfAborted();results.push(await work(items[i],i));}return results;
  });
  vi.useFakeTimers();vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','supabase-v1');vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin);
  let active=0,peak=0,allocated=false,prepared=false,committed=false;
  const objects=new Map<string,Buffer>(),events:string[]=[],verified=new Map<string,number>();
  let recordText='',snapshotId='';const counts:Record<string,number>={};
  const io=async(kind:string)=>{events.push(kind);counts[kind]=(counts[kind]??0)+1;peak=Math.max(peak,++active);await wait(100);active--;};
  const fetcher:typeof fetch=async(raw,init)=>{
    const url=new URL(String(raw));expect(url.origin).toBe(origin);const headers=new Headers(init?.headers);
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const {p_op,p_input}=JSON.parse(String(init?.body));await io(p_op);
      if(p_op==='snapshot_prepare'){
        prepared=true;recordText=p_input.record;snapshotId=p_input.id;
        expect(recordText).toBe(JSON.stringify(f.record));expect(p_input.assets).toHaveLength(f.photos.length*2);
      }else if(p_op==='snapshot_commit'){
        expect([...verified.values()]).toEqual(Array(f.photos.length*2).fill(2));expect(active).toBe(0);committed=true;
      }else throw Error('Unexpected RPC');
      return Response.json(null);
    }
    const path=url.pathname.replace('/storage/v1','');
    if(path.startsWith('/object/upload/sign/')){
      expect(allocated).toBe(true);
      if(init?.method==='PUT'){
        expect(headers.has('x-ttb-demo-code')).toBe(false);expect(headers.has('authorization')).toBe(false);expect(init.credentials).toBe('omit');
        const bytes=Buffer.from(await (init.body as File).arrayBuffer());await io('upload');objects.set(path.replace('/object/upload/sign/',''),bytes);return Response.json({});
      }
      await io('sign');return Response.json({url:path+'?token=offline'});
    }
    if(path.startsWith('/object/ttb-evidence/')){
      expect(prepared).toBe(true);expect(headers.get('x-upsert')).toBe('false');
      const bytes=Buffer.from(init?.body as Uint8Array);await io('snapshot-put');objects.set(path.replace('/object/',''),bytes);return Response.json({});
    }
    if(path.startsWith('/object/authenticated/')){
      const key=path.replace('/object/authenticated/',''),bytes=objects.get(key);expect(bytes).toBeDefined();
      await io(key.startsWith('ttb-uploads/')?'source-read':'snapshot-get');
      if(key.startsWith('ttb-evidence/'))verified.set(key,(verified.get(key)??0)+1);
      return new Response(new Uint8Array(bytes!),{headers:{'content-type':'image/png'}});
    }
    throw Error('Unexpected network request');
  };
  vi.stubGlobal('fetch',fetcher);
  const reviews=await createHostedStores({env,objects:createSupabaseObjects(env),fetch:fetcher}).openReviews();
  const uploadHandler=createUploadHandler({env,quota:{reserve:async()=>{throw Error('Wrong quota');},reserveGroup:async uploads=>{
    expect(uploads.map(p=>p.bytes)).toEqual(f.input.group.photos.map(p=>p.bytes));await io('upload-quota');allocated=true;
  }}});
  const ids={attemptId:randomUUID(),reservationId:randomUUID()},binding=f.prepared.photoSetSha256+'.'+'c'.repeat(64);
  const transport:typeof fetch=async(raw,init)=>{
    if(String(raw).startsWith('https:'))return fetcher(raw,init);
    const headers=new Headers(init?.headers);headers.set('origin',env.TTB_DEMO_ORIGIN);
    const request=new Request(env.TTB_DEMO_ORIGIN+raw,{...init,headers});
    if(raw==='/api/uploads')return uploadHandler(request);
    expect(raw).toBe('/api/comparisons');
    const operation=JSON.parse(String(init?.body));
    const input=await readGroupUploadTicket(operation.ticket,env,operation,init?.signal??undefined);
    expect(input.files.map(p=>p.image.bytes)).toEqual(f.input.files.map(p=>p.image.bytes));
    expect(verifyGroupUploadTicket(operation.ticket,env).declaration).toEqual(f.input.group);
    if(operation.phase==='prepare')return Response.json({prepared:{schemaVersion:2,groupId:input.group.groupId,revision:input.group.revision,
      photos:f.record.photos,photoSetSha256:f.record.photoSetSha256,...ids,binding}});
    expect(operation).toMatchObject({...ids,binding});await wait(2900);
    const comparisonId=await reviews.snapshotGroup!(f.record,f.photos,init?.signal??undefined);
    expect(committed).toBe(true);expect(comparisonId).toBe(snapshotId);expect(recordText).toBe(JSON.stringify(f.record));
    return Response.json({result:f.record,comparisonId,reviewAvailability:'available'});
  };
  const stages:StageMeasurement[]=[],signal=new AbortController().signal;
  const files=f.input.files.map(p=>new File([new Uint8Array(p.image.bytes)],p.image.filename,{type:p.image.mime}));
  let done=false,error:unknown;const start=Date.now();
  const pending=(async()=>{
    const ready=await prepareLiveGroup(f.input.group,files,env.TTB_DEMO_ACCESS_SECRET,signal,transport,s=>stages.push(s));
    const response=await executeLiveGroup(ready,env.TTB_DEMO_ACCESS_SECRET,signal,transport,s=>stages.push(s));
    expect(JSON.stringify(response.result)).toBe(JSON.stringify(f.record));
  })().catch(e=>{error=e;}).finally(()=>{done=true;});
  for(let i=0;i<15000&&!done;i++)await vi.advanceTimersByTimeAsync(1);
  expect(done).toBe(true);await pending;if(error)throw error;
  expect(active).toBe(0);expect(peak).toBe(serial?1:2);expect(events[0]).toBe('upload-quota');expect(events.at(-1)).toBe('snapshot_commit');
  const result={fullMs:Date.now()-start,stages:stages.filter(s=>s.state==='complete').map(s=>({stage:s.stage,ms:s.elapsedMs})),peak,counts};
  vi.restoreAllMocks();vi.useRealTimers();return result;
}
test.each([2,4])('mock latency profile: %i photos, exact snapshots, bounded I/O, durability stays on clock',async count=>{
  const f=await groupFixture(count),before=await profile(f,true),after=await profile(f,false);
  expect(after.counts).toEqual(before.counts); // Same work, no elided readbacks or deferral.
  expect(after.fullMs).toBeLessThan(before.fullMs);
  expect(before.fullMs-after.fullMs).toBeGreaterThanOrEqual(count===2?990:1990);
  console.info('LATENCY_PROFILE',JSON.stringify({photos:count,ioDelayMs:100,mockExtractionMs:2900,before,after}));
});
