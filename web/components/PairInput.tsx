'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { applicationSchema, checkFileDeclaration } from '../lib/contracts';
import {prepareLiveGroup,executeLiveGroup,photoRecord,type UiComparisonRecord as ComparisonRecord,type StageMeasurement,type PhotoDeclaration} from '../lib/live-photo-client';
import PhotoInput,{type LocalPhoto} from './PhotoInput';
import OperationTimings from './OperationTimings';
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
  const [editing,setEditing]=useState(true),[photos,setPhotos]=useState<LocalPhoto[]>([]),[stages,setStages]=useState<StageMeasurement[]>([]);
  const filename=photos[0]?.file.name??'',preview=photos[0]?.url??null;
  const photoRef=useRef(photos);photoRef.current=photos;
  const groupId=useRef(''),revision=useRef(1),controller=useRef<AbortController|null>(null);
  const feedbackRef=useRef<HTMLDivElement>(null), submitting=useRef(false),generation=useRef(0),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;controller.current?.abort();photoRef.current.forEach(p=>URL.revokeObjectURL(p.url));};},[]);
  function invalidate(edit=true){generation.current++;if(edit)revision.current++;controller.current?.abort();setFeedback(null);setRecord(null);setElapsed(null);setStages([]);setComparisonId(undefined);}
  async function check(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(submitting.current)return;
    invalidate(false);const run=generation.current;
    const live=(event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='live';
    const data=new FormData(event.currentTarget);
    const errors:string[]=[];
    if(!photos.length)errors.push('Choose 1–4 label photos for this bottle and application.');
    for(const photo of photos){const error=checkFileDeclaration(photo.file);if(error)errors.push(`${photo.file.name}: ${error}`);}
    const values=Object.fromEntries(fields.map(([key])=>[key,data.get(key)]));
    const imported=data.get('imported');
    const result=applicationSchema.safeParse({...values,commodity:data.get('commodity'),imported:imported==='true'?true:imported==='false'?false:undefined,origin:{kind:data.get('originKind'),country:data.get('country')}});
    if(!result.success)for(const issue of result.error.issues){const message=`${labels[String(issue.path[0])]||'Application'}: provide an explicit, valid value consistent with the origin context.`;if(!errors.includes(message))errors.push(message);}
    if(!result.success)setTab('application');
    setFeedback(errors.length?{kind:'error',messages:errors}:{kind:'checked',messages:['Application fields checked locally. Image content is still unvalidated. Nothing has been uploaded, analyzed or saved.']});
    requestAnimationFrame(()=>feedbackRef.current?.focus());
    if(!live||errors.length||!result.success)return;
    submitting.current=true;setRunning(true);const started=performance.now();
    try{
      const active=new AbortController();controller.current=active;const signal=AbortSignal.any([active.signal,AbortSignal.timeout(55000)]);
      if(!groupId.current)groupId.current=crypto.randomUUID();
      const onStage=(stage:StageMeasurement)=>{if(mounted.current&&run===generation.current)setStages(previous=>[...previous.filter(s=>s.stage!==stage.stage),stage]);};
      const ready=await prepareLiveGroup({schemaVersion:2,groupId:groupId.current,revision:revision.current,application:result.data,photos:photos.map(p=>({photoId:p.photoId,role:p.role,filename:p.file.name,mime:p.file.type as PhotoDeclaration['mime'],bytes:p.file.size}))},photos.map(p=>p.file),accessCode,signal,fetch,onStage);
      if(!mounted.current||run!==generation.current)return;
      const payload=await executeLiveGroup(ready,accessCode,signal,fetch,onStage);if(!mounted.current||run!==generation.current)return;
      setElapsed(Math.round(performance.now()-started));
      if(payload.result?.processing!=='complete'){
        setRecord(payload.result?.processing==='failed'?payload.result:null);
        const code=payload.result?.processing==='failed'?payload.result.code:'provider-failed';
        setFeedback({kind:'error',messages:[code==='daily-limit-reached'?'Daily demo scan limit reached. The public demo allows 50 paid scans per UTC day; saved examples and history remain available.':code==='access-denied'?'Access denied by server. The server access configuration may have changed.':code==='invalid-input'?'Invalid image or application. Check the file signature, size and required fields.':`Comparison unavailable (${code??'provider-failed'}). No match was produced. A spend hold may remain; do not automatically retry.`]});
      }else{setRecord(payload.result);setComparisonId(payload.comparisonId);setEditing(false);setFeedback(null);}
    }catch(error){if(mounted.current&&run===generation.current){setElapsed(Math.round(performance.now()-started));const reason=error instanceof Error&&/^[a-z-]{1,80}$/.test(error.message)?` (${error.message})`:'';setFeedback({kind:'error',messages:[`Whole photo group unavailable${reason}. No match produced; spend may have been incurred. No automatic retry. Check saved history before starting new work.`]});}}
    finally{submitting.current=false;if(mounted.current){setRunning(false);requestAnimationFrame(()=>feedbackRef.current?.focus());}}
  }
  function navigate(next:typeof tab){setTab(next);requestAnimationFrame(()=>document.getElementById(`entry-${next}-tab`)?.focus());}
  return <>
    {!editing&&<div className="review-heading"><div><p className="eyebrow">Single review · live comparison</p><h2>{record?.processing==='complete'?record.application.brand:filename}</h2><p>Inspect the label and independent application, then record one human outcome.</p></div><button onClick={()=>{invalidate();setEditing(true);}}>Change input</button></div>}
    <form onSubmit={check} onChangeCapture={()=>invalidate()} hidden={!editing} noValidate autoComplete="off">
      <nav className="tabs entry-tabs" role="tablist" aria-label="Review inputs">{(['application','images'] as const).map(key=><button type="button" role="tab" id={`entry-${key}-tab`} aria-selected={tab===key} aria-controls={`entry-${key}-panel`} tabIndex={tab===key?0:-1} key={key} onClick={()=>navigate(key)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();navigate(e.key==='Home'?'application':e.key==='End'?'images':tab==='application'?'images':'application');}}}>{key==='application'?'Application':'Label images'}</button>)}</nav>
      <section id="entry-images-panel" role="tabpanel" aria-labelledby="entry-images-tab" hidden={tab!=='images'}>
        <fieldset className="input-card"><legend>Choose photos of one bottle</legend><p>Select photos now; the application can be entered separately. Front, back, neck and closeups are reviewed jointly, not as separate bottles.</p><PhotoInput photos={photos} onChange={next=>{invalidate();setPhotos(next);}}/>
          <p className="help">Image-only extraction cannot establish an application match. This backend requires an independent application before comparison; image-only analysis is not connected.</p><button type="button" onClick={()=>navigate('application')}>Add application reference</button>
          <details><summary>Image limits & privacy</summary><p id="file-help" className="help">Local previews stay in this browser. Explicit Submit for comparison uploads all selected originals and sends normalized photos in one joint extraction request.</p><p id="limits" className="help">1–4 still JPEG/PNG photos per bottle. 10 MiB and 20 megapixels per photo; 20 MiB originals, 20 MiB normalized output and 40 megapixels per group. Server decoding, metadata removal and hashes are enforced. Use synthetic or authorized demo data only.</p></details>
        </fieldset>
      </section>
      <section id="entry-application-panel" role="tabpanel" aria-labelledby="entry-application-tab" hidden={tab!=='application'}>
        <fieldset className="input-card"><legend>Independent application reference</legend><p className="help">Enter the application's declarations, not values copied from label extraction. No commodity, import status, origin or alcohol value is inferred.</p><div className="field-grid">
          {fields.map(([key,label])=><div key={key}><label htmlFor={key}>{label}</label><input id={key} name={key} type="text" inputMode={key==='abv'?'decimal':'text'} required maxLength={key==='abv'?32:key.startsWith('application')?128:1000}/></div>)}
          <div><label htmlFor="commodity">Commodity</label><select id="commodity" name="commodity" required defaultValue=""><option value="">Choose a commodity</option><option value="wine">Wine</option><option value="distilled-spirits">Distilled spirits</option><option value="malt-beverage">Malt beverage</option></select></div>
          <div><label htmlFor="imported">Imported product?</label><select id="imported" name="imported" required defaultValue=""><option value="">Choose import status</option><option value="true">Yes — imported</option><option value="false">No — domestic</option></select></div>
          <div><label htmlFor="originKind">Origin context</label><select id="originKind" name="originKind" required defaultValue=""><option value="">Choose origin context</option><option value="imported">Imported origin</option><option value="domestic">Domestic origin</option></select></div>
          <div><label htmlFor="country">Country of origin</label><input id="country" name="country" type="text" required maxLength={1000}/></div>
        </div><p className="help">Enter the declared country or territory, not an importer’s address. Domestic context supports United States or Puerto Rico; keep Puerto Rico when that is the declared origin. Imported context requires a foreign country. This does not determine legal applicability. Identifiers are preserved exactly.</p></fieldset>
      </section>
      <div className="actions"><button type="submit" disabled={running}>Check application fields</button><button type="submit" value="live" disabled={running}>Submit for comparison</button></div><p className="help">Public demo processing is open. Server-side quota: 50 paid scans per UTC day. No automatic retries. Only a server-confirmed SAVED receipt is durable.</p>
    </form>
    <OperationTimings stages={stages} local={!process.env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT}/>
    {feedback&&<div ref={feedbackRef} tabIndex={-1} className={`notice ${feedback.kind==='error'?'error':''}`} role={feedback.kind==='error'?'alert':'status'}><ul>{feedback.messages.map(message=><li key={message}>{message}</li>)}</ul></div>}
    {elapsed!==null&&<p className="help" role="status">Measured elapsed time: {elapsed} ms (request processing, not a model-only benchmark).</p>}
    {record?.processing==='complete'&&<section aria-label="Live comparison results"><ReviewConfirmation key={(photoRecord(record)?.photoSetSha256??record.imageSha256)+String(elapsed)} record={record} comparisonId={comparisonId} accessCode={accessCode} preview={preview} photos={photos.map(p=>({photoId:p.photoId,url:p.url}))}/></section>}
  </>;
}
