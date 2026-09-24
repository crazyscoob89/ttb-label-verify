import type { Application } from './contracts';
import type { ExtractionEvidence } from './extraction/schema';
import { compareEvidenceV8 } from './semantic-rules-v8';
import { incompleteClassFragment } from './semantic-text-v8';
import { partialClassCompatibility, rumType } from './semantic-text-v9';

/** Only class semantics change. v8's frozen implementation supplies every other
 * field unchanged and remains the exclusive historical v8 replay comparator. */
export function compareEvidenceV9(application: Application, evidence: ExtractionEvidence) {
  const base = compareEvidenceV8(application, evidence);
  if (application.commodity !== 'distilled-spirits' || evidence.classType.status !== 'readable' || evidence.classType.text === null) return base;
  const declared = rumType(application.classType), actual = rumType(evidence.classType.text);
  let field = base.fields.classType;
  if (incompleteClassFragment(evidence.classType.text)) {
    const conflict = partialClassCompatibility(evidence.classType.text, application.classType) === false;
    field = { ...field, status: conflict ? 'mismatch' : 'needs-review', reasons: [conflict
      ? 'Class/type: readable style fragment conflicts with the declared subtype; verify the source designation.'
      : 'Class/type: incomplete or unsupported fragment does not establish a commodity/category. A complete compatible source photo is required; no missing class words inferred.'] };
  } else if (declared !== null && actual !== null) {
    const status = declared === actual || declared === '' ? 'match' : actual === '' ? 'needs-review' : 'mismatch';
    field = { ...field, status, reasons: [status === 'match'
      ? 'Class/type: explicit rum category and all supported style/designator words agree under bounded English/Spanish equivalence, including redundant synonyms; raw designation retained, no legal classification certified.'
      : status === 'needs-review' ? 'Class/type: generic rum observation does not verify the declared subtype.' : 'Class/type: explicit rum subtypes differ; inspect the source designation.'] };
  }
  return { ...base, fields: { ...base.fields, classType: field } };
}
