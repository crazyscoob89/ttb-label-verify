import { z } from 'zod';
import { GPT41_MODEL, GPT41_PROMPT_VERSION } from './photo-contracts';
import { applicationSchema, type Application } from './contracts';
import { extractionEvidenceSchema, type ExtractionEvidence } from './extraction/schema';
import { RULES_VERSION } from './rules';
import { comparePhotoApplication, type GroupComparison } from './group-rules';
import { comparePhotoApplicationV7, type GroupComparisonV7 } from './group-rules-v7';
import { aggregatePhotoEvidence } from './photo-evidence';
import { aggregatePhotoEvidence as aggregateV1 } from './photo-evidence-v1';
import { comparePhotoApplication as compareV4, type GroupComparison as GroupComparisonV4 } from './group-rules-v4';
import { AGGREGATION_VERSION_V1, AZURE_OCR_MODEL, AZURE_OCR_PROMPT_VERSION } from './photo-contracts';
import { AGGREGATION_VERSION,GROUP_PROMPT_VERSION,MAX_GROUP_RECORD_BYTES,photoDescriptorsSchema,photoIdSchema,sha256Schema,parsePhotoSetEvidence,photoSetCanonical,type PhotoDescriptor,type PhotoSetEvidence,type PhotoProvenance } from './photo-contracts';
const extractionBase=z.object({schemaVersion:z.literal(2),promptVersion:z.literal(GROUP_PROMPT_VERSION),model:z.literal('offline-fixture'),requestId:photoIdSchema}).strict();
const liveExtraction=extractionBase.extend({model:z.literal('anthropic/claude-haiku-4.5'),attemptId:photoIdSchema,reservationId:photoIdSchema});
const azureExtraction=liveExtraction.extend({model:z.literal(AZURE_OCR_MODEL),promptVersion:z.literal(AZURE_OCR_PROMPT_VERSION)});
const gpt41Extraction=liveExtraction.extend({model:z.literal(GPT41_MODEL),promptVersion:z.literal(GPT41_PROMPT_VERSION)});
const extraction=z.union([extractionBase,liveExtraction,azureExtraction,gpt41Extraction]);
export type CompletePhotoComparison={recordVersion:2;processing:'complete';application:Application;groupId:string;revision:number;photos:PhotoDescriptor[];photoSetSha256:string;imageSha256:string;source:'fixture'|'openrouter'|'azure-foundry';photoEvidence:PhotoSetEvidence;aggregationVersion:typeof AGGREGATION_VERSION|typeof AGGREGATION_VERSION_V1;evidence:ExtractionEvidence;provenance:PhotoProvenance;extraction:z.infer<typeof extraction>;comparison:GroupComparison|GroupComparisonV4|GroupComparisonV7};
const schema=z.object({recordVersion:z.literal(2),processing:z.literal('complete'),application:applicationSchema,groupId:photoIdSchema,revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),photos:photoDescriptorsSchema,photoSetSha256:sha256Schema,imageSha256:sha256Schema,source:z.enum(['fixture','openrouter','azure-foundry']),photoEvidence:z.unknown(),aggregationVersion:z.enum([AGGREGATION_VERSION_V1,AGGREGATION_VERSION]),evidence:extractionEvidenceSchema,provenance:z.unknown(),extraction,comparison:z.unknown()}).strict();
/** Browser-safe structural replay; server additionally recomputes the digest on
 * every snapshot/read. Browser consumers can await verifyPhotoRecordDigest. */
