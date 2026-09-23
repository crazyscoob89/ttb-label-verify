import { GPT41_MODEL, MAX_GROUP_REQUEST_BYTES } from '../photo-contracts';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, sanitizeImage } from '../intake';
import { boundedBody } from '../demo-security';
import { GPT41_PHOTO_PROMPT } from './gpt41-prompt';
import { gpt41JsonSchema } from './gpt41-wire';
import { OPENROUTER_ENDPOINT, type Transport } from './openrouter';
import { gpt41DetailRectangles, gpt41DetailViews, type Gpt41DetailView } from './gpt41-views';

export const GPT41_OUTPUT_TOKENS=3200;
export const GPT41_INPUT_TOKEN_BOUND=230000;
export const GPT41_VISION_ALLOWANCE=32768;
export const GPT41_CATALOG_URL='https://openrouter.ai/api/v1/models';
// Same two-fold margin and token ceilings as the measured benchmark, not the
// 1M model context multiplied into a fictional cost for every small photograph.
export const GPT41_COST_BOUND_MICROUSD=Math.ceil(2*(GPT41_INPUT_TOKEN_BOUND*2+GPT41_OUTPUT_TOKENS*8));

export function gpt41ImageTokenBound(width:number,height:number):number {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_IMAGE_PIXELS)throw Error('Image pixel bound');
  // GPT-4.1 high-detail uses 512px tiles (85 base + 170/tile), downscaling
  // large inputs. Overbound even original, unresized tiles, with a 2048-square
  // allowance for small-image scaling. Reject pathological aspect ratios whose
  // unresized bound exceeds the benchmark's generous 32768-token allowance.
  const bound=85+170*Math.max(16,Math.ceil(width/512)*Math.ceil(height/512));
  if(bound>GPT41_VISION_ALLOWANCE)throw Error('Image token bound');
  return bound;
}
export function makeGpt41Request(image:Buffer,mime:'image/png'|'image/jpeg',details:Gpt41DetailView[]=[]) {
  if(!image.length||image.length>MAX_IMAGE_BYTES||![0,2].includes(details.length)||details.some(d=>!d.bytes.length||d.bytes.length>MAX_IMAGE_BYTES))throw Error('Image byte bound');
  const content=[{type:'text',text:details.length
    ? 'Read this one photograph independently. The first image is the complete photograph; the following overlapping detail views come only from that same photograph. Read the whole photograph and use the details to check visible characters and context. Return one observation set, not one per view. Do not reconstruct clipped or unreadable text, expand printed abbreviations, or treat repeated views as independent evidence.'
    : 'Read this one photograph independently.'},
    {type:'image_url',image_url:{url:`data:${mime};base64,${image.toString('base64')}`,detail:'high'}},
    ...details.flatMap(d=>[{type:'text',text:JSON.stringify(d.tag)},{type:'image_url',image_url:{url:`data:image/png;base64,${d.bytes.toString('base64')}`,detail:'high'}}])];
  const body={model:GPT41_MODEL,messages:[{role:'system',content:GPT41_PHOTO_PROMPT},{role:'user',content}],
    response_format:{type:'json_schema',json_schema:{name:'isolated_label_transcription',strict:true,schema:gpt41JsonSchema}},
    max_tokens:GPT41_OUTPUT_TOKENS,temperature:0,stream:false,
    provider:{only:['openai'],order:['openai'],allow_fallbacks:false,require_parameters:true,max_price:{prompt:2,completion:8}},
  };
  const encoded=JSON.stringify(body);
  if(Buffer.byteLength(encoded)>MAX_GROUP_REQUEST_BYTES)throw Error('Request byte bound');
  const imageBytes=[image,...details.map(d=>d.bytes)].reduce((sum,b)=>sum+4*Math.ceil(b.length/3),0);
  // One TOTAL vision allowance, not one per crop. The decoded sum must fit this
  // allowance in preparation and again at dispatch. Transport base64 isn't text.
  const textBytes=Buffer.byteLength(encoded)-imageBytes;
  if(textBytes+GPT41_VISION_ALLOWANCE+4096>GPT41_INPUT_TOKEN_BOUND||GPT41_COST_BOUND_MICROUSD>1000000)throw Error('Request token bound');
  return body;
}

