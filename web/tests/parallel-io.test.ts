import {afterEach, expect, test, vi} from 'vitest';
import {mapTwoIO} from '../lib/parallel-io';

afterEach(()=>vi.useRealTimers());
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

test('two-operation waves preserve order despite reversed completion and never exceed two',async()=>{
  vi.useFakeTimers();let active=0,peak=0;const started:number[]=[];
  const pending=mapTwoIO([0,1,2,3,4],async n=>{
    started.push(n);peak=Math.max(peak,++active);await wait(n%2?10:30);active--;return n;
  });
  expect(started).toEqual([0,1]);await vi.advanceTimersByTimeAsync(10);expect(started).toEqual([0,1]);
  await vi.advanceTimersByTimeAsync(80);expect(await pending).toEqual([0,1,2,3,4]);expect(peak).toBe(2);expect(active).toBe(0);
});
test.each(['throw','reject','abort'] as const)('%s drains started sibling, starts no later work, and never retries',async failure=>{
  vi.useFakeTimers();const controller=new AbortController();let drained=false,returned=false;const started:number[]=[];
  const pending=mapTwoIO([0,1,2,3],async n=>{
    started.push(n);
    if(n===0){if(failure==='throw')throw Error('failed');await wait(10);if(failure==='abort'){controller.abort();return n;}throw Error('failed');}
    await wait(50);drained=true;return n;
  },controller.signal).catch(()=>{returned=true;});
  await vi.advanceTimersByTimeAsync(20);expect(returned).toBe(false);expect(drained).toBe(false);
  await vi.advanceTimersByTimeAsync(30);await pending;expect(returned).toBe(true);expect(drained).toBe(true);expect(started).toEqual([0,1]);
});
test('pre-aborted signal starts no I/O',async()=>{
  const controller=new AbortController();controller.abort();const work=vi.fn();await expect(mapTwoIO([0,1],work,controller.signal)).rejects.toThrow();expect(work).not.toHaveBeenCalled();
});
