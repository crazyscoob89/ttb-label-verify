import { expect, test } from 'vitest';
import { comparePhotoApplication } from '../lib/group-rules';
import { comparePhotoApplicationV7 } from '../lib/group-rules-v7';
import { parseGpt41Wire } from '../lib/extraction/gpt41-wire';
import { application } from './fixtures/jose-cuervo';
import front from './fixtures/gpt41-refined-envelope-0.json';
import back from './fixtures/gpt41-refined-envelope-1.json';

function set(text: string) {
  const photos = [front, back].map((envelope, i) => ({ photoId: `00000000-0000-4000-8000-00000000000${i + 1}`, evidence: parseGpt41Wire(JSON.parse(envelope.choices[0].message.content)) }));
  photos[0].evidence.abv.text = text;
  return { schemaVersion: 2 as const, photos };
}

test.each(['40% Alc./Vol.', '40% ALC./VOL', '40 % alc/vol.', '40.00% alc./vol.'])('revision 7 recognizes whole percentage notation %s, preserving original evidence and frozen revision 6', text => {
  const evidence = set(text), original = JSON.stringify(evidence);
  const old = comparePhotoApplication(application, evidence), next = comparePhotoApplicationV7(application, evidence);
  expect(old.fields.abv.status).toBe('needs-review');
  expect(next.fields.abv.status).toBe('match');
  expect(next.fields.abv.observed.text).toBe(text);
  expect(JSON.stringify(evidence)).toBe(original);
  for (const key of ['brand', 'classType', 'netContents', 'producer', 'origin', 'warning'] as const) expect(next.fields[key]).toEqual(old.fields[key]);
});

test.each(['39.999% Alc./Vol.', '40.001% Alc./Vol.', '35% Alc./Vol.'])('no tolerance or numeric repair for %s', text => {
  expect(comparePhotoApplicationV7(application, set(text)).fields.abv).toMatchObject({ status: 'mismatch', observed: { text } });
});

test.each(['-40% Alc./Vol.', '40 proof', '40 Alc./Vol.', '4.0.0% Alc./Vol.', '40% Alc../Vol.', '40% Alc./Vol. extra', 'about 40% Alc./Vol.', '40% Alc./Vol. 80 proof'])('unsupported notation stays reviewable, not repaired: %s', text => {
  expect(comparePhotoApplicationV7(application, set(text)).fields.abv).toMatchObject({ status: 'needs-review', observed: { text } });
});

test('uncertainty and real cross-photo mismatches cannot be hidden by the notation projection', () => {
  const evidence = set('40% Alc./Vol.');
  evidence.photos[0].evidence.abv.status = 'uncertain';
  expect(comparePhotoApplicationV7(application, evidence).fields.abv.status).toBe('needs-review');
  evidence.photos[0].evidence.abv.status = 'readable';
  evidence.photos[1].evidence.abv = { status: 'readable', text: '35% Alc./Vol.', reason: 'Synthetic contradictory observation.' };
  expect(comparePhotoApplicationV7(application, evidence).fields.abv).toMatchObject({ status: 'mismatch', conflict: true });
  evidence.photos[1].evidence.abv.text = '40% alc/vol';
  // Aggregation v2 remains frozen too: this new rule does not suppress any
  // raw-notation conflict, even one future aggregation could recognize as equal.
  expect(comparePhotoApplicationV7(application, evidence).fields.abv).toMatchObject({ status: 'needs-review', conflict: true });
});
