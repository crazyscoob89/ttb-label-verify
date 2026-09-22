import { describe, expect, it } from 'vitest';
import { applicationSchema, type Application } from '../lib/contracts';
import type { ExtractionEvidence, Observation } from '../lib/extraction/schema';
import { compareApplication, FIELD_KEYS, WARNING_REFERENCE } from '../lib/rules';
import { compareApplicationV3, RULES_REVISION_V3 } from '../lib/wine-rules';

const readable = (text: string): Observation => ({ status: 'readable', text, reason: 'Synthetic transcription, not bottle evidence.' });
function pair(): { application: Application; evidence: ExtractionEvidence } {
  return {
    application: {
      applicationId: 'wine-policy-test', applicationVersion: '1', brand: 'Synthetic Cellars',
      classType: 'Wine', abv: 12.5, netContents: '750 mL', producerName: 'Synthetic Cellars',
      producerAddress: 'Lodi, CA', commodity: 'wine', imported: false,
      origin: { kind: 'domestic', country: 'US' },
    },
    evidence: {
      schemaVersion: 1, brand: readable('Synthetic Cellars'), classType: readable('Wine'),
      abv: readable('12.5% BY VOL.'), netContents: readable('0.75 L'),
      producer: { name: readable('Synthetic Cellars'), address: readable('Lodi, CA') },
      origin: readable('US'),
      warning: { heading: readable(WARNING_REFERENCE.heading), body: readable(WARNING_REFERENCE.body), headingBold: true, bodyBold: false },
    },
  };
}
function complete(application: Application, evidence: ExtractionEvidence) {
  const result = compareApplicationV3(application, evidence);
  if (result.processing !== 'complete') throw Error(JSON.stringify(result));
  return result;
}
function warning(body: string = WARNING_REFERENCE.body, heading: string = WARNING_REFERENCE.heading, headingBold: boolean | null = true, bodyBold: boolean | null = false) {
  const { application, evidence } = pair();
  evidence.warning = { heading: readable(heading), body: readable(body), headingBold, bodyBold };
  return complete(application, evidence);
}

describe('revision 3 broad wine class, not varietal certification', () => {
  it.each(['Cabernet Sauvignon', ' cabernet\n SAUVIGNON ', 'Chardonnay', 'Merlot', 'Pinot Noir', 'Sauvignon Blanc', 'Syrah', 'Riesling', 'Zinfandel'])('accepts bounded whole varietal %s under generic Wine', text => {
    const { application, evidence } = pair();
    evidence.classType = readable(text);
    const field = complete(application, evidence).fields.classType;
    expect(field).toMatchObject({ status: 'match', expected: 'Wine', observed: evidence.classType });
    expect(field.reasons.join(' ')).toMatch(/broad.class compatible/i);
    expect(field.reasons.join(' ')).toMatch(/not.*varietal percentage.*subtype/i);
  });
  it.each(['Cabernet Sauvignon blend', 'Cabernet Sauvignon Wine', 'Cabernet Sauvignon / Merlot', 'Cabernet', 'CabernetSauvignon', 'Unknown Grape', 'Vodka'])('does not extend the bounded list to %s', text => {
    const { application, evidence } = pair(); evidence.classType = readable(text);
    expect(complete(application, evidence).fields.classType.status).toBe('mismatch');
  });
  it('retains specific-grape contradictions and normal exact matches', () => {
    const { application, evidence } = pair(); application.classType = 'Cabernet Sauvignon';
    evidence.classType = readable('Merlot');
    expect(complete(application, evidence).fields.classType.status).toBe('mismatch');
    evidence.classType = readable('cabernet sauvignon');
    expect(complete(application, evidence).fields.classType.status).toBe('match');
    evidence.classType = readable('Wine');
    expect(complete(application, evidence).fields.classType.status).toBe('mismatch');
  });
  it.each(['uncertain', 'unreadable', 'missing'] as const)('never promotes %s varietal evidence', status => {
    const { application, evidence } = pair();
    evidence.classType = { ...readable('Cabernet Sauvignon'), status, text: status === 'missing' ? null : 'Cabernet Sauvignon' };
    expect(complete(application, evidence).fields.classType.status).toBe('needs-review');
  });
});

