import { expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHostedStores, createHostedUploadQuota } from '../lib/persistence/hosted-demo-rpc';
import { createDemoHandler } from '../lib/demo-route';
import { createReviewHandler } from '../lib/review-route';
import { samples, compareOfflineSample } from '../lib/offline-demo';
import { newReviewIntent } from '../lib/review-policy';
import type { CompleteComparison } from '../lib/comparison-record';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-secret',TTB_DEMO_ENABLED:'true',TTB_DEMO_ACCESS_SECRET:'synthetic-only-access-code-0123456789abcdef',TTB_DEMO_ORIGIN:'https://demo.example',OPENROUTER_API_KEY:'synthetic'};
const objects={putEvidence:vi.fn(),getEvidence:vi.fn(),signEvidence:vi.fn()};
function req(path='comparisons',authorized=true){return new Request(`https://demo.example/api/${path}`,{method:'POST',headers:{origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':authorized?env.TTB_DEMO_ACCESS_SECRET:'bad'}});}
test('hosted selection requires explicit mode and factory, denies before private IO, awaits async admission',async()=>{
 const acquireWork=vi.fn(async()=>{throw Error('disabled');}),openSpend=vi.fn(async()=>({acquireWork,close:vi.fn()})),readInput=vi.fn();
 const stores={openSpend,openReviews:vi.fn()} as any;
 const handler=createDemoHandler({env,stores,readInput});
 expect((await handler(req('comparisons',false))).status).toBe(403);expect(openSpend).not.toHaveBeenCalled();
 expect((await handler(req())).status).toBe(503);expect(acquireWork).toHaveBeenCalledTimes(1);expect(readInput).not.toHaveBeenCalled();
 expect((await createDemoHandler({env,readInput})(req())).status).toBe(403);
 expect((await createDemoHandler({env:{...env,TTB_PERSISTENCE:'typo'},stores})(req())).status).toBe(403);
});
test('review async list/link close and auth ordering; hosted never silently opens SQLite',async()=>{
 const descriptor={url:'https://synthetic.supabase.co/storage/v1/object/sign/x',sha256:'a'.repeat(64),bytes:12,mime:'image/png',expiresIn:60};
 const close=vi.fn(async()=>{}),list=vi.fn(async()=>[]),evidenceLink=vi.fn(async()=>descriptor),openReviews=vi.fn(async()=>({list,evidenceLink,close}));
 const handler=createReviewHandler(env,{openReviews,openSpend:vi.fn()} as any);
 expect((await handler(req('reviews/list',false))).status).toBe(403);expect(openReviews).not.toHaveBeenCalled();
 expect(await (await handler(req('reviews/list'))).json()).toEqual({reviews:[]});expect(close).toHaveBeenCalledTimes(1);
 const response=await handler(req(`reviews/${randomUUID()}/evidence-link`));expect(await response.json()).toEqual(descriptor);expect(response.headers.get('cache-control')).toBe('no-store');
 expect((await createReviewHandler(env)(req('reviews/list'))).status).toBe(503);
});
test('RPC is bounded server-only no redirect/retry and uses only service role',async()=>{
 const transport=vi.fn(async()=>Response.json(true));
 const stores=createHostedStores({env,objects,fetch:transport});const spend=await stores.openSpend();
 await spend.hasIntent(randomUUID(),randomUUID());
 expect(transport).toHaveBeenCalledTimes(1);const [url,init]=transport.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe(env.TTB_SUPABASE_URL+'/rest/v1/rpc/ttb_demo_spend');expect(init.redirect).toBe('error');expect(init.headers).toMatchObject({apikey:env.TTB_SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.TTB_SUPABASE_SERVICE_ROLE_KEY}`});
 transport.mockImplementation(async()=>{throw Error('lost acknowledgment secret');});
 await expect(spend.acquireWork(randomUUID())).rejects.toThrow('Persistence unavailable');expect(transport).toHaveBeenCalledTimes(2);
 expect(()=>createHostedStores({env:{...env,TTB_PERSISTENCE:undefined},objects})).toThrow();
});
test('RPC timeout and oversized response never replay',async()=>{
 const transport=vi.fn(()=>new Promise<Response>(()=>{}));
 const stores=createHostedStores({env,objects,fetch:transport,timeoutMs:10});
 await expect((await stores.openSpend()).acquireWork(randomUUID())).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(1);
 const oversized=vi.fn(async()=>new Response('x'.repeat(2*1024*1024+1)));
 await expect((await createHostedStores({env,objects,fetch:oversized}).openReviews()).list()).rejects.toThrow();expect(oversized).toHaveBeenCalledTimes(1);
});
test('snapshot quota reserved before object put and verified before commit; unchanged policy canonicalization',async()=>{
 const bytes=readFileSync(`public${samples.match.imagePath}`),record=await compareOfflineSample('match',samples.match.application,bytes) as CompleteComparison;
 const calls:string[]=[];let id='';
 const transport=vi.fn(async(_url:unknown,init?:RequestInit)=>{const {p_op,p_input}=JSON.parse(String(init?.body));calls.push(p_op);if(p_op==='snapshot_prepare'){id=p_input.id;return Response.json(null);}if(p_op==='snapshot_get')return Response.json({record:JSON.stringify(record)});return Response.json(null);});
 const obj={putEvidence:vi.fn(async(i:string)=>{calls.push('put');return {key:`snapshots/${i}`};}),getEvidence:vi.fn(async()=>{calls.push('verify');return bytes;}),signEvidence:vi.fn()};
 const reviews=await createHostedStores({env,objects:obj,fetch:transport}).openReviews();
 expect(await reviews.snapshot(record,bytes,'image/png')).toBe(id);expect(calls).toEqual(['snapshot_prepare','put','verify','snapshot_commit']);
 const intent={...newReviewIntent(record),outcome:'second-review',confirmed:false,notes:'Synthetic'};
 await expect(reviews.save({comparisonId:id,idempotencyKey:randomUUID(),intent})).rejects.toThrow('review-policy-or-stale-binding');expect(calls).not.toContain('save');
 obj.getEvidence.mockImplementationOnce(async()=>{calls.push('verify');return Buffer.from('bad');});
 await expect(reviews.snapshot(record,bytes,'image/png')).rejects.toThrow();expect(calls.at(-1)).toBe('verify');
});
test('durable upload quota uses bounded RPC and validates before IO',async()=>{
 const transport=vi.fn(async(_url:unknown,_init?:RequestInit)=>Response.json(null));
 const quota=createHostedUploadQuota(env,{fetch:transport});
 await expect(quota.reserve(randomUUID(),10*1024*1024+1)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 await quota.reserve(randomUUID(),1024);expect(JSON.parse(String(transport.mock.calls[0][1]?.body)).p_op).toBe('upload_reserve');
});
