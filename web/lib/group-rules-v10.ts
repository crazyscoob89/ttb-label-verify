import type { Application } from './contracts';
import type { PhotoSetEvidence } from './photo-contracts';
import { comparePhotoApplicationV9, type GroupComparisonV9 } from './group-rules-v9';
import { aggregatePhotoEvidence } from './photo-evidence-v5';
import { classCorroboration } from './class-corroboration-v10';

export type GroupComparisonV10 = Omit<GroupComparisonV9,'rulesRevision'> & {rulesRevision:10};
/** Only fresh GPT group class comparison changes; all frozen v9 findings for
 * other fields (including domestic origin and physical checks) stay untouched. */
export function comparePhotoApplicationV10(application: Application, input: PhotoSetEvidence): GroupComparisonV10 {
  const base = comparePhotoApplicationV9(application,input);
  const { projected, supports, contradictions } = classCorroboration(input);
  if (application.commodity !== 'distilled-spirits' || (!supports.length && !contradictions.length)) return {...base,rulesRevision:10};
  const composed = comparePhotoApplicationV9(application,projected).fields.classType;
  const aggregate = aggregatePhotoEvidence(input);
  const field = {
    ...composed,
    observed: aggregate.evidence.classType,
    conflict: aggregate.provenance.classType.conflict,
    status: contradictions.length ? 'mismatch' as const : composed.status,
    // Exact photo IDs and exact field strings, not a fabricated transcription.
    reasons: [...supports.map(s=>s.reason),...contradictions.map(s=>s.reason),
      ...(contradictions.length ? [] : composed.status === 'match' ? ['Class/type: corroborated category and observed style agree with the declaration.'] : composed.reasons)],
  };
  return {...base,rulesRevision:10,fields:{...base.fields,classType:field}};
}
