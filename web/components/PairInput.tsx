'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { applicationSchema, checkFileDeclaration } from '../lib/contracts';
import { prepareLiveMedia } from '../lib/live-media-client';
import type { ComparisonRecord } from '../lib/comparison-record';
import ReviewConfirmation from './ReviewConfirmation';
import { useSessionAccess } from './SessionAccess';
const fields = [
  ['applicationId', 'Application ID'], ['applicationVersion', 'Application version'],
  ['brand', 'Brand name'], ['classType', 'Class / type'], ['abv', 'Alcohol by volume (%)'],
  ['netContents', 'Net contents'], ['producerName', 'Producer name'], ['producerAddress', 'Producer address'],
] as const;
const labels: Record<string, string> = { ...Object.fromEntries(fields), commodity: 'Commodity', imported: 'Imported product?', origin: 'Origin context / country' };
type Feedback = { kind: 'error' | 'checked'; messages: string[] } | null;
export default function PairInput() {
  const [feedback,setFeedback]=useState<Feedback>(null), [running,setRunning]=useState(false);
  const [record,setRecord]=useState<ComparisonRecord|null>(null), [elapsed,setElapsed]=useState<number|null>(null);
  const [comparisonId,setComparisonId]=useState<string|undefined>();
  const {code:accessCode}=useSessionAccess();
  const [tab,setTab]=useState<'application'|'images'>('images');
  const [editing,setEditing]=useState(true), [preview,setPreview]=useState<string|null>(null),[filename,setFilename]=useState('');
  const feedbackRef=useRef<HTMLDivElement>(null), submitting=useRef(false), previewRef=useRef<string|null>(null), generation=useRef(0), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;if(previewRef.current)URL.revokeObjectURL(previewRef.current);};},[]);
  function invalidate(){generation.current++;setFeedback(null);setRecord(null);setElapsed(null);setComparisonId(undefined);}
  function selectImage(file?:File){
    if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=null;setPreview(null);setFilename(file?.name??'');
    if(!file)return;const error=checkFileDeclaration(file);if(error){setFeedback({kind:'error',messages:[error]});return;}
    const url=URL.createObjectURL(file);previewRef.current=url;setPreview(url);
  }
  async function check(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(submitting.current)return;
    invalidate();const run=generation.current;
    const live=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='live';
    const data=new FormData(event.currentTarget),selected=data.get('image');
    const errors:string[]=[];
    if(!(selected instanceof File)||!selected.name)errors.push('Choose a label image to pair with this application.');
    else {const error=checkFileDeclaration(selected);if(error)errors.push(error);}
    const values=Object.fromEntries(fields.map(([key])=>[key,data.get(key)]));
    const imported=data.get('imported');
    const result=applicationSchema.safeParse({...values,commodity:data.get('commodity'),imported:imported==='true'?true:imported==='false'?false:undefined,origin:{kind:data.get('originKind'),country:data.get('country')}});
    if(!result.success)for(const issue of result.error.issues){const message=`${labels[String(issue.path[0])]||'Application'}: provide an explicit, valid value consistent with the origin context.`;if(!errors.includes(message))errors.push(message);}
    if(!result.success)setTab('application');
    setFeedback(errors.length?{kind:'error',messages:errors}:{kind:'checked',messages:['Application fields checked locally. Image content is still unvalidated. Nothing has been uploaded, analyzed or saved.']});
    requestAnimationFrame(()=>feedbackRef.current?.focus());
    if(!live||errors.length||!result.success||!(selected instanceof File))return;
    if(!accessCode){setFeedback({kind:'error',messages:['Verify demo access once above before starting a live comparison.']});return;}
    submitting.current=true;setRunning(true);const started=performance.now();
    try{
      const media=await prepareLiveMedia(selected,result.data,accessCode,AbortSignal.timeout(35000));
      const response=await fetch('/api/comparisons',{method:'POST',headers:{...media.headers,'x-ttb-demo-code':accessCode},body:media.body,signal:AbortSignal.timeout(35000),cache:'no-store',redirect:'error'});
      const payload=await response.json();if(!mounted.current||run!==generation.current)return;
      setElapsed(payload.elapsedMs??Math.round(performance.now()-started));
      if(!response.ok||payload.result?.processing!=='complete'){
        setRecord(payload.result?.processing==='failed'?payload.result:null);
        const code=payload.result?.code??payload.code;
        setFeedback({kind:'error',messages:[code==='access-denied'?'Access denied by server. The code or server access configuration may have changed.':code==='invalid-input'?'Invalid image or application. Check the file signature, size and required fields.':`Comparison unavailable (${code??'provider-failed'}). No match was produced. A spend hold may remain; do not automatically retry.`]});
      }else{setRecord(payload.result);setComparisonId(payload.comparisonId);setEditing(false);setFeedback(null);}
    }catch{if(mounted.current&&run===generation.current){setElapsed(Math.round(performance.now()-started));setFeedback({kind:'error',messages:['Network or provider timeout. No match produced; spend may have been incurred. No automatic retry.']});}}
    finally{submitting.current=false;if(mounted.current){setRunning(false);requestAnimationFrame(()=>feedbackRef.current?.focus());}}
  }
  function navigate(next:typeof tab){setTab(next);requestAnimationFrame(()=>document.getElementById(`entry-${next}-tab`)?.focus());}
  return <>
    {!editing&&<div className="review-heading"><div><p className="eyebrow">Single review · live comparison</p><h2>{record?.processing==='complete'?record.application.brand:filename}</h2><p>Inspect the label and independent application, then record one human outcome.</p></div><button onClick={()=>{invalidate();setEditing(true);}}>Change input</button></div>}
    <form onSubmit={check} onChangeCapture={invalidate} hidden={!editing} noValidate autoComplete="off">
      <nav className="tabs entry-tabs" role="tablist" aria-label="Review inputs">{(['application','images'] as const).map(key=><button type="button" role="tab" id={`entry-${key}-tab`} aria-selected={tab===key} aria-controls={`entry-${key}-panel`} tabIndex={tab===key?0:-1} key={key} onClick={()=>navigate(key)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();navigate(e.key==='Home'?'application':e.key==='End'?'images':tab==='application'?'images':'application');}}}>{key==='application'?'Application':'Label images'}</button>)}</nav>
      <section id="entry-images-panel" role="tabpanel" aria-labelledby="entry-images-tab" hidden={tab!=='images'}>
        <fieldset disabled={running} className="input-card"><legend>Choose a label image</legend><p>Select an image now; the application can be entered separately. No form completion is required to select or preview a file.</p><label htmlFor="label-image">Label image (JPEG or PNG)</label><input id="label-image" name="image" type="file" accept="image/jpeg,image/png" onChange={e=>selectImage(e.target.files?.[0])} aria-describedby="file-help limits"/>
          {preview&&<div className="intake-preview"><img src={preview} alt="Selected label — not analyzed"/><p>{filename} · Local preview only — not uploaded or analyzed.</p></div>}
          <p className="help">Image-only extraction cannot establish an application match. This backend requires an independent application before comparison; image-only analysis is not connected.</p><button type="button" onClick={()=>navigate('application')}>Add application reference</button>
          <details><summary>Image limits & privacy</summary><p id="file-help" className="help">Image bytes are not read or uploaded for application-field checking. Local preview reads your selected file in this browser only. Explicit Submit for comparison uploads it and sends sanitized image bytes to the AI provider.</p><p id="limits" className="help">10 MiB input and sanitized output; 20 megapixels; one still JPEG or PNG. Server decoding, metadata removal and hashes are enforced. Use synthetic or authorized demo data only.</p></details>
        </fieldset>
      </section>
      <section id="entry-application-panel" role="tabpanel" aria-labelledby="entry-application-tab" hidden={tab!=='application'}>
        <fieldset disabled={running} className="input-card"><legend>Independent application reference</legend><p className="help">Enter the application's declarations, not values copied from label extraction. No commodity, import status, origin or alcohol value is inferred.</p><div className="field-grid">
          {fields.map(([key,label])=><div key={key}><label htmlFor={key}>{label}</label><input id={key} name={key} type="text" inputMode={key==='abv'?'decimal':'text'} required maxLength={key==='abv'?32:key.startsWith('application')?128:1000}/></div>)}
          <div><label htmlFor="commodity">Commodity</label><select id="commodity" name="commodity" required defaultValue=""><option value="">Choose a commodity</option><option value="wine">Wine</option><option value="distilled-spirits">Distilled spirits</option><option value="malt-beverage">Malt beverage</option></select></div>
          <div><label htmlFor="imported">Imported product?</label><select id="imported" name="imported" required defaultValue=""><option value="">Choose import status</option><option value="true">Yes — imported</option><option value="false">No — domestic</option></select></div>
          <div><label htmlFor="originKind">Origin context</label><select id="originKind" name="originKind" required defaultValue=""><option value="">Choose origin context</option><option value="imported">Imported origin</option><option value="domestic">Domestic origin</option></select></div>
          <div><label htmlFor="country">Country of origin</label><input id="country" name="country" type="text" required maxLength={1000}/></div>
        </div><p className="help">Enter the declared country, not an importer’s address. Domestic context requires United States; imported context requires a foreign country. This does not determine legal applicability. Identifiers are preserved exactly.</p></fieldset>
      </section>
      <div className="actions"><button type="submit" disabled={running}>Check application fields</button><button type="submit" value="live" disabled={running||!accessCode}>Submit for comparison</button></div><p className="help">{accessCode?'Access verified.':'Verify access above before live processing.'} Submission may incur provider spend. No automatic retries. Only a server-confirmed SAVED receipt is durable.</p>
    </form>
    {running&&<p role="status">Comparing label — waiting for provider observations…</p>}
    {feedback&&<div ref={feedbackRef} tabIndex={-1} className={`notice ${feedback.kind==='error'?'error':''}`} role={feedback.kind==='error'?'alert':'status'}><ul>{feedback.messages.map(message=><li key={message}>{message}</li>)}</ul></div>}
    {elapsed!==null&&<p className="help" role="status">Measured elapsed time: {elapsed} ms (request processing, not a model-only benchmark).</p>}
    {record?.processing==='complete'&&<section aria-label="Live comparison results"><ReviewConfirmation key={record.imageSha256+String(elapsed)} record={record} comparisonId={comparisonId} accessCode={accessCode} preview={preview}/></section>}
  </>;
}
