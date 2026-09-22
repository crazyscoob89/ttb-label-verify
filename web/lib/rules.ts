import { applicationSchema, type Application } from './contracts';
import { extractionEvidenceSchema, type ExtractionEvidence, type Observation } from './extraction/schema';

// Policy provenance, grammar and deliberate exclusions: docs/RULES-POLICY.md.
export const RULES_VERSION = 'prototype-seven-fields-v1' as const;
// Comparison revision is separate from the deployed extraction/spend family.
export const RULES_REVISION = 2 as const;
export const FIELD_KEYS = Object.freeze(['brand', 'classType', 'abv', 'netContents', 'producer', 'origin', 'warning'] as const);
export type FieldKey = typeof FIELD_KEYS[number];
export type FieldStatus = 'match' | 'mismatch' | 'needs-review' | 'not-applicable';
// Verbatim reference from fixtures/manifest.json statutory_warning (27 CFR 16.21).
// Runtime does not depend on the archived fixtures or accept a replacement warning.
export const WARNING_REFERENCE = Object.freeze({
  heading: 'GOVERNMENT WARNING:',
  body: '(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
});
export type FieldResult<K extends FieldKey> = {
  status: FieldStatus;
  expected: string;
  observed: ExtractionEvidence[K];
  reasons: string[];
};
export type ComparisonFields = { [K in FieldKey]: FieldResult<K> };
export type ComparisonResult = {
  processing: 'complete';
  applicationId: string;
  applicationVersion: string;
  rulesVersion: typeof RULES_VERSION;
  // Absent only on historical, pre-repair snapshots; never default it on reads.
  rulesRevision?: typeof RULES_REVISION;
  fields: ComparisonFields;
  physicalPrintSize: { status: 'unverified'; reason: string };
} | {
  processing: 'failed';
  code: 'invalid-application' | 'invalid-extraction';
  reason: string;
};

type Decision = { status: FieldStatus; reasons: string[] };
const decision = (status: FieldStatus, reason: string): Decision => ({ status, reasons: [reason] });
// NFC preserves accents; no punctuation deletion, transliteration, number removal,
// substring match, synonym expansion, NFKC compatibility folding or edit distance.
const whitespace = (value: string) => value.trim().replace(/\s+/gu, ' ');
const normalize = (value: string) => whitespace(value.normalize('NFC')).toLowerCase();
function unavailable(observation: Observation, label: string): Decision | null {
  return observation.status === 'readable' ? null : decision('needs-review', `${label}: ${observation.status} observation; human review required.`);
}
function textDecision(expected: string, observed: Observation, label: string, exact = false): Decision {
  const uncertain = unavailable(observed, label);
  if (uncertain) return uncertain;
  // Schema guarantees non-null/nonblank readable text; explicit guard stays fail-closed.
  if (observed.text === null) return decision('needs-review', `${label}: no observed text.`);
  const equal = exact ? whitespace(expected) === whitespace(observed.text) : normalize(expected) === normalize(observed.text);
  return decision(equal ? 'match' : 'mismatch', `${label}: readable text ${equal ? 'agrees' : 'differs'} under ${exact ? 'exact wording (layout whitespace only)' : 'case/whitespace/NFC equivalence'}.`);
}
function combine(parts: Decision[]): Decision {
  // A known defect is not concealed by independent missing/uncertain evidence.
  const status = parts.some(part => part.status === 'mismatch') ? 'mismatch'
    : parts.some(part => part.status === 'needs-review') ? 'needs-review' : 'match';
  return { status, reasons: parts.flatMap(part => part.reasons) };
}

