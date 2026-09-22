'use client';
import { useCallback,useEffect, useRef, useState } from 'react';
import {photoRecord,loadReviewPhotoEvidence,type UiCompleteComparison as CompleteComparison,type PhotoDescriptor} from '../lib/live-photo-client';
import type { Application } from '../lib/contracts';
import {checkedRecord,type ReviewIntent} from '../lib/review-policy';
import { savedReceiptSchema, type SavedReceipt } from '../lib/saved-review-contract';
import { loadReviewEvidence } from '../lib/live-media-client';
import EvidenceReview, { fieldLabels } from './EvidenceReview';
import { useSessionAccess } from './SessionAccess';
type Summary={receipt:SavedReceipt;application:Application;outcome:string};
type Detail={receipt:SavedReceipt;record:CompleteComparison;intent:ReviewIntent};
export default function SavedReviewHistory(){
 const {code}=useSessionAccess();
 const [rows,setRows]=useState<Summary[]>([]),[detail,setDetail]=useState<Detail|null>(null),[image,setImage]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0);
 const generation=useRef(0),imageUrl=useRef<string|null>(null);
 const loadPhoto=useCallback((photo:PhotoDescriptor,variant:'original'|'normalized',signal:AbortSignal)=>{if(!detail)throw Error('review-unavailable');return loadReviewPhotoEvidence(detail.receipt.reviewId,photo,variant,code,signal);},[detail,code]);
 function release(){if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current=null;setImage(null);}
 function clear(){generation.current++;release();setDetail(null);setRows([]);setError('');setBusy(false);setOffset(0);}
 useEffect(()=>()=>{generation.current++;if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);},[]);
 async function request(path:string){
  const response=await fetch(`/api/reviews/${path}`,{method:'POST',headers:{'x-ttb-demo-code':code},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error((await response.json()).code??'history-unavailable');return response;
 }
 async function load(next=0){
  const run=++generation.current;release();setDetail(null);setError('');setBusy(true);
  try{const data=await(await request(`list?offset=${next}`)).json();if(run===generation.current){setRows(data.reviews);setOffset(next);}}
  catch(e){if(run===generation.current){setRows([]);setError(e instanceof Error?e.message:'history-unavailable');}}
  finally{if(run===generation.current)setBusy(false);}
 }
 async function reopen(id:string){
  const run=++generation.current;release();setDetail(null);setError('');setBusy(true);
  try{
   const data:Detail=await(await request(id)).json();savedReceiptSchema.parse(data.receipt);
   if(data.receipt.reviewId!==id||!checkedRecord(data.record))throw Error('invalid-saved-record');
   if(photoRecord(data.record)){if(run===generation.current)setDetail(data);return;}
   const evidence=await loadReviewEvidence(id,data.record.imageSha256,code,AbortSignal.timeout(15000));
   if(run!==generation.current)return;
   const url=URL.createObjectURL(evidence);imageUrl.current=url;setImage(url);setDetail(data);
  }catch(e){if(run===generation.current)setError(e instanceof Error?e.message:'reopen-failed');}
  finally{if(run===generation.current)setBusy(false);}
 }
 return <section className="card" aria-label="Saved review history"><h1>Saved review history</h1>
  <p>Private shared-demo history — NOT individual reviewer authentication. Original immutable comparisons and human decisions; no government submission.</p>
  <div className="actions"><button onClick={()=>void load()} disabled={!code||busy}>Load saved reviews</button><button onClick={clear}>Clear private history from page</button></div>
  {!code&&<p className="help">Verify access once above to load private history.</p>}
  {busy&&<p role="status">Loading private saved evidence…</p>}{error&&<p role="alert">History unavailable ({error}). No saved state has been inferred.</p>}
  <ul>{rows.map(row=><li key={row.receipt.reviewId}><button disabled={busy} onClick={()=>void reopen(row.receipt.reviewId)}>Reopen {row.application.applicationId} / {row.application.applicationVersion} — {row.outcome}</button> · {row.receipt.savedAt}</li>)}</ul>
  {!!offset&&<button disabled={busy} onClick={()=>void load(Math.max(0,offset-50))}>Previous saved reviews</button>}{rows.length===50&&offset<150&&<button disabled={busy} onClick={()=>void load(offset+50)}>More saved reviews</button>}
  {detail&&<article data-testid="reopened-review"><h2>SAVED — original review reopened</h2><p>Receipt {detail.receipt.reviewId} · Server time {detail.receipt.savedAt}</p><p>{detail.receipt.identity}</p><p className="hash">Source {detail.record.source} · Normalized image SHA-256 {detail.record.imageSha256}</p>
   <EvidenceReview key={detail.receipt.reviewId} preserved record={detail.record} preview={image} loadPhoto={photoRecord(detail.record)?loadPhoto:undefined} resolution={key=>{const resolution=detail.intent.resolutions[key];return resolution&&resolution.decision!=='unresolved'?<span className="status resolved">Resolved · {resolution.decision} · server saved</span>:null;}} previewNote="Preserved normalized label from saved review. Retrieved bytes verified against the original saved hash.">
    <details className="original-application"><summary>Original application declarations</summary><dl data-testid="original-application">{Object.entries(detail.record.application).map(([key,value])=><div key={key}><dt>{fieldLabels[key as keyof typeof fieldLabels]??key.replace(/([A-Z])/g,' $1')}</dt><dd>{typeof value==='object'?`${value.kind} · ${value.country}`:String(value)}</dd></div>)}</dl></details>
    <section className="decision"><h3>Saved human decision — {detail.intent.outcome}</h3><p>{detail.intent.notes}</p><p>Physical assessment: {detail.intent.physical.checked?'Human checked':'Not checked'} — {detail.intent.physical.note}</p>{Object.entries(detail.intent.resolutions).map(([key,value])=><p key={key}>{fieldLabels[key as keyof typeof fieldLabels]}: {value.decision} — {value.note} Supporting evidence: {value.evidence}</p>)}</section>
   </EvidenceReview>
  </article>}
 </section>;
}
