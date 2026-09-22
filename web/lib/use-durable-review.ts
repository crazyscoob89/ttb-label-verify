'use client';
import { useEffect, useRef, useState } from 'react';
import { savedReceiptSchema, type SavedReceipt } from './saved-review-contract';
import type { ReviewIntent } from './review-policy';
// Page memory only: survive batch navigation, never store the shared code.
// Bounded by the demo's snapshot cap. Reload recovery uses server history.
const attempts=new Map<string,{payload:string;key:string;receipt?:SavedReceipt}>();
export function useDurableReview(comparisonId:string|undefined,code:string|undefined,intent:ReviewIntent,onSaved?:(receipt:SavedReceipt)=>void) {
 const [receipt,setReceipt]=useState<SavedReceipt|undefined>(()=>comparisonId?attempts.get(comparisonId)?.receipt:undefined);
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 const [elapsedMs,setElapsedMs]=useState<number|null>(null);
 const selection=JSON.stringify([comparisonId,intent]);
 const latest=useRef(selection);latest.current=selection;
 const mounted=useRef(true),busy=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function save(){
  if(!comparisonId||!code||busy.current||receipt)return;
  busy.current=true;setPending(true);setError('');setElapsedMs(null);const started=performance.now(),run=selection;
  const payload=JSON.stringify(intent);
  let attempt=attempts.get(comparisonId);
  if(!attempt||attempt.payload!==payload){
   attempt={payload,key:crypto.randomUUID()};
   if(attempts.size>=200)attempts.delete(attempts.keys().next().value!);
   attempts.set(comparisonId,attempt);
  }
  try {
   const response=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json','x-ttb-demo-code':code},body:JSON.stringify({comparisonId,idempotencyKey:attempt.key,intent:JSON.parse(attempt.payload)}),cache:'no-store',signal:AbortSignal.timeout(15000)});
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.code==='string'?data.code:'save-failed');
   const saved=savedReceiptSchema.parse(data.receipt);
   if(saved.comparisonId!==comparisonId)throw Error('receipt-binding-mismatch');
   if(!mounted.current||latest.current!==run)return;
   attempt.receipt=saved;
   onSaved?.(saved);
   if(mounted.current)setReceipt(saved);
  }catch(e){if(mounted.current&&latest.current===run)setError(`UNSAVED — receipt not confirmed (${e instanceof Error?e.message:'network failure'}). Retry unchanged to recover the same receipt, or check saved history before changing the decision.`);}
  finally{busy.current=false;if(mounted.current){setPending(false);if(latest.current===run)setElapsedMs(Math.round(performance.now()-started));}}
 }
 return {receipt,pending,error,save,elapsedMs};
}
