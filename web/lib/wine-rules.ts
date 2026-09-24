import type { Application } from './contracts';
import type { ExtractionEvidence, Observation } from './extraction/schema';
import { compareApplication, WARNING_REFERENCE, type ComparisonResult } from './rules';

// Additive policy only: frozen revisions 1/2 must never import this module.
// Scope and deliberate exclusions: docs/WINE-POLICY-V3.md.
export const RULES_REVISION_V3 = 3 as const;
export type ComparisonResultV3 = Exclude<ComparisonResult, { processing: 'complete' }>
  | (Omit<Extract<ComparisonResult, { processing: 'complete' }>, 'rulesRevision'> & { rulesRevision: typeof RULES_REVISION_V3 });

const layout = (text: string) => text.trim().replace(/\s+/gu, ' ');
const normalize = (text: string) => layout(text.normalize('NFC')).toLowerCase();
// Whole values only, not a grape registry, synonym expansion or legal standard.
const WINE_VARIETALS = new Set([
  'cabernet sauvignon', 'chardonnay', 'merlot', 'pinot noir',
  'sauvignon blanc', 'syrah', 'riesling', 'zinfandel',
]);
// Explicit known city/state pairs, never any arbitrary word followed by "CA".
// No prefix/address stripping, substring recognition, or state-only inference.
const US_PRODUCER_LOCATION = /^(?:lodi|napa|sonoma)(?:,? )(?:ca|california)$/u;

/** Exact whitespace-delimited token diff. Case and attached punctuation remain
 * significant. LCS is diagnostic only, NEVER a fuzzy matching policy. Its size
 * is bounded by the fixed warning reference and validated observation length. */
