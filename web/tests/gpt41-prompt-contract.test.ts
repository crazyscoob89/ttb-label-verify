import { expect, test } from 'vitest';
import { GPT41_PHOTO_PROMPT } from '../lib/extraction/gpt41-prompt';
import { parseGpt41Wire, type gpt41WireSchema } from '../lib/extraction/gpt41-wire';
import { compareApplicationV5 } from '../lib/semantic-rules';
import { application } from './fixtures/jose-cuervo';
import type { z } from 'zod';

// Synthetic contract examples, not new OCR captures or a host role classifier.
const name = "O'River & Sons, Ltd.";
const role = `“${name}”, the family's distillery, produces spirits here.`;
const address = 'River Road No. 17, Oakville, Jalisco, 46400 Mexico';
const declared = { ...application, producerName: name, producerAddress: address };
const wire = (): z.infer<typeof gpt41WireSchema> => ({
  brand: null, classType: null, abv: null, netContents: null, origin: null,
  producer: { name, address, roleEvidence: role, otherEntityText: 'IMPORTED BY Separate Imports' },
  warning: { heading: null, body: null, headingBold: null, bodyBold: null }, uncertainties: [],
});
function producerStatus(value: ReturnType<typeof wire>) {
  const result = compareApplicationV5(declared, parseGpt41Wire(value));
  if (result.processing !== 'complete') throw Error('Invalid synthetic fixture');
  return result.fields.producer.status;
}

test('prompt separates enclosing quotes from internal punctuation and requires contiguous named role support', () => {
  for (const text of [
    'shortest complete contiguous visible sentence or clause',
    'do not start the excerpt after the name, return only the name, or use an address block alone',
    'Keep the enclosing quotation marks exactly as printed in producer.roleEvidence',
    'Do not add quotation marks merely to present an excerpt',
    'preserve punctuation within the name',
    'mark producer uncertain',
  ]) expect(GPT41_PHOTO_PROMPT).toContain(text);
  expect(GPT41_PHOTO_PROMPT).not.toContain(name);
  const parsed = parseGpt41Wire(wire());
  expect(parsed.producer.name).toMatchObject({ status: 'readable', text: name });
  expect(parsed.producer.address).toMatchObject({ status: 'readable', text: address });
  expect(parsed.producer.name.reason).toContain(`Role excerpt: ${role}`);
  expect(parsed.producer.name.reason).toContain('Other entity: IMPORTED BY Separate Imports');
  expect(producerStatus(wire())).toBe('match');
});

test.each([null, name, "the family's distillery, produces spirits here."])(
  'unchanged host guard rejects missing-name/null/name-only support: %s', support => {
    const value = wire(); value.producer.roleEvidence = support;
    expect(parseGpt41Wire(value).producer.name.status).toBe('uncertain');
    expect(parseGpt41Wire(value).producer.address.status).toBe('uncertain');
    expect(producerStatus(value)).toBe('needs-review');
  },
);

test.each(['uncertainty', 'fragment', 'different-name', 'outer-quotes', 'lost-internal-punctuation', 'wrong-number'])(
  'clarification cannot bless %s through parser or comparison', fault => {
    const value = wire();
    if (fault === 'uncertainty') value.uncertainties = [{ field: 'producer', reason: 'Role linkage unclear' }];
    if (fault === 'fragment') { value.producer.address = 'River Road'; value.uncertainties = [{ field: 'producer', reason: 'Address incomplete' }]; }
    if (fault === 'different-name') { value.producer.name = 'Other Distillery'; value.producer.roleEvidence = 'Other Distillery manufactures spirits here.'; }
    if (fault === 'outer-quotes') { value.producer.name = `“${name}”`; }
    if (fault === 'lost-internal-punctuation') { value.producer.name = 'ORiver & Sons Ltd'; value.producer.roleEvidence = 'ORiver & Sons Ltd manufactures spirits here.'; }
    if (fault === 'wrong-number') value.producer.address = address.replace('17', '18');
    expect(producerStatus(value)).toBe(fault === 'wrong-number' ? 'mismatch' : 'needs-review');
    const parsed = parseGpt41Wire(value);
    expect(parsed.producer.name.text).toBe(value.producer.name);
    expect(parsed.producer.address.text).toBe(value.producer.address);
  },
);
