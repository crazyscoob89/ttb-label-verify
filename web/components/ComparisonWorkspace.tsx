'use client';
import { useEffect, useRef, useState } from 'react';
import PairInput from './PairInput';
import ProcessingState from './ProcessingState';
import ReviewConfirmation from './ReviewConfirmation';
import { samples, compareOfflineSample, type Scenario } from '../lib/offline-demo';
import { MAX_IMAGE_BYTES } from '../lib/contracts';
import { FIELD_KEYS } from '../lib/rules';
import type { ComparisonRecord } from '../lib/comparison-record';

export const fieldLabels = { brand:'Brand name', classType:'Class / type', abv:'Alcohol by volume', netContents:'Net contents', producer:'Producer name and address', origin:'Country of origin', warning:'Government warning' };
function observations(value: unknown): string {
  if (value === null) return 'Unknown';
  if (typeof value !== 'object') return String(value);
  if ('status' in value && 'text' in value && 'reason' in value) return `${value.status}: ${value.text ?? 'No readable text'} — ${value.reason}`;
  return Object.entries(value).map(([key, child]) => `${key}: ${observations(child)}`).join('\n');
}

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
  const zoom = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const sample = samples[scenario];
  function releasePreview() { if (previewRef.current) URL.revokeObjectURL(previewRef.current); previewRef.current = null; setPreview(null); }
  function reset() { generation.current++; active.current?.abort(); active.current = null; setRunning(false); setResult(null); releasePreview(); zoom.current?.close(); }
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
    <nav className="tabs" role="tablist" aria-label="Review mode"><button id="single-tab" role="tab" aria-selected="true" aria-controls="single-panel">Single review</button><button role="tab" disabled aria-selected="false">Batch upload — Phase 5</button></nav>
    <section id="single-panel" role="tabpanel" aria-labelledby="single-tab" className="card">
      <h1>Single label review</h1>
      <p>Pair evidence with one application. Findings support an internal human review, not government submission.</p>
      {offlineEnabled && <div className="notice"><strong>Offline fixture demonstration – not AI analysis; nothing saved</strong><p>Only explicitly selected synthetic PNGs have predefined observations. Local rules compare declarations; no model latency is measured.</p></div>}
      <label htmlFor="input-mode">Input source</label><select id="input-mode" value={mode} onChange={e=>{reset();setMode(e.target.value as typeof mode);}}>
        {offlineEnabled && <option value="fixture">Known synthetic fixture</option>}<option value="manual">My image and application — service unavailable</option>
      </select>
      {mode === 'manual' ? <><div className="notice">Live comparison unavailable until authorized provider and authentication are configured. Arbitrary images never receive sample findings.</div><PairInput /></> : <>
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
          {result?.processing === 'complete' && <>
            <p className="notice hash">Source: fixture · Application {result.application.applicationId} / version {result.application.applicationVersion} · Normalized image SHA-256 {result.imageSha256}</p>
            <div className="workspace">
              <section aria-label="Label preview"><div className="preview-head"><h2>Synthetic label</h2><button onClick={()=>zoom.current?.showModal()}>Enlarge label</button></div>{preview && <img className="label-preview" src={preview} alt={`Exact synthetic label: ${sample.title}`} />}<p className="help">Image-only review cannot verify physical print/type size. Not legal certification.</p></section>
              <section aria-label="Comparison evidence"><h2>Seven-field comparison</h2><table><thead><tr><th>Field</th><th>Observed evidence</th><th>Application / reference</th><th>Machine finding</th></tr></thead><tbody>{FIELD_KEYS.map(key=>{const field=result.comparison.fields[key];return <tr key={key}><th scope="row">{fieldLabels[key]}</th><td data-title="Observed">{observations(field.observed)}</td><td data-title="Expected">{field.expected}</td><td data-title="Finding"><strong className={`status ${field.status}`}>{field.status === 'match' ? '✓' : field.status === 'mismatch' ? '≠' : '!'} {field.status}</strong><p className="help">{field.reasons.join(' ')}</p></td></tr>;})}</tbody></table></section>
            </div>
          </>}
        </div>
        <ReviewConfirmation key={`${generation.current}:${result?.processing??'empty'}`} record={result} />
        <dialog ref={zoom} aria-labelledby="zoom-title"><h2 id="zoom-title">Larger synthetic label</h2><button onClick={()=>zoom.current?.close()}>Close preview</button>{preview && <img className="label-preview" src={preview} alt="Enlarged exact synthetic label" />}</dialog>
      </>}
    </section>
  </>;
}
