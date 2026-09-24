import { describe, expect, it } from 'vitest';
import { comparePhotoApplication } from '../lib/group-rules';
import { aggregatePhotoEvidence } from '../lib/photo-evidence';
import { parsePhotoSetEvidence } from '../lib/photo-contracts';
import { checkedRecord } from '../lib/review-policy';
import { compareApplicationV5 } from '../lib/semantic-rules';
import type { Observation } from '../lib/extraction/schema';
import { application, incident, readable } from './fixtures/jose-cuervo';
import savedGroups from './fixtures/photo-ui-records.json';
import history from './fixtures/semantic-history.json';

const absent = (): Observation => ({ status: 'missing', text: null, reason: 'Not visible in this synthetic view.' });
const fullAddress = 'Jose Cuervo No. 73, Tequila, Jalisco, 46400 Mexico';

// Offline comparator inputs informed by /opt/data/ttb-jose-cuervo-ground-truth.json,
// NOT newly extracted provider output. Imported/distilled-spirits are explicit
// assumptions inherited from the incident fixture. No edits to immutable fixtures.
function supportedEvidence() {
  const set = incident();
  const [front, back] = set.photos.map(p => p.evidence);
  front.classType = readable('TEQUILA GOLD');
  // Back narrative mentions several tequilas; it is not an exclusive designation.
  back.classType = absent();
  front.abv = readable('40% ALC/VOL');
  back.abv = absent();
  front.producer = {
    name: { status: 'uncertain', text: 'La Rojena', reason: 'Seal names the establishment, but this view alone does not establish the producer role.' },
    address: { status: 'uncertain', text: 'Tequila, Mexico', reason: 'Only locality visible; no complete street address.' },
  };
  back.producer = {
    name: { status: 'readable', text: 'La Rojeña', reason: 'Named as the distillery in narrative and address block. Separate IMPORTED & BOTTLED BY PROXIMO, LAWRENCEBURG, IN statement is not the producer name.' },
    address: readable(fullAddress),
  };
  return set;
}

const compare = (set = supportedEvidence(), app = application) => comparePhotoApplication(app, set);