describe('revision 3 domestic wine location is not foreign-country evidence', () => {
  it.each(['Lodi CA', 'Lodi, CA', 'LODI, CALIFORNIA', ' Lodi\nCA ', 'Napa, CA', 'Sonoma California'])('recognizes only bounded US city/state %s', text => {
    const { application, evidence } = pair(); evidence.origin = readable(text);
    const field = complete(application, evidence).fields.origin;
    expect(field).toMatchObject({ status: 'not-applicable', expected: 'US', observed: evidence.origin });
    expect(field.reasons.join(' ')).toMatch(/geographic producer location/i);
    expect(field.reasons.join(' ')).toMatch(/not.*foreign.country evidence/i);
    expect(field.reasons.join(' ')).toMatch(/domestic country statement.*not required/i);
  });
  it.each(['US', 'USA', 'U.S.A.', 'United States', 'United States of America'])('preserves schema-valid declared alias %s', country => {
    const { application, evidence } = pair(); application.origin.country = country; evidence.origin = readable('Lodi CA');
    expect(applicationSchema.safeParse(application).success).toBe(true);
    expect(complete(application, evidence).fields.origin).toMatchObject({ status: 'not-applicable', expected: country });
  });
  it.each(['Lodi', 'California', 'Atlantis CA', 'Lodi TX', 'Lodi, Italy', 'PRODUCT OF LODI CA', 'Bottled in Lodi CA', 'Lodi CA / New Zealand', 'MADE IN USA', 'Some arbitrary prose'])('does not guess domesticity or a foreign conflict for %s', text => {
    const { application, evidence } = pair(); evidence.origin = readable(text);
    expect(complete(application, evidence).fields.origin.status).toBe('needs-review');
  });
  it.each(['New Zealand', 'PRODUCT OF NEW ZEALAND', ' PRODUCT\nOF  NEW ZEALAND ', 'PRODUCT OF FRANCE'])('retains definite domestic contradiction %s', text => {
    const { application, evidence } = pair(); evidence.origin = readable(text);
    expect(complete(application, evidence).fields.origin.status).toBe('mismatch');
  });
  it.each(['uncertain', 'unreadable', 'missing'] as const)('keeps domestic %s evidence appropriately fail-closed', status => {
    const { application, evidence } = pair();
    evidence.origin = { ...readable('Lodi CA'), status, text: status === 'missing' ? null : 'Lodi CA' };
    expect(complete(application, evidence).fields.origin.status).toBe(status === 'missing' ? 'not-applicable' : 'needs-review');
  });
  it('leaves imported country matching and missing country requirements unchanged', () => {
    const { application, evidence } = pair(); application.imported = true; application.origin = { kind: 'imported', country: 'New Zealand' };
    for (const [text, status] of [['PRODUCT OF NEW ZEALAND', 'match'], ['PRODUCT OF AUSTRALIA', 'mismatch'], ['Lodi CA', 'mismatch']] as const) {
      evidence.origin = readable(text);
      expect(complete(application, evidence).fields.origin.status).toBe(status);
    }
    evidence.origin = { status: 'missing', text: null, reason: 'Not located in synthetic evidence.' };
    expect(complete(application, evidence).fields.origin.status).toBe('needs-review');
  });
});

