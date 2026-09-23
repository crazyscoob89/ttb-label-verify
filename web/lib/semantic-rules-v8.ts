import { applicationSchema, type Application } from './contracts';
import type { ExtractionEvidence } from './extraction/schema';
import { compareApplicationV5 } from './semantic-rules';
import { abvNotation, brandKey, domesticOrigin, equalVolume, incompleteClassFragment, originKey, partialClassCompatibility, rumType } from './semantic-text-v8';

/** New group-only semantics. Frozen revisions remain separate. The US context
 * projection permits reusing unchanged warning/producer/wine/ABV rules, NOT
 * rewriting PR evidence or declarations. Origin is always decided below using
 * the actual application and observation; expected/observed remain verbatim. */
export function compareEvidenceV8(application: Application, evidence: ExtractionEvidence) {
  const app = applicationSchema.parse(application);
  const projected = structuredClone(evidence);
  if (projected.abv.text !== null) projected.abv.text = abvNotation(projected.abv.text);
  const baseline = compareApplicationV5(!app.imported ? { ...app, origin: { kind: 'domestic', country: 'United States' } } : app, projected);
  if (baseline.processing !== 'complete') throw Error('Invalid group comparison');
  const fields = { ...baseline.fields, abv: { ...baseline.fields.abv, observed: evidence.abv }, origin: { ...baseline.fields.origin, expected: app.origin.country } };
  if (evidence.brand.status === 'readable' && evidence.brand.text !== null) {
    const equal = brandKey(app.brand) === brandKey(evidence.brand.text);
    fields.brand = { ...fields.brand, status: equal ? 'match' : 'mismatch', reasons: [`Brand: readable text ${equal ? 'agrees' : 'differs'} under case, layout and Latin diacritic equivalence; punctuation, words and numbers retained.`] };
  }
  if (evidence.netContents.status === 'readable' && evidence.netContents.text !== null) {
    const equal = equalVolume(app.netContents, evidence.netContents.text);
    fields.netContents = { ...fields.netContents, status: equal === null ? 'needs-review' : equal ? 'match' : 'mismatch', reasons: [equal === null
      ? 'Net contents: requires one positive decimal mL, L, LTR, liter or litre amount on each side; unsupported units or ambiguity require review.'
      : `Net contents: ${equal ? 'equal' : 'unequal'} exact metric volume (1 L = 1000 mL); standards of fill not evaluated.`] };
  }
  if (app.commodity === 'distilled-spirits' && evidence.classType.status === 'readable' && evidence.classType.text !== null) {
    const declared = rumType(app.classType), actual = rumType(evidence.classType.text);
    if (incompleteClassFragment(evidence.classType.text)) {
      const conflict = partialClassCompatibility(evidence.classType.text, app.classType) === false;
      fields.classType = { ...fields.classType, status: conflict ? 'mismatch' : 'needs-review', reasons: [conflict
        ? 'Class/type: readable style fragment conflicts with the declared subtype; verify the source designation.'
        : 'Class/type: incomplete or unsupported fragment does not establish a commodity/category. A complete compatible source photo is required; no missing class words inferred.'] };
    } else if (declared !== null && actual !== null) {
      const status = declared === actual || declared === '' ? 'match' : actual === '' ? 'needs-review' : 'mismatch';
      fields.classType = { ...fields.classType, status, reasons: [status === 'match'
        ? 'Class/type: explicit rum designation is compatible with the declared rum class/subtype under bounded English/Spanish wording; raw designation retained, no legal classification certified.'
        : status === 'needs-review' ? 'Class/type: generic rum observation does not verify the declared subtype.' : 'Class/type: explicit rum subtypes differ; inspect the source designation.'] };
    }
  }
  if (evidence.origin.status === 'readable' && evidence.origin.text !== null) {
    const actual = originKey(evidence.origin.text), declared = originKey(app.origin.country);
    const status = actual === null ? 'needs-review'
      : app.imported ? domesticOrigin(actual) ? 'mismatch' : declared === null ? 'needs-review' : actual === declared ? 'match' : 'mismatch'
      : !domesticOrigin(actual) ? 'mismatch' : declared === 'puerto rico' && actual === 'united states' ? 'needs-review' : 'not-applicable';
    fields.origin = { ...fields.origin, status, reasons: [status === 'not-applicable'
      ? 'Origin: recognized domestic U.S./Puerto Rico context; imported-country comparison not applicable. Specific territory and raw source claim retained.'
      : status === 'match' ? 'Origin: whole explicit origin claim agrees with the declared country; raw text retained.'
      : status === 'mismatch' ? 'Origin: readable country/territory claim conflicts with the declared origin or import context.'
      : 'Origin: unsupported/ambiguous claim or generic US claim does not verify the specific declared territory; inspect source and context. No history, recipe or shipping origin inferred.'] };
  }
  return { ...baseline, fields };
}
