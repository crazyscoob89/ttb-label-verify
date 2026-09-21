'use client';

import { useRef, useState, type FormEvent } from 'react';
import { applicationSchema, checkFileDeclaration } from '../lib/contracts';
import type { ComparisonRecord } from '../lib/comparison-record';
import { FIELD_KEYS } from '../lib/rules';
import ReviewConfirmation from './ReviewConfirmation';

const fields = [
  ['applicationId', 'Application ID'], ['applicationVersion', 'Application version'],
  ['brand', 'Brand name'], ['classType', 'Class / type'], ['abv', 'Alcohol by volume (%)'],
  ['netContents', 'Net contents'], ['producerName', 'Producer name'], ['producerAddress', 'Producer address'],
] as const;
const labels: Record<string, string> = { ...Object.fromEntries(fields), commodity: 'Commodity', imported: 'Imported product?', origin: 'Origin context / country' };

type Feedback = { kind: 'error' | 'checked'; messages: string[] } | null;

export default function PairInput() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [record, setRecord] = useState<ComparisonRecord|null>(null);
  const [elapsed, setElapsed] = useState<number|null>(null);
  const [comparisonId,setComparisonId]=useState<string|undefined>();
  const [accessCode,setAccessCode]=useState('');

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setRecord(null); setElapsed(null); setComparisonId(undefined);
    const live = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'live';
    const data = new FormData(event.currentTarget);
    const selected = data.get('image');
    const errors: string[] = [];
    if (!(selected instanceof File) || !selected.name) errors.push('Choose a label image to pair with this application.');
    else {
      const error = checkFileDeclaration(selected);
      if (error) errors.push(error);
    }
    const values = Object.fromEntries(fields.map(([key]) => [key, data.get(key)]));
    const imported = data.get('imported');
    const result = applicationSchema.safeParse({
      ...values, commodity: data.get('commodity'),
      imported: imported === 'true' ? true : imported === 'false' ? false : undefined,
      origin: { kind: data.get('originKind'), country: data.get('country') },
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const label = labels[String(issue.path[0])] || 'Application';
        const message = `${label}: provide an explicit, valid value consistent with the origin context.`;
        if (!errors.includes(message)) errors.push(message);
      }
    }
    setFeedback(errors.length ? { kind: 'error', messages: errors } : {
      kind: 'checked', messages: ['Application fields checked locally. Image content is still unvalidated. Nothing has been uploaded, analyzed or saved.'],
    });
    // Focus after React commits feedback, including keyboard-only submissions.
    requestAnimationFrame(() => feedbackRef.current?.focus());
    if (!live || errors.length || !result.success || !(selected instanceof File)) return;
    const code = String(data.get('accessCode') ?? '');
    setAccessCode(code);
    if (!code) { setFeedback({kind:'error',messages:['Enter the demo access code.']}); return; }
    const body = new FormData(); body.set('image', selected); body.set('application', JSON.stringify(result.data));
    setRunning(true); const started = performance.now();
    try {
      const response = await fetch('/api/comparisons', {method:'POST', headers:{'x-ttb-demo-code':code},body,signal:AbortSignal.timeout(35000),cache:'no-store'});
      const payload = await response.json();
      setElapsed(payload.elapsedMs ?? Math.round(performance.now()-started));
      if (!payload.result || payload.result.processing !== 'complete') {
        setRecord(payload.result ?? null);
        const code = payload.result?.code ?? payload.code;
        setFeedback({kind:'error',messages:[code === 'access-denied' ? 'Access denied. Check the code; the server may have live demo disabled.' : code === 'invalid-input' ? 'Invalid image or application. Check the file signature, size and required fields.' : `Comparison unavailable (${code ?? 'provider-failed'}). No match was produced. A spend hold may remain; do not automatically retry.`]});
      } else { setRecord(payload.result);setComparisonId(payload.comparisonId); setFeedback({kind:'checked',messages:[`Live provider observations compared using local rules. Human review required; check submission status below. ${payload.comparisonId?'Server snapshot available for explicit save.':'Durable save unavailable; comparison retained on this page only.'}`]}); }
    } catch { setElapsed(Math.round(performance.now()-started)); setFeedback({kind:'error',messages:['Network or provider timeout. No match produced; spend may have been incurred. No automatic retry.']}); }
    finally { setRunning(false); requestAnimationFrame(()=>feedbackRef.current?.focus()); }
  }

  return <><form onSubmit={check} onChange={() => {setFeedback(null);setRecord(null);setElapsed(null);}} noValidate autoComplete="off">
    <fieldset disabled={running}>
      <legend>1. Choose a label</legend>
      <label htmlFor="label-image">Label image (JPEG or PNG)</label>
      <input id="label-image" name="image" type="file" accept="image/jpeg,image/png" required aria-describedby="file-help limits" />
      <p id="file-help" className="help">Image bytes are not read or uploaded when checking application fields. Submit for comparison uploads this image to the guarded server and sends sanitized image bytes to the AI provider.</p>
      <p id="limits" className="help">Server decoder limits: 10 MiB input and sanitized output, 20 megapixels, one still JPEG or PNG. Signature checks, full decoding, metadata removal and hashes are enforced. Use synthetic or authorized demo data only.</p>
    </fieldset>
    <fieldset disabled={running}>
      <legend>2. Enter this image’s application</legend>
      <p className="help">All fields are required. No commodity, import status, origin or alcohol value is inferred. Identifiers are preserved exactly; remove surrounding spaces yourself.</p>
      <div className="field-grid">
        {fields.map(([key, label]) => <div key={key}>
          <label htmlFor={key}>{label}</label>
          <input id={key} name={key} type="text" inputMode={key === 'abv' ? 'decimal' : 'text'} required maxLength={key === 'abv' ? 32 : key.startsWith('application') ? 128 : 1000} />
        </div>)}
        <div><label htmlFor="commodity">Commodity</label><select id="commodity" name="commodity" required defaultValue=""><option value="">Choose a commodity</option><option value="wine">Wine</option><option value="distilled-spirits">Distilled spirits</option><option value="malt-beverage">Malt beverage</option></select></div>
        <div><label htmlFor="imported">Imported product?</label><select id="imported" name="imported" required defaultValue=""><option value="">Choose import status</option><option value="true">Yes — imported</option><option value="false">No — domestic</option></select></div>
        <div><label htmlFor="originKind">Origin context</label><select id="originKind" name="originKind" required defaultValue=""><option value="">Choose origin context</option><option value="imported">Imported origin</option><option value="domestic">Domestic origin</option></select></div>
        <div><label htmlFor="country">Country of origin</label><input id="country" name="country" type="text" required maxLength={1000} aria-describedby="country-help" /></div>
      </div>
      <p id="country-help" className="help">Enter the declared country, not the importer’s address. Domestic context requires United States; imported context requires a foreign country. This declaration does not determine legal applicability.</p>
    </fieldset>
    <label htmlFor="demo-access-code">Demo access code</label><input id="demo-access-code" name="accessCode" type="password" maxLength={256} disabled={running} autoComplete="off" />
    <div className="actions"><button type="submit" disabled={running}>Check application fields</button><button type="submit" value="live" disabled={running} aria-describedby="processing-help">Submit for comparison</button></div>
    {running && <p role="status">Comparing label — waiting for provider observations…</p>}
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`notice ${feedback.kind === 'error' ? 'error' : ''}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.kind === 'error' && <strong>Check the required input</strong>}
      <ul>{feedback.messages.map(message => <li key={message}>{message}</li>)}</ul>
    </div>}
    <div className="notice" id="processing-help"><strong>Guarded live demo</strong><p>Requires a server-enabled demo and shared access code, not individual reviewer authentication. Only a confirmed SAVED receipt is durable. No automatic comparison retries.</p></div>
  </form>
  {elapsed !== null && <p role="status">Measured elapsed time: {elapsed} ms (request processing, not a model-only benchmark).</p>}
  {record?.processing === 'complete' && <section aria-label="Live comparison results"><p className="notice hash">Source: {record.source} · Application {record.application.applicationId} / {record.application.applicationVersion} · Sanitized image SHA-256 {record.imageSha256}</p><h2>Seven-field comparison</h2><table><thead><tr><th>Field</th><th>Observed evidence</th><th>Expected</th><th>Machine finding</th></tr></thead><tbody>{FIELD_KEYS.map(key=>{const field=record.comparison.fields[key];return <tr key={key}><th>{key}</th><td><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(field.observed,null,2)}</pre></td><td>{field.expected}</td><td><strong className={`status ${field.status}`}>{field.status}</strong><p>{field.reasons.join(' ')}</p></td></tr>;})}</tbody></table><ReviewConfirmation key={record.imageSha256+String(elapsed)} record={record} comparisonId={comparisonId} accessCode={accessCode}/></section>}
  </>;
}