describe('completion boundary: evidence assignment versus frozen comparison semantics', () => {
  it('already accepts an independently supported designation, name and full address without forcing all-green', () => {
    const set = supportedEvidence(), before = JSON.stringify(set);
    const result = compare(set), aggregated = aggregatePhotoEvidence(set);
    expect(result.rulesRevision).toBe(6);
    expect(result.fields.classType).toMatchObject({ status: 'match', conflict: false, observed: { text: 'TEQUILA GOLD' }, sourcePhotoIds: [set.photos[0].photoId] });
    expect(result.fields.abv.status).toBe('match');
    expect(result.fields.producer).toMatchObject({ status: 'match', conflict: false, observed: { name: { text: 'La Rojeña' }, address: { text: fullAddress } } });
    expect(aggregated.provenance['producer.name'].variants.map(v => v.value)).toEqual(['La Rojena', 'La Rojeña']);
    expect(aggregated.provenance['producer.address'].variants.map(v => v.value)).toEqual(['Tequila, Mexico', fullAddress]);
    expect(result.fields.warning.status).toBe('needs-review');
    expect(result.physicalPrintSize.status).toBe('unverified');
    expect(JSON.stringify(set)).toBe(before);
  });

  it('uses the same bounded class/name/address decisions in singleton revision 5', () => {
    const e = supportedEvidence().photos[1].evidence;
    e.classType = readable('Tequila Gold');
    const result = compareApplicationV5(application, e);
    expect(result.processing).toBe('complete');
    if (result.processing !== 'complete') throw Error('Invalid fixture');
    expect(result.rulesRevision).toBe(5);
    expect(result.fields.classType.status).toBe('match');
    expect(result.fields.producer.status).toBe('match');
    expect(result.fields.abv.status).toBe('needs-review');
  });

  it.each(['Especial Tequila Gold', 'Tequila Gold Especial', 'Reposado and younger Tequilas'])('does not strip arbitrary marketing/narrative text from an assigned class: %s', text => {
    // Illustrative contamination shapes, not a claim about the exact saved raw
    // response. The deployed summary reports Especial contamination but omits it.
    const set = supportedEvidence();
    set.photos[0].evidence.classType = readable(text);
    expect(compare(set).fields.classType.status).toBe('mismatch');
    expect(aggregatePhotoEvidence(set).evidence.classType.text).toBe(text);
  });

  it('does not treat an exclusive subtype inferred from narrative as a compatible second designation', () => {
    const set = supportedEvidence();
    set.photos[1].evidence.classType = readable('Tequila Reposado');
    expect(compare(set).fields.classType).toMatchObject({ status: 'needs-review', conflict: true });
    set.photos[1].evidence.classType = absent();
    expect(compare(set).fields.classType).toMatchObject({ status: 'match', conflict: false });
  });

  it.each(['Vodka', 'Tequila Silver'])('retains a genuine declared class mismatch: %s', classType => {
    expect(compare(supportedEvidence(), { ...application, classType }).fields.classType.status).toBe('mismatch');
  });

  it.each(['PROXIMO', 'Jose Cuervo', 'La Rojeña Spirits, LLC', 'Other Distillery'])('does not infer producer aliases even with the correct complete address: %s', name => {
    const set = supportedEvidence();
    set.photos[0].evidence.producer.name = absent();
    set.photos[1].evidence.producer.name = readable(name);
    expect(compare(set).fields.producer.status).toBe('needs-review');
  });

  it('requires explicit uncertain status for unresolved producer role, even when the spelling matches', () => {
    const set = supportedEvidence();
    set.photos[1].evidence.producer.name = { status: 'uncertain', text: 'La Rojeña', reason: 'Name readable but role cannot be established from this view.' };
    expect(compare(set).fields.producer).toMatchObject({ status: 'needs-review', conflict: false });
    // There is deliberately no semantic parser for free-form reasons. Extraction
    // must not mark unresolved role evidence readable and rely on prose to veto it.
    expect(aggregatePhotoEvidence(set).evidence.producer.name.status).toBe('uncertain');
  });

  it('retains unnormalized establishment prefixes instead of silently deleting name words', () => {
    const set = supportedEvidence();
    set.photos[0].evidence.producer.name = readable('FABRICA LA ROJENA');
    expect(compare(set).fields.producer).toMatchObject({ status: 'needs-review', conflict: true });
    expect(aggregatePhotoEvidence(set).provenance['producer.name'].variants.map(v => v.value)).toEqual(['FABRICA LA ROJENA', 'La Rojeña']);
  });

  it.each([
    'Jose Cuervo No. 74, Tequila, Jalisco, 46400 Mexico',
    'Jose Cuervo No. 73, Tequila, Jalisco, 46401 Mexico',
    'Jose Cuervo No. 73, Tequila, Jalisco, 46400 Canada',
  ])('retains a readable address contradiction: %s', address => {
    const set = supportedEvidence();
    set.photos[1].evidence.producer.address = readable(address);
    expect(compare(set).fields.producer.status).toBe('mismatch');
  });

  it('never concatenates partial addresses or confuses a named address block with a complete address field', () => {
    const set = supportedEvidence();
    set.photos[1].evidence.producer.address = readable('Jalisco, 46400 Mexico');
    expect(compare(set).fields.producer.status).toBe('needs-review');
    expect(aggregatePhotoEvidence(set).evidence.producer.address.text).not.toBe(fullAddress);
    set.photos[0].evidence.producer.address = absent();
    set.photos[1].evidence.producer.address = readable(`La Rojeña ${fullAddress}`);
    expect(compare(set).fields.producer.status).toBe('needs-review');
  });

  it('does not depend on bottle-specific brand, producer or street values', () => {
    const set = supportedEvidence();
    const app = { ...application, brand: 'Another Brand', producerName: 'Fabrica del Rio', producerAddress: 'Camino No.12, Puebla, 72000 Mexico' };
    for (const photo of set.photos) {
      photo.evidence.brand = readable('Another Brand');
      photo.evidence.producer.name = readable('Fábrica del Río');
      photo.evidence.producer.address = readable('Camino No. 12, Puebla, 72000 Mexico');
    }
    expect(compare(set, app).fields.brand.status).toBe('match');
    expect(compare(set, app).fields.producer.status).toBe('match');
    set.photos[0].evidence.brand = readable('Different Brand');
    expect(compare(set, app).fields.brand.status).toBe('mismatch');
  });

  it('does not infer class, producer, ABV or warning from the application when their source views are absent', () => {
    const set = supportedEvidence();
    const frontOnly = compare({ ...set, photos: [set.photos[0]] });
    expect(frontOnly.fields.abv.status).toBe('match');
    expect(frontOnly.fields.producer.status).toBe('needs-review');
    expect(frontOnly.fields.warning.status).toBe('needs-review');
    const backOnly = compare({ ...set, photos: [set.photos[1]] });
    expect(backOnly.fields.abv.status).toBe('needs-review');
    expect(backOnly.fields.classType.status).toBe('needs-review');
    for (const photo of set.photos) photo.evidence.producer = { name: absent(), address: absent() };
    expect(compare(set).fields.producer).toMatchObject({ status: 'needs-review', sourcePhotoIds: [] });
  });

  it('enforces the existing strict schema rather than accepting invented role/entity slots', () => {
    const set = supportedEvidence();
    const invalid = structuredClone(set);
    Object.assign(invalid.photos[1].evidence.producer, { role: 'distiller', importerName: 'PROXIMO' });
    expect(() => parsePhotoSetEvidence(invalid, invalid.photos.map(p => p.photoId))).toThrow();
    expect(parsePhotoSetEvidence(set, set.photos.map(p => p.photoId))).toEqual(set);
  });

  it('replays already-captured groups under revision 6 and historical revisions without rewriting evidence', () => {
    const records = [savedGroups.complementary, savedGroups.conflict, ...history.singletons, history.group];
    const before = JSON.stringify(records);
    for (const record of records) expect(checkedRecord(record)).toEqual(record);
    expect(JSON.stringify(records)).toBe(before);
    const tampered = structuredClone(savedGroups.complementary);
    tampered.comparison.fields.producer.status = 'mismatch';
    expect(checkedRecord(tampered)).toBeNull();
  });
});
