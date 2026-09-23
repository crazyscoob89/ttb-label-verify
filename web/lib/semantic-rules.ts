import { applicationSchema, type Application } from './contracts';
import { extractionEvidenceSchema, type ExtractionEvidence, type Observation } from './extraction/schema';
import { WARNING_REFERENCE, type ComparisonResult, type FieldStatus } from './rules';
import { compareApplicationV3 } from './wine-rules';
import { addressContradiction, addressKey, addressParts, compatibleAddress, countryKey, layout, nameKey, projectWarning, tequilaType } from './semantic-text';

export const RULES_REVISION_V5 = 5 as const;
export type ComparisonResultV5 = Exclude<ComparisonResult,{processing:'complete'}> | (Omit<Extract<ComparisonResult,{processing:'complete'}>,'rulesRevision'>&{rulesRevision:5});
type Decision={status:FieldStatus;reasons:string[]};
const decision=(status:FieldStatus,reason:string):Decision=>({status,reasons:[reason]});
const combine=(parts:Decision[]):Decision=>({status:parts.some(p=>p.status==='mismatch')?'mismatch':parts.some(p=>p.status==='needs-review')?'needs-review':'match',reasons:parts.flatMap(p=>p.reasons)});
const readable=(o:Observation):o is Observation&{text:string}=>o.status==='readable'&&o.text!==null;
function producerName(expected:string,observed:Observation):Decision {
 if(!readable(observed))return decision('needs-review',`Producer name: ${observed.status}; inspect the producer statement.`);
 if(nameKey(expected)===nameKey(observed.text))return decision('match','Producer name: agrees under case, layout and Latin accent equivalence; no role or corporate-identity certification.');
 return decision('needs-review','Producer name: extracted name differs; inspect whether this is the producer, brand, importer or bottler. No entity alias inferred.');
}
function producerAddress(expected:string,observed:Observation):Decision {
 if(!readable(observed))return decision('needs-review',`Producer address: ${observed.status}; a complete readable address is needed.`);
 const equal=addressKey(expected)===addressKey(observed.text);
 if(equal)return decision('match','Producer address: whole supplied address agrees under case, Latin accents, comma layout and No. spacing; no substring verification.');
 if(addressContradiction(expected,observed.text))return decision('mismatch','Producer address: readable street number, postal code or country differs; verify against the source label.');
 if(compatibleAddress(expected,observed.text))return decision('needs-review','Producer address: compatible partial view, not a verified complete address. A complete compatible photo may supply the address.');
 return decision('needs-review',`Producer address: ${addressParts(observed.text).complete?'address components differ':'incomplete or unsupported address form'}; inspect the full address and entity mapping. No proven label defect inferred from a fragment.`);
}
function warningText(expected:string,observed:Observation,part:'heading'|'body'):Decision {
 if(!readable(observed))return decision('needs-review',`Warning ${part}: ${observed.status}; words cannot be verified.`);
 const reference=layout(expected),actual=layout(observed.text);
 const equal=part==='body'?reference.toLowerCase()===actual.toLowerCase():reference===actual;
 return decision(equal?'match':'mismatch',equal
  ?`Warning ${part}: wording matches (${part==='body'?'body case and layout whitespace ignored; punctuation and word order retained':'exact capitals and colon; layout whitespace ignored'}).`
  :`Warning ${part}: wording differs. Reference: ${JSON.stringify(expected)}. Observed: ${JSON.stringify(observed.text)}. Verify transcription against the image before correcting the label; no missing words supplied.`);
}
function warning(e:ExtractionEvidence['warning']):Decision {
 const format=(v:boolean|null,expected:boolean,part:string)=>decision(v===null?'needs-review':v===expected?'match':'mismatch',`Warning ${part} boldness: ${v===null?'unknown; inspect the image':v===expected?'observed as required':'formatting differs; verify against the image'}. Letter case does not establish boldness.`);
 return combine([warningText(WARNING_REFERENCE.heading,e.heading,'heading'),warningText(WARNING_REFERENCE.body,e.body,'body'),format(e.headingBold,true,'heading'),format(e.bodyBold,false,'body')]);
}
/** Revision 5 is additive. Revisions 1/2/3 and historical group 4 remain frozen. */
export function compareApplicationV5(application:Application,evidence:ExtractionEvidence):ComparisonResultV5 {
 // Validate before projecting; malformed inputs must fail rather than throw.
 const a=applicationSchema.safeParse(application),raw=extractionEvidenceSchema.safeParse(evidence);
 if(!a.success)return {processing:'failed',code:'invalid-application',reason:'Application does not satisfy the intake contract.'};
 if(!raw.success)return {processing:'failed',code:'invalid-extraction',reason:'Extraction does not satisfy the evidence contract.'};
 const e=projectWarning(raw.data),baseline=compareApplicationV3(a.data,e);
 if(baseline.processing!=='complete')return baseline;
 const fields={...baseline.fields};
 const observed=e.classType;
 if(a.data.commodity==='distilled-spirits'&&readable(observed)){
  const declared=tequilaType(a.data.classType),actual=tequilaType(observed.text);
  if(declared===''&&actual!==null)fields.classType={...fields.classType,status:'match',reasons:['Class/type: recognized Tequila designation is compatible with generic Tequila. Observed subtype is retained; no legal classification certified.']};
  else if(declared!==null&&declared!==''&&actual==='')fields.classType={...fields.classType,status:'needs-review',reasons:['Class/type: generic Tequila observation does not verify the declared subtype.']};
 }
 if(readable(e.origin)){
  const actual=countryKey(e.origin.text),declared=countryKey(a.data.origin.country);
  if(actual!==null && (!a.data.imported||declared!==null)){
   const status:FieldStatus=a.data.imported?(actual===declared?'match':'mismatch'):actual==='united states'?'not-applicable':'mismatch';
   fields.origin={...fields.origin,status,reasons:[`Origin: ${status==='match'?'whole country claim agrees under bounded origin-prefix/country mapping':status==='not-applicable'?'recognized domestic US claim; imported-country comparison not applicable':'readable country claim conflicts with the declared origin'}. Raw source text retained.`]};
  } else if(a.data.imported || fields.origin.status!=='not-applicable')fields.origin={...fields.origin,status:'needs-review',reasons:['Origin: unsupported or ambiguous country claim; no country inferred from a substring or import/shipping statement.']};
 }
 fields.producer={...fields.producer,...combine([producerName(a.data.producerName,e.producer.name),producerAddress(a.data.producerAddress,e.producer.address)])};
 fields.warning={...fields.warning,...warning(e.warning)};
 if(e.warning.heading.text!==raw.data.warning.heading.text)fields.warning.reasons.unshift(e.warning.heading.reason!);
 fields.warning.reasons.push('Physical print size: unverified; inspect the physical label separately.');
 return {...baseline,rulesRevision:RULES_REVISION_V5,fields};
}