describe('exact warning diagnostics without guessing what Alex’s photo contains', () => {
  it('normalizes layout only and preserves verbatim evidence/reference and physical uncertainty', () => {
    const result = warning(WARNING_REFERENCE.body.replaceAll(' ', '\n  '), ' GOVERNMENT\tWARNING: ');
    expect(result.fields.warning.status).toBe('match');
    expect(result.fields.warning.expected).toBe(`${WARNING_REFERENCE.heading}\n${WARNING_REFERENCE.body}`);
    expect(result.fields.warning.observed.body.text).toContain('\n  ');
    expect(result.fields.warning.reasons.join(' ')).toMatch(/body wording:.*matches/i);
    expect(result.physicalPrintSize.status).toBe('unverified');
    expect(result.fields.warning.reasons.join(' ')).toMatch(/physical print size: unverified/i);
  });
  it('does not call matching wording a mismatch when boldness is unknown', () => {
    const field = warning(undefined, undefined, null, null).fields.warning;
    expect(field.status).toBe('needs-review');
    expect(field.reasons.join(' ')).toMatch(/body wording:.*matches/i);
    expect(field.reasons.join(' ')).toMatch(/heading boldness: unknown/i);
    expect(field.reasons.join(' ')).toMatch(/body boldness: unknown/i);
    expect(field.reasons.join(' ')).not.toMatch(/wording: mismatch/i);
  });
  it('reports exact missing words and their reference position', () => {
    const field = warning(WARNING_REFERENCE.body.replace('not drink', 'drink')).fields.warning;
    expect(field.status).toBe('mismatch');
    expect(field.reasons.join(' ')).toMatch(/body wording: mismatch/i);
    expect(field.reasons.join(' ')).toMatch(/missing from observed: "not".*reference token 9/i);
  });
  it('reports extra text and separate nonadjacent missing spans, not an imagined image defect', () => {
    const field = warning(WARNING_REFERENCE.body.replace('should not', 'must').replace('health problems.', 'problems.')).fields.warning;
    const reasons = field.reasons.join(' ');
    expect(field.status).toBe('mismatch');
    expect(reasons).toContain('Missing from observed: "should not"');
    expect(reasons).toContain('Unexpected in observed: "must"');
    expect(reasons).toContain('Missing from observed: "health"');
    expect(reasons).toMatch(/verify transcription against.*image/i);
  });
  it.each([
    ['Government Warning:', 'heading capitalization'],
    ['GOVERNMENT WARNING', 'heading punctuation'],
    ['HEALTH WARNING:', 'heading wording'],
  ])('classifies %s distinctly from body wording', (heading, label) => {
    const field = warning(undefined, heading).fields.warning;
    expect(field.status).toBe('mismatch');
    expect(field.reasons.join(' ')).toContain(`${label}: mismatch`);
    expect(field.reasons.join(' ')).toMatch(/body wording:.*matches/i);
    expect(field.reasons.join(' ')).toContain('Reference: "GOVERNMENT WARNING:"');
    expect(field.reasons.join(' ')).toContain(`Observed: ${JSON.stringify(heading)}`);
  });
  it.each([
    WARNING_REFERENCE.body.replace('According', 'according'),
    WARNING_REFERENCE.body.replace('General,', 'General'),
    WARNING_REFERENCE.body.replace('(1)', '①'),
    WARNING_REFERENCE.body.replace('health', 'heаlth'), // Cyrillic a, not layout whitespace.
    WARNING_REFERENCE.body.replace('beverages', 'bever-\nages'),
  ])('does not silently waive case, punctuation, Unicode or hyphenation differences', body => {
    expect(warning(body).fields.warning.status).toBe('mismatch');
  });
  it.each([[false, false, 'heading boldness'], [true, true, 'body boldness']] as const)('identifies the actual boldness defect (%s, %s)', (headingBold, bodyBold, label) => {
    const field = warning(undefined, undefined, headingBold, bodyBold).fields.warning;
    expect(field.status).toBe('mismatch');
    expect(field.reasons.join(' ')).toContain(`${label}: mismatch`);
    expect(field.reasons.join(' ')).toMatch(/body wording:.*matches/i);
  });
  it('known wording/format defects dominate independent unknown evidence', () => {
    expect(warning(WARNING_REFERENCE.body.replace('not ', ''), undefined, null).fields.warning.status).toBe('mismatch');
    const { application, evidence } = pair();
    evidence.warning.body = { status: 'missing', text: null, reason: 'Not found.' };
    evidence.warning.headingBold = false;
    expect(complete(application, evidence).fields.warning.status).toBe('mismatch');
  });
  it.each(['uncertain', 'unreadable', 'missing'] as const)('does not invent a text diff from %s warning evidence', status => {
    const { application, evidence } = pair();
    evidence.warning.body = { ...evidence.warning.body, status, text: status === 'missing' ? null : 'not drink' };
    const field = complete(application, evidence).fields.warning;
    expect(field.status).toBe('needs-review');
    expect(field.reasons.join(' ')).toContain(`body wording: ${status}`);
    expect(field.reasons.join(' ')).not.toContain('Missing from observed:');
  });
});

