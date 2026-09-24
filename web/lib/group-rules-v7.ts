import type { Application } from './contracts';
import type { PhotoSetEvidence } from './photo-contracts';
import { comparePhotoApplication, type GroupComparison } from './group-rules';

export type GroupComparisonV7 = Omit<GroupComparison, 'rulesRevision'> & { rulesRevision: 7 };

/** Additive revision for newly finalized GPT groups only. Historical revision 6
 * remains frozen. Recognize optional abbreviation periods in the WHOLE ABV
 * notation, never remove decimal points or convert proof/units. The temporary
 * comparison projection is not extraction evidence and is never persisted.
 * Existing exact decimal arithmetic, uncertainty, conflicts and mismatch
 * precedence remain authoritative. All displayed observations remain verbatim. */
export function comparePhotoApplicationV7(application: Application, raw: PhotoSetEvidence): GroupComparisonV7 {
  const baseline = comparePhotoApplication(application, raw);
  const projected = structuredClone(raw);
  for (const photo of projected.photos) {
    const observed = photo.evidence.abv;
    if (observed.text !== null) {
      const match = observed.text.trim().match(/^(\d+(?:\.\d+)?)\s*%\s*alc\.?\/vol\.?$/i);
      if (match) observed.text = `${match[1]}% alc/vol`;
    }
  }
  const computed = comparePhotoApplication(application, projected).fields.abv;
  const original = baseline.fields.abv;
  return { ...baseline, rulesRevision: 7, fields: { ...baseline.fields, abv: {
    ...original,
    status: computed.status === 'mismatch' ? 'mismatch' : original.conflict ? 'needs-review' : computed.status,
    reasons: original.conflict ? [...computed.reasons, ...original.reasons] : computed.reasons,
  } } };
}
