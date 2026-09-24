import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {GPT41_MODEL,GPT41_PROMPT_VERSION} from '../photo-contracts';
import {photoDescriptorsSchema,photoIdSchema,sha256Schema,GROUP_PROMPT_VERSION,AZURE_OCR_MODEL,AZURE_OCR_PROMPT_VERSION,type PhotoDescriptor,type PhotoSetEvidence} from '../photo-contracts';
import {photoSetHash} from '../group-binding';
import {RULES_VERSION} from '../rules';
export type GroupExtractionRequest={schemaVersion:2;photos:{descriptor:PhotoDescriptor;image:Uint8Array}[];photoSetSha256:string;reservationId:string;attemptId:string};
type GroupMetadataBase={schemaVersion:2;rulesVersion:typeof RULES_VERSION;photoSetSha256:string;photos:{photoId:string;imageSha256:string}[];requestId:string};
export type GroupExtractionMetadata=GroupMetadataBase & (
 {source:'fixture';model:'offline-fixture';promptVersion:typeof GROUP_PROMPT_VERSION;reservationId?:never;attemptId?:never} |
 {source:'openrouter';model:'anthropic/claude-haiku-4.5';promptVersion:typeof GROUP_PROMPT_VERSION;reservationId:string;attemptId:string} |
 {source:'openrouter';model:typeof GPT41_MODEL;promptVersion:typeof GPT41_PROMPT_VERSION;reservationId:string;attemptId:string} |
 {source:'azure-foundry';model:typeof AZURE_OCR_MODEL;promptVersion:typeof AZURE_OCR_PROMPT_VERSION;reservationId:string;attemptId:string}
);
export type GroupExtractionResult={processing:'complete';evidence:PhotoSetEvidence;metadata:GroupExtractionMetadata}|{processing:'failed';code:'unconfigured'|'invalid-request'|'provider-failed'|'spend-unavailable'};
export interface GroupExtractionProvider{extractGroup(request:GroupExtractionRequest,signal?:AbortSignal):Promise<GroupExtractionResult>}
export function snapshotGroupRequest(input:GroupExtractionRequest){
 const parsed=z.object({schemaVersion:z.literal(2),photos:z.array(z.object({descriptor:z.unknown(),image:z.custom<Uint8Array>(v=>v instanceof Uint8Array&&!(v.buffer instanceof SharedArrayBuffer))}).strict()).min(1).max(4),photoSetSha256:sha256Schema,reservationId:photoIdSchema,attemptId:photoIdSchema}).strict().parse(input);
 const descriptors=photoDescriptorsSchema.parse(parsed.photos.map(p=>p.descriptor));
 const photos=parsed.photos.map((p,i)=>{
  const descriptor=descriptors[i];if(p.image.byteLength!==descriptor.normalized.bytes)throw Error('Invalid image');
  const image=Buffer.from(p.image);if(createHash('sha256').update(image).digest('hex')!==descriptor.normalized.sha256)throw Error('Input hash mismatch');
  return {descriptor,image};
 });
 if(photoSetHash(descriptors)!==parsed.photoSetSha256)throw Error('Manifest mismatch');
 return {...parsed,photos,requestId:randomUUID()};
}
