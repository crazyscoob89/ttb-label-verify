import { FIELD_KEYS, type ComparisonFields, type ComparisonResult, type FieldKey } from './rules';
import { compareEvidenceV9 } from './semantic-rules-v9';
import type { Application } from './contracts';
import { aggregatePhotoEvidence } from './photo-evidence-v4';
import { EVIDENCE_PATHS, type PhotoSetEvidence } from './photo-contracts';
import { incompleteClassFragment } from './semantic-text-v8';
export const GROUP_RULES_REVISION=9 as const;
export type GroupComparisonV9=Omit<Extract<ComparisonResult,{processing:'complete'}>,'rulesRevision'|'fields'>&{rulesRevision:9;fields:{[K in FieldKey]:ComparisonFields[K]&{sourcePhotoIds:string[];conflict:boolean}}};
/** Fresh GPT groups only; explicit stored version dispatch preserves 4/6/7/8. */
export function comparePhotoApplicationV9(application:Application,photoEvidence:PhotoSetEvidence):GroupComparisonV9 {
 const {evidence,provenance}=aggregatePhotoEvidence(photoEvidence);
 const base=compareEvidenceV9(application,evidence);
 if(base.processing!=='complete')throw Error('Invalid group comparison');
 const individual=photoEvidence.photos.map((p,i)=>({number:i+1,result:compareEvidenceV9(application,p.evidence)}));
 const fields={} as GroupComparisonV9['fields'];
 for(const key of FIELD_KEYS){
  const paths=EVIDENCE_PATHS.filter(p=>p===key||p.startsWith(key+'.'));
  const conflicting=paths.filter(p=>provenance[p].conflict);
  let sourcePhotoIds=photoEvidence.photos.map(p=>p.photoId).filter(id=>paths.some(p=>provenance[p].sourcePhotoIds.includes(id)));
  const differences=individual.filter(p=>p.result.processing==='complete'&&p.result.fields[key].status==='mismatch');
  const original=base.fields[key];
  // A resolved style fragment contributes provenance, not category proof.
  // Keep every raw variant in provenance; cite only independently matching
  // complete views as the source of this class match.
  if(key==='classType'&&original.status==='match'&&!conflicting.length&&!differences.length&&photoEvidence.photos.some(p=>p.evidence.classType.text!==null&&incompleteClassFragment(p.evidence.classType.text))){
   sourcePhotoIds=photoEvidence.photos.filter((_,i)=>individual[i].result.fields.classType.status==='match').map(p=>p.photoId);
  }
  const mapping=key==='warning'&&provenance['warning.body'].derivations?.length?['Warning field mapping corrected from visible heading text; only its actual suffix supplies the body. Raw observations and source paths retained.']:[];
  const field={...original,sourcePhotoIds,conflict:conflicting.length>0,status:differences.length?'mismatch' as const:conflicting.length?'needs-review' as const:original.status,reasons:[...mapping,...original.reasons,...conflicting.map(p=>`${p}: photo observations disagree; inspect the source views.`),...differences.map(p=>`${key}: readable difference in photo ${p.number}; verify extraction against the image, not an independently confirmed label defect.`)]};
  Object.assign(fields,{[key]:field});
 }
 return {...base,rulesRevision:GROUP_RULES_REVISION,fields};
}
