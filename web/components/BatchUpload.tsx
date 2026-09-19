'use client';
import { useEffect, useRef, useState } from 'react';
import { buildBatchManifest, type BatchManifest } from '../lib/batch-manifest';
import { checkFileDeclaration, MAX_BATCH_PAIRS, MAX_IMAGE_BYTES } from '../lib/contracts';
import { samples, type Scenario } from '../lib/offline-demo';

export type FixtureAsset = { scenario: Scenario; bytes: Uint8Array<ArrayBuffer> };
export type PreparedBatch = { manifest: BatchManifest; assets: Map<string, FixtureAsset>; diagnostics: string[] };

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

export default function BatchUpload({ offlineEnabled, onPrepared, onClear }: {
  offlineEnabled: boolean; onPrepared: (batch: PreparedBatch) => void; onClear: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const generation = useRef(0); const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  function invalidate() { generation.current++; controller.current?.abort(); setBusy(false); setError(''); onClear(); }
  async function loadFixtures() {
    if (!offlineEnabled) return;
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
      if (!Array.isArray(mapping) || mapping.length > MAX_BATCH_PAIRS || files.length > MAX_BATCH_PAIRS) throw Error('Use a JSON array and at most 300 files / mappings.');
      const assets = new Map<string, FixtureAsset>(); const diagnostics: string[] = [];
      const declarations: {filename:string;imageSha256:string}[] = [];
      // Sequential reads bound working memory; retained assets deduplicate the four
      // known PNGs by hash. A 300-card rail never creates 300 image elements.
      for (const file of files) {
        const issue = checkFileDeclaration(file); let hash = 'unavailable';
        if (issue) diagnostics.push(`${file.name}: ${issue}`);
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
      const manifest = buildBatchManifest(declarations, mapping);
      if (run === generation.current) onPrepared({manifest,assets,diagnostics});
    } catch { if (run === generation.current) setError('Provide a valid JSON array with 1–300 logical entries and at most 300 files / mappings. Each row requires an exact filename and a complete application version.'); }
    finally { if (run === generation.current) setBusy(false); }
  }
  return <section aria-label="Batch preparation">
    <p>Maximum 300 files, mappings and logical entries. Exact, case-sensitive filename pairing only — never list order. Unknown uploads remain unavailable until real runtime adapters exist.</p>
    {offlineEnabled && <><div className="notice"><strong>Development-only synthetic fixture batch — not AI analysis; nothing saved</strong><p>Only exact known PNG bytes can use predefined observations. Uploaded copies are checked by bytes, not by filename.</p></div><button onClick={loadFixtures} disabled={busy}>Load synthetic fixture batch</button></>}
    <label htmlFor="batch-files">Batch label images</label><input ref={fileInput} id="batch-files" type="file" multiple accept="image/png,image/jpeg" onChange={e=>{invalidate();setFiles(Array.from(e.target.files ?? []));}} />
    <p>{files.length} files selected</p>
    <label htmlFor="batch-json">Batch JSON manifest</label><textarea id="batch-json" className="batch-json" value={json} onChange={e=>{invalidate();setJson(e.target.value);}} spellCheck={false} />
    <p className="help">Array shape: [{'{'}"filename": "label.png", "application": {'{'}"applicationId": "…", "applicationVersion": "…", plus all application declarations{'}'}{'}'}]. The fixture button supplies an editable complete example. Input changes clear the previous batch; use Replace selected pair to retain superseded page-memory versions.</p>
    <button onClick={validate} disabled={busy}>Validate batch manifest</button>
    {busy && <p role="status">Checking local fixture bytes / declarations. No AI request.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </section>;
}
