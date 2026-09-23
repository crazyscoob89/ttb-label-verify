import { z } from 'zod';
import { parseExtractionEvidence, type Observation, type ExtractionEvidence } from './schema';

// Exact schema dialect/fields validated by slot-0-request.json. Semantic guards
// below are host-side: they do not change the provider's known JSON Schema.
const text = z.string().min(1).max(2000).nullable();
export const gpt41WireSchema = z.object({
  brand:text, classType:text, abv:text, netContents:text,
  producer:z.object({name:text,address:text,roleEvidence:text,otherEntityText:text}).strict(),
  origin:text,
  warning:z.object({heading:text,body:text,headingBold:z.boolean().nullable(),bodyBold:z.boolean().nullable()}).strict(),
  uncertainties:z.array(z.object({field:z.enum(['brand','classType','abv','netContents','producer','origin','warning']),reason:z.string().min(1).max(300)}).strict()).max(7),
}).strict();
function freeze<T>(value:T):T {
  if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);} return value;
}
export const gpt41JsonSchema = freeze(z.toJSONSchema(gpt41WireSchema,{target:'draft-7'}));

export function parseGpt41Wire(input:unknown):ExtractionEvidence {
  const wire=gpt41WireSchema.parse(input);
  const check=(value:unknown):void=>{
    if(typeof value==='string' && (!value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || /^(?:null|undefined)$/i.test(value.trim())))throw Error('Invalid observation string');
    if(value && typeof value==='object')Object.values(value).forEach(check);
  };check(wire);
  const reasons=new Map(wire.uncertainties.map(u=>[u.field,u.reason]));
  if(reasons.size!==wire.uncertainties.length)throw Error('Duplicate uncertainty');
  for(const key of ['heading','body'] as const)if(wire.warning[key]===null && wire.warning[`${key}Bold`]!==null)throw Error('Absent warning typography');
  const expand=(value:string|null,field:typeof wire.uncertainties[number]['field']):Observation=>{
    const reason=reasons.get(field);
    return {status:reason?(value===null?'unreadable':'uncertain'):(value===null?'missing':'readable'),text:value,
      reason:reason??(value===null?'No visible text reported in this photograph.':'Visible text transcribed from this photograph.')};
  };
  const name=expand(wire.producer.name,'producer'),address=expand(wire.producer.address,'producer');
  // Keep role/other-entity capture as evidence reasons, never substitute either
  // for the selected name/address or manufacture a multilingual role classifier.
  const role=wire.producer.roleEvidence,other=wire.producer.otherEntityText;
  const supported=role!==null && name.text!==null && role.includes(name.text) && role.trim()!==name.text.trim();
  for(const observation of [name,address]){
    if(!supported && observation.status==='readable')observation.status='uncertain';
    // Reject overflow rather than silently truncate captured support. Reasons
    // are bounded by the unchanged persisted schema (500 characters).
    observation.reason=[observation.reason,role===null?'Manufacturing role not established.':`Role excerpt: ${role}`,other===null?'':`Other entity: ${other}`].filter(Boolean).join(' ');
  }
  return parseExtractionEvidence({schemaVersion:1,
    brand:expand(wire.brand,'brand'),classType:expand(wire.classType,'classType'),abv:expand(wire.abv,'abv'),netContents:expand(wire.netContents,'netContents'),
    producer:{name,address},origin:expand(wire.origin,'origin'),
    warning:{heading:expand(wire.warning.heading,'warning'),body:expand(wire.warning.body,'warning'),headingBold:wire.warning.headingBold,bodyBold:wire.warning.bodyBold},
  });
}
