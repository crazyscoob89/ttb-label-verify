import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import sharp from 'sharp';
import {GPT41_COST_BOUND_MICROUSD,GPT41_INPUT_TOKEN_BOUND,GPT41_OUTPUT_TOKENS,GPT41_VISION_ALLOWANCE,GPT41_CATALOG_URL,gpt41ImageTokenBound,gpt41PriceCheckedTransport,makeGpt41Request,validateGpt41Catalog} from '../lib/extraction/gpt41-pricing';
import {OPENROUTER_ENDPOINT,type Transport} from '../lib/extraction/openrouter';
import {image} from './fixtures/synthetic';
import catalog from './fixtures/gpt41-catalog.json';
const network=vi.fn(()=>{throw Error('Network forbidden');});
beforeEach(()=>{network.mockClear();vi.stubGlobal('fetch',network);});
afterEach(()=>{expect(network).not.toHaveBeenCalled();vi.unstubAllGlobals();});
test('archived current GPT catalog permits bounded request: $0.9712 margin, NOT max model context as usage',()=>{
 expect(()=>validateGpt41Catalog(catalog)).not.toThrow();expect(catalog.data[0].context_length).toBe(1047576);
 expect(GPT41_COST_BOUND_MICROUSD).toBe(971200);expect(GPT41_COST_BOUND_MICROUSD).toBeLessThanOrEqual(1000000);
 expect(GPT41_INPUT_TOKEN_BOUND).toBe(230000);expect(GPT41_OUTPUT_TOKENS).toBe(3200);
 expect(gpt41ImageTokenBound(4000,5000)).toBeLessThanOrEqual(GPT41_VISION_ALLOWANCE);
 for(const [w,h] of [[4001,5000],[1,20000000],[-1,1],[0,1],[1.5,1],[NaN,1]])expect(()=>gpt41ImageTokenBound(w,h)).toThrow();
});
test.each([-0.000002,'-0.000002',null,'null','NaN','Infinity','1e-6',{},'',0.000002])('negative/real/non-decimal/null price %j never accepted',value=>{
 for(const key of ['prompt','completion','input_cache_read','web_search']){const c=structuredClone(catalog);Object.assign(c.data[0].pricing,{[key]:value});expect(()=>validateGpt41Catalog(c)).toThrow();}
});
test('catalog model/context/output and unknown-fee drift fail closed',()=>{
 for(const patch of [{id:'other'},{context_length:1047577},{context_length:200000},{context_length:'1047576'},{top_provider:null},{top_provider:{max_completion_tokens:3199}},{pricing:{...catalog.data[0].pricing,prompt:'0.0000021'}},{pricing:{...catalog.data[0].pricing,completion:'0.0000081'}},{pricing:{...catalog.data[0].pricing,request:'0.01'}},{pricing:{...catalog.data[0].pricing,input_cache_write:'0.000001'}}])expect(()=>validateGpt41Catalog({data:[{...catalog.data[0],...patch}]})).toThrow();
 for(const bad of [null,'null',{},[],{data:[]},{data:[catalog.data[0],catalog.data[0]]}])expect(()=>validateGpt41Catalog(bad)).toThrow();
});
test('canonical request gate rejects null/string fields, routing spoof, tools and malformed bodies before lookup or POST',async()=>{
 const bytes=await image(),transport=vi.fn<Transport>(async()=>Response.json(catalog)),guard=gpt41PriceCheckedTransport(transport),valid=makeGpt41Request(bytes,'image/png');
 const patches=[{model:null},{model:'null'},{model:'anthropic/claude-haiku-4.5'},{max_tokens:-3.2},{max_tokens:3201},{stream:'false'},{messages:null},{provider:null},{provider:{...valid.provider,only:['azure']}},{provider:{...valid.provider,allow_fallbacks:true}},{provider:{...valid.provider,max_price:{prompt:2.1,completion:8}}},{tools:[]},{plugins:[]},{response_format:{type:'json_object'}}];
 for(const body of ['{','null','"null"',...patches.map(p=>JSON.stringify({...valid,...p}))])await expect(guard(OPENROUTER_ENDPOINT,{method:'POST',redirect:'error',body})).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
});
test('decode 20MP independently of tiny compressed size; canonical one POST includes exact endpoint caps',async()=>{
 const bytes=await sharp({create:{width:4000,height:5000,channels:3,background:'#aaa'}}).jpeg().toBuffer();
 const body=JSON.stringify(makeGpt41Request(bytes,'image/jpeg'));const transport=vi.fn<Transport>(async url=>Response.json(url===GPT41_CATALOG_URL?catalog:{ok:true}));
 expect((await gpt41PriceCheckedTransport(transport)(OPENROUTER_ENDPOINT,{method:'POST',redirect:'error',body})).status).toBe(200);
 expect(transport).toHaveBeenCalledTimes(2);expect(transport.mock.calls[0][0]).toBe(GPT41_CATALOG_URL);expect(JSON.parse(String(transport.mock.calls[1][1].body)).provider).toEqual({only:['openai'],order:['openai'],allow_fallbacks:false,require_parameters:true,max_price:{prompt:2,completion:8}});
 const oversized=await sharp({create:{width:4001,height:5000,channels:3,background:'#aaa'}}).jpeg().toBuffer();await expect(gpt41PriceCheckedTransport(transport)(OPENROUTER_ENDPOINT,{method:'POST',redirect:'error',body:JSON.stringify(makeGpt41Request(oversized,'image/jpeg'))})).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(2);
});
test('bad catalog cannot reach provider; cancelled catalog/body is bounded without retry',async()=>{
 const bytes=await image(),init={method:'POST',redirect:'error' as const,body:JSON.stringify(makeGpt41Request(bytes,'image/png'))};
 for(const response of [Response.json(null),new Response('error',{status:500}),new Response(null,{status:302}),new Response('x'.repeat(4*1024*1024+1))]){const t=vi.fn<Transport>(async()=>response);await expect(gpt41PriceCheckedTransport(t)(OPENROUTER_ENDPOINT,init)).rejects.toThrow();expect(t).toHaveBeenCalledTimes(1);}
 const controller=new AbortController(),t=vi.fn<Transport>(()=>new Promise(()=>{}));const pending=gpt41PriceCheckedTransport(t)(OPENROUTER_ENDPOINT,{...init,signal:controller.signal});await vi.waitFor(()=>expect(t).toHaveBeenCalledTimes(1));controller.abort();await expect(pending).rejects.toThrow();expect(t).toHaveBeenCalledTimes(1);
});