function tokenDiff(reference: string, observed: string): string[] {
  const expected = reference.split(' ');
  const actual = observed.split(' ');
  const lcs = Array.from({ length: expected.length + 1 }, () => new Uint16Array(actual.length + 1));
  for (let i = expected.length - 1; i >= 0; i--) {
    for (let j = actual.length - 1; j >= 0; j--) {
      lcs[i][j] = expected[i] === actual[j] ? 1 + lcs[i + 1][j + 1] : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const reasons: string[] = [];
  let i = 0;
  let j = 0;
  while (i < expected.length || j < actual.length) {
    if (i < expected.length && j < actual.length && expected[i] === actual[j]) {
      i++; j++; continue;
    }
    const startI = i;
    const startJ = j;
    while (i < expected.length || j < actual.length) {
      if (i < expected.length && j < actual.length && expected[i] === actual[j]) break;
      // Stable tie-break: report reference removals before observed additions.
      if (i < expected.length && (j === actual.length || lcs[i + 1][j] >= lcs[i][j + 1])) i++;
      else j++;
    }
    if (i > startI) reasons.push(`Missing from observed: ${JSON.stringify(expected.slice(startI, i).join(' '))} (reference token ${startI + 1}${i > startI + 1 ? `–${i}` : ''}).`);
    if (j > startJ) reasons.push(`Unexpected in observed: ${JSON.stringify(actual.slice(startJ, j).join(' '))} (observed token ${startJ + 1}${j > startJ + 1 ? `–${j}` : ''}).`);
  }
  return reasons;
}

function textDiagnostics(reference: string, observation: Observation, part: 'heading' | 'body'): string[] {
  const label = `Warning ${part} wording`;
  if (observation.status !== 'readable' || observation.text === null) {
    return [`${label}: ${observation.status} observation; human review required. No readable text difference established.`];
  }
  const expected = layout(reference);
  const actual = layout(observation.text);
  if (expected === actual) return [`${label}: matches exact reference (layout whitespace only); case and punctuation preserved.`];

  // Classification only; no relaxed equality is used to accept the text.
  const withoutPunctuation = (text: string) => text.replace(/\p{P}/gu, '');
  const difference = expected.toLowerCase() === actual.toLowerCase() ? 'capitalization'
    : withoutPunctuation(expected) === withoutPunctuation(actual) ? 'punctuation'
    : withoutPunctuation(expected).toLowerCase() === withoutPunctuation(actual).toLowerCase() ? 'capitalization and punctuation'
    : 'wording';
  const mismatchLabel = part === 'heading' ? `Warning heading ${difference}` : label;
  return [
    `${mismatchLabel}: mismatch${part === 'body' && difference !== 'wording' ? ` (${difference})` : ''}. Reference: ${JSON.stringify(reference)}. Observed: ${JSON.stringify(observation.text)}.`,
    `Warning ${part} exact token diff (layout whitespace only; case and punctuation retained): ${tokenDiff(expected, actual).join(' ')}`,
    `Warning ${part}: verify transcription against the source image; if confirmed, correct the label to the reference. This compares supplied extraction, not independently verified image text.`,
  ];
}
function boldnessDiagnostics(value: boolean | null, expected: boolean, part: 'heading' | 'body'): string {
  const label = `Warning ${part} boldness`;
  const requirement = expected ? 'bold' : 'nonbold';
  if (value === null) return `${label}: unknown; expected ${requirement}. Inspect the source image or physical label; human review required, not a wording mismatch.`;
  return value === expected
    ? `${label}: matches; observed ${requirement}.`
    : `${label}: mismatch; expected ${requirement}, observed ${value ? 'bold' : 'nonbold'}. Verify formatting against the source image and correct if confirmed; not a wording mismatch.`;
}
function warningDiagnostics(observed: ExtractionEvidence['warning']): string[] {
  return [
    ...textDiagnostics(WARNING_REFERENCE.heading, observed.heading, 'heading'),
    ...textDiagnostics(WARNING_REFERENCE.body, observed.body, 'body'),
    boldnessDiagnostics(observed.headingBold, true, 'heading'),
    boldnessDiagnostics(observed.bodyBold, false, 'body'),
    'Physical print size: unverified; cannot be measured or certified from extraction/photo evidence. Assess the physical label separately; this is not a wording mismatch or a legal compliance guarantee.',
  ];
}

/** Pure revision-2 comparison plus three deliberate field overrides. Runtime
 * validation, failed-result shape and detached evidence come from revision 2.
 * No verdict, saved-history dispatch, provider call or image verification. */
export function compareApplicationV3(application: Application, evidence: ExtractionEvidence): ComparisonResultV3 {
  const baseline = compareApplication(application, evidence);
  if (baseline.processing === 'failed') return baseline;
  const fields = { ...baseline.fields };
  if (application.commodity === 'wine') {
    const observedClass = fields.classType.observed;
    if (normalize(fields.classType.expected) === 'wine' && observedClass.status === 'readable'
      && observedClass.text !== null && WINE_VARIETALS.has(normalize(observedClass.text))) {
      fields.classType = {
        ...fields.classType, status: 'match',
        reasons: ['Class/type: broad-class compatible; a recognized wine varietal is compatible with the generic Wine declaration for commodity wine. This is not evidence of varietal percentage or subtype regulatory requirements; no complete classification or legal compliance inferred.'],
      };
    }
    const observedOrigin = fields.origin.observed;
    if (!application.imported && observedOrigin.status === 'readable' && observedOrigin.text !== null
      && US_PRODUCER_LOCATION.test(normalize(observedOrigin.text))) {
      fields.origin = {
        ...fields.origin, status: 'not-applicable',
        reasons: ['Origin: recognized US city/state text is a geographic producer location, not foreign-country evidence. In the declared domestic wine context a domestic country statement is not required by this comparison policy; imported-country comparison is not applicable. This does not establish grape origin or verify the producer address.'],
      };
    }
  }
  // Preserve revision-2 warning status EXACTLY, including mismatch precedence.
  // Only explanations change; text/format equality and legal scope do not.
  fields.warning = { ...fields.warning, reasons: warningDiagnostics(fields.warning.observed) };
  return { ...baseline, rulesRevision: RULES_REVISION_V3, fields };
}
