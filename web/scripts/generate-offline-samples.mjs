// Deterministic synthetic artwork only. Never reads applicant/browser input.
// The observation source is the existing manually authored synthetic evidence,
// not values submitted for comparison. No OCR/model/remote asset generation.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
const original = JSON.parse(await fs.readFile(new URL('../tests/fixtures/comparisons.json', import.meta.url), 'utf8'));
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const samples = {};
await fs.mkdir(new URL('../public/offline-samples/', import.meta.url), { recursive: true });
for (const id of ['match', 'discrepancy', 'uncertainty', 'failure']) {
  const evidence = structuredClone(original.evidence);
  if (id === 'discrepancy') evidence.abv.text = '45%';
  if (id === 'uncertainty') evidence.abv = { status: 'unreadable', text: null, reason: 'ABV is obscured in this synthetic artwork; no numeric observation.' };
  const lines = ['SYNTHETIC LABEL — NOT FOR SALE', 'Old Harbor', 'Vodka', evidence.abv.text ?? '[ABV obscured]', '750 mL', 'Harbor Distillery', '12 Wharf Road, Paris', 'France', 'GOVERNMENT WARNING:'];
  // Fixed warning wrapped for readability. The bold heading/body flags match art.
  const words = evidence.warning.body.text.split(' '); let line = '';
  for (const word of words) { if ((line + ' ' + word).length > 57) { lines.push(line); line = word; } else line += (line ? ' ' : '') + word; } lines.push(line);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1020"><rect width="840" height="1020" fill="#faf6e9"/><rect x="26" y="26" width="788" height="968" rx="8" fill="none" stroke="#173a5e" stroke-width="3"/>${lines.map((text,i) => `<text x="65" y="${80+i*48}" fill="#162230" font-family="sans-serif" font-size="${i===1?40:22}" font-weight="${i===1||i===8?'bold':'normal'}">${escape(text)}</text>`).join('')}<text x="65" y="955" font-size="18" font-family="sans-serif" fill="#52616d">Offline scenario: ${id}</text></svg>`;
  // Same normalization as PNG intake; deterministic committed bytes are authoritative.
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const normalized = await sharp(png).autoOrient().png().toBuffer();
  await fs.writeFile(new URL(`../public/offline-samples/${id}.png`, import.meta.url), normalized);
  samples[id] = { title: ({match:'Matching sample',discrepancy:'Readable discrepancy',uncertainty:'Unreadable ABV',failure:'Processing failure'})[id], imagePath: `/offline-samples/${id}.png`, imageSha256: crypto.createHash('sha256').update(normalized).digest('hex'), application: {...original.application, applicationId:`OFFLINE-${id}`, applicationVersion:'1'}, evidence, failure: id==='failure' };
}
await fs.writeFile(new URL('../lib/offline-samples.json', import.meta.url), JSON.stringify(samples,null,2)+'\n');
