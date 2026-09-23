import { GPT41_MODEL, MAX_GROUP_REQUEST_BYTES } from '../photo-contracts';
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, sanitizeImage } from '../intake';
import { boundedBody } from '../demo-security';
import { GPT41_PHOTO_PROMPT } from './gpt41-prompt';
import { gpt41JsonSchema } from './gpt41-wire';
import { OPENROUTER_ENDPOINT, type Transport } from './openrouter';

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
export function makeGpt41Request(image:Buffer,mime:'image/png'|'image/jpeg') {
  if(!image.length||image.length>MAX_IMAGE_BYTES)throw Error('Image byte bound');
  const body={model:GPT41_MODEL,messages:[{role:'system',content:GPT41_PHOTO_PROMPT},{role:'user',content:[{type:'text',text:'Read this one photograph independently.'},{type:'image_url',image_url:{url:`data:${mime};base64,${image.toString('base64')}`,detail:'high'}}]}],
    response_format:{type:'json_schema',json_schema:{name:'isolated_label_transcription',strict:true,schema:gpt41JsonSchema}},
    max_tokens:GPT41_OUTPUT_TOKENS,temperature:0,stream:false,
    provider:{only:['openai'],order:['openai'],allow_fallbacks:false,require_parameters:true,max_price:{prompt:2,completion:8}},
  };
  const encoded=JSON.stringify(body);
  if(Buffer.byteLength(encoded)>MAX_GROUP_REQUEST_BYTES)throw Error('Request byte bound');
  // data URL bytes are image transport, not text tokens. Count every other UTF-8
  // byte as a token (including the entire response schema), plus decoded vision
  // and envelope overhead. Never estimate image tokens from compressed bytes.
  const textBytes=Buffer.byteLength(encoded)-Buffer.byteLength(image.toString('base64'));
  if(textBytes+GPT41_VISION_ALLOWANCE+4096>GPT41_INPUT_TOKEN_BOUND||GPT41_COST_BOUND_MICROUSD>1000000)throw Error('Request token bound');
  return body;
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
  return async(url,init)=>{
    if(url!==OPENROUTER_ENDPOINT||init.method!=='POST'||init.redirect!=='error'||typeof init.body!=='string'||Buffer.byteLength(init.body)>MAX_GROUP_REQUEST_BYTES)throw Error('Unexpected paid request');
    const body=JSON.parse(init.body);
    const imageUrl=body?.messages?.[1]?.content?.[1]?.image_url?.url;
    if(typeof imageUrl!=='string')throw Error('Invalid image URL');
    const match=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageUrl);
    if(!match)throw Error('Invalid image URL');
    const image=Buffer.from(match[2],'base64'),mime=match[1] as 'image/png'|'image/jpeg';
    if(image.toString('base64')!==match[2]||JSON.stringify(body)!==JSON.stringify(makeGpt41Request(image,mime)))throw Error('Unexpected paid request');
    const decoded=await sanitizeImage({filename:mime==='image/png'?'photo.png':'photo.jpg',mime,bytes:image});
    gpt41ImageTokenBound(decoded.width,decoded.height);
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