type Decimal = { numerator: bigint; denominator: bigint };
function decimal(text: string): Decimal | null {
  // Engineering bound, not a legal precision limit. No binary floating rounding.
  if (!/^\d{1,32}(?:\.\d{1,32})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}
function applicationDecimal(value: number): Decimal {
  // Application is already the existing contract's finite numeric output. Expand
  // scientific notation rather than round tiny valid declared numbers to zero.
  const [mantissa, exponentText = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const exponent = Number(exponentText) - fraction.length;
  const numerator = BigInt(whole + fraction);
  return exponent >= 0
    ? { numerator: numerator * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator, denominator: 10n ** BigInt(-exponent) };
}
const equalDecimal = (a: Decimal, b: Decimal) => a.numerator * b.denominator === b.numerator * a.denominator;
function abvDecision(application: Application, observed: Observation): Decision {
  const uncertain = unavailable(observed, 'ABV');
  if (uncertain) return uncertain;
  const match = observed.text?.trim().match(/^(\d+(?:\.\d+)?)(?:\s*%(?:\s*(?:ABV|alc\/vol|alcohol by volume|BY\s+VOL\.?))?)?$/i);
  const value = match ? decimal(match[1]) : null;
  if (!value) return decision('needs-review', 'ABV: unsupported or ambiguous notation; no proof conversion or tolerance inferred.');
  const equal = equalDecimal(applicationDecimal(application.abv), value);
  return decision(equal ? 'match' : 'mismatch', `ABV: ${equal ? 'equal' : 'unequal'} declared/observed decimal percentage; no regulatory tolerance applied.`);
}
function volume(text: string): Decimal | null {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(mL|L)$/i);
  const value = match ? decimal(match[1]) : null;
  if (!value || value.numerator === 0n || !match) return null;
  return { ...value, numerator: value.numerator * (match[2].toLowerCase() === 'l' ? 1000n : 1n) };
}
function volumeDecision(expected: string, observed: Observation): Decision {
  const uncertain = unavailable(observed, 'Net contents');
  if (uncertain) return uncertain;
  const declared = volume(expected);
  const extracted = observed.text === null ? null : volume(observed.text);
  if (!declared || !extracted) return decision('needs-review', 'Net contents: requires a single positive decimal mL or L amount on both sides; unsupported units or ambiguity require review.');
  const equal = equalDecimal(declared, extracted);
  return decision(equal ? 'match' : 'mismatch', `Net contents: ${equal ? 'equal' : 'unequal'} exact metric volume (1 L = 1000 mL); standards of fill not evaluated.`);
}
// Deliberately bounded domestic-conflict recognition, not a geography registry.
// Exact normalized whole names only; all other non-US values require review.
const DOMESTIC_FOREIGN_COUNTRIES = new Set([
  'australia', 'canada', 'france', 'germany', 'italy', 'japan', 'mexico',
  'new zealand', 'portugal', 'south africa', 'spain', 'united kingdom',
]);
function originDecision(application: Application, observed: Observation): Decision {
  // Explicit table leaves no implicit commodity/default applicability fallback.
  const policy: Record<Application['commodity'], boolean> = {
    wine: application.imported,
    'distilled-spirits': application.imported,
    'malt-beverage': application.imported,
  };
  const domestic = !policy[application.commodity];
  const notApplicable = () => decision('not-applicable', `Origin: explicit domestic ${application.commodity} context; imported-country comparison not applicable in this prototype.`);
  // Domestic goods do not acquire a foreign-origin statement requirement. But
  // present evidence must not disappear behind the old unconditional N/A.
  if (domestic && observed.status === 'missing') return notApplicable();
  const uncertain = unavailable(observed, 'Origin');
  if (uncertain) return uncertain;
  const country = normalize(observed.text ?? '').replace(/^product of /u, '');
  // One whole country-slot value, not substring search or arbitrary prose stripping.
  // This is a lexical bound, NOT a geography lookup or legal country-name registry.
  if (!/^[\p{L}\p{M}]+(?:[ .’'\-][\p{L}\p{M}]+)*\.?$/u.test(country) || /\b(?:product|or)\b/u.test(country)) {
    return decision('needs-review', 'Origin: unsupported or ambiguous country statement; human review required.');
  }
  if (domestic) {
    // Same explicit US designations as intake; no foreign alias/geography inference.
    if (['united states', 'united states of america', 'us', 'usa'].includes(country.replaceAll('.', ''))) return notApplicable();
    // A letters-and-spaces grammar alone cannot establish a foreign country.
    if (!DOMESTIC_FOREIGN_COUNTRIES.has(country)) {
      return decision('needs-review', 'Origin: country statement not recognized by the bounded domestic-conflict policy; human review required.');
    }
    return decision('mismatch', `Origin: readable country statement conflicts with declared domestic ${application.commodity} origin; verify application/import context. No foreign-origin statement requirement inferred.`);
  }
  const result = textDecision(application.origin.country, { ...observed, text: country }, 'Imported country of origin');
  return { ...result, reasons: [`Origin applies to imported ${application.commodity}.`, ...result.reasons] };
}
function warningDecision(observed: ExtractionEvidence['warning']): Decision {
  const formatting = (value: boolean | null, expected: boolean, label: string) => value === null
    ? decision('needs-review', `${label}: formatting unknown; human review required.`)
    : decision(value === expected ? 'match' : 'mismatch', `${label}: ${value === expected ? 'observed as required' : 'readable formatting defect'}.`);
  return combine([
    textDecision(WARNING_REFERENCE.heading, observed.heading, 'Warning all-caps heading', true),
    textDecision(WARNING_REFERENCE.body, observed.body, 'Warning body wording', true),
    formatting(observed.headingBold, true, 'Warning bold heading'),
    formatting(observed.bodyBold, false, 'Warning nonbold body'),
  ]);
}
function field<K extends FieldKey>(expected: string, observed: ExtractionEvidence[K], result: Decision): FieldResult<K> {
  return { ...result, expected, observed };
}

/** Pure local comparison of one explicit application/evidence pair. No verdict,
 * auth, image binding, provider trust or legal certification is implied. */
export function compareApplication(applicationInput: unknown, extractionInput: unknown): ComparisonResult {
  const parsedApplication = applicationSchema.safeParse(applicationInput);
  if (!parsedApplication.success) return { processing: 'failed', code: 'invalid-application', reason: 'Application does not satisfy the intake contract.' };
  const parsedEvidence = extractionEvidenceSchema.safeParse(extractionInput);
  if (!parsedEvidence.success) return { processing: 'failed', code: 'invalid-extraction', reason: 'Extraction does not satisfy the evidence contract.' };
  const a = parsedApplication.data;
  const e = parsedEvidence.data;
  return {
    processing: 'complete', applicationId: a.applicationId, applicationVersion: a.applicationVersion, rulesVersion: RULES_VERSION, rulesRevision: RULES_REVISION,
    fields: {
      brand: field<'brand'>(a.brand, e.brand, textDecision(a.brand, e.brand, 'Brand')),
      classType: field<'classType'>(a.classType, e.classType, textDecision(a.classType, e.classType, 'Class/type')),
      abv: field<'abv'>(String(a.abv), e.abv, abvDecision(a, e.abv)),
      netContents: field<'netContents'>(a.netContents, e.netContents, volumeDecision(a.netContents, e.netContents)),
      producer: field<'producer'>(`${a.producerName}\n${a.producerAddress}`, e.producer, combine([
        textDecision(a.producerName, e.producer.name, 'Producer name'),
        textDecision(a.producerAddress, e.producer.address, 'Producer address'),
      ])),
      origin: field<'origin'>(a.origin.country, e.origin, originDecision(a, e.origin)),
      warning: field<'warning'>(`${WARNING_REFERENCE.heading}\n${WARNING_REFERENCE.body}`, e.warning, warningDecision(e.warning)),
    },
    physicalPrintSize: { status: 'unverified', reason: 'Physical print size cannot be established from extraction/photo evidence; not measured or certified. This source-backed prototype is not exhaustive TTB legal certification.' },
  };
}