describe('revision boundary, purity and unaffected policies', () => {
  it('retains seven fields, family and field shape, changing only the intended decisions', () => {
    const { application, evidence } = pair();
    evidence.classType = readable('Cabernet Sauvignon'); evidence.origin = readable('Lodi CA');
    const before = structuredClone({ application, evidence });
    const baseline = compareApplication(application, evidence);
    const result = complete(application, evidence);
    expect(RULES_REVISION_V3).toBe(3);
    expect(result).toMatchObject({ rulesRevision: 3, rulesVersion: 'prototype-seven-fields-v1', applicationId: application.applicationId, applicationVersion: '1' });
    expect(Object.keys(result.fields)).toEqual([...FIELD_KEYS]);
    if (baseline.processing !== 'complete') throw Error('baseline failed');
    for (const key of ['brand', 'abv', 'netContents', 'producer'] as const) expect(result.fields[key]).toEqual(baseline.fields[key]);
    expect(result.physicalPrintSize).toEqual(baseline.physicalPrintSize);
    expect(baseline.fields.classType.status).toBe('mismatch');
    expect(baseline.fields.origin.status).toBe('needs-review');
    expect(baseline.rulesRevision).toBe(2);
    for (const key of FIELD_KEYS) {
      expect(result.fields[key].expected).toEqual(baseline.fields[key].expected);
      expect(result.fields[key].observed).toEqual(baseline.fields[key].observed);
    }
    expect({ application, evidence }).toEqual(before);
    expect(complete(application, evidence)).toEqual(result);
    evidence.classType.text = 'mutated';
    expect(result.fields.classType.observed.text).toBe('Cabernet Sauvignon');
  });
  it.each(['distilled-spirits', 'malt-beverage'] as const)('does not change unrelated commodity %s decisions', commodity => {
    const { application, evidence } = pair(); application.commodity = commodity;
    evidence.classType = readable('Cabernet Sauvignon');
    for (const text of ['Lodi CA', 'PRODUCT OF NEW ZEALAND', 'US', 'Unknown prose']) {
      evidence.origin = readable(text);
      const baseline = compareApplication(application, evidence);
      const current = complete(application, evidence);
      if (baseline.processing !== 'complete') throw Error('baseline failed');
      for (const key of FIELD_KEYS) {
        if (key !== 'warning') expect(current.fields[key]).toEqual(baseline.fields[key]);
        else expect(current.fields[key].status).toEqual(baseline.fields[key].status);
      }
    }
  });
  it.each(['wine', 'distilled-spirits', 'malt-beverage'] as const)('preserves revision-2 warning statuses across wording/readability/formatting controls for %s', commodity => {
    const { application, evidence } = pair(); application.commodity = commodity;
    const headings: Observation[] = [readable(WARNING_REFERENCE.heading), readable('Government Warning:'), { status: 'missing', text: null, reason: 'Missing heading.' }];
    const bodies: Observation[] = [readable(WARNING_REFERENCE.body), readable(WARNING_REFERENCE.body.replace('not ', '')), { status: 'uncertain', text: WARNING_REFERENCE.body, reason: 'Uncertain transcription.' }];
    for (const heading of headings) for (const body of bodies) {
      for (const headingBold of [true, false, null]) for (const bodyBold of [true, false, null]) {
        evidence.warning = { heading, body, headingBold, bodyBold };
        const baseline = compareApplication(application, evidence);
        if (baseline.processing !== 'complete') throw Error('baseline failed');
        expect(complete(application, evidence).fields.warning.status).toBe(baseline.fields.warning.status);
      }
    }
  });
  it('handles start/end edits, repeated words and maximum-length readable text deterministically', () => {
    for (const body of [`EXTRA ${WARNING_REFERENCE.body}`, `${WARNING_REFERENCE.body} EXTRA`, WARNING_REFERENCE.body.replace('should not', 'should should not'), 'x '.repeat(1000)]) {
      const result = warning(body);
      expect(result.fields.warning.status).toBe('mismatch');
      expect(result.fields.warning.reasons.join(' ')).toContain('Unexpected in observed:');
      expect(warning(body)).toEqual(result);
    }
    const removedLast = warning(WARNING_REFERENCE.body.replace('health problems.', '')).fields.warning;
    expect(removedLast.reasons.join(' ')).toContain('Missing from observed: "health problems."');
  });
  it('invalid application and extraction still fail without fields', () => {
    const { application, evidence } = pair();
    for (const invalid of [{ ...application, commodity: 'unknown' }, { ...application, imported: true }, { ...application, origin: { kind: 'domestic', country: 'Atlantis' } }]) {
      expect(compareApplicationV3(invalid as Application, evidence)).toEqual(compareApplication(invalid, evidence));
    }
    const invalid = { ...evidence, classType: { ...evidence.classType, text: null } };
    expect(compareApplicationV3(application, invalid)).toEqual(compareApplication(application, invalid));
    expect(compareApplicationV3(application, invalid).processing).toBe('failed');
  });
});
