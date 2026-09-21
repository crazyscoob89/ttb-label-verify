import { afterEach, expect, test, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { createSupabaseObjects } from '../lib/persistence/supabase-storage';
import { createUploadHandler } from '../lib/upload-route';
import { createHostedInputReader, UPLOAD_TICKET_SECONDS } from '../lib/hosted-media';
import { preparePair } from '../lib/intake';
import { MAX_IMAGE_BYTES } from '../lib/contracts';
import { createComparisonService } from '../lib/compare-service';
import fixtures from './fixtures/comparisons.json';
import { image } from './fixtures/synthetic';
const origin='https://synthetic-ref.supabase.co';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:origin,TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-only',TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence',TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_MEDIA_SIGNING_SECRET:'b'.repeat(64),TTB_DEMO_ACCESS_SECRET:'a'.repeat(32)};
const id='00000000-0000-4000-8000-000000000001';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const declaration=(bytes=5)=>({filename:'label.png',mime:'image/png',bytes,application:fixtures.application});
function request(body:unknown,auth=true){return new Request('https://demo.example/api/uploads',{method:'POST',headers:{'content-type':'application/json',origin:env.TTB_DEMO_ORIGIN,...(auth?{'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET}:{})},body:JSON.stringify(body)});}
function mockStorage(bytes:Buffer){return vi.fn<typeof fetch>(async(url,init)=>{
 const path=new URL(String(url)).pathname;
 expect(init?.redirect).toBe('error');expect(init?.signal).toBeDefined();
 expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${env.TTB_SUPABASE_SERVICE_ROLE_KEY}`);
 if(path.includes('/object/upload/sign/'))return Response.json({url:path.replace('/storage/v1','')+'?token=synthetic.token'});
 if(path.includes('/object/sign/'))return Response.json({signedURL:path.replace('/storage/v1','')+'?token=synthetic.token'});
 if(init?.method==='POST')return Response.json({Key:'ttb-evidence/snapshots/'+id});
 return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png'}});
});}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
test('private evidence POST is create-only, read back before commit, digest checked and signed for 60 seconds',async()=>{
 const bytes=await image(),fetcher=mockStorage(bytes);vi.stubGlobal('fetch',fetcher);const objects=createSupabaseObjects(env);
 expect(await objects.putEvidence(id,bytes,'image/png',sha(bytes))).toEqual({key:`snapshots/${id}`});
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(fetcher.mock.calls[0][0]).toBe(`${origin}/storage/v1/object/ttb-evidence/snapshots/${id}`);
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-upsert')).toBe('false');
 expect(await objects.getEvidence(`snapshots/${id}`,sha(bytes),bytes.length,'image/png')).toEqual(bytes);
 expect(await objects.signEvidence(`snapshots/${id}`,sha(bytes),bytes.length,'image/png')).toEqual({url:`${origin}/storage/v1/object/sign/ttb-evidence/snapshots/${id}?token=synthetic.token`,sha256:sha(bytes),bytes:bytes.length,mime:'image/png',expiresIn:60});
 expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]?.body))).toEqual({expiresIn:60});
 await expect(objects.getEvidence(`snapshots/${id}`,'a'.repeat(64),bytes.length,'image/png')).rejects.toThrow();
});
test('lost acknowledgements and duplicate objects never retry or upsert; invalid metadata has no IO',async()=>{
 const bytes=await image(),fetcher=vi.fn<typeof fetch>().mockRejectedValue(Error('lost acknowledgement'));vi.stubGlobal('fetch',fetcher);const objects=createSupabaseObjects(env);
 await expect(objects.putEvidence(id,bytes,'image/png',sha(bytes))).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
 fetcher.mockClear();await expect(objects.putEvidence(id,bytes,'image/png','a'.repeat(64))).rejects.toThrow();
 await expect(objects.getEvidence('../escape',sha(bytes),bytes.length,'image/png')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockResolvedValue(Response.json({error:'duplicate'},{status:409}));await expect(objects.putEvidence(id,bytes,'image/png',sha(bytes))).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
test('Storage response length, content type, readback corruption, foreign signing URL and redirects fail closed',async()=>{
 const bytes=await image(),objects=createSupabaseObjects(env);
 const fetcher=vi.fn<typeof fetch>();vi.stubGlobal('fetch',fetcher);
 for(const response of [new Response(new Uint8Array(bytes),{headers:{'content-type':'image/jpeg'}}),new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png','content-length':String(MAX_IMAGE_BYTES+1)}}),new Response('abc',{status:302,headers:{location:'https://evil.example'}})]){
  fetcher.mockResolvedValueOnce(response);await expect(objects.getEvidence(`snapshots/${id}`,sha(bytes),bytes.length,'image/png')).rejects.toThrow();
 }
 fetcher.mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(new Response('wrong',{headers:{'content-type':'image/png'}}));await expect(objects.putEvidence(id,bytes,'image/png',sha(bytes))).rejects.toThrow();
 fetcher.mockResolvedValueOnce(Response.json({signedURL:'https://evil.example/object?token=leak'}));await expect(objects.signEvidence(`snapshots/${id}`,sha(bytes),bytes.length,'image/png')).rejects.toThrow();
 expect(()=>createSupabaseObjects({...env,TTB_SUPABASE_URL:origin+'/other'})).toThrow();
});
test('upload auth and declaration validation precede quota and private IO; quota failure never signs',async()=>{
 const quota={reserve:vi.fn().mockResolvedValue(undefined)},fetcher=mockStorage(Buffer.from('bytes'));vi.stubGlobal('fetch',fetcher);const handler=createUploadHandler({env,quota});
 expect((await handler(request(declaration(),false))).status).toBe(403);
 for(const value of [declaration(MAX_IMAGE_BYTES+1),{...declaration(),filename:'../x.png'},{...declaration(),mime:'image/jpeg'},{...declaration(),application:{}},{...declaration(),url:'https://evil.example'}])expect((await handler(request(value))).status).toBe(400);
 expect(quota.reserve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 quota.reserve.mockRejectedValueOnce(Error('quota'));expect((await handler(request(declaration()))).status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
});
test('real signed-upload protocol and HMAC ticket round trip preserves binding and feeds unchanged sanitation',async()=>{
 const bytes=await image(),fetcher=mockStorage(bytes);vi.stubGlobal('fetch',fetcher);const quota={reserve:vi.fn().mockResolvedValue(undefined)};
 const response=await createUploadHandler({env,quota})(request(declaration(bytes.length)));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 const {uploadUrl,ticket}=await response.json();expect(uploadUrl).toMatch(/^https:\/\/synthetic-ref\.supabase\.co\/storage\/v1\/object\/upload\/sign\/ttb-uploads\/uploads\//);
 expect(quota.reserve).toHaveBeenCalledWith(expect.any(String),bytes.length);expect(quota.reserve.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[0]);
 expect(fetcher.mock.calls[0][1]?.method).toBe('POST');expect(fetcher.mock.calls[0][1]?.body).toBe('{}');expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-upsert')).toBe('false');
 expect(ticket).not.toContain(env.TTB_SUPABASE_SERVICE_ROLE_KEY);
 const input=await createHostedInputReader(env)(request({ticket}));expect(input.file.bytes).toEqual(bytes);expect(input.binding.application).toEqual(fixtures.application);
 expect((await preparePair(input.file,input.binding)).image.sanitizedSha256).toMatch(/^[a-f0-9]{64}$/);
});
test('HMAC tamper, expiry, future issuance, wrong auth and arbitrary URL never cause private reads',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
 const fetcher=mockStorage(Buffer.from('bytes'));vi.stubGlobal('fetch',fetcher);const handler=createUploadHandler({env,quota:{reserve:vi.fn().mockResolvedValue(undefined)}});
 const {ticket}=await(await handler(request(declaration()))).json();const reader=createHostedInputReader(env);fetcher.mockClear();
 const [body,mac]=ticket.split('.');const data=JSON.parse(Buffer.from(body,'base64url').toString());data.bytes++;
 for(const bad of [Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+mac,ticket+'.x','https://evil.example'])await expect(reader(request({ticket:bad}))).rejects.toThrow();
 await expect(reader(request({ticket},false))).rejects.toThrow();await expect(reader(request({ticket,url:'https://evil.example'}))).rejects.toThrow();
 vi.setSystemTime(new Date('2025-12-31T23:59:59Z'));await expect(reader(request({ticket}))).rejects.toThrow();
 vi.setSystemTime(new Date(Date.UTC(2026,0,1)+UPLOAD_TICKET_SECONDS*1000));await expect(reader(request({ticket}))).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
test('shared demo code holder cannot forge, renew, rebind or redirect a media ticket',async()=>{
 const fetcher=mockStorage(Buffer.from('bytes'));vi.stubGlobal('fetch',fetcher);
 const {ticket}=await(await createUploadHandler({env,quota:{reserve:vi.fn().mockResolvedValue(undefined)}})(request(declaration()))).json();
 const data=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url').toString());
 const variants=[data,{...data,issuedAt:data.issuedAt+1,expiresAt:data.expiresAt+1},
  {...data,id,key:`uploads/${id}`},{...data,declaration:{...data.declaration,filename:'other.png'}},
  {...data,declaration:{...data.declaration,bytes:1}}];
 fetcher.mockClear();
 for(const value of variants){
  const payload=Buffer.from(JSON.stringify(value)).toString('base64url');
  const forged=payload+'.'+createHmac('sha256',env.TTB_DEMO_ACCESS_SECRET).update('ttb-upload-v1\0').update(payload).digest('hex');
  await expect(createHostedInputReader(env)(request({ticket:forged}))).rejects.toThrow();
 }
 expect(fetcher).not.toHaveBeenCalled();
 expect(ticket).not.toContain(env.TTB_MEDIA_SIGNING_SECRET);
});
test('missing, weak or shared signing key fails before quota or Storage issuance',async()=>{
 const fetcher=mockStorage(Buffer.from('bytes'));vi.stubGlobal('fetch',fetcher);const quota={reserve:vi.fn()};
 for(const secret of [undefined,'short',env.TTB_DEMO_ACCESS_SECRET]){
  expect((await createUploadHandler({env:{...env,TTB_MEDIA_SIGNING_SECRET:secret},quota})(request(declaration()))).status).toBe(503);
 }
 expect(quota.reserve).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
test('ticket reader enforces exact length/type and corrupt image cannot reach paid provider',async()=>{
 const bytes=Buffer.from('not a png'),fetcher=mockStorage(bytes);vi.stubGlobal('fetch',fetcher);const handler=createUploadHandler({env,quota:{reserve:vi.fn().mockResolvedValue(undefined)}});
 const {ticket}=await(await handler(request(declaration(bytes.length)))).json();const input=await createHostedInputReader(env)(request({ticket}));const extract=vi.fn();
 expect(await createComparisonService({provider:{extract},authorize:()=>true})(input)).toEqual({processing:'failed',code:'invalid-input'});expect(extract).not.toHaveBeenCalled();
 fetcher.mockResolvedValueOnce(new Response('short',{headers:{'content-type':'image/png'}}));await expect(createHostedInputReader(env)(request({ticket}))).rejects.toThrow();
 fetcher.mockResolvedValueOnce(new Response(new Uint8Array(bytes),{headers:{'content-type':'image/jpeg'}}));await expect(createHostedInputReader(env)(request({ticket}))).rejects.toThrow();
});
test('10 MiB declarations allowed; JSON control bodies and streamed image reads are bounded',async()=>{
 const fetcher=mockStorage(Buffer.from('bytes'));vi.stubGlobal('fetch',fetcher);const quota={reserve:vi.fn().mockResolvedValue(undefined)},handler=createUploadHandler({env,quota});
 expect((await handler(request(declaration(MAX_IMAGE_BYTES)))).status).toBe(200);
 expect((await handler(request({...declaration(),padding:'a'.repeat(65536)}))).status).toBe(413);
 const {ticket}=await(await handler(request(declaration(5)))).json();let cancelled=false;
 fetcher.mockResolvedValueOnce(new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(6));},cancel(){cancelled=true;}}),{headers:{'content-type':'image/png'}}));
 await expect(createHostedInputReader(env)(request({ticket}))).rejects.toThrow();expect(cancelled).toBe(true);
});
