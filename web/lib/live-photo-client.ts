import {checkFileDeclaration} from './contracts';
import {mapTwoIO} from './parallel-io';
import {FIELD_KEYS} from './rules';
import type {CompleteComparison, ComparisonRecord} from './comparison-record';
import {checkedPhotoRecord,verifyPhotoRecordDigest,type CompletePhotoComparison} from './photo-record';
export type {CompletePhotoComparison} from './photo-record';
import {boundedBytes, capability, hostedMode, loadReviewEvidence} from './live-media-client';

import {photoGroupDeclarationSchema,preparedGroupSchema,photoSetCanonical,photoIdSchema,parsePhotoSetEvidence,EVIDENCE_PATHS,type PhotoRole,type PhotoDeclaration,type PhotoGroupDeclaration,type PhotoDescriptor,type PreparedGroup,type FieldProvenance} from './photo-contracts';
export type {PhotoRole,PhotoDeclaration,PhotoGroupDeclaration,PhotoDescriptor,PreparedGroup,FieldProvenance} from './photo-contracts';
export const PHOTO_ROLES:PhotoRole[]=['front','back','neck','closeup','other'];

export type UiCompleteComparison=CompleteComparison|CompletePhotoComparison;
export type UiComparisonRecord=ComparisonRecord|CompletePhotoComparison;
export function photoRecord(record:UiCompleteComparison):CompletePhotoComparison|null {return 'recordVersion' in record && record.recordVersion===2 ? record as CompletePhotoComparison : null;}
export type PhotoPreview={photoId:string;url:string};
export type OperationStage='upload'|'prepare'|'compare';
export type StageMeasurement={stage:OperationStage;elapsedMs:number;state:'running'|'complete'|'failed'};
export type StageListener=(measurement:StageMeasurement)=>void;
export type ReadyPhotoGroup={group:PhotoGroupDeclaration;files:File[];ticket?:string;prepared:PreparedGroup};
const uuid=(v:unknown)=>photoIdSchema.safeParse(v).success;
export function validatePhotoGroup(group:PhotoGroupDeclaration,files:File[]){
 photoGroupDeclarationSchema.parse(group);
 if(files.length!==group.photos.length)throw Error('invalid-input');
 group.photos.forEach((p,i)=>{const file=files[i];if(checkFileDeclaration(file)||p.filename!==file.name||p.mime!==file.type||p.bytes!==file.size)throw Error('invalid-input');});
}
function checkedPreparation(input:unknown,group:PhotoGroupDeclaration):PreparedGroup {
 const value=preparedGroupSchema.parse(input);
 if(value.groupId!==group.groupId||value.revision!==group.revision||!value.binding.startsWith(value.photoSetSha256+'.')||value.photos.length!==group.photos.length)throw Error('invalid-preparation');
 value.photos.forEach((p,i)=>{const d=group.photos[i];if(['photoId','filename','mime','bytes','role'].some(key=>p[key as keyof PhotoDeclaration]!==d[key as keyof PhotoDeclaration]))throw Error('invalid-preparation');});return value;
}
export async function verifyPhotoSet(photos:PhotoDescriptor[],expectedHash:string){
 const bytes=new TextEncoder().encode(photoSetCanonical(photos));const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(actual!==expectedHash)throw Error('photo-set-integrity-mismatch');
}
async function readJson(response:Response,signal:AbortSignal){
 if(!response.ok){let code='comparison-unavailable';try{const data=JSON.parse(new TextDecoder().decode(await boundedBytes(new Response(response.body),65536,signal)));if(typeof data.code==='string'&&/^[a-z-]{1,80}$/.test(data.code))code=data.code;}catch{}throw Error(code);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedBytes(response,384*1024,signal)));
}
function bodyFor(group:PhotoGroupDeclaration,files:File[],ticket:string|undefined,operation:{phase:'prepare'}|{phase:'execute';attemptId:string;reservationId:string;binding:string}):{headers:Record<string,string>;body:BodyInit}{
 if(ticket)return {headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:2,...operation,ticket})};
 const body=new FormData();body.set('group',JSON.stringify(group));body.set('operation',JSON.stringify(operation));group.photos.forEach((p,i)=>body.set(`photo:${p.photoId}`,files[i]));return {headers:{},body};
}
async function measured<T>(stage:OperationStage,listener:StageListener|undefined,work:()=>Promise<T>):Promise<T>{const start=performance.now();listener?.({stage,state:'running',elapsedMs:0});try{const result=await work();listener?.({stage,state:'complete',elapsedMs:Math.round(performance.now()-start)});return result;}catch(e){listener?.({stage,state:'failed',elapsedMs:Math.round(performance.now()-start)});throw e;}}
/** All originals uploaded once, one preparation and one explicit execute. Never retry. */
export async function prepareLiveGroup(input:PhotoGroupDeclaration,inputFiles:File[],code:string,signal:AbortSignal,transport:typeof fetch=fetch,onStage?:StageListener):Promise<ReadyPhotoGroup>{
 const group=structuredClone(input),files=[...inputFiles];validatePhotoGroup(group,files);if(!code)throw Error('access-denied');signal.throwIfAborted();let ticket:string|undefined;
 if(hostedMode())ticket=await measured('upload',onStage,async()=>{
  const response=await transport('/api/uploads',{method:'POST',headers:{'content-type':'application/json','x-ttb-demo-code':code},body:JSON.stringify(group),signal,cache:'no-store',redirect:'error'});
  const data=await readJson(response,signal);
  if(data.schemaVersion!==2||typeof data.ticket!=='string'||!data.ticket.length||data.ticket.length>60000||!Array.isArray(data.uploads)||data.uploads.length!==group.photos.length)throw Error('invalid-upload-ticket');
  const urls=data.uploads.map((u:{photoId:string;uploadUrl:string},i:number)=>{if(u.photoId!==group.photos[i].photoId)throw Error('invalid-upload-ticket');return capability(u.uploadUrl,'upload');});
  if(new Set(urls).size!==urls.length)throw Error('invalid-upload-ticket');
  await mapTwoIO(files,async(file,i)=>{const upload=await transport(urls[i],{method:'PUT',body:file,headers:{'content-type':file.type,'x-upsert':'false','cache-control':'no-store'},signal,cache:'no-store',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});await boundedBytes(upload,16384,signal);},signal);
  return data.ticket as string;
 });
 const prepared=await measured('prepare',onStage,async()=>{const media=bodyFor(group,files,ticket,{phase:'prepare'});const response=await transport('/api/comparisons',{method:'POST',...media,headers:{...media.headers,'x-ttb-demo-code':code},signal,cache:'no-store',redirect:'error'});return checkedPreparation((await readJson(response,signal)).prepared,group);});
 await verifyPhotoSet(prepared.photos,prepared.photoSetSha256);return {group,files,ticket,prepared};
}
export async function executeLiveGroup(ready:ReadyPhotoGroup,code:string,signal:AbortSignal,transport:typeof fetch=fetch,onStage?:StageListener):Promise<{result:UiComparisonRecord;comparisonId?:string;reviewAvailability?:string;elapsedMs?:number}>{
 validatePhotoGroup(ready.group,ready.files);const p=checkedPreparation(ready.prepared,ready.group);await verifyPhotoSet(p.photos,p.photoSetSha256);
 return measured('compare',onStage,async()=>{const media=bodyFor(ready.group,ready.files,ready.ticket,{phase:'execute',attemptId:p.attemptId,reservationId:p.reservationId,binding:p.binding});const response=await transport('/api/comparisons',{method:'POST',...media,headers:{...media.headers,'x-ttb-demo-code':code},signal,cache:'no-store',redirect:'error'});const payload=await readJson(response,signal);
 if(payload.result?.processing==='complete'){
  const record=photoRecord(payload.result);if(!record||record.groupId!==p.groupId||record.revision!==p.revision||record.photoSetSha256!==p.photoSetSha256||photoSetCanonical(record.photos)!==photoSetCanonical(p.photos)||JSON.stringify(record.application)!==JSON.stringify(ready.group.application)||![6,7].includes(record.comparison?.rulesRevision)||record.aggregationVersion!=='photo-set-aggregation-v2')throw Error('invalid-extraction');
  // Reject forged findings/provenance before rendering, not merely on Save.
  if(!checkedPhotoRecord(record)||!await verifyPhotoRecordDigest(record))throw Error('invalid-extraction');
  const ids=record.photos.map(p=>p.photoId);parsePhotoSetEvidence(record.photoEvidence,ids);
  for(const key of FIELD_KEYS){const field=record.comparison.fields?.[key];if(!field||!['match','mismatch','needs-review','not-applicable'].includes(field.status)||!Array.isArray(field.reasons)||field.reasons.some(reason=>typeof reason!=='string'))throw Error('invalid-extraction');}
  for(const key of EVIDENCE_PATHS){const source=record.provenance?.[key];if(!source||typeof source.conflict!=='boolean'||!Array.isArray(source.sourcePhotoIds)||source.sourcePhotoIds.some(id=>!ids.includes(id))||!Array.isArray(source.variants)||source.variants.some(v=>!['string','boolean'].includes(typeof v.value)||!Array.isArray(v.sourcePhotoIds)||v.sourcePhotoIds.some(id=>!ids.includes(id))))throw Error('invalid-extraction');}
  if(payload.comparisonId!==undefined&&(!uuid(payload.comparisonId)||payload.reviewAvailability!=='available'))throw Error('invalid-snapshot');
 }return payload;});
}
export function loadReviewPhotoEvidence(id:string,photo:PhotoDescriptor,variant:'original'|'normalized',code:string,signal:AbortSignal,transport:typeof fetch=fetch){const asset=variant==='original'?{sha256:photo.sourceSha256,bytes:photo.bytes,mime:photo.mime}:photo.normalized;return loadReviewEvidence(id,asset.sha256,code,signal,transport,{photoId:photo.photoId,variant,bytes:asset.bytes,mime:asset.mime});}
