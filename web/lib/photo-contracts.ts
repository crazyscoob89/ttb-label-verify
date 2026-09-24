import { z } from 'zod';
import { applicationSchema, filenameSchema, checkFileDeclaration, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './contracts';
import { extractionEvidenceSchema } from './extraction/schema';

// Browser-safe wire contract. Storage handles and signing secrets never enter it.
export const MAX_PHOTOS_PER_APPLICATION = 4;
export const MAX_GROUP_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const MAX_GROUP_NORMALIZED_BYTES = 20 * 1024 * 1024;
export const MAX_GROUP_PIXELS = 40_000_000;
export const MAX_GROUP_REQUEST_BYTES = 28 * 1024 * 1024;
export const MAX_GROUP_RECORD_BYTES = 96 * 1024;
export const GROUP_OUTPUT_TOKENS = 6000;
export const GROUP_PROMPT_VERSION = 'photo-set-observations-v2' as const;
export const GPT41_MODEL = 'openai/gpt-4.1' as const;
export const GPT41_PROMPT_VERSION = 'gpt41-photo-observations-v1' as const;
export const AZURE_OCR_MODEL = 'mistral-document-ai-2512' as const;
export const AZURE_OCR_PROMPT_VERSION = 'azure-ocr-photo-observations-v1' as const;
export const AZURE_OCR_DISPLAY_NAME = 'Azure Foundry · Mistral Document AI 2512 (OCR annotation)';
export const AGGREGATION_VERSION_V1 = 'photo-set-aggregation-v1' as const;
export const AGGREGATION_VERSION = 'photo-set-aggregation-v2' as const;
export const photoIdSchema = z.uuid().refine(v => v === v.toLowerCase());
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const photoRoleSchema = z.enum(['front','back','neck','closeup','other']);
const mime = z.enum(['image/png','image/jpeg']);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const photoDeclarationSchema = z.object({photoId:photoIdSchema,role:photoRoleSchema,filename:filenameSchema,mime,bytes:positive.max(MAX_IMAGE_BYTES)}).strict().refine(p => !checkFileDeclaration({name:p.filename,type:p.mime,size:p.bytes}));
function validPhotos(photos: {photoId:string;bytes:number}[]) {
 return new Set(photos.map(p=>p.photoId)).size === photos.length && photos.reduce((n,p)=>n+p.bytes,0) <= MAX_GROUP_ORIGINAL_BYTES;
}
export const photoDeclarationsSchema = z.array(photoDeclarationSchema).min(1).max(MAX_PHOTOS_PER_APPLICATION).refine(validPhotos);
export const photoGroupDeclarationSchema = z.object({schemaVersion:z.literal(2),groupId:photoIdSchema,revision:positive,application:applicationSchema,photos:photoDeclarationsSchema}).strict();
export const photoDescriptorSchema = photoDeclarationSchema.safeExtend({sourceSha256:sha256Schema,normalized:z.object({sha256:sha256Schema,bytes:positive.max(MAX_IMAGE_BYTES),mime,width:positive,height:positive}).strict().refine(p=>p.width*p.height<=MAX_IMAGE_PIXELS)});
export const photoDescriptorsSchema = z.array(photoDescriptorSchema).min(1).max(MAX_PHOTOS_PER_APPLICATION).refine(photos => validPhotos(photos) && new Set(photos.map(p=>p.sourceSha256)).size===photos.length && photos.reduce((n,p)=>n+p.normalized.bytes,0)<=MAX_GROUP_NORMALIZED_BYTES && photos.reduce((n,p)=>n+p.normalized.width*p.normalized.height,0)<=MAX_GROUP_PIXELS);
export const preparedGroupSchema = z.object({schemaVersion:z.literal(2),groupId:photoIdSchema,revision:positive,photoSetSha256:sha256Schema,photos:photoDescriptorsSchema,attemptId:photoIdSchema,reservationId:photoIdSchema,binding:z.string().regex(/^[a-f0-9]{64}\.[a-f0-9]{64}$/)}).strict();
export const groupOperationSchema = z.discriminatedUnion('phase',[
 z.object({phase:z.literal('prepare')}).strict(),
 z.object({phase:z.literal('execute'),attemptId:photoIdSchema,reservationId:photoIdSchema,binding:z.string().regex(/^[a-f0-9]{64}\.[a-f0-9]{64}$/)}).strict(),
]);
export const groupCompareRequestSchema = z.discriminatedUnion('phase',[
 z.object({schemaVersion:z.literal(2),phase:z.literal('prepare'),ticket:z.string().min(1).max(60000)}).strict(),
 z.object({schemaVersion:z.literal(2),phase:z.literal('execute'),ticket:z.string().min(1).max(60000),attemptId:photoIdSchema,reservationId:photoIdSchema,binding:z.string().regex(/^[a-f0-9]{64}\.[a-f0-9]{64}$/)}).strict(),
]);
export const photoSetEvidenceSchema = z.object({schemaVersion:z.literal(2),photos:z.array(z.object({photoId:photoIdSchema,evidence:extractionEvidenceSchema}).strict()).min(1).max(MAX_PHOTOS_PER_APPLICATION)}).strict().superRefine((set,ctx)=>{
 if(new Set(set.photos.map(p=>p.photoId)).size!==set.photos.length) ctx.addIssue({code:'custom',message:'Duplicate photo evidence'});
 for(const p of set.photos) for(const part of ['heading','body'] as const) if(p.evidence.warning[`${part}Bold`]!==null && ['missing','unreadable'].includes(p.evidence.warning[part].status)) ctx.addIssue({code:'custom',message:'Formatting requires corresponding visible text'});
});
export type PhotoRole = z.infer<typeof photoRoleSchema>;
export type PhotoId = string;
export type PhotoDeclaration = z.infer<typeof photoDeclarationSchema>;
export type PhotoGroupDeclaration = z.infer<typeof photoGroupDeclarationSchema>;
export type PhotoDescriptor = z.infer<typeof photoDescriptorSchema>;
export type PreparedGroup = z.infer<typeof preparedGroupSchema>;
export type GroupCompareRequest = z.infer<typeof groupCompareRequestSchema>;
export type GroupOperation = z.infer<typeof groupOperationSchema>;
export type PhotoSetEvidence = z.infer<typeof photoSetEvidenceSchema>;
export type GroupUploadResponse = {schemaVersion:2;ticket:string;uploads:{photoId:string;uploadUrl:string}[]};
export const EVIDENCE_PATHS = ['brand','classType','abv','netContents','producer.name','producer.address','origin','warning.heading','warning.body','warning.headingBold','warning.bodyBold'] as const;
export type EvidencePath = typeof EVIDENCE_PATHS[number];
export type FieldProvenance = {sourcePhotoIds:string[];conflict:boolean;variants:{value:string|boolean;sourcePhotoIds:string[]}[];derivations?:{photoId:string;sourcePath:'warning.heading';operation:'split-visible-warning-prefix'}[]};
export type PhotoProvenance = Record<EvidencePath,FieldProvenance>;
export type PhotoSelector = {photoId:string;variant:'original'|'normalized'};
/** Canonical ordered digest input; hashing is supplied by server/Web Crypto. */
export function photoSetCanonical(photos:PhotoDescriptor[]):string {
 return JSON.stringify(['ttb-photo-set-v2',photos.map(p=>[p.photoId,p.role,p.filename,p.mime,p.bytes,p.sourceSha256,p.normalized.sha256,p.normalized.bytes,p.normalized.mime,p.normalized.width,p.normalized.height])]);
}
export function parsePhotoSetEvidence(value:unknown,ids:string[]):PhotoSetEvidence {
 const set=photoSetEvidenceSchema.parse(value);
 if(set.photos.length!==ids.length || ids.some(id=>!set.photos.some(p=>p.photoId===id))) throw new Error('Incomplete photo coverage');
 return {schemaVersion:2,photos:ids.map(id=>set.photos.find(p=>p.photoId===id)!)};
}
