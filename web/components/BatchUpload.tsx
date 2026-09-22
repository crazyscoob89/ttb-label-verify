'use client';
import { useEffect, useRef, useState } from 'react';
import { buildBatchManifest, type BatchManifest } from '../lib/batch-manifest';
import { checkFileDeclaration, MAX_BATCH_PAIRS, MAX_IMAGE_BYTES } from '../lib/contracts';
import { samples, type Scenario } from '../lib/offline-demo';

export type FixtureAsset = { scenario: Scenario; bytes: Uint8Array<ArrayBuffer> };
export type PreparedBatch = { manifest: BatchManifest; assets: Map<string, FixtureAsset>; files: Map<string, File>; live: boolean; diagnostics: string[] };

/** Read a bounded declaration, not an image sanitizer. Only an exact catalog hash
 * may enter the offline executor. Unknown files never get a preview or findings. */
async function readBounded(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const reader = blob.stream().getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > MAX_IMAGE_BYTES) throw Error('File exceeds 10 MiB');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export default function BatchUpload({ offlineEnabled, live, onPrepared, onClear }: {
  offlineEnabled: boolean; live: boolean; onPrepared: (batch: PreparedBatch) => void; onClear: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [json, setJson] = useState('');
  const [inputTab,setInputTab] = useState<'application'|'images'>('images');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  function invalidate() { generation.current++; controller.current?.abort(); setBusy(false); setError(''); onClear(); }
  async function loadFixtures() {
    if (!offlineEnabled || live) return;
    invalidate(); const run = generation.current; setBusy(true);
    const active = new AbortController(); controller.current = active;
    const timeout = setTimeout(() => active.abort(), 5000);
    try {
      const selected: File[] = [];
      for (const sample of Object.values(samples)) {
        const response = await fetch(sample.imagePath, { signal: active.signal, cache: 'no-store' });
        if (!response.ok || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES || !response.body) throw Error('Fixture unavailable');
        // Stream the allowlisted response with a cap before constructing a File.
        const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let length = 0;
        try { for (;;) { const {done, value} = await reader.read(); if (done) break; length += value.length; if (length > MAX_IMAGE_BYTES) throw Error('Fixture too large'); chunks.push(new Uint8Array(value)); } }
        finally { await reader.cancel().catch(() => {}); }
        selected.push(new File(chunks, sample.imagePath.split('/').pop()!, {type:'image/png'}));
      }
      if (run !== generation.current || active.signal.aborted) return;
      if (fileInput.current) fileInput.current.value = '';
      setFiles(selected);
      setJson(JSON.stringify(Object.values(samples).map(sample => ({filename:sample.imagePath.split('/').pop(),application:sample.application})), null, 2));
    } catch { if (run === generation.current) setError('Synthetic fixtures unavailable or timed out. No comparison was started.'); }
    finally { clearTimeout(timeout); if (run === generation.current) setBusy(false); }
  }
  async function validate() {
    invalidate(); const run = generation.current; setBusy(true);
    try {
      const mapping: unknown = JSON.parse(json);
      const grouped=!!mapping&&typeof mapping==='object'&&!Array.isArray(mapping)&&'schemaVersion' in mapping&&mapping.schemaVersion===2;
      if ((!grouped&&(!Array.isArray(mapping)||mapping.length>MAX_BATCH_PAIRS))||files.length>(grouped?1200:MAX_BATCH_PAIRS))throw Error('Use grouped v2 JSON or a legacy array.');
      const assets = new Map<string, FixtureAsset>(); const diagnostics: string[] = [];
      const declarations: {filename:string;imageSha256:string|null}[] = [];
      // Sequential reads bound working memory; retained assets deduplicate the four
      // known PNGs by hash. A 300-card rail never creates 300 image elements.
      for (const file of files) {
        const issue = checkFileDeclaration(file); let hash: string | null = 'unavailable';
        if (issue) diagnostics.push(`${file.name}: ${issue}`);
        else if (live) hash = null; // Preserve File; active queue slots prepare on server.
        else if (!offlineEnabled) diagnostics.push(`${file.name}: Processing unavailable — runtime adapters are not configured.`);
        else {
          const bytes = await readBounded(file);
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const candidate = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
          const scenario = (Object.keys(samples) as Scenario[]).find(id => samples[id].imageSha256 === candidate);
          if (scenario) { hash = candidate; assets.set(hash, {scenario,bytes}); }
          else diagnostics.push(`${file.name}: Unknown image — processing unavailable. No sanitation or extraction performed.`);
        }
        if (run !== generation.current) return;
        declarations.push({filename:file.name,imageSha256:hash});
      }
      const manifest = buildBatchManifest(declarations, mapping, {live});
      if (run === generation.current) onPrepared({manifest,assets,files:new Map(files.map(file=>[file.name,file])),live,diagnostics});
    } catch { if (run === generation.current) setError('Provide a valid grouped v2 manifest (1–300 bottles, 1–4 photos each), or a legacy singleton array. Each bottle needs a complete independent application, unique group/photo IDs and exact filename references.'); }
    finally { if (run === generation.current) setBusy(false); }
  }
  return <section aria-label="Batch preparation">
    <p>Maximum 300 bottles, 1–4 photos per bottle (up to 1,200 references). One application and one review per bottle. Exact, case-sensitive filename mapping only — never list order or guessed grouping. {live?'Validation checks declarations only. Explicit queue start uploads active groups for server sanitation and one joint comparison per bottle.':'Only exact known singleton fixtures can run offline; grouped manifests require the guarded live transport.'}</p>
    {offlineEnabled && !live && <><div className="notice"><strong>Development-only synthetic fixture batch — not AI analysis; nothing saved</strong><p>Only exact known PNG bytes can use predefined observations. Uploaded copies are checked by bytes, not by filename.</p></div><button onClick={loadFixtures} disabled={busy}>Load synthetic fixture batch</button></>}
    <nav className="tabs entry-tabs" role="tablist" aria-label="Batch inputs">{(['application','images'] as const).map(key=><button type="button" role="tab" id={`batch-input-${key}-tab`} aria-controls={`batch-input-${key}-panel`} aria-selected={inputTab===key} tabIndex={inputTab===key?0:-1} key={key} onClick={()=>setInputTab(key)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'application':e.key==='End'?'images':inputTab==='images'?'application':'images';setInputTab(next);document.getElementById(`batch-input-${next}-tab`)?.focus();}}}>{key==='application'?'Application':'Label images'}</button>)}</nav>
    <div id="batch-input-images-panel" role="tabpanel" aria-labelledby="batch-input-images-tab" hidden={inputTab!=='images'} className="input-card">
    <label htmlFor="batch-files">Batch label images</label><input ref={fileInput} id="batch-files" type="file" multiple accept="image/png,image/jpeg" onChange={e=>{invalidate();setFiles(Array.from(e.target.files ?? []));}} />
    <p>{files.length} files selected</p>
    <p className="help">Select images before completing application mapping. Nothing is uploaded until explicit queue start. Image-only extraction cannot establish an application match.</p>
    <button onClick={()=>setInputTab('application')}>Add application mapping</button></div>
    <div id="batch-input-application-panel" role="tabpanel" aria-labelledby="batch-input-application-tab" hidden={inputTab!=='application'} className="input-card">
    <h2>Independent application mapping</h2><p>Import a grouped JSON manifest identifying the photos of each bottle under one independent application. Old singleton arrays are still supported. Do not use label extraction as the application reference.</p>
    <label htmlFor="batch-manifest-file">Application manifest file (JSON)</label><input id="batch-manifest-file" type="file" accept="application/json,.json" onChange={async e=>{invalidate();const run=generation.current,file=e.target.files?.[0];if(!file)return;if(file.size>4*1024*1024){setError('Manifest exceeds 4 MiB.');return;}try{const value=await file.text();if(run===generation.current)setJson(value);}catch{if(run===generation.current)setError('Could not read the application manifest.');}}}/>
    <p className="help">{json?'Application mapping loaded. Validate before queue start.':'No application mapping yet.'}</p>
    <details><summary>Advanced: edit JSON mapping</summary><label htmlFor="batch-json">Batch JSON manifest</label><textarea id="batch-json" className="batch-json" value={json} onChange={e=>{invalidate();setJson(e.target.value);}} spellCheck={false} />
    <p className="help">Grouped shape: schemaVersion: 2, groups: [groupId (UUID), application (all independent declarations), photos: [photoId (UUID), filename, role]]. Roles: front, back, neck, closeup, other. Photos are ordered; repeated roles are allowed. Duplicate/cross-bottle filenames or IDs are blocked, not guessed. Input changes clear the previous batch.</p><pre>{JSON.stringify({schemaVersion:2,groups:[{groupId:'00000000-0000-4000-8000-000000000001',application:{applicationId:'YOUR-APPLICATION',applicationVersion:'1','…':'all independent application fields required'},photos:[{photoId:'00000000-0000-4000-8000-000000000002',filename:'front.png',role:'front'},{photoId:'00000000-0000-4000-8000-000000000003',filename:'back.png',role:'back'}]}]},null,2)}</pre>
    </details></div>
    <button onClick={validate} disabled={busy}>Validate batch manifest</button>
    {busy && <p role="status">Checking local fixture bytes / declarations. No AI request.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
