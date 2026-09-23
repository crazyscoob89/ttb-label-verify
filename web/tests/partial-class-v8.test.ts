import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import capture from './fixtures/bacardi-partial-class-v8.json';
import { checkedPhotoRecord, finalizePhotoComparison, type CompletePhotoComparison } from '../lib/photo-record';
import { compareEvidenceV8 } from '../lib/semantic-rules-v8';
import { comparePhotoApplicationV8 } from '../lib/group-rules-v8';
import { aggregatePhotoEvidence } from '../lib/photo-evidence-v3';

// Byte-exact local first-response comparison from 07f8df9, NOT a new saved
// production snapshot or rewritten model output. The expected old failure stays.
// Source: /opt/data/ttb-general-real-acceptance/bacardi-comparison.json;
// report.md and bacardi-result.json document this capture's provenance.
const record = capture as CompletePhotoComparison;
const readable = (text: string) => ({ status: 'readable' as const, text, reason: 'Synthetic partial-class regression, not model output.' });
function compare(declared: string, ...texts: string[]) {
  const set = structuredClone(record.photoEvidence);
  set.photos = texts.map((text, i) => ({ photoId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, evidence: { ...structuredClone(set.photos[0].evidence), classType: readable(text) } }));
  const result = comparePhotoApplicationV8({ ...record.application, classType: declared }, set);
  expect(set.photos.map(p => p.evidence.classType)).toEqual(texts.map(readable));
  return { field: result.fields.classType, set, aggregate: aggregatePhotoEvidence(set) };
}

test('captured real front resolves compatible GOLD on back without editing either source or hiding LITR', () => {
  expect(createHash('sha256').update(readFileSync(new URL('./fixtures/bacardi-partial-class-v8.json', import.meta.url))).digest('hex')).toBe('f0c45124b8c45d958e64c04c5c4409df7093a7495b6536449fb862efe9db923a');
  expect(record.comparison.fields.classType).toMatchObject({ status: 'mismatch', conflict: true });
  const before = JSON.stringify(record);
  const current = finalizePhotoComparison(record.application, record.groupId, record.revision, record.photos, record.photoSetSha256, {
    processing: 'complete', evidence: record.photoEvidence,
    metadata: { ...record.extraction, source: record.source, rulesVersion: record.comparison.rulesVersion, photoSetSha256: record.photoSetSha256, photos: record.photos.map(p => ({ photoId: p.photoId, imageSha256: p.normalized.sha256 })) },
  });
  // Preserve v8 policy assertions rather than relabeling fresh v10 findings.
  const result = {...current,aggregationVersion:'photo-set-aggregation-v3' as const,...aggregatePhotoEvidence(record.photoEvidence),comparison:comparePhotoApplicationV8(record.application,record.photoEvidence)};
  expect(result.comparison.fields.classType).toMatchObject({ status: 'match', conflict: false, observed: record.photoEvidence.photos[0].evidence.classType, sourcePhotoIds: [record.photos[0].photoId] });
  expect(result.provenance.classType).toEqual({ conflict: false, sourcePhotoIds: record.photos.map(p => p.photoId), variants: record.photoEvidence.photos.map(p => ({ value: p.evidence.classType.text, sourcePhotoIds: [p.photoId] })) });
  expect(result.photoEvidence).toEqual(record.photoEvidence);
  expect(result.comparison.fields.netContents).toMatchObject({ status: 'needs-review', conflict: true });
  expect(result.comparison.physicalPrintSize.status).toBe('unverified');
  expect(checkedPhotoRecord(result)).toEqual(result);
  expect(JSON.stringify(record)).toBe(before);
});

test.each([
  ['Gold Rum', 'GOLD', 'Gold Rum'], ['Gold Rum', 'ORO', 'RON SUPERIOR CARTA ORO'],
  ['White Rum', 'BLANCO', 'White Rum'], ['Aged Rum', 'AÑEJO', 'Ron Añejo'],
  ['Spiced Rum', 'SPICED', 'Spiced Rum'], ['Tequila Gold', 'GOLD', 'Tequila Gold'],
  ['Tequila Silver', 'SILVER', 'Tequila Silver'], ['Tequila Reposado', 'REPOSADO', 'Tequila Reposado'],
])('complete source wins in either order: %s / %s / %s', (declared, partial, full) => {
  for (const texts of [[partial, full], [full, partial]]) {
    const { field, set } = compare(declared, ...texts);
    expect(field).toMatchObject({ status: 'match', conflict: false, observed: readable(full), sourcePhotoIds: [set.photos[texts.indexOf(full)].photoId] });
  }
});

test.each(['GOLD', 'ORO', 'SILVER', 'SUPERIOR', 'Reserve', 'Gold Reserve', 'Unknown style'])('incomplete evidence alone needs review, never proves the category: %s', text => {
  const evidence = structuredClone(record.photoEvidence.photos[0].evidence);
  evidence.classType = readable(text);
  expect(compareEvidenceV8(record.application, evidence).fields.classType.status).toBe(text === 'SILVER' ? 'mismatch' : 'needs-review');
  expect(compare('Rum', text).field.status).toBe('needs-review');
  expect(compare(text, text).field.status).toBe('needs-review');
});

test.each(['Reserve', 'SUPERIOR', 'Gold Reserve', 'Unknown style'])('unknown fragment cannot be silently discarded: %s', text => {
  expect(compare('Gold Rum', 'Gold Rum', text).field).toMatchObject({ status: 'needs-review', conflict: true });
});

test.each([
  ['Gold Rum', 'Gold Rum', 'SILVER'], ['Gold Rum', 'Gold Rum', 'White'],
  ['Gold Rum', 'Gold Rum', 'Vodka'], ['Rum', 'Rum', 'Tequila'],
  ['Gold Rum', 'Gold Rum', 'Gold Rum 12'], ['Gold Rum', 'Gold Rum', 'GOLD 12'],
  ['Gold Rum', 'Gold Rum', 'Gold Rum flavored vodka'],
  ['Tequila Gold', 'Tequila Gold', 'Silver'],
])('readable genuine contradiction remains mismatch: %s / %s / %s', (declared, full, other) => {
  expect(compare(declared, full, other).field).toMatchObject({ status: 'mismatch', conflict: true });
});

test('partial, generic and matching full cannot bridge contradictory styles or commodities', () => {
  for (const texts of [['GOLD', 'Gold Rum', 'White Rum'], ['Gold Rum', 'Rum', 'SILVER'], ['GOLD', 'Gold Rum', 'Vodka']]) {
    expect(compare('Rum', ...texts).field).toMatchObject({ conflict: true });
    expect(compare('Rum', ...texts).field.status).not.toBe('match');
  }
});

test('generic category plus style cannot manufacture a full designation or prove application subtype', () => {
  expect(compare('Gold Rum', 'Rum').field.status).toBe('needs-review');
  expect(compare('Gold Rum', 'Rum', 'GOLD').field.status).toBe('needs-review');
  expect(compare('Gold Rum', 'Rum', 'GOLD').aggregate.evidence.classType.text).not.toBe('Gold Rum');
  const { set } = compare('Gold Rum', 'GOLD', 'Gold Rum');
  set.photos[1].evidence.classType.status = 'uncertain';
  expect(comparePhotoApplicationV8(record.application, set).fields.classType.status).toBe('needs-review');
  expect(comparePhotoApplicationV8({ ...record.application, commodity: 'wine' }, set).fields.classType.status).not.toBe('match');
});