export function checkedPhotoRecord(value:unknown):CompletePhotoComparison|null {
 try {
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_GROUP_RECORD_BYTES)return null;
  const r=schema.parse(value);
  const expectedSource=r.extraction.model==='offline-fixture'?'fixture':r.extraction.model===AZURE_OCR_MODEL?'azure-foundry':'openrouter';
  if(r.source!==expectedSource||r.imageSha256!==r.photos[0].normalized.sha256)return null;
  if((r.source==='azure-foundry'||r.extraction.model===GPT41_MODEL)&&r.aggregationVersion!==AGGREGATION_VERSION)return null;
  const photoEvidence=parsePhotoSetEvidence(r.photoEvidence,r.photos.map(p=>p.photoId));
  if(JSON.stringify(photoEvidence)!==JSON.stringify(r.photoEvidence))return null;
  const historical=r.aggregationVersion===AGGREGATION_VERSION_V1;
  if(!r.comparison||typeof r.comparison!=='object'||!('rulesRevision' in r.comparison))return null;
  const refined=r.comparison.rulesRevision===7 && r.extraction.model===GPT41_MODEL && !historical;
  if(!refined && r.comparison.rulesRevision!==(historical?4:6))return null;
  const aggregate=(historical?aggregateV1:aggregatePhotoEvidence)(photoEvidence);
  const comparison=(historical?compareV4:refined?comparePhotoApplicationV7:comparePhotoApplication)(r.application,photoEvidence);
  if(JSON.stringify(aggregate.evidence)!==JSON.stringify(r.evidence)||JSON.stringify(aggregate.provenance)!==JSON.stringify(r.provenance)||JSON.stringify(comparison)!==JSON.stringify(r.comparison))return null;
  return {...r,photoEvidence,...aggregate,comparison};
 }catch{return null;}
}
export async function verifyPhotoRecordDigest(record:CompletePhotoComparison):Promise<boolean> {
 const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(photoSetCanonical(record.photos)));
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')===record.photoSetSha256;
}
const metadataBase=z.object({source:z.literal('fixture'),model:z.literal('offline-fixture'),schemaVersion:z.literal(2),promptVersion:z.literal(GROUP_PROMPT_VERSION),rulesVersion:z.literal(RULES_VERSION),requestId:photoIdSchema,photoSetSha256:sha256Schema,photos:z.array(z.object({photoId:photoIdSchema,imageSha256:sha256Schema}).strict()).min(1).max(4)}).strict();
export const groupExtractionEnvelope=z.object({processing:z.literal('complete'),evidence:z.unknown(),metadata:z.union([
 metadataBase,
 metadataBase.extend({source:z.literal('openrouter'),model:z.literal('anthropic/claude-haiku-4.5'),attemptId:photoIdSchema,reservationId:photoIdSchema}),
 metadataBase.extend({source:z.literal('azure-foundry'),model:z.literal(AZURE_OCR_MODEL),promptVersion:z.literal(AZURE_OCR_PROMPT_VERSION),attemptId:photoIdSchema,reservationId:photoIdSchema}),
 metadataBase.extend({source:z.literal('openrouter'),model:z.literal(GPT41_MODEL),promptVersion:z.literal(GPT41_PROMPT_VERSION),attemptId:photoIdSchema,reservationId:photoIdSchema}),
])}).strict();
export function finalizePhotoComparison(application:Application,groupId:string,revision:number,photos:PhotoDescriptor[],photoSetSha256:string,input:unknown):CompletePhotoComparison {
 const {metadata,evidence:raw}=groupExtractionEnvelope.parse(input);
 if(metadata.photoSetSha256!==photoSetSha256||JSON.stringify(metadata.photos)!==JSON.stringify(photos.map(p=>({photoId:p.photoId,imageSha256:p.normalized.sha256}))))throw Error('Input provenance mismatch');
 const photoEvidence=parsePhotoSetEvidence(raw,photos.map(p=>p.photoId));
 const ex={schemaVersion:2 as const,promptVersion:metadata.promptVersion,model:metadata.model,requestId:metadata.requestId,...(metadata.source!=='fixture'?{attemptId:metadata.attemptId,reservationId:metadata.reservationId}:{})};
  const compare=metadata.model===GPT41_MODEL?comparePhotoApplicationV7:comparePhotoApplication;
  const record=checkedPhotoRecord({recordVersion:2,processing:'complete',application,groupId,revision,photos,photoSetSha256,imageSha256:photos[0].normalized.sha256,source:metadata.source,photoEvidence,aggregationVersion:AGGREGATION_VERSION,...aggregatePhotoEvidence(photoEvidence),extraction:ex,comparison:compare(application,photoEvidence)});
 if(!record)throw Error('Invalid group record');return record;
}
