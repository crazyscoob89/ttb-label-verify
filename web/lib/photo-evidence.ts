import { EVIDENCE_PATHS, parsePhotoSetEvidence, type EvidencePath, type PhotoSetEvidence, type PhotoProvenance } from './photo-contracts';
import type { ExtractionEvidence, Observation } from './extraction/schema';

const whitespace=(s:string)=>s.trim().replace(/\s+/gu,' ');
const normalize=(s:string)=>whitespace(s.normalize('NFC')).toLowerCase();
function numeric(s:string,path:EvidencePath):[bigint,bigint]|null {
 const m=path==='abv'?s.trim().match(/^(\d+(?:\.\d+)?)(?:\s*%(?:\s*(?:ABV|alc\/vol|alcohol by volume|BY\s+VOL\.?))?)?$/i):s.trim().match(/^(\d+(?:\.\d+)?)\s*(mL|L)$/i);
 if(!m || !/^\d{1,32}(?:\.\d{1,32})?$/.test(m[1]))return null;
 const [whole,fraction='']=m[1].split('.');let n=BigInt(whole+fraction);
 if(path==='netContents'){if(n===0n)return null;if(m[2].toLowerCase()==='l')n*=1000n;}
 return [n,10n**BigInt(fraction.length)];
}
export function equivalentPhotoText(path:EvidencePath,a:string,b:string):boolean {
 if(path==='warning.heading'||path==='warning.body')return whitespace(a)===whitespace(b);
 if(path==='abv'||path==='netContents') {const x=numeric(a,path),y=numeric(b,path);return x&&y?x[0]*y[1]===y[0]*x[1]:a===b;}
 if(path==='origin')return normalize(a).replace(/^product of /u,'')===normalize(b).replace(/^product of /u,'');
 return normalize(a)===normalize(b);
}
export function evidenceLeaf(e:ExtractionEvidence,path:EvidencePath):Observation|boolean|null {
 const [a,b]=path.split('.');
 if(a==='producer')return e.producer[b as 'name'|'address'];
 if(a==='warning')return e.warning[b as keyof ExtractionEvidence['warning']];
 return e[a as 'brand'|'classType'|'abv'|'netContents'|'origin'];
}
export function aggregatePhotoEvidence(input:PhotoSetEvidence,ids=input.photos.map(p=>p.photoId)):{evidence:ExtractionEvidence;provenance:PhotoProvenance} {
 const set=parsePhotoSetEvidence(input,ids);
 const evidence=structuredClone(set.photos[0].evidence), provenance={} as PhotoProvenance;
 for(const path of EVIDENCE_PATHS){
  const rows=set.photos.map(p=>({id:p.photoId,observation:evidenceLeaf(p.evidence,path)}));
  const bool=path.endsWith('Bold');
  const variants:PhotoProvenance[EvidencePath]['variants']=[];
  const sourcePhotoIds:string[]=[];
  for(const row of rows){
   const value=typeof row.observation==='object'?row.observation?.text??null:row.observation;
   if(value===null)continue;
   sourcePhotoIds.push(row.id);
   // Preserve verbatim variants even where equivalence permits one projection.
   let variant=variants.find(v=>v.value===value);
   if(!variant){variant={value,sourcePhotoIds:[]};variants.push(variant);}variant.sourcePhotoIds.push(row.id);
  }
  const conflict=variants.some(v=> bool?v.value!==variants[0].value:!equivalentPhotoText(path,String(v.value),String(variants[0].value)));
  provenance[path]={sourcePhotoIds,conflict,variants};
  let projected:Observation|boolean|null;
  if(bool)projected=conflict?null:(variants[0]?.value as boolean|undefined)??null;
  else if(conflict)projected={status:'uncertain',text:null,reason:'Conflicting photo observations; inspect source photos.'};
  else {
   const observations=rows.map(r=>r.observation as Observation);
   projected=structuredClone(['readable','uncertain','unreadable','missing'].flatMap(status=>observations.filter(o=>o.status===status))[0]);
  }
  const [a,b]=path.split('.');
  if(b)Object.assign(evidence[a as 'producer'|'warning'],{[b]:projected});else Object.assign(evidence,{[a]:projected});
 }
 return {evidence,provenance};
}
