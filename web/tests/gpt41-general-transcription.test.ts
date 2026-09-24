import { expect, test } from 'vitest';
import { GPT41_PHOTO_PROMPT } from '../lib/extraction/gpt41-prompt';
import { makeGpt41Request } from '../lib/extraction/gpt41-pricing';
import { parseGpt41Wire, type gpt41WireSchema } from '../lib/extraction/gpt41-wire';
import type { z } from 'zod';

// Synthetic wire/selection-contract tests. These do not prove model recognition.
const wire = (): z.infer<typeof gpt41WireSchema> => ({
  brand: 'EXAMPLE', classType: null, abv: null, netContents: null, origin: null,
  producer: { name: null, address: null, roleEvidence: null, otherEntityText: null },
  warning: { heading: null, body: null, headingBold: null, bodyBold: null }, uncertainties: [],
});

test('generic selection scans peripheral category and current-origin claims without assembling answers', () => {
  for (const clause of [
    'Full-label selection clarification r3',
    'vertical or curved lettering, seals, badges and small lower bands',
    'Do not stop at a prominent color, range or style word',
    'Select one complete visible product designation containing the category word',
    'Do not concatenate separate display lines, translate another designation, or assemble modifiers from narrative',
    'category-of-place wording on a badge',
    'Historical founding locations, cocktail names and serving recipes are not current origin claims',
    'Preserve the exact printed unit spelling',
  ]) expect(GPT41_PHOTO_PROMPT).toContain(clause);
  for (const answer of ['BACARD', 'PUERTO RICO', 'CARTA ORO', 'Cuervo', 'Rojeña', '00962', 'No. 73']) {
    expect(GPT41_PHOTO_PROMPT).not.toContain(answer);
  }
});

test('request has only generic instructions and the exact single photo; high detail and routing retained', () => {
  const bytes = Buffer.from('independent-photo-bytes');
  const request = makeGpt41Request(bytes, 'image/jpeg');
  expect(request.messages).toEqual([
    { role: 'system', content: GPT41_PHOTO_PROMPT },
    { role: 'user', content: [
      { type: 'text', text: 'Read this one photograph independently.' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'high' } },
    ] },
  ]);
  expect(request.provider.only).toEqual(['openai']);
  expect(request.provider.allow_fallbacks).toBe(false);
  expect(request.response_format.json_schema.strict).toBe(true);
});

test.each(['GOLD RUM', 'RON SUPERIOR CARTA ORO', 'RUM'])('wire preserves one designation exactly: %s', text => {
  const input = wire(); input.classType = text; input.origin = 'RUM OF PUERTO RICO'; input.netContents = '1.75 LTR';
  const before = structuredClone(input), result = parseGpt41Wire(input);
  expect(result.classType).toMatchObject({ status: 'readable', text });
  expect(result.origin.text).toBe(input.origin);
  expect(result.netContents.text).toBe('1.75 LTR');
  expect(input).toEqual(before);
});

test.each(['classType', 'origin', 'netContents'] as const)('ambiguous %s stays uncertain; no host completion or normalization', field => {
  const input = wire(); input[field] = field === 'classType' ? 'GOLD' : field === 'origin' ? 'OF ...' : '1.75 LT';
  input.uncertainties = [{ field, reason: 'Remaining lettering obscured; cannot establish the complete statement.' }];
  const result = parseGpt41Wire(input);
  expect(result[field]).toMatchObject({ status: 'uncertain', text: input[field] });
  input[field] = null;
  expect(parseGpt41Wire(input)[field]).toMatchObject({ status: 'unreadable', text: null });
});

test('a lone style is not retrospectively repaired; absent origin and warning stay absent', () => {
  const input = wire(); input.classType = 'GOLD';
  const result = parseGpt41Wire(input);
  expect(result.classType.text).toBe('GOLD'); // Parser cannot establish pixels; no bottle lookup.
  expect(result.origin).toMatchObject({ status: 'missing', text: null });
  expect(result.warning.body).toMatchObject({ status: 'missing', text: null });
});

test('warning fragments remain exact and uncertain; importer cannot fill missing manufacturer', () => {
  const input = wire(); input.warning.heading = 'GOVERNMENT WARNING:';
  input.warning.body = '(1) ACCORDING TO THE SURGEON GENERAL,';
  input.producer.otherEntityText = 'IMPORTED BY Separate Imports, Port City';
  input.uncertainties = [{ field: 'warning', reason: 'Remaining clauses obscured.' }];
  const result = parseGpt41Wire(input);
  expect(result.warning.body).toMatchObject({ status: 'uncertain', text: input.warning.body });
  expect(result.warning.bodyBold).toBeNull();
  expect(result.producer.name.text).toBeNull();
  expect(result.producer.name.reason).toContain(input.producer.otherEntityText);
});