export function gpt41RequestInputTokenBound(body:ReturnType<typeof makeGpt41Request>,dimensions:{width:number;height:number}[]):number {
  const content=body.messages[1].content;
  if(!Array.isArray(content))throw Error('Invalid content');
  const images=content.filter(p=>p.type==='image_url');
  if(![1,3].includes(images.length)||images.length!==dimensions.length)throw Error('Image count bound');
  const vision=dimensions.reduce((sum,d)=>sum+gpt41ImageTokenBound(d.width,d.height),0);
  if(vision>GPT41_VISION_ALLOWANCE)throw Error('Combined image token bound');
  const encoded=JSON.stringify(body),base64=images.reduce((sum,p)=>sum+(p.image_url?.url.split(',')[1]?.length??0),0);
  const bound=Buffer.byteLength(encoded)-base64+vision+4096;
  if(Buffer.byteLength(encoded)>MAX_GROUP_REQUEST_BYTES||bound>GPT41_INPUT_TOKEN_BOUND||GPT41_COST_BOUND_MICROUSD>1000000)throw Error('Request token bound');
  return bound;
}

/** Adapter preparation; the guard independently re-derives the same views.
 * Snapshot before awaits; retain exact full-photo bytes, never validator re-encodes.
 */
export async function prepareGpt41Request(image:Buffer,mime:'image/png'|'image/jpeg',photoId:string,signal?:AbortSignal) {
  signal?.throwIfAborted();
  if(!Buffer.isBuffer(image)||image.buffer instanceof SharedArrayBuffer||!image.length||image.length>MAX_IMAGE_BYTES)throw Error('Image byte bound');
  const source=Buffer.from(image);
  const decoded=await sanitizeImage({filename:mime==='image/png'?'photo.png':'photo.jpg',mime,bytes:source});
  const rectangles=gpt41DetailRectangles(decoded.width,decoded.height);
  const dimensions=[decoded,...rectangles];
  // Bound derived pixels/tokens before allocating crop buffers.
  if(dimensions.reduce((sum,d)=>sum+gpt41ImageTokenBound(d.width,d.height),0)>GPT41_VISION_ALLOWANCE)throw Error('Combined image token bound');
  const details=await gpt41DetailViews(source,photoId,decoded.width,decoded.height,signal);
  const body=makeGpt41Request(source,mime,details);
  gpt41RequestInputTokenBound(body,dimensions);
  signal?.throwIfAborted();return body;
}
export function validateGpt41Catalog(catalog:unknown):void {
  const data=(catalog as {data?:unknown})?.data;
  if(!Array.isArray(data))throw Error('Catalog unavailable');
  const matches=data.filter(m=>m?.id===GPT41_MODEL);if(matches.length!==1)throw Error('Unknown model');
  const model=matches[0];
  if(!Number.isSafeInteger(model.context_length)||model.context_length<GPT41_INPUT_TOKEN_BOUND+GPT41_OUTPUT_TOKENS||model.context_length>1047576)throw Error('Context drift');
  if(!model.top_provider||!Number.isSafeInteger(model.top_provider.max_completion_tokens)||model.top_provider.max_completion_tokens<GPT41_OUTPUT_TOKENS)throw Error('Output context drift');
  const pricing=model.pricing;
  if(!pricing||typeof pricing!=='object'||Array.isArray(pricing))throw Error('Unknown pricing');
  const rate=(value:unknown)=>{
    if(typeof value!=='string'||!/^\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('Unknown price');
    return Number(value);
  };
  if(rate(pricing.prompt)>0.000002||rate(pricing.completion)>0.000008)throw Error('Price drift');
  for(const [key,value] of Object.entries(pricing)){
    const amount=rate(value);
    if(['prompt','completion'].includes(key))continue;
    // Cache reads replace ordinary input, never add to it; no cache writes are
    // requested. Discount must not exceed our ordinary input cap.
    if(key==='input_cache_read'){if(amount>0.000002)throw Error('Cache price drift');}
    else if(key==='web_search'){/* Strict request has no tools/plugins/search. */}
    else if(amount!==0)throw Error('Unknown additional fee');
  }
}

/** Immediately before each POST, inside its claimed hold. No retry/cache/fallback.
 * The canonical body gate rules out malformed/null-string routing or extra tools.
 * The injected transport is raw; this guard is also installed by the adapter. */
export function gpt41PriceCheckedTransport(transport:Transport):Transport {
  return async(url,incoming)=>{
    // Guard the exact immutable body/method that will be dispatched, even while
    // asynchronous image validation/catalog lookup yields to a caller.
    const init={...incoming};
    if(url!==OPENROUTER_ENDPOINT||init.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||Buffer.byteLength(init.body)>MAX_GROUP_REQUEST_BYTES)throw Error('Unexpected paid request');
    const body=JSON.parse(init.body),content=body?.messages?.[1]?.content;
    if(!Array.isArray(content)||![2,6].includes(content.length))throw Error('Invalid image count');
    const images: {bytes:Buffer;mime:'image/png'|'image/jpeg';width:number;height:number}[]=[];
    for(let index=1;index<content.length;index+=2){
      init.signal?.throwIfAborted();
      const part=content[index],match=typeof part?.image_url?.url==='string'&&/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.image_url.url);
      if(part?.type!=='image_url'||part.image_url.detail!=='high'||!match||match[2].length>4*Math.ceil(MAX_IMAGE_BYTES/3))throw Error('Invalid image URL');
      const bytes=Buffer.from(match[2],'base64'),mime=match[1] as 'image/png'|'image/jpeg';
      if(bytes.toString('base64')!==match[2])throw Error('Invalid image encoding');
      const decoded=await sanitizeImage({filename:mime==='image/png'?'photo.png':'photo.jpg',mime,bytes});
      images.push({bytes,mime,width:decoded.width,height:decoded.height});
    }
    // Meter ALL supplied high-detail images, not just the original, before GET/POST.
    gpt41RequestInputTokenBound(body,images);
    const original=images[0],rectangles=gpt41DetailRectangles(original.width,original.height);
    if(images.length!==1+rectangles.length)throw Error('Unexpected detail count');
    const details=rectangles.length
      ? await gpt41DetailViews(original.bytes,JSON.parse(content[2].text)?.photoId,original.width,original.height,init.signal??undefined)
      : [];
    // Re-derive from the sole full source. Metadata/hash claims alone cannot admit
    // crops from another photo, changed transforms, instructions, or pixel edits.
    if(JSON.stringify(body)!==JSON.stringify(makeGpt41Request(original.bytes,original.mime,details)))throw Error('Unexpected paid request');
    const controller=new AbortController(),signal=init.signal?AbortSignal.any([init.signal,controller.signal]):controller.signal;
    let abort:(()=>void)|undefined;
    const expired=new Promise<never>((_,reject)=>{abort=()=>reject(Error('Catalog cancelled'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
    const timer=setTimeout(()=>controller.abort(),5000);
    try {
      const catalog=await Promise.race([(async()=>{
        signal.throwIfAborted();const response=await transport(GPT41_CATALOG_URL,{method:'GET',redirect:'error',cache:'no-store',signal});
        if(signal.aborted||response.status!==200||response.redirected||(response.url&&response.url!==GPT41_CATALOG_URL)){void response.body?.cancel().catch(()=>{});throw Error('Catalog unavailable');}
        return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBody(response,4*1024*1024)));
      })(),expired]);
      validateGpt41Catalog(catalog);signal.throwIfAborted();
    }finally{clearTimeout(timer);if(abort)signal.removeEventListener('abort',abort);controller.abort();}
    init.signal?.throwIfAborted();
    return transport(url,init);
  };
}
