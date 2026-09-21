'use client';
import { useEffect, useRef, useState } from 'react';
import type { CompleteComparison } from '../lib/comparison-record';
import type { Application } from '../lib/contracts';
import type { ReviewIntent } from '../lib/review-policy';
import { savedReceiptSchema, type SavedReceipt } from '../lib/saved-review-contract';
import { FIELD_KEYS } from '../lib/rules';
import { fieldLabels, observations } from './ComparisonWorkspace';
type Summary={receipt:SavedReceipt;application:Application;outcome:string};
type Detail={receipt:SavedReceipt;record:CompleteComparison;intent:ReviewIntent};
export default function SavedReviewHistory(){
 const [code,setCode]=useState(''),[rows,setRows]=useState<Summary[]>([]),[detail,setDetail]=useState<Detail|null>(null),[image,setImage]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0);
 const generation=useRef(0),imageUrl=useRef<string|null>(null);
 function release(){if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current=null;setImage(null);}
 function clear(){generation.current++;release();setDetail(null);setRows([]);setError('');setBusy(false);setOffset(0);}
 useEffect(()=>()=>{generation.current++;if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);},[]);
 async function request(path:string){
  const response=await fetch(`/api/reviews/${path}`,{method:'POST',headers:{'x-ttb-demo-code':code},cache:'no-store',signal:AbortSignal.timeout(15000)});
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
   const response=await request(`${id}/evidence`),bytes=await response.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==data.record.imageSha256)throw Error('evidence-integrity-mismatch');
   if(run!==generation.current)return;
   const url=URL.createObjectURL(new Blob([bytes],{type:response.headers.get('content-type')??'image/png'}));imageUrl.current=url;setImage(url);setDetail(data);
  }catch(e){if(run===generation.current)setError(e instanceof Error?e.message:'reopen-failed');}
  finally{if(run===generation.current)setBusy(false);}
 }
 return <section className="card" aria-label="Saved review history"><h1>Saved review history</h1>
  <p>Private shared-demo history — NOT individual reviewer authentication. Original immutable comparisons and human decisions; no government submission.</p>
  <label htmlFor="history-code">History demo access code</label><input id="history-code" type="password" maxLength={256} autoComplete="off" value={code} onChange={e=>{clear();setCode(e.target.value);}}/>
  <button onClick={()=>void load()} disabled={!code||busy}>Load saved reviews</button><button onClick={()=>{clear();setCode('');}}>Clear private history from page</button>
  {busy&&<p role="status">Loading private saved evidence…</p>}{error&&<p role="alert">History unavailable ({error}). No saved state has been inferred.</p>}
  <ul>{rows.map(row=><li key={row.receipt.reviewId}><button disabled={busy} onClick={()=>void reopen(row.receipt.reviewId)}>Reopen {row.application.applicationId} / {row.application.applicationVersion} — {row.outcome}</button> · {row.receipt.savedAt}</li>)}</ul>
  {!!offset&&<button disabled={busy} onClick={()=>void load(Math.max(0,offset-50))}>Previous saved reviews</button>}{rows.length===50&&offset<150&&<button disabled={busy} onClick={()=>void load(offset+50)}>More saved reviews</button>}
  {detail&&<article data-testid="reopened-review"><h2>SAVED — original review reopened</h2><p>Receipt {detail.receipt.reviewId} · Server time {detail.receipt.savedAt}</p><p>{detail.receipt.identity}</p><p className="hash">Source {detail.record.source} · Normalized image SHA-256 {detail.record.imageSha256}</p>
   <div className="workspace"><section><h3>Preserved normalized label</h3>{image&&<img className="label-preview" src={image} alt="Preserved normalized label from saved review"/>}</section><section><h3>Original application</h3><pre style={{whiteSpace:'pre-wrap'}} data-testid="original-application">{JSON.stringify(detail.record.application,null,2)}</pre></section></div>
   <h3>Original seven-field comparison</h3><table><thead><tr><th>Field</th><th>Observed evidence</th><th>Expected</th><th>Machine finding</th></tr></thead><tbody>{FIELD_KEYS.map(key=>{const field=detail.record.comparison.fields[key];return <tr key={key}><th>{fieldLabels[key]}</th><td>{observations(field.observed)}</td><td>{field.expected}</td><td>{field.status}<p>{field.reasons.join(' ')}</p></td></tr>;})}</tbody></table>
   <h3>Saved human decision — {detail.intent.outcome}</h3><p>{detail.intent.notes}</p><p>Physical assessment: {detail.intent.physical.checked?'Human checked':'Not checked'} — {detail.intent.physical.note}</p>{Object.entries(detail.intent.resolutions).map(([key,value])=><p key={key}>{key}: {value.decision} — {value.note} Supporting evidence: {value.evidence}</p>)}
  </article>}
 </section>;
}
