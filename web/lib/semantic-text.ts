import type { ExtractionEvidence } from './extraction/schema';
import { WARNING_REFERENCE } from './rules';

// Shared by revision 5 comparison and aggregation v2 only. Historical policies
// never import this module. These are lexical compatibility rules, not registries.
export const layout = (s:string) => s.trim().replace(/\s+/gu,' ');
export const textKey = (s:string) => layout(s.normalize('NFC')).toLowerCase();
// Bounded to Latin orthographic marks; does not delete punctuation or name words.
export const nameKey = (s:string) => textKey(s).normalize('NFD').replace(/([A-Za-z])[\u0300-\u036f]+/gu,'$1').normalize('NFC');
const COUNTRIES = new Map([
 'australia','canada','france','germany','italy','japan','mexico','new zealand',
 'portugal','south africa','spain','united kingdom','united states',
].map(s=>[s,s]));
for(const alias of ['us','usa','u.s.','u.s.a.','united states of america']) COUNTRIES.set(alias,'united states');
COUNTRIES.set('méxico','mexico');
/** Whole country slots with only explicit origin-claim prefixes. Unsupported
 * prose (including imported-from claims) is deliberately not country evidence. */
export function countryKey(s:string):string|null {
 return COUNTRIES.get(textKey(s).replace(/^(?:product of|made in|hecho en) /u,''))??null;
}
const TEQUILA_TYPES = new Set(['gold','silver','blanco','reposado','añejo','extra añejo','joven']);
export function tequilaType(s:string):string|null {
 const value=textKey(s);
 if(value==='tequila')return '';
 if(value.startsWith('tequila ') && TEQUILA_TYPES.has(value.slice(8)))return value.slice(8);
 return null;
}
export function compatibleClass(a:string,b:string):boolean {
 if(textKey(a)===textKey(b))return true;
 const x=tequilaType(a),y=tequilaType(b);
 return x!==null&&y!==null&&(x===''||y==='');
}
export function addressKey(s:string):string {
 return nameKey(s).replace(/\bno\.\s*(?=\d)/gu,'no.').replace(/\s*,\s*/gu,',');
}
type Address = { components:string[]; number:string|null; postal:string|null; country:string|null; complete:boolean };
export function addressParts(s:string):Address {
 const components=addressKey(s).split(',');
 const number=components[0].match(/\bno\.(\d+[a-z]?)\b/u)?.[1]??null;
 const last=components[components.length-1];
 const postalMatch=last.match(/^(\d{4,6}) (.+)$/u);
 const country=countryKey(postalMatch?.[2]??last);
 if(country)components[components.length-1]=country;
 // Postal remains an independent component, never discarded to compare fulls.
 if(postalMatch&&country)components.push(postalMatch[1]);
 return {components,number,postal:postalMatch&&country?postalMatch[1]:null,country,complete:number!==null&&country!==null&&components.length>=3};
}
/** A partial view may be covered by whole comma-delimited components of a full
 * one; it is not independently verified. No arbitrary substring or concatenation. */
export function compatibleAddress(a:string,b:string):boolean {
 if(addressKey(a)===addressKey(b))return true;
 const x=addressParts(a),y=addressParts(b);
 if(x.complete&&y.complete)return false;
 if(!x.complete&&!y.complete)return false;
 const full=x.complete?x:y,partial=x.complete?y:x;
 return partial.components.every(c=>full.components.includes(c));
}
export function addressContradiction(a:string,b:string):boolean {
 const x=addressParts(a),y=addressParts(b);
 return Boolean((x.number&&y.number&&x.number!==y.number)||(x.postal&&y.postal&&x.postal!==y.postal)||(x.country&&y.country&&x.country!==y.country));
}
/** Correct an extraction field mapping, not a label. Slice ONLY actual text;
 * never consult the reference body or infer boldness from capitals. */
export function projectWarning(input:ExtractionEvidence):ExtractionEvidence {
 const e=structuredClone(input),w=e.warning;
 if(w.heading.status==='readable' && w.body.status==='missing' && w.heading.text!==null){
  const raw=w.heading.text.trim();
  const prefix=WARNING_REFERENCE.heading;
  if(raw.startsWith(prefix)&&/^\s+\S/u.test(raw.slice(prefix.length))){
   const reason='Field mapping correction: split the visible GOVERNMENT WARNING: prefix from its actual suffix; no words supplied from reference.';
   w.heading={...w.heading,text:raw.slice(0,prefix.length),reason};
   w.body={status:'readable',text:raw.slice(prefix.length).trim(),reason};
   // Missing body had no independently observed body typography.
   w.bodyBold=null;
  }
 }
 return e;
}
