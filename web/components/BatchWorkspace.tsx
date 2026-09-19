'use client';
import { useEffect, useRef, useState } from 'react';
import BatchUpload, { type PreparedBatch } from './BatchUpload';
import BatchQueue from './BatchQueue';
import BatchSwitcher from './BatchSwitcher';
import ReviewConfirmation from './ReviewConfirmation';
import ProcessingState from './ProcessingState';
import { fieldLabels, observations } from './ComparisonWorkspace';
import { createBatchState, transitionBatch, type BatchAction, type BatchState, type DispatchCommand } from '../lib/batch-state';
import { compareOfflineSample, samples, type Scenario } from '../lib/offline-demo';
import { parseApplication } from '../lib/contracts';
import { FIELD_KEYS } from '../lib/rules';

export default function BatchWorkspace({offlineEnabled}:{offlineEnabled:boolean}) {
  const [prepared,setPrepared] = useState<PreparedBatch|null>(null);
  const [state,setState] = useState<BatchState|null>(null);
  const current = useRef<BatchState|null>(null);
  const assets = useRef<PreparedBatch['assets']>(new Map());
  const planned = useRef<{id:string;revision:number}[]>([]);
  const mounted = useRef(true);
  const [error,setError] = useState('');
  const [preview,setPreview] = useState<string|null>(null);
  const zoom = useRef<HTMLDialogElement>(null);
  const [replacement,setReplacement] = useState('');
  const [replacementImage,setReplacementImage] = useState<Scenario>('match');
  const selected = state?.pairs.find(pair=>pair.id===state.selectedId);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;current.current=null;planned.current=[];};},[]);
  // Preview only the active exact, hash-checked asset. Navigation/replacement and
  // unmount revoke its URL; the rail itself contains no expensive image loads.
  useEffect(()=>{
    zoom.current?.close(); setPreview(null);
    const asset = selected?.record && assets.current.get(selected.record.imageSha256);
    if (!asset) return;
    const url = URL.createObjectURL(new Blob([asset.bytes],{type:'image/png'})); setPreview(url);
    return ()=>URL.revokeObjectURL(url);
  },[state?.batchId,selected?.id,selected?.revision,selected?.record]);
  useEffect(()=>{
    setReplacement(selected?.application?JSON.stringify(selected.application,null,2):'');
    const asset = selected?.imageSha256 && assets.current.get(selected.imageSha256);
    setReplacementImage(asset?asset.scenario:'match'); setError('');
  },[state?.batchId,selected?.id,selected?.revision]);

  function clear() { current.current=null;planned.current=[];assets.current=new Map();setState(null);setPrepared(null);setError(''); }
  function prepare(batch:PreparedBatch) {
    const next=createBatchState(batch.manifest,{batchId:crypto.randomUUID()});
    assets.current=batch.assets; planned.current=[]; current.current=next;setState(next);setPrepared(batch);setError('');
  }
  function apply(action:BatchAction) {
    if (!current.current || !mounted.current) return null;
    const step=transitionBatch(current.current,action);
    current.current=step.state;setState(step.state);
    if (step.rejected) setError(step.rejected);
    // This UI never submits a saved review. Dispatch commands below are consumed
    // ONLY by the opted-in fixture executor, never by a provider/API boundary.
    return step;
  }
  async function execute(command:DispatchCommand) {
    const asset=assets.current.get(command.image.imageSha256);
    let result:unknown={processing:'failed',code:'unconfigured'};
    try {
      if (offlineEnabled && asset) result=await compareOfflineSample(asset.scenario,command.application,asset.bytes);
    } catch { result={processing:'failed',code:'invalid-input'}; }
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
    if (!offlineEnabled || !current.current || current.current.inFlight.length) return;
    planned.current=current.current.pairs.filter(p=>p.processing==='queued').map(p=>({id:p.id,revision:p.revision}));pump();
  }
  function replace() {
    if (!offlineEnabled || !selected?.application) return;
    try {
      const application=parseApplication(JSON.parse(replacement));
      if (application.applicationId===selected.application.applicationId && application.applicationVersion===selected.application.applicationVersion) throw Error('Use a new application version for replacement.');
      const hash=samples[replacementImage].imageSha256;
      if (!assets.current.has(hash)) throw Error('That exact fixture was not validated in this batch.');
      apply({type:'replace',pairId:selected.id,application,image:{filename:selected.filename,imageSha256:hash}});
    } catch(e) { setError(e instanceof Error && e.message.startsWith('Use a new')?e.message:'Replacement requires valid application JSON, a new application version and a fixture already validated in this batch.'); }
  }
  return <section id="batch-panel" role="tabpanel" aria-labelledby="batch-tab" className="card batch-workspace">
    <h1>Batch label review</h1>
    <BatchUpload offlineEnabled={offlineEnabled} onPrepared={prepare} onClear={clear} />
    {prepared && <section aria-label="Manifest validation" className="notice">
      <p data-testid="manifest-counts">Manifest — Total: {prepared.manifest.counts.total} · Valid: {prepared.manifest.counts.valid} · Blocked: {prepared.manifest.counts.blocked}</p>
      <p>Valid means explicit mapping plus recognized fixture bytes, not arbitrary-image sanitation or live analysis.</p>
      <details data-testid="manifest-entries" open><summary>Per-entry validation</summary><ul>{prepared.manifest.entries.map(entry=><li key={entry.id}>{entry.filename??entry.id}: {entry.status}{entry.status==='valid'?` — ${entry.application.applicationId} / version ${entry.application.applicationVersion}`:` — ${entry.issues.join(', ')}`}</li>)}{prepared.diagnostics.map((message,index)=><li key={`diagnostic:${index}`}>{message}</li>)}</ul></details>
    </section>}
    {state && selected && <>
      <BatchQueue state={state} onCompare={compareQueue} onRetry={()=>{if(offlineEnabled)dispatch(selected.id,true);}} />
      <BatchSwitcher state={state} onNavigate={target=>apply({type:'navigate',target})} />
      <section data-testid="active-pair" aria-label="Active batch review">
        <h2>{selected.filename??'Blocked entry'} — Revision {selected.revision}</h2>
        <p className="hash">Application {selected.application?.applicationId??'unavailable'} / version {selected.application?.applicationVersion??'unavailable'} · {selected.processing} · Image SHA-256 {selected.imageSha256??'unavailable'}</p>
        {selected.processing==='blocked' && <p role="alert" className="notice error">Pair blocked: {selected.issues.join(', ')}. Correct the explicit manifest / files and validate again. No findings or review available.</p>}
        {selected.processing==='queued' && <p>Queued fixture — not compared. Start the queue explicitly.</p>}
        <ProcessingState running={selected.processing==='running'} result={selected.record??(selected.failure?{processing:'failed',code:selected.failure}:null)} />
        {selected.record && <div className="workspace">
          <section aria-label="Label preview"><div className="preview-head"><h2>Synthetic label</h2><button onClick={()=>zoom.current?.showModal()}>Enlarge label</button></div>{preview && <img className="label-preview" src={preview} alt="Exact batch synthetic label" />}<p className="help">Exact synthetic fixture bytes. Not AI analysis or physical print/type-size verification.</p></section>
          <section aria-label="Comparison evidence"><h2>Seven-field comparison</h2><table><thead><tr><th>Field</th><th>Observed evidence</th><th>Application / reference</th><th>Machine finding</th></tr></thead><tbody>{FIELD_KEYS.map(key=>{const field=selected.record!.comparison.fields[key];return <tr key={key}><th scope="row">{fieldLabels[key]}</th><td data-title="Observed">{observations(field.observed)}</td><td data-title="Expected">{field.expected}</td><td data-title="Finding"><strong className={`status ${field.status}`}>{field.status}</strong><p className="help">{field.reasons.join(' ')}</p></td></tr>;})}</tbody></table></section>
        </div>}
        <ReviewConfirmation key={`${state.batchId}:${selected.id}:${selected.revision}`} record={selected.record} controlled={selected.intent?{
          intent:selected.intent,draft:selected.draft,
          onEdit:intent=>apply({type:'edit-intent',pairId:selected.id,edits:{outcome:intent.outcome,notes:intent.notes,physical:intent.physical,resolutions:intent.resolutions}}),
          onConfirm:checked=>apply(checked?{type:'confirm',pairId:selected.id}:{type:'edit-intent',pairId:selected.id,edits:{}}),
          onDraft:()=>apply({type:'draft',pairId:selected.id}),
        }:undefined} />
        {selected.application && <details className="batch-replacement"><summary>Replace this pair with a new application version</summary>
          <p>Old results are superseded, not saved history. Replacement clears the current intent and requires a new comparison. Any old running attempt still occupies its slot until it settles.</p>
          <label htmlFor="batch-replacement-json">Replacement application JSON</label><textarea id="batch-replacement-json" value={replacement} onChange={e=>setReplacement(e.target.value)} />
          <label htmlFor="batch-replacement-image">Replacement synthetic image</label><select id="batch-replacement-image" value={replacementImage} onChange={e=>setReplacementImage(e.target.value as Scenario)}>{(Object.keys(samples) as Scenario[]).filter(id=>assets.current.has(samples[id].imageSha256)).map(id=><option key={id} value={id}>{samples[id].title}</option>)}</select>
          <button onClick={replace}>Replace selected pair</button>
        </details>}
        <p className="help">Superseded page-memory versions: {selected.history.length}. Not durable saved history. Reload clears all versions.</p>
      </section>
      <dialog ref={zoom} aria-labelledby="batch-zoom-title"><h2 id="batch-zoom-title">Larger synthetic label</h2><button onClick={()=>zoom.current?.close()}>Close preview</button>{preview&&<img className="label-preview" src={preview} alt="Enlarged exact batch synthetic label" />}</dialog>
    </>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
