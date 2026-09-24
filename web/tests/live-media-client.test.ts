import { afterEach, expect, test, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { prepareLiveMedia, loadReviewEvidence } from '../lib/live-media-client';
import { executeLivePair } from '../lib/live-batch-client';
import { createBatchState, transitionBatch, type DispatchCommand } from '../lib/batch-state';
import { buildBatchManifest } from '../lib/batch-manifest';
import { MAX_IMAGE_BYTES, parseApplication } from '../lib/contracts';
import fixtures from './fixtures/comparisons.json';
const origin='https://synthetic-ref.supabase.co', uploadUrl=origin+'/storage/v1/object/upload/sign/ttb-uploads/uploads/00000000-0000-4000-8000-000000000001?token=synthetic';
const ticket='synthetic.ticket',code='private-demo-code';
function hosted(){vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','supabase-v1');vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin);}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('10 MiB goes directly to exact Storage signed PUT, credentials/code only sent to same-origin ticket API',async()=>{
 hosted();const file=new File([new Uint8Array(MAX_IMAGE_BYTES)],'label.png',{type:'image/png'});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({uploadUrl,ticket})).mockResolvedValueOnce(Response.json({Key:'ok'}));
 const media=await prepareLiveMedia(file,parseApplication(fixtures.application),code,AbortSignal.timeout(10000),fetcher);
 expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][0]).toBe('/api/uploads');
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-ttb-demo-code')).toBe(code);
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({filename:file.name,mime:file.type,bytes:file.size,application:parseApplication(fixtures.application)});
 const [url,init]=fetcher.mock.calls[1];expect(url).toBe(uploadUrl);expect(init?.method).toBe('PUT');expect(init?.body).toBe(file);
 expect(init?.redirect).toBe('error');expect(init?.credentials).toBe('omit');expect(init?.referrerPolicy).toBe('no-referrer');
 const headers=new Headers(init?.headers);expect(headers.get('content-type')).toBe('image/png');expect(headers.get('x-upsert')).toBe('false');
 for(const key of ['authorization','apikey','x-ttb-demo-code'])expect(headers.has(key)).toBe(false);
 expect(media).toEqual({body:JSON.stringify({ticket}),headers:{'content-type':'application/json'}});
});
test('local transport stays multipart and has no preliminary fetch; unknown transport fails closed',async()=>{
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');const fetcher=vi.fn(),file=new File(['x'],'label.png',{type:'image/png'});
 const media=await prepareLiveMedia(file,parseApplication(fixtures.application),code,AbortSignal.timeout(1000),fetcher);
 expect(media.body).toBeInstanceOf(FormData);expect((media.body as FormData).get('image')).toBe(file);expect(media.headers).toEqual({});expect(fetcher).not.toHaveBeenCalled();
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','typo');await expect(prepareLiveMedia(file,parseApplication(fixtures.application),code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();
});
test('foreign origins, paths, credentials, tokenless URLs, redirects, oversize declarations and failures have no upload retries',async()=>{
 hosted();const file=new File(['x'],'label.png',{type:'image/png'}),fetcher=vi.fn<typeof fetch>();
 for(const bad of [uploadUrl.replace(origin,'https://synthetic-ref.supabase.co.evil.example'),uploadUrl.replace('/storage/v1/','/other/'),uploadUrl.replace('https://','https://user:password@'),uploadUrl.split('?')[0],uploadUrl+'#fragment']){
  fetcher.mockReset().mockResolvedValueOnce(Response.json({uploadUrl:bad,ticket}));await expect(prepareLiveMedia(file,parseApplication(fixtures.application),code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
 }
 fetcher.mockReset();await expect(prepareLiveMedia(new File([new Uint8Array(MAX_IMAGE_BYTES+1)],'x.png',{type:'image/png'}),parseApplication(fixtures.application),code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockResolvedValueOnce(Response.json({uploadUrl,ticket})).mockResolvedValueOnce(new Response(null,{status:302}));await expect(prepareLiveMedia(file,parseApplication(fixtures.application),code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(2);
});
test('hosted batch uploads once, reuses ticket for prepare/execute, stable intent and at most one paid fetch on lost response',async()=>{
 hosted();const file=new File(['x'],'label.png',{type:'image/png'});
 const batch=createBatchState(buildBatchManifest([{filename:file.name,imageSha256:null}],[{filename:file.name,application:parseApplication(fixtures.application)}],{live:true}),{batchId:randomUUID(),live:true});
 const command=transitionBatch(batch,{type:'dispatch-next',attempts:[{attemptId:randomUUID(),reservationId:randomUUID()}]}).commands[0] as DispatchCommand;
 const prepared={imageSha256:'a'.repeat(64),binding:'a'.repeat(64)+'.'+'b'.repeat(64)};
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({uploadUrl,ticket})).mockResolvedValueOnce(Response.json({Key:'ok'})).mockResolvedValueOnce(Response.json({prepared})).mockRejectedValueOnce(Error('lost paid response'));
 expect(await executeLivePair(command,file,code,()=>true,fetcher)).toEqual({processing:'failed',code:'provider-failed'});
 expect(fetcher).toHaveBeenCalledTimes(4);
 for(const index of [2,3]){expect(fetcher.mock.calls[index][0]).toBe('/api/comparisons');expect(fetcher.mock.calls[index][1]?.body).toBe(JSON.stringify({ticket}));}
 expect(JSON.parse(new Headers(fetcher.mock.calls[3][1]?.headers).get('x-ttb-batch-intent')!)).toEqual(command.token);
 fetcher.mockReset().mockResolvedValueOnce(Response.json({uploadUrl,ticket})).mockResolvedValueOnce(Response.json({Key:'ok'})).mockResolvedValueOnce(Response.json({prepared}));
 expect(await executeLivePair(command,file,code,()=>false,fetcher)).toEqual({processing:'failed',code:'cancelled'});expect(fetcher).toHaveBeenCalledTimes(3);
});
const bytes=Buffer.from('synthetic evidence'),hash=createHash('sha256').update(bytes).digest('hex');
const link={url:origin+'/storage/v1/object/sign/ttb-evidence/snapshots/00000000-0000-4000-8000-000000000001?token=synthetic',sha256:hash,bytes:bytes.length,mime:'image/png',expiresIn:60};
test('hosted history fetches 60-second evidence link then exact-origin bytes without demo header; local binary compatibility',async()=>{
 hosted();const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(link)).mockResolvedValueOnce(new Response(bytes,{headers:{'content-type':'image/png'}}));
 const blob=await loadReviewEvidence('00000000-0000-4000-8000-000000000001',hash,code,AbortSignal.timeout(1000),fetcher);expect(blob.type).toBe('image/png');expect(Buffer.from(await blob.arrayBuffer())).toEqual(bytes);
 expect(fetcher.mock.calls[0][0]).toBe('/api/reviews/00000000-0000-4000-8000-000000000001/evidence-link');expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-ttb-demo-code')).toBe(code);
 expect(fetcher.mock.calls[1][0]).toBe(link.url);expect(fetcher.mock.calls[1][1]).toMatchObject({redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});expect(new Headers(fetcher.mock.calls[1][1]?.headers).has('x-ttb-demo-code')).toBe(false);
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');fetcher.mockReset().mockResolvedValueOnce(new Response(bytes,{headers:{'content-type':'image/png'}}));
 expect(await(await loadReviewEvidence('00000000-0000-4000-8000-000000000001',hash,code,AbortSignal.timeout(1000),fetcher)).text()).toBe(bytes.toString());expect(fetcher).toHaveBeenCalledTimes(1);
});
test('history rejects link metadata mismatch before Storage and verifies fetched MIME, hash, length and redirect state',async()=>{
 hosted();const fetcher=vi.fn<typeof fetch>();
 for(const bad of [{...link,url:'https://evil.example/storage/v1/x'}, {...link,sha256:'a'.repeat(64)}, {...link,bytes:MAX_IMAGE_BYTES+1},{...link,expiresIn:120}]){
  fetcher.mockReset().mockResolvedValueOnce(Response.json(bad));await expect(loadReviewEvidence('00000000-0000-4000-8000-000000000001',hash,code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
 }
 for(const response of [new Response(bytes,{headers:{'content-type':'image/jpeg'}}),new Response('wrong',{headers:{'content-type':'image/png'}}),new Response(new Uint8Array(bytes.length).fill(1),{headers:{'content-type':'image/png'}}),new Response(null,{status:302})]){
  fetcher.mockReset().mockResolvedValueOnce(Response.json(link)).mockResolvedValueOnce(response);await expect(loadReviewEvidence('00000000-0000-4000-8000-000000000001',hash,code,AbortSignal.timeout(1000),fetcher)).rejects.toThrow();
 }
});
test('build rejects public credential aliases and conflicting server/browser origins',async()=>{
 hosted();vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_SIGNING_SECRET','never-public');vi.resetModules();
 await expect(import('../next.config')).rejects.toThrow();
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_SIGNING_SECRET',undefined);vi.stubEnv('TTB_SUPABASE_URL','https://different.supabase.co');vi.resetModules();
 await expect(import('../next.config')).rejects.toThrow();
});
test('CSP adds only exact configured Storage origin, fails closed for invalid hosted origin and retains local policy',async()=>{
 hosted();vi.resetModules();let config=(await import('../next.config')).default;let headers=await config.headers!();expect(JSON.stringify(headers)).toContain(`connect-src 'self' ${origin};`);expect(JSON.stringify(headers)).not.toContain('*.supabase.co');
 vi.stubEnv('NEXT_PUBLIC_TTB_SUPABASE_ORIGIN',origin+"; connect-src *");vi.resetModules();await expect(import('../next.config')).rejects.toThrow();
 vi.stubEnv('NEXT_PUBLIC_TTB_MEDIA_TRANSPORT','');vi.resetModules();config=(await import('../next.config')).default;headers=await config.headers!();expect(JSON.stringify(headers)).toContain("connect-src 'self';");
});
