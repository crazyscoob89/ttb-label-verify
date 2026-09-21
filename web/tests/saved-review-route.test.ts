import { it, expect, vi } from 'vitest';
import { rmSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { privateLedgerDir } from './fixtures/private-ledger';
import { createDemoHandler } from '../lib/demo-route';
import { createReviewHandler } from '../lib/review-route';
import { SqliteSpendStore } from '../lib/sqlite-spend';
import { ReviewStore, REVIEW_LIMITS } from '../lib/review-store';
import { newReviewIntent } from '../lib/review-policy';
import fixtures from './fixtures/comparisons.json';
vi.setConfig({testTimeout:60000});

it('server-generated snapshot -> authenticated save/list/detail/image, missing store and response preservation',async()=>{
 const spend=privateLedgerDir(),reviews=privateLedgerDir();
 const code=randomUUID(),origin='https://demo.example';
 const env={TTB_DEMO_ENABLED:'true',TTB_DEMO_ACCESS_SECRET:code,TTB_DEMO_ORIGIN:origin,TTB_DEMO_DATA_DIR:spend,TTB_REVIEW_DATA_DIR:reviews,TTB_DEMO_PERSISTENT_VOLUME:'single-private-volume-v1',OPENROUTER_API_KEY:'synthetic-unused'};
 const transport=vi.fn(async(url:string)=>url.endsWith('/models')?Response.json({data:[{id:'anthropic/claude-haiku-4.5',context_length:200000,pricing:{prompt:'0.000001',completion:'0.000005'}}]}):Response.json({choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fixtures.evidence)}}]}));
 const review=createReviewHandler(env);
 const req=(path='',body?:unknown)=>new Request(origin+'/api/reviews'+path,{method:'POST',headers:{origin,'x-ttb-demo-code':code,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const compare=async()=>{
  const body=new FormData();body.set('image',new File([readFileSync('public/offline-samples/match.png')],'synthetic.png',{type:'image/png'}));body.set('application',JSON.stringify(fixtures.application));
  return createDemoHandler({env,transport})(new Request(origin+'/api/comparisons',{method:'POST',headers:{origin,'x-ttb-demo-code':code},body}));
 };
 try{
  SqliteSpendStore.provision(join(spend,'spend.sqlite'));
  const unavailable=await compare();expect(unavailable.status).toBe(200);const retained=await unavailable.json();expect(retained.result.processing).toBe('complete');expect(retained.comparisonId).toBeUndefined();expect(retained.reviewAvailability).toBe('snapshot-unavailable');
  expect((await review(req('/list'))).status).toBe(503);
  ReviewStore.provision(join(reviews,'reviews.sqlite'));
  const response=await compare();const {comparisonId,result}=await response.json();expect(comparisonId).toMatch(/^[0-9a-f-]{36}$/);
  const intent={...newReviewIntent(result),outcome:'second-review',confirmed:true,notes:'Synthetic server policy acceptance.'};
  const input={comparisonId,idempotencyKey:randomUUID(),intent};
  expect((await review(req('',{...input,record:result}))).status).toBe(400);
  expect((await review(req('',{...input,intent:{...intent,outcome:'pass'}}))).status).toBe(409);
  expect((await review(req('',{...input,intent:{...intent,bindingKey:JSON.stringify({...result,application:{...result.application,applicationVersion:'forged'}})}}))).status).toBe(409);
  const saved=await review(req('',input));expect(saved.status).toBe(200);const {receipt}=await saved.json();
  const replay=await createReviewHandler(env)(req('',input));expect(await replay.json()).toEqual({receipt});
  const endpoints=['','/list',`/${receipt.reviewId}`,`/${receipt.reviewId}/evidence`];
  for(const endpoint of endpoints){
   for(const mutation of ['code','origin','site']){
    const denied=req(endpoint,input);denied.headers.set(mutation==='code'?'x-ttb-demo-code':mutation==='origin'?'origin':'sec-fetch-site',mutation==='site'?'cross-site':'invalid');
    const r=await review(denied);expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('no-store');expect(denied.bodyUsed).toBe(false);
   }
  }
  const detail=await review(req(`/${receipt.reviewId}`));expect((await detail.json()).record).toEqual(result);
  const image=await review(req(`/${receipt.reviewId}/evidence`));expect(image.headers.get('cache-control')).toBe('no-store');expect(image.headers.get('content-type')).toBe('image/png');expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await(await review(req('/list'))).json()).reviews).toHaveLength(1);
  expect((await review(req('/list?offset=999999'))).status).toBe(400);
  expect((await review(req('/'+randomUUID()))).status).toBe(404);
  const oversized=req('',{});oversized.headers.set('content-length',String(REVIEW_LIMITS.requestBytes+1));expect((await review(oversized)).status).toBe(413);
  const streamed=new Request(origin+'/api/reviews',{method:'POST',headers:{origin,'x-ttb-demo-code':code,'content-type':'application/json'},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(REVIEW_LIMITS.requestBytes+1));c.close();}}),duplex:'half'} as RequestInit);expect((await review(streamed)).status).toBe(413);
  const before=transport.mock.calls.length;expect((await review(req('',input))).status).toBe(200);expect(transport.mock.calls.length).toBe(before);
  if(process.platform!=='win32'){chmodSync(join(reviews,'reviews.sqlite'),0o644);expect((await review(req('/list'))).status).toBe(503);}
 }finally{rmSync(spend,{recursive:true,force:true});rmSync(reviews,{recursive:true,force:true});}
});
