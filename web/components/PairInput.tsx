'use client';

import { useRef, useState, type FormEvent } from 'react';
import { applicationSchema, checkFileDeclaration } from '../lib/contracts';

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

  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  }

  return <form onSubmit={check} onChange={() => setFeedback(null)} noValidate autoComplete="off">
    <fieldset>
      <legend>1. Choose a label</legend>
      <label htmlFor="label-image">Label image (JPEG or PNG)</label>
      <input id="label-image" name="image" type="file" accept="image/jpeg,image/png" required aria-describedby="file-help limits" />
      <p id="file-help" className="help">Image bytes are not read or uploaded in this browser form. Filename, declared type and size checks are advisory only.</p>
      <p id="limits" className="help">Local decoder limits: 10 MiB input and sanitized output, 20 megapixels, one still JPEG or PNG. PNG expanded metadata is capped at 1 MiB. Signature checks, full decoding, metadata removal and hashes exist in the tested local helper, but are not connected to this form.</p>
    </fieldset>
    <fieldset>
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
    <div className="actions"><button type="submit">Check application fields</button><button type="button" disabled aria-describedby="processing-help">Submit for comparison</button></div>
    {feedback && <div ref={feedbackRef} tabIndex={-1} className={`notice ${feedback.kind === 'error' ? 'error' : ''}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.kind === 'error' && <strong>Check the required input</strong>}
      <ul>{feedback.messages.map(message => <li key={message}>{message}</li>)}</ul>
    </div>}
    <div className="notice" id="processing-help"><strong>Processing not connected</strong><p>No image analysis, authentication, saved history or review submission is available. Use synthetic data only. Reload clears this draft; this app does not persist it.</p></div>
  </form>;
}
