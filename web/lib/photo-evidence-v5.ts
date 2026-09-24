import type { PhotoSetEvidence } from './photo-contracts';
import { aggregatePhotoEvidence as aggregateV4 } from './photo-evidence-v4';
import { classCorroboration } from './class-corroboration-v10';

/** v4 supplies all other fields and exact raw class variants. Only comparison
 * compatibility/selection uses same-photo corroboration, never stored text. */
export function aggregatePhotoEvidence(input: PhotoSetEvidence, ids = input.photos.map(p=>p.photoId)) {
  const aggregate = aggregateV4(input, ids);
  const { projected, supports, contradictions } = classCorroboration(input);
  if (!supports.length && !contradictions.length) return aggregate;
  const composed = aggregateV4(projected, ids);
  aggregate.provenance.classType.conflict = composed.provenance.classType.conflict || contradictions.length > 0;
  if (aggregate.provenance.classType.conflict) {
    aggregate.evidence.classType = { status:'uncertain', text:null, reason:'Conflicting photo observations; inspect source photos.' };
  } else {
    const index = projected.photos.findIndex(p=>JSON.stringify(p.evidence.classType)===JSON.stringify(composed.evidence.classType));
    // v4 selects one actual observation; reverse only that comparison key.
    if (index < 0) throw Error('Class corroboration source missing');
    aggregate.evidence.classType = structuredClone(input.photos[index].evidence.classType);
  }
  return aggregate;
}
