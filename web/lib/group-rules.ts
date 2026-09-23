import { FIELD_KEYS, type ComparisonFields, type ComparisonResult, type FieldKey } from './rules';
import { compareApplicationV5 } from './semantic-rules';
import type { Application } from './contracts';
import { aggregatePhotoEvidence } from './photo-evidence';
import { EVIDENCE_PATHS, type PhotoSetEvidence } from './photo-contracts';
export const GROUP_RULES_REVISION=6 as const;
export type GroupComparison=Omit<Extract<ComparisonResult,{processing:'complete'}>,'rulesRevision'|'fields'>&{rulesRevision:6;fields:{[K in FieldKey]:ComparisonFields[K]&{sourcePhotoIds:string[];conflict:boolean}}};
/** Fresh groups use revision 5 semantics and aggregation v2. Revision 4 is frozen
 * in group-rules-v4.ts and is selected only by explicit stored version pairs. */
export function comparePhotoApplication(application:Application,photoEvidence:PhotoSetEvidence):GroupComparison {
 const {evidence,provenance}=aggregatePhotoEvidence(photoEvidence);
 const base=compareApplicationV5(application,evidence);
 if(base.processing!=='complete')throw Error('Invalid group comparison');
 const individual=photoEvidence.photos.map((p,i)=>({number:i+1,result:compareApplicationV5(application,p.evidence)}));
 const fields={} as GroupComparison['fields'];
 for(const key of FIELD_KEYS){
  const paths=EVIDENCE_PATHS.filter(p=>p===key||p.startsWith(key+'.'));
  const conflicting=paths.filter(p=>provenance[p].conflict);
  const sourcePhotoIds=photoEvidence.photos.map(p=>p.photoId).filter(id=>paths.some(p=>provenance[p].sourcePhotoIds.includes(id)));
  const differences=individual.filter(p=>p.result.processing==='complete'&&p.result.fields[key].status==='mismatch');
  const original=base.fields[key];
  const mapping=key==='warning'&&provenance['warning.body'].derivations?.length?['Warning field mapping corrected from visible heading text; only its actual suffix supplies the body. Raw observations and source paths retained.']:[];
  const field={...original,sourcePhotoIds,conflict:conflicting.length>0,status:differences.length?'mismatch' as const:conflicting.length?'needs-review' as const:original.status,reasons:[...mapping,...original.reasons,...conflicting.map(p=>`${p}: photo observations disagree; inspect the source views.`),...differences.map(p=>`${key}: readable difference in photo ${p.number}; verify extraction against the image, not an independently confirmed label defect.`)]};
  Object.assign(fields,{[key]:field});
 }
 return {...base,rulesRevision:GROUP_RULES_REVISION,fields};
}
