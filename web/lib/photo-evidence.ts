import { EVIDENCE_PATHS, parsePhotoSetEvidence, type EvidencePath, type PhotoSetEvidence, type PhotoProvenance } from './photo-contracts';
import type { ExtractionEvidence, Observation } from './extraction/schema';
import { equivalentPhotoText as equivalentV1, evidenceLeaf } from './photo-evidence-v1';
import { addressParts, compatibleAddress, compatibleClass, countryKey, layout, nameKey, projectWarning, tequilaType } from './semantic-text';
export { evidenceLeaf } from './photo-evidence-v1';

/** Compatibility, not interchangeable transcription; all raw per-photo fields
 * remain untouched. Pairwise checks below prohibit generic bridging conflicts. */
export function equivalentPhotoText(path:EvidencePath,a:string,b:string):boolean {
 if(path==='warning.body')return layout(a).toLowerCase()===layout(b).toLowerCase();
 if(path==='classType')return compatibleClass(a,b);
 if(path==='origin') { const x=countryKey(a),y=countryKey(b);return x!==null&&y!==null?x===y:equivalentV1(path,a,b); }
 if(path==='producer.name')return nameKey(a)===nameKey(b);
 if(path==='producer.address')return compatibleAddress(a,b);
 return equivalentV1(path,a,b);
}
export function aggregatePhotoEvidence(input:PhotoSetEvidence,ids=input.photos.map(p=>p.photoId)):{evidence:ExtractionEvidence;provenance:PhotoProvenance} {
 const raw=parsePhotoSetEvidence(input,ids);
 const set={...raw,photos:raw.photos.map(p=>({...p,evidence:projectWarning(p.evidence)}))};
 const evidence=structuredClone(set.photos[0].evidence),provenance={} as PhotoProvenance;
 for(const path of EVIDENCE_PATHS){
  const rows=set.photos.map(p=>({id:p.photoId,observation:evidenceLeaf(p.evidence,path)}));
  const bool=path.endsWith('Bold'),variants:PhotoProvenance[EvidencePath]['variants']=[],sourcePhotoIds:string[]=[];
  for(const row of rows){
   const value=typeof row.observation==='object'?row.observation?.text??null:row.observation;
   if(value===null)continue;
   sourcePhotoIds.push(row.id);
   let variant=variants.find(v=>v.value===value);
   if(!variant){variant={value,sourcePhotoIds:[]};variants.push(variant);}variant.sourcePhotoIds.push(row.id);
  }
  const conflict=variants.some((v,i)=>variants.slice(i+1).some(other=>bool?v.value!==other.value:!equivalentPhotoText(path,String(v.value),String(other.value))));
  provenance[path]={sourcePhotoIds,conflict,variants};
  if(path==='warning.heading'||path==='warning.body'){
   const derived=set.photos.filter((p,i)=>p.evidence.warning.heading.text!==raw.photos[i].evidence.warning.heading.text);
   if(derived.length)provenance[path].derivations=derived.map(p=>({photoId:p.photoId,sourcePath:'warning.heading',operation:'split-visible-warning-prefix'}));
  }
  let projected:Observation|boolean|null;
  if(bool)projected=conflict?null:(variants[0]?.value as boolean|undefined)??null;
  else if(conflict)projected={status:'uncertain',text:null,reason:'Conflicting photo observations; inspect source photos.'};
  else {
   const observations=rows.map(r=>r.observation as Observation);
   const candidates=['readable','uncertain','unreadable','missing'].flatMap(status=>observations.filter(o=>o.status===status));
   // Prefer an actual complete/specific readable view, never assemble one.
   const specific=candidates.find(o=>o.status==='readable'&&o.text!==null&&(path==='producer.address'?addressParts(o.text).complete:path==='classType'?Boolean(tequilaType(o.text)):false));
   projected=structuredClone(specific??candidates[0]);
  }
  const [a,b]=path.split('.');
  if(b)Object.assign(evidence[a as 'producer'|'warning'],{[b]:projected});else Object.assign(evidence,{[a]:projected});
 }
 return {evidence,provenance};
}
