import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {groupExtractionProviderName,validateRuntimeEnv} from '../lib/runtime-env';
import {groupInput} from './fixtures/photo-groups';
import {OfflineSpendStore} from './helpers/offline-spend-store';
import {GPT41_CATALOG_URL} from '../lib/extraction/gpt41-pricing';
import {OPENROUTER_ENDPOINT} from '../lib/extraction/openrouter';
import {GPT41_MODEL,GPT41_PROMPT_VERSION} from '../lib/photo-contracts';
import catalog from './fixtures/gpt41-catalog.json';
import front from './fixtures/gpt41-refined-envelope-0.json';
import back from './fixtures/gpt41-refined-envelope-1.json';
import {application} from './fixtures/jose-cuervo';
import {GPT41_PHOTO_PROMPT} from '../lib/extraction/gpt41-prompt';
const env={TTB_PERSISTENCE:'supabase',TTB_SUPABASE_URL:'https://synthetic.supabase.co',TTB_SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-secret',TTB_SUPABASE_EVIDENCE_BUCKET:'ttb-evidence',TTB_SUPABASE_UPLOAD_BUCKET:'ttb-uploads',TTB_DEMO_ENABLED:'true',TTB_DEMO_ORIGIN:'https://demo.example',TTB_DEMO_ACCESS_SECRET:'a'.repeat(43),TTB_MEDIA_SIGNING_SECRET:'b'.repeat(43),NEXT_PUBLIC_TTB_MEDIA_TRANSPORT:'supabase-v1',NEXT_PUBLIC_TTB_SUPABASE_ORIGIN:'https://synthetic.supabase.co',TTB_GROUP_EXTRACTION_PROVIDER:'gpt41',OPENROUTER_API_KEY:'offline-openrouter-key'};
const network=vi.fn(()=>{throw Error('Network forbidden');});
beforeEach(()=>{network.mockClear();vi.stubGlobal('fetch',network);});
afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();vi.unstubAllEnvs();});
test('trusted server-only selection requires managed store and OpenRouter key; old default stays Haiku',()=>{
 expect(validateRuntimeEnv(env)).toBe('supabase');expect(groupExtractionProviderName(env)).toBe('gpt41');expect(groupExtractionProviderName({})).toBe('openrouter');
 for(const change of [{TTB_GROUP_EXTRACTION_PROVIDER:'openai/gpt-4.1'},{TTB_GROUP_EXTRACTION_PROVIDER:'null'},{TTB_PERSISTENCE:'sqlite'},{OPENROUTER_API_KEY:undefined},{NEXT_PUBLIC_TTB_GROUP_EXTRACTION_PROVIDER:'gpt41'}])expect(()=>validateRuntimeEnv({...env,...change})).toThrow();
});
test('actual app managed prepare/execute, snapshot assets, human save/reopen, replay, pricing failure never falls back or gates history',async()=>{
 const {createAppRoute}=await import('../lib/app-runtime');const {signGroupUploadTicket}=await import('../lib/group-media');const {newReviewIntent}=await import('../lib/review-policy');
 const input=await groupInput(2),ledger=new OfflineSpendStore();ledger.ceiling=50000000;ledger.historical=27000000;
 input.group.application=structuredClone(application);
 for(const key of Object.keys(process.env))if(key.startsWith('TTB_')||key.startsWith('NEXT_PUBLIC_TTB_')||['VERCEL','VERCEL_ENV','OPENROUTER_API_KEY'].includes(key))vi.stubEnv(key,undefined);
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const objects=input.group.photos.map(p=>{const id=randomUUID();return {photoId:p.photoId,id,key:`uploads/${id}`};});
 const ticket=signGroupUploadTicket(input.group,objects,env),stored=new Map<string,Buffer>();
 let snapshot:any,receipt:any,savedIntent:any,posts=0,lookups=0,priceFailure=false;
 const fetcher=vi.fn<typeof fetch>(async(raw,init)=>{
  const url=new URL(String(raw));expect(init?.redirect).toBe('error');
  if(url.href===GPT41_CATALOG_URL){lookups++;return Response.json(priceFailure?null:catalog);}
  if(url.href===OPENROUTER_ENDPOINT){posts++;const body=JSON.parse(String(init?.body));expect(body.model).toBe(GPT41_MODEL);expect(body.messages[0].content).toBe(GPT41_PHOTO_PROMPT);expect(body.provider.only).toEqual(['openai']);return Response.json(posts===1?front:back);}
  expect(url.origin).toBe(env.TTB_SUPABASE_URL);
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const {p_op,p_input}=JSON.parse(String(init?.body));
   if(p_op==='has_intent')return Response.json(ledger.attempts.has(p_input.attemptId)||ledger.rows.has(p_input.reservationId));
   if(p_op==='reserve')return Response.json(await ledger.reserve(p_input.binding));
   if(p_op==='claim')return Response.json(await ledger.claim(p_input.binding,p_input.claimId));
   if(p_op==='complete')return Response.json(await ledger.complete(p_input.binding,p_input.claimId));
   if(p_op==='snapshot_prepare')snapshot=p_input;
   if(p_op==='snapshot_get')return Response.json({record:snapshot.record,assets:snapshot.assets});
   if(p_op==='save'){savedIntent=p_input.intent;receipt={state:'SAVED',reviewId:randomUUID(),comparisonId:p_input.comparisonId,savedAt:new Date().toISOString(),identity:'Shared demo access code — NOT an individually authenticated reviewer'};return Response.json(receipt);}
   if(p_op==='detail')return Response.json({receipt,record:snapshot.record,intent:savedIntent,assets:snapshot.assets});
   return Response.json(null);
  }
  const path=url.pathname.replace('/storage/v1','');
  if(path.startsWith('/object/authenticated/ttb-uploads/')){const i=objects.findIndex(o=>path.endsWith(o.key));return new Response(new Uint8Array(input.files[i].image.bytes),{headers:{'content-type':'image/png'}});}
  if(path.startsWith('/object/ttb-evidence/')){expect(new Headers(init?.headers).get('x-upsert')).toBe('false');stored.set(path.replace('/object/',''),Buffer.from(init?.body as Uint8Array));return Response.json({});}
  if(path.startsWith('/object/authenticated/ttb-evidence/'))return new Response(new Uint8Array(stored.get(path.replace('/object/authenticated/',''))!),{headers:{'content-type':'image/png'}});
  throw Error('Unexpected offline request');
 });vi.stubGlobal('fetch',fetcher);
 const req=(path:string,body:unknown)=>new Request(`${env.TTB_DEMO_ORIGIN}/api/${path}`,{method:'POST',headers:{origin:env.TTB_DEMO_ORIGIN,'x-ttb-demo-code':env.TTB_DEMO_ACCESS_SECRET,'content-type':'application/json'},body:JSON.stringify(body)});
 const compare=createAppRoute('comparisons'),reviews=createAppRoute('reviews');
 const prep=await compare(req('comparisons',{schemaVersion:2,phase:'prepare',ticket}));expect(prep.status).toBe(200);const {prepared}=await prep.json();expect(posts+lookups).toBe(0);
 const op={schemaVersion:2,phase:'execute',ticket,attemptId:prepared.attemptId,reservationId:prepared.reservationId,binding:prepared.binding};
 const response=await compare(req('comparisons',op));expect(response.status).toBe(200);const result=await response.json();expect(posts).toBe(2);expect(lookups).toBe(2);expect(result.reviewAvailability).toBe('available');
 expect(JSON.parse(snapshot.record).extraction).toMatchObject({model:GPT41_MODEL,promptVersion:GPT41_PROMPT_VERSION,schemaVersion:2});expect(JSON.parse(snapshot.record).source).toBe('openrouter');expect(stored.size).toBe(4);
 expect(result.result.comparison.rulesRevision).toBe(9);
 expect(result.result.aggregationVersion).toBe('photo-set-aggregation-v4');
 expect(Object.values(result.result.comparison.fields).map((field:any)=>field.status)).toEqual(Array(7).fill('match'));
 expect(result.result.comparison.physicalPrintSize.status).toBe('unverified');
 const intent={...newReviewIntent(result.result),outcome:'second-review',confirmed:true,notes:'Offline GPT integration; human review required.'};
 expect((await reviews(req('reviews',{comparisonId:result.comparisonId,idempotencyKey:randomUUID(),intent}))).status).toBe(200);
 const detail=await reviews(req(`reviews/${receipt.reviewId}`,{}));expect(detail.status).toBe(200);expect((await detail.json()).record).toEqual(result.result);
 expect((await compare(req('comparisons',op))).status).toBe(409);expect(posts).toBe(2);
 priceFailure=true;expect((await reviews(req(`reviews/${receipt.reviewId}`,{}))).status).toBe(200);expect(lookups).toBe(2);
 // Fresh revision to test actual catalog gate rather than replay denial.
 input.group.revision=2;const ticket2=signGroupUploadTicket(input.group,objects,env);
 const {prepared:next}=await(await compare(req('comparisons',{schemaVersion:2,phase:'prepare',ticket:ticket2}))).json();
 const denied=await compare(req('comparisons',{schemaVersion:2,phase:'execute',ticket:ticket2,attemptId:next.attemptId,reservationId:next.reservationId,binding:next.binding}));
 expect(denied.status).toBe(502);expect(posts).toBe(2);expect(lookups).toBe(4);expect(ledger.unresolved).toBe(4000000);expect(ledger.historical).toBe(27000000);
});
