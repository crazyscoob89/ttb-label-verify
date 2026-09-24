import { FIELD_KEYS, type ComparisonFields, type ComparisonResult, type FieldKey } from './rules';
import { compareApplicationV3 } from './wine-rules';
import type { Application } from './contracts';
import { aggregatePhotoEvidence } from './photo-evidence-v1';
import { EVIDENCE_PATHS, type PhotoSetEvidence } from './photo-contracts';
export const GROUP_RULES_REVISION=4 as const;
export type GroupComparison=Omit<Extract<ComparisonResult,{processing:'complete'}>,'rulesRevision'|'fields'>&{rulesRevision:4;fields:{[K in FieldKey]:ComparisonFields[K]&{sourcePhotoIds:string[];conflict:boolean}}};
/** Group revision 4 wraps wine revision 3, including individual defect checks.
 * Frozen revision-1/2 evaluators themselves must never be modified. */
export function comparePhotoApplication(application:Application,photoEvidence:PhotoSetEvidence):GroupComparison {
 const {evidence,provenance}=aggregatePhotoEvidence(photoEvidence);
 const base=compareApplicationV3(application,evidence);
 if(base.processing!=='complete')throw Error('Invalid group comparison');
 const individual=photoEvidence.photos.map(p=>({id:p.photoId,result:compareApplicationV3(application,p.evidence)}));
 const fields={} as GroupComparison['fields'];
 for(const key of FIELD_KEYS){
  const paths=EVIDENCE_PATHS.filter(p=>p===key||p.startsWith(key+'.'));
  const conflicting=paths.filter(p=>provenance[p].conflict);
  const sourcePhotoIds=photoEvidence.photos.map(p=>p.photoId).filter(id=>paths.some(p=>provenance[p].sourcePhotoIds.includes(id)));
  const defects=individual.filter(p=>p.result.processing==='complete'&&p.result.fields[key].status==='mismatch');
  const original=base.fields[key];
  const field={...original,sourcePhotoIds,conflict:conflicting.length>0,status:defects.length?'mismatch' as const:conflicting.length?'needs-review' as const:original.status,reasons:[...original.reasons,...conflicting.map(p=>`${p}: conflicting photo observations (${provenance[p].sourcePhotoIds.join(', ')}).`),...defects.map(p=>`${key}: proven defect in photo ${p.id}.`)]};
  Object.assign(fields,{[key]:field});
 }
 return {...base,rulesRevision:GROUP_RULES_REVISION,fields};
}
