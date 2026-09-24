'use client';
import { useEffect, useRef, useState } from 'react';
import PairInput from './PairInput';
import ProcessingState from './ProcessingState';
import ReviewConfirmation from './ReviewConfirmation';
import { samples, compareOfflineSample, type Scenario } from '../lib/offline-demo';
import { MAX_IMAGE_BYTES } from '../lib/contracts';

import type { ComparisonRecord } from '../lib/comparison-record';

export { fieldLabels, observations } from './EvidenceReview';

export default function ComparisonWorkspace({ offlineEnabled }: { offlineEnabled: boolean }) {
  const [mode, setMode] = useState<'fixture'|'manual'>(offlineEnabled ? 'fixture' : 'manual');
  const [scenario, setScenario] = useState<Scenario>('match');
  const [application, setApplication] = useState(samples.match.application);
  const [result, setResult] = useState<ComparisonRecord|null>(null);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<string|null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController|null>(null);
  const previewRef = useRef<string|null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const sample = samples[scenario];
  function releasePreview() { if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = null; setPreview(null); }
  function reset() { generation.current++; active.current?.abort(); active.current = null; setRunning(false); setResult(null); releasePreview(); }
  useEffect(() => () => { generation.current++; active.current?.abort(); if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  async function compare() {
    if (!offlineEnabled || mode !== 'fixture' || running) return;
    reset(); const run = generation.current; const controller = new AbortController(); active.current = controller;
    const appSnapshot = structuredClone(application); const selected = scenario;
    setRunning(true);
    const timer = setTimeout(() => { if (generation.current === run) { generation.current++; controller.abort(); setRunning(false); setResult({processing:'failed',code:'timeout'}); } }, 5000);
    try {
      const response = await fetch(samples[selected].imagePath, { signal: controller.signal, cache:'no-store' });
      if (!response.ok || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw Error('input');
      // This is an allowlisted local asset, never a user upload/remote URL.
      const reader = response.body?.getReader(); if (!reader) throw Error('input');
      const chunks: Uint8Array[] = []; let length = 0;
      for (;;) { const {done,value} = await reader.read(); if (done) break; length += value.length; if (length > MAX_IMAGE_BYTES) { void reader.cancel(); throw Error('input'); } chunks.push(value); }
      const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const compared = await compareOfflineSample(selected, appSnapshot, bytes);
      if (controller.signal.aborted || generation.current !== run) return;
      // Display EXACT bytes that were hashed, not a separately fetched replacement.
      const url = URL.createObjectURL(new Blob([bytes], {type:'image/png'})); previewRef.current = url; setPreview(url);
      setResult(compared); requestAnimationFrame(() => resultRef.current?.focus());
    } catch { if (generation.current === run && !controller.signal.aborted) setResult({processing:'failed',code:'invalid-input'}); }
    finally { clearTimeout(timer); if (generation.current === run) { setRunning(false); active.current = null; } }
  }
  return <>
    <section id="single-panel" role="tabpanel" aria-labelledby="single-tab" className="card">
      <h1>Single label review</h1>
      <p>Pair evidence with one application. Findings support an internal human review, not government submission.</p>
      {offlineEnabled && <div className="notice"><strong>Offline fixture demonstration – not AI analysis; nothing saved</strong><p>Only explicitly selected synthetic PNGs have predefined observations. Local rules compare declarations; no model latency is measured.</p></div>}
      {offlineEnabled && <><label htmlFor="input-mode">Input source</label><select id="input-mode" value={mode} onChange={e=>{reset();setMode(e.target.value as typeof mode);}}>
        {offlineEnabled && <option value="fixture">Known synthetic fixture</option>}<option value="manual">My image and application — guarded live demo</option>
      </select></>}
      {mode === 'manual' ? <PairInput /> : <>
        <div className="toolbar"><label htmlFor="scenario">Synthetic scenario</label><select id="scenario" value={scenario} onChange={e=>{reset();const id=e.target.value as Scenario;setScenario(id);setApplication(structuredClone(samples[id].application));}}>{Object.entries(samples).map(([id,s])=><option value={id} key={id}>{s.title}</option>)}</select></div>
        <div className="field-grid">
          <label>Sample application ID<input value={application.applicationId} maxLength={128} onChange={e=>{reset();setApplication({...application,applicationId:e.target.value});}} /></label>
          <label>Sample application version<input value={application.applicationVersion} maxLength={128} onChange={e=>{reset();setApplication({...application,applicationVersion:e.target.value});}} /></label>
          <label>Sample declared ABV<input value={application.abv} type="number" min="0" max="100" onChange={e=>{reset();setApplication({...application,abv:e.target.value === '' ? NaN : Number(e.target.value)});}} /></label>
        </div>
        <p className="help">Other declarations: {application.brand} · {application.classType} · {application.netContents} · {application.producerName}, {application.producerAddress} · {application.commodity}, imported from {application.origin.country}.</p>
        <p className="hash">Paired image: {sample.imagePath.split('/').pop()} · normalized SHA-256 {sample.imageSha256}</p>
        <button onClick={compare} disabled={running}>Submit comparison</button>
        <ProcessingState running={running} result={result} />
        <div ref={resultRef} tabIndex={-1}>
          <ReviewConfirmation key={`${generation.current}:${result?.processing??'empty'}`} record={result} preview={preview} previewNote="Exact synthetic fixture bytes; not AI analysis. Nothing saved." />
        </div>

      </>}
    </section>
  </>;
}
