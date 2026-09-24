import type { EvidencePath, PhotoSetEvidence } from './photo-contracts';
import { aggregatePhotoEvidence as aggregateV3, equivalentPhotoText as equivalentV3 } from './photo-evidence-v3';
import { tequilaType } from './semantic-text';
import { compatibleClassV9, rumType } from './semantic-text-v9';
export { evidenceLeaf } from './photo-evidence-v1';

export function equivalentPhotoText(path: EvidencePath, a: string, b: string): boolean {
  return path === 'classType' ? compatibleClassV9(a,b) : equivalentV3(path,a,b);
}
/** Only class changes; the frozen v3 aggregate supplies all other fields. Keep
 * every exact variant/source and select one real readable complete designation,
 * never join fragments. Pairwise compatibility prevents generic-Rum bridging. */
export function aggregatePhotoEvidence(input: PhotoSetEvidence, ids = input.photos.map(p=>p.photoId)) {
  const aggregate = aggregateV3(input, ids);
  const provenance = aggregate.provenance.classType;
  provenance.conflict = provenance.variants.some((v,i)=>provenance.variants.slice(i+1).some(other=>!compatibleClassV9(String(v.value),String(other.value))));
  if (provenance.conflict) {
    aggregate.evidence.classType = { status: 'uncertain', text: null, reason: 'Conflicting photo observations; inspect source photos.' };
  } else {
    const observations = input.photos.map(p=>p.evidence.classType);
    const candidates = ['readable','uncertain','unreadable','missing'].flatMap(status=>observations.filter(o=>o.status===status));
    const specific = candidates.find(o=>o.status==='readable' && o.text!==null && Boolean(tequilaType(o.text)||rumType(o.text)));
    aggregate.evidence.classType = structuredClone(specific ?? candidates[0]);
  }
  return aggregate;
}
