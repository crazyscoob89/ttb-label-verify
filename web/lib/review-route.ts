import { demoAccess, boundedBody, InputError } from './demo-security';
import { photoSelectorSchema } from './group-assets';
import { ReviewError, REVIEW_LIMITS, type DemoStoreFactory, type DemoReviewStore } from './demo-store-contracts';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
let active=0;
export function createReviewHandler(env:Record<string,string|undefined>=process.env,stores?:DemoStoreFactory) {
 return async(request:Request):Promise<Response>=>{
  const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
  if(!demoAccess(request,env))return json({code:'access-denied'},403);
  if(active>=2)return json({code:'busy'},429);
  active++;let store:DemoReviewStore|undefined;
  try {
   const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean).slice(2);
   // POST reads deliberately retain the identical Origin fence on every browser
   // request. They have no side effects and need no request body.
   if(request.method!=='POST')return json({code:'method-not-allowed'},405);
   if(env.TTB_PERSISTENCE==='supabase') {if(!stores)throw Error('Missing hosted stores');store=await stores.openReviews();}
   else {if(stores||(env.TTB_PERSISTENCE!==undefined&&env.TTB_PERSISTENCE!=='sqlite'))throw Error('Invalid persistence mode');const {ReviewStore,reviewPath}=await import('./review-store');store=new ReviewStore(reviewPath(env));}
   if(parts.length===0){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return json({code:'invalid-input'},415);
    let input:unknown;
    try{input=JSON.parse((await boundedBody(request,REVIEW_LIMITS.requestBytes)).toString('utf8'));}
    catch(e){if(e instanceof InputError)throw e;return json({code:'invalid-input'},400);}
    return json({receipt:await store.save(input)});
   }
   if(parts.length===1&&parts[0]==='list')return json({reviews:await store.list(Number(url.searchParams.get('offset')??0))});
   if(parts.length===1)return json(await store.detail(parts[0]));
   if(parts.length===5&&parts[1]==='photos'){
    const parsed=photoSelectorSchema.safeParse({photoId:parts[2],variant:parts[3]});
    if(!parsed.success)return json({code:'not-found'},404);
    if(parts[4]==='evidence-link'&&store.evidenceLink)return json(await store.evidenceLink(parts[0],parsed.data));
    if(parts[4]==='evidence'){const evidence=await store.evidence(parts[0],parsed.data);return new Response(new Uint8Array(evidence.bytes),{headers:{...headers,'Content-Type':evidence.mime,'Content-Disposition':'inline; filename="label-photo"'}});}
   }
   if(parts.length===2&&parts[1]==='evidence-link'&&store.evidenceLink)return json(await store.evidenceLink(parts[0]));
   if(parts.length===2&&parts[1]==='evidence'){
    const evidence=await store.evidence(parts[0]);
    return new Response(new Uint8Array(evidence.bytes),{headers:{...headers,'Content-Type':evidence.mime,'Content-Disposition':'inline; filename="normalized-label"'}});
   }
   return json({code:'not-found'},404);
  }catch(e){return json({code:e instanceof ReviewError?e.code:e instanceof InputError?'invalid-input':'reviews-unavailable'},e instanceof ReviewError||e instanceof InputError?e.status:503);}
  finally{try{await store?.close();}catch{/* Do not discard a committed receipt. */}finally{active--;}}
 };
}
