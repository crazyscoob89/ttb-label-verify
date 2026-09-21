import { demoAccess, boundedBody, InputError } from './demo-security';
import { ReviewStore, ReviewError, reviewPath, REVIEW_LIMITS } from './review-store';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
let active=0;
export function createReviewHandler(env:Record<string,string|undefined>=process.env) {
 return async(request:Request):Promise<Response>=>{
  const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
  if(!demoAccess(request,env))return json({code:'access-denied'},403);
  if(active>=2)return json({code:'busy'},429);
  active++;let store:ReviewStore|undefined;
  try {
   const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean).slice(2);
   // POST reads deliberately retain the identical Origin fence on every browser
   // request. They have no side effects and need no request body.
   if(request.method!=='POST')return json({code:'method-not-allowed'},405);
   store=new ReviewStore(reviewPath(env));
   if(parts.length===0){
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return json({code:'invalid-input'},415);
    let input:unknown;
    try{input=JSON.parse((await boundedBody(request,REVIEW_LIMITS.requestBytes)).toString('utf8'));}
    catch(e){if(e instanceof InputError)throw e;return json({code:'invalid-input'},400);}
    return json({receipt:store.save(input)});
   }
   if(parts.length===1&&parts[0]==='list')return json({reviews:store.list(Number(url.searchParams.get('offset')??0))});
   if(parts.length===1)return json(store.detail(parts[0]));
   if(parts.length===2&&parts[1]==='evidence'){
    const evidence=store.evidence(parts[0]);
    return new Response(new Uint8Array(evidence.bytes),{headers:{...headers,'Content-Type':evidence.mime,'Content-Disposition':'inline; filename="normalized-label"'}});
   }
   return json({code:'not-found'},404);
  }catch(e){return json({code:e instanceof ReviewError?e.code:e instanceof InputError?'invalid-input':'reviews-unavailable'},e instanceof ReviewError||e instanceof InputError?e.status:503);}
  finally{try{store?.close();}finally{active--;}}
 };
}
