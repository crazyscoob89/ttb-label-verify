'use client';
import { useEffect, useRef, useState } from 'react';
import BatchUpload, { type PreparedBatch } from './BatchUpload';
import BatchQueue from './BatchQueue';
import BatchSwitcher from './BatchSwitcher';
import ReviewConfirmation from './ReviewConfirmation';
import ProcessingState from './ProcessingState';
import { useSessionAccess } from './SessionAccess';
import { createBatchState, transitionBatch, type BatchAction, type BatchState, type DispatchCommand } from '../lib/batch-state';
import { compareOfflineSample, samples, type Scenario } from '../lib/offline-demo';
import { parseApplication } from '../lib/contracts';

import { executeLivePair } from '../lib/live-batch-client';
import type { Outcome } from '../lib/review-policy';
import {prepareLiveGroup,executeLiveGroup,type PhotoDeclaration,type StageMeasurement} from '../lib/live-photo-client';
import PhotoInput,{type LocalPhoto} from './PhotoInput';
import OperationTimings from './OperationTimings';

export default function BatchWorkspace({offlineEnabled}:{offlineEnabled:boolean}) {
  const [live,setLive] = useState(!offlineEnabled);
  const {code:accessCode} = useSessionAccess();
  const [overview,setOverview] = useState(true);
  const snapshotIds=useRef(new Map<string,string>());
  const [saved,setSaved]=useState<Record<string,Outcome>>({});
  const files = useRef<Map<string,File>>(new Map());
  const groupFiles=useRef(new Map<string,File>());
  const [photoPreviews,setPhotoPreviews]=useState<LocalPhoto[]>([]),[timings,setTimings]=useState<Record<string,StageMeasurement[]>>({});
  const [prepared,setPrepared] = useState<PreparedBatch|null>(null);
  const [state,setState] = useState<BatchState|null>(null);
  const current = useRef<BatchState|null>(null);
  const assets = useRef<PreparedBatch['assets']>(new Map());
  const planned = useRef<{id:string;revision:number}[]>([]);
  const mounted = useRef(true);
  const [error,setError] = useState('');
  const [preview,setPreview] = useState<string|null>(null);

  const [replacement,setReplacement] = useState('');
  const [replacementImage,setReplacementImage] = useState<Scenario>('match');
  const selected = state?.pairs.find(pair=>pair.id===state.selectedId);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;current.current=null;planned.current=[];};},[]);
  // Preview only the active exact, hash-checked asset. Navigation/replacement and
  // unmount revoke its URL; the rail itself contains no expensive image loads.
  useEffect(()=>{
    setPreview(null);
    setPhotoPreviews([]);
    if(selected?.photos){const previews=selected.photos.flatMap(p=>{const file=groupFiles.current.get(p.photoId);return file?[{photoId:p.photoId,file,role:p.role,url:URL.createObjectURL(file)}]:[];});setPhotoPreviews(previews);return()=>previews.forEach(p=>URL.revokeObjectURL(p.url));}
    const asset = selected?.record && assets.current.get(selected.record.imageSha256);
    const file = selected?.record && selected.filename && files.current.get(selected.filename);
    const source = state?.mode==='live' ? file : asset && new Blob([asset.bytes],{type:'image/png'});
    if (!source) return;
    const url = URL.createObjectURL(source); setPreview(url);
    return ()=>URL.revokeObjectURL(url);
  },[state?.batchId,selected?.id,selected?.revision,selected?.record?.imageSha256]);
  useEffect(()=>{
    setReplacement(selected?.application?JSON.stringify(selected.application,null,2):'');
    const asset = selected?.imageSha256 && assets.current.get(selected.imageSha256);
    setReplacementImage(asset?asset.scenario:'match'); setError('');
  },[state?.batchId,selected?.id]);

  function clear() { current.current=null;planned.current=[];assets.current=new Map();files.current=new Map();groupFiles.current.clear();snapshotIds.current.clear();setSaved({});setTimings({});setState(null);setPrepared(null);setError(''); }
  function prepare(batch:PreparedBatch) {
    setOverview(true);
    snapshotIds.current.clear();setSaved({});
    const next=createBatchState(batch.manifest,{batchId:crypto.randomUUID(),live:batch.live});
    groupFiles.current=new Map();setTimings({});for(const entry of batch.manifest.entries)if(entry.status==='valid')for(const p of entry.photos??[]){const file=batch.files.get(p.filename);if(file)groupFiles.current.set(p.photoId,file);}
    files.current=batch.files; assets.current=batch.assets; planned.current=[]; current.current=next;setState(next);setPrepared(batch);setError('');
  }
  function apply(action:BatchAction) {
    if (!current.current || !mounted.current) return null;
    const step=transitionBatch(current.current,action);
    current.current=step.state;setState(step.state);
    if (step.rejected) setError(step.rejected);
    // The server owns durable review authority; reducer remains page-memory only.
    return step;
  }
  function unconfirm(pairId:string) {
    // Mode/overview navigation is not an edit to evidence or a prepared draft.
    // Mirror the reducer's navigation fence without changing its selected ID.
    const previous=current.current;
    if(!previous||!mounted.current)return;
    const next={...previous,pairs:previous.pairs.map(pair=>pair.id===pairId&&pair.intent
      ? {...pair,intent:{...pair.intent,confirmed:false},pendingSave:null} : pair)};
    current.current=next;setState(next);
  }
  async function execute(command:DispatchCommand) {
    const asset=command.image.imageSha256 && assets.current.get(command.image.imageSha256);
    const file=files.current.get(command.image.filename);
    let result:unknown={processing:'failed',code:'unconfigured'};
    try {
      if(current.current?.mode==='live'&&command.group){
        const inputFiles=command.group.photos.map(p=>{const file=groupFiles.current.get(p.photoId);if(!file)throw Error('invalid-input');return file;});
        const key=`${command.token.pairId}:${command.token.revision}`,signal=AbortSignal.timeout(55000);
        const active=()=>mounted.current&&current.current?.batchId===command.token.batchId&&current.current.pairs.some(p=>p.id===command.token.pairId&&p.revision===command.token.revision&&p.activeAttempt?.attemptId===command.token.attemptId);
        const onStage=(stage:StageMeasurement)=>{if(active())setTimings(previous=>({...previous,[key]:[...(previous[key]??[]).filter(s=>s.stage!==stage.stage),stage]}));};
        const ready=await prepareLiveGroup({schemaVersion:2,groupId:command.group.groupId,revision:command.token.revision,application:command.application,photos:command.group.photos.map((p,i)=>({...p,mime:inputFiles[i].type as PhotoDeclaration['mime'],bytes:inputFiles[i].size}))},inputFiles,accessCode,signal,fetch,onStage);
        const step=active()?apply({type:'prepared-group',token:command.token,prepared:ready.prepared}):null;
        if(!step||step.rejected)result={processing:'failed',code:'cancelled'};
        else{const payload=await executeLiveGroup(ready,accessCode,signal,fetch,onStage);result=payload.result;if(active()&&payload.comparisonId)snapshotIds.current.set(`${command.token.batchId}:${command.token.pairId}:${command.token.revision}`,payload.comparisonId);}
      }
      else if (current.current?.mode==='live' && file) result=await executeLivePair(command,file,accessCode,(token,imageSha256)=>{
        if (!mounted.current || current.current?.batchId!==token.batchId) return false;
        const step=apply({type:'prepared',token,imageSha256});
        return !!step && !step.rejected;
      },fetch,comparisonId=>{
        if(current.current?.batchId===command.token.batchId)
          snapshotIds.current.set(`${command.token.batchId}:${command.token.pairId}:${command.token.revision}`,comparisonId);
      });
      else if (offlineEnabled && asset) result=await compareOfflineSample(asset.scenario,command.application,asset.bytes);
    } catch(error) { result={processing:'failed',code:error instanceof Error&&error.message==='invalid-input'?'invalid-input':'provider-failed'}; }
    if (!mounted.current || current.current?.batchId!==command.token.batchId) return;
    apply({type:'settle',token:command.token,result}); pump();
  }
  function dispatch(pairId:string,retry=false) {
    const step=apply({type:retry?'retry':'dispatch',pairId,attemptId:crypto.randomUUID(),reservationId:crypto.randomUUID()});
    for (const command of step?.commands??[]) if(command.kind==='authorize-reserve-and-dispatch') void execute(command);
  }
  function pump() {
    while (current.current && current.current.inFlight.length<current.current.concurrency && planned.current.length) {
      const candidate=planned.current.shift()!;
      const pair=current.current.pairs.find(p=>p.id===candidate.id);
      // User's start click authorizes only the queued revisions present then.
      // Replaced versions and failures require another explicit click.
      if (pair?.processing==='queued' && pair.revision===candidate.revision) dispatch(pair.id);
    }
  }
  function compareQueue() {
    if (!current.current || current.current.inFlight.length) return;
    planned.current=current.current.pairs.filter(p=>p.processing==='queued').map(p=>({id:p.id,revision:p.revision}));pump();
  }
  function replace() {
    if (!selected?.application) return;
    try {
      const application=parseApplication(JSON.parse(replacement));
      if(selected.groupId&&selected.photos){apply({type:'replace-group',pairId:selected.id,application,photos:selected.photos});return;}
      if (application.applicationId===selected.application.applicationId && application.applicationVersion===selected.application.applicationVersion) throw Error('Use a new application version for replacement.');
      const hash=state?.mode==='live'?null:samples[replacementImage].imageSha256;
      if (hash && !assets.current.has(hash)) throw Error('That exact fixture was not validated in this batch.');
      apply({type:'replace',pairId:selected.id,application,image:{filename:selected.filename,imageSha256:hash}});
    } catch(e) { setError(e instanceof Error && e.message.startsWith('Use a new')?e.message:'Replacement requires valid application JSON and a new application version. Offline images must be fixtures already validated in this batch.'); }
  }
  return <section id="batch-panel" role="tabpanel" aria-labelledby="batch-tab" className="card batch-workspace">
    <div hidden={!overview}>
    <p className="eyebrow">Batch upload · queue landing</p><h1>Prepare a batch. Review one bottle at a time.</h1>
    <p>Open a record for its full-width comparison and individual confirmation. No bulk approve.</p>
    {offlineEnabled && <label>Batch execution mode<select aria-label="Batch execution mode" value={live?'live':'offline'} disabled={!!state?.inFlight.length} onChange={e=>{clear();setLive(e.target.value==='live');}}><option value="offline">Offline synthetic samples</option><option value="live">Guarded live comparison</option></select></label>}
    {live && <p className="help">Public demo session access is reused. Reviews remain UNSAVED until a server receipt confirms save. No automatic comparison retries or refunds. Use authorized demo images only.</p>}
    <BatchUpload key={live?'live':'offline'} offlineEnabled={offlineEnabled} live={live} onPrepared={prepare} onClear={clear} />
    {prepared && <section aria-label="Manifest validation" className="notice">
      <p data-testid="manifest-counts">Manifest — Total: {prepared.manifest.counts.total} · Valid: {prepared.manifest.counts.valid} · Blocked: {prepared.manifest.counts.blocked}</p>
      <p>{prepared.manifest.counts.total} bottle entries · {prepared.files.size} selected photo files. Photos of one bottle produce one comparison and one review.</p>
      <p>{prepared.live?'Valid means declarations and explicit mapping only. Image is unprepared until its active queue slot is sanitized by the server.':'Valid means explicit mapping plus recognized fixture bytes, not arbitrary-image sanitation or live analysis.'}</p>
      <details data-testid="manifest-entries"><summary>Per-entry validation</summary><ul>{prepared.manifest.entries.map(entry=><li key={entry.id}>{entry.filename??entry.id}: {entry.status}{entry.status==='valid'?` — ${entry.application.applicationId} / version ${entry.application.applicationVersion}`:` — ${entry.issues.join(', ')}`}</li>)}{prepared.diagnostics.map((message,index)=><li key={`diagnostic:${index}`}>{message}</li>)}</ul></details>
    </section>}
    </div>
    {state && selected && <>
      <div hidden={!overview}>
      <BatchQueue state={state} saved={state.pairs.flatMap(pair=>{const id=snapshotIds.current.get(`${state.batchId}:${pair.id}:${pair.revision}`);return id&&saved[id]?[saved[id]]:[];})} onCompare={compareQueue} onRetry={()=>dispatch(selected.id,true)} />
      <div className="batch-overview" aria-label="Batch overview records">{state.pairs.map(pair=>{const snapshot=snapshotIds.current.get(`${state.batchId}:${pair.id}:${pair.revision}`);return <article className="queue-item" key={pair.id}><div><h3>{pair.filename??'Blocked entry'}</h3><p>{pair.application?.applicationId??'Missing application'} / {pair.application?.applicationVersion??'—'}</p></div><span className={`status ${pair.processing==='failed'||pair.processing==='blocked'?'mismatch':'needs-review'}`}>{snapshot&&saved[snapshot]?'SAVED':pair.processing}</span><button onClick={()=>{apply({type:'navigate',target:pair.id});setOverview(false);}}>Open review</button></article>;})}</div>
      </div>
      <div hidden={overview}>
      <BatchSwitcher state={state} onOverview={()=>{unconfirm(selected.id);setOverview(true);}} isSaved={pairId=>{const pair=state.pairs.find(p=>p.id===pairId)!;const id=snapshotIds.current.get(`${state.batchId}:${pair.id}:${pair.revision}`);return !!id&&!!saved[id];}} onNavigate={target=>apply({type:'navigate',target})} />
      <section data-testid="active-pair" aria-label="Active batch review">
        <h2>{selected.filename??'Blocked entry'} — Revision {selected.revision}</h2>
        <p className="hash">Application {selected.application?.applicationId??'unavailable'} / version {selected.application?.applicationVersion??'unavailable'} · {selected.processing} · {selected.groupId?`${selected.photos?.length??0} photos · Photo-set SHA-256 ${selected.preparedGroup?.photoSetSha256??'unprepared'}`:`Image SHA-256 ${selected.imageSha256??'unavailable'}`}</p>
        {selected.processing==='blocked' && <p role="alert" className="notice error">Pair blocked: {selected.issues.join(', ')}. Correct the explicit manifest / files and validate again. No findings or review available.</p>}
        {selected.processing==='queued' && <p>Queued {state.mode==='live'?'pair':'fixture'} — not compared. Start the queue explicitly.</p>}
        <ProcessingState live={state.mode==='live'} running={selected.processing==='running'} result={selected.record??(selected.failure?{processing:'failed',code:selected.failure}:null)} />
        <OperationTimings stages={timings[`${selected.id}:${selected.revision}`]??[]} local={!process.env.NEXT_PUBLIC_TTB_MEDIA_TRANSPORT}/>
        <ReviewConfirmation preview={preview} photos={photoPreviews.map(p=>({photoId:p.photoId,url:p.url}))} previewNote={state.mode==='live'?'Original uploaded File preview; comparison binds the server-sanitized image hash.':'Exact synthetic fixture bytes; not AI analysis.'} key={`${state.batchId}:${selected.id}:${selected.revision}:${selected.record?.imageSha256??'empty'}`} comparisonId={snapshotIds.current.get(`${state.batchId}:${selected.id}:${selected.revision}`)} accessCode={accessCode} onSaved={receipt=>{if(mounted.current&&current.current?.batchId===state.batchId&&current.current.selectedId===selected.id&&current.current.pairs.find(p=>p.id===selected.id)?.revision===selected.revision&&selected.intent?.outcome)setSaved(previous=>({...previous,[receipt.comparisonId]:selected.intent!.outcome!}));}} record={selected.record} controlled={selected.intent?{
          intent:selected.intent,draft:selected.draft,
          resolutionEdits:selected.resolutionEdits,onResolutionEdit:(field,value)=>apply({type:'resolution-edit',pairId:selected.id,field,value}),
          onEdit:intent=>apply({type:'edit-intent',pairId:selected.id,edits:{outcome:intent.outcome,notes:intent.notes,physical:intent.physical,resolutions:intent.resolutions}}),
          onConfirm:checked=>checked?apply({type:'confirm',pairId:selected.id}):unconfirm(selected.id),
          onDraft:()=>apply({type:'draft',pairId:selected.id}),
        }:undefined} />
        {selected.groupId&&selected.application&&<details className="batch-replacement"><summary>Edit this bottle’s photos</summary><p>Any addition, removal, role or order edit immediately clears preparation, results, decisions and confirmation for this bottle. It does not delete saved history. Start the updated queue explicitly.</p><PhotoInput photos={photoPreviews} onChange={next=>{const step=apply({type:'replace-group',pairId:selected.id,application:selected.application,photos:next.map(p=>({photoId:p.photoId,filename:p.file.name,role:p.role}))});if(step&&!step.rejected){for(const p of next)groupFiles.current.set(p.photoId,p.file);if(selected.issues.includes('invalid-application'))apply({type:'invalidate-input',pairId:selected.id});}for(const p of next)if(!photoPreviews.some(old=>old.url===p.url))URL.revokeObjectURL(p.url);}}/></details>}
        {selected.application && <details className="batch-replacement"><summary>Replace this pair with a new application version</summary>
          <p>Replacement supersedes this page’s results, not any committed historical review. It clears the current intent and requires a new comparison. Any old running attempt still occupies its slot until it settles.</p>
          <label htmlFor="batch-replacement-json">Replacement application JSON</label><textarea id="batch-replacement-json" value={replacement} onChange={e=>{if(selected.groupId&&selected.processing!=='blocked')apply({type:'invalidate-input',pairId:selected.id});setReplacement(e.target.value);}} />
          {state.mode==='offline'?<><label htmlFor="batch-replacement-image">Replacement synthetic image</label><select id="batch-replacement-image" value={replacementImage} onChange={e=>setReplacementImage(e.target.value as Scenario)}>{(Object.keys(samples) as Scenario[]).filter(id=>assets.current.has(samples[id].imageSha256)).map(id=><option key={id} value={id}>{samples[id].title}</option>)}</select></>:<p>The original File is retained; the new application revision requires fresh server preparation. To change files, rebuild the manifest.</p>}
          <button onClick={replace}>Replace selected pair</button>
        </details>}
        <p className="help">Superseded page-memory versions: {selected.history.length}. Not durable saved history. Reload clears all versions.</p>
      </section>
      </div>
    </>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
