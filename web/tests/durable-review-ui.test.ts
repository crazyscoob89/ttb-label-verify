import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {newReviewIntent} from '../lib/review-policy';
const hooks=vi.hoisted(()=>({values:[] as unknown[],cursor:0,cleanups:[] as (()=>void)[]}));
vi.mock('react',()=>({useState:(initial:unknown)=>{const i=hooks.cursor++;if(!(i in hooks.values))hooks.values[i]=typeof initial==='function'?initial():initial;return [hooks.values[i],(v:unknown)=>{hooks.values[i]=typeof v==='function'?v(hooks.values[i]):v;}];},useRef:(initial:unknown)=>{const i=hooks.cursor++;if(!(i in hooks.values))hooks.values[i]={current:initial};return hooks.values[i];},useEffect:(fn:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.values)){hooks.values[i]=true;const cleanup=fn();if(cleanup)hooks.cleanups.push(cleanup);}}}));
import {useDurableReview} from '../lib/use-durable-review';
beforeEach(()=>{hooks.values=[];hooks.cursor=0;hooks.cleanups=[];});afterEach(()=>vi.unstubAllGlobals());
const intent={...newReviewIntent({synthetic:'UI hook test only'}),outcome:'correction' as const,notes:'Synthetic correction notes',confirmed:true};
function receipt(id:string){return {state:'SAVED',reviewId:randomUUID(),comparisonId:id,savedAt:'2026-09-22T12:00:00Z',identity:'Shared demo access code — NOT an individually authenticated reviewer'};}
function render(id:string,onSaved:NonNullable<Parameters<typeof useDurableReview>[3]>,epoch=0,value=intent){hooks.cursor=0;return useDurableReview(id,'test-code',value,onSaved,epoch);}
test('late server receipt after navigation ABA cannot mark current UI saved; unchanged retry retains idempotency key',async()=>{
 const id=randomUUID(),saved=receipt(id),onSaved=vi.fn();let finish!:(r:Response)=>void;const fetcher=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise(resolve=>finish=resolve)).mockResolvedValueOnce(Response.json({receipt:saved}));vi.stubGlobal('fetch',fetcher);
 const saving=render(id,onSaved).save();render(id,onSaved,1);render(id,onSaved,0);finish(Response.json({receipt:saved}));await saving;expect(render(id,onSaved).receipt).toBeUndefined();expect(onSaved).not.toHaveBeenCalled();
 await render(id,onSaved).save();expect(render(id,onSaved).receipt).toEqual(saved);expect(onSaved).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls.map(([,init])=>JSON.parse(String(init?.body)).idempotencyKey)[0]).toBe(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).idempotencyKey);
});
test('unmount on input replacement ignores the late receipt and callback while server history remains authoritative',async()=>{
 const id=randomUUID(),onSaved=vi.fn();let finish!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>finish=r)));const saving=render(id,onSaved).save();hooks.cleanups.forEach(fn=>fn());finish(Response.json({receipt:receipt(id)}));await saving;expect(onSaved).not.toHaveBeenCalled();expect(render(id,onSaved).receipt).toBeUndefined();
});
test('changed intent fences pending save; mismatched receipt never becomes SAVED',async()=>{
 const id=randomUUID(),onSaved=vi.fn();let finish!:(r:Response)=>void;const fetcher=vi.fn<typeof fetch>().mockImplementationOnce(()=>new Promise<Response>(r=>finish=r)).mockResolvedValueOnce(Response.json({receipt:receipt(randomUUID())}));vi.stubGlobal('fetch',fetcher);const saving=render(id,onSaved).save();render(id,onSaved,0,{...intent,notes:'Changed current assessment'});finish(Response.json({receipt:receipt(id)}));await saving;expect(onSaved).not.toHaveBeenCalled();await render(id,onSaved).save();expect(render(id,onSaved).receipt).toBeUndefined();expect(render(id,onSaved).error).toContain('receipt-binding-mismatch');
});
