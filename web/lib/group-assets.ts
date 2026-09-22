import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {checkedRecord} from './review-policy';
import {photoSetHash,groupAttemptIds} from './group-binding';
import {photoIdSchema,type PhotoSelector} from './photo-contracts';
import type {CompleteComparison,CompletePhotoComparison} from './comparison-record';
import {ReviewError} from './demo-store-contracts';
export type GroupPhotoBytes={photoId:string;original:Buffer;normalized:Buffer};
export type SnapshotAsset=PhotoSelector&{key:string;sha256:string;bytes:number;mime:'image/png'|'image/jpeg'};
export const photoSelectorSchema=z.object({photoId:photoIdSchema,variant:z.enum(['original','normalized'])}).strict();
export function checkedServerRecord(value:unknown):CompleteComparison {
 // Validate a synchronous plain-data snapshot, but retain its exact serialization
 // order: full-record human bindings must not be rewritten during save/reopen.
 const snapshot:unknown=JSON.parse(JSON.stringify(value));
 const record=checkedRecord(snapshot);
 if(!record||('recordVersion' in record && photoSetHash(record.photos)!==record.photoSetSha256))throw new ReviewError(400,'invalid-snapshot');
 if('recordVersion' in record&&record.extraction.model==='anthropic/claude-haiku-4.5'){
  const ids=groupAttemptIds(record.groupId,record.revision);
  if(ids.attemptId!==record.extraction.attemptId||ids.reservationId!==record.extraction.reservationId)throw new ReviewError(400,'invalid-snapshot');
 }
 return snapshot as CompleteComparison;
}
export function assetExpected(record:CompletePhotoComparison,selector:PhotoSelector){
 photoSelectorSchema.parse(selector);const p=record.photos.find(p=>p.photoId===selector.photoId);
 if(!p)throw new ReviewError(404,'review-not-found');
 return selector.variant==='original'?{sha256:p.sourceSha256,bytes:p.bytes,mime:p.mime}:p.normalized;
}
/** Validate and copy ALL buffers synchronously before a quota/Storage await. */
export function prepareGroupAssets(value:CompletePhotoComparison,photos:GroupPhotoBytes[],id=randomUUID()) {
 const record=checkedServerRecord(value);if(!('recordVersion' in record))throw new ReviewError(400,'invalid-snapshot');
 if(photos.length!==record.photos.length||new Set(photos.map(p=>p.photoId)).size!==photos.length)throw new ReviewError(400,'invalid-snapshot');
 const assets:SnapshotAsset[]=[],buffers:Buffer[]=[];
 for(const [i,p] of record.photos.entries()){
  const photo=photos.find(f=>f.photoId===p.photoId);if(!photo)throw new ReviewError(400,'invalid-snapshot');
  for(const variant of ['original','normalized'] as const){
   const expected=assetExpected(record,{photoId:p.photoId,variant}),bytes=photo[variant];
   if(!Buffer.isBuffer(bytes)||bytes.buffer instanceof SharedArrayBuffer||bytes.length!==expected.bytes)throw new ReviewError(400,'invalid-snapshot');
   const buffer=Buffer.from(bytes);if(createHash('sha256').update(buffer).digest('hex')!==expected.sha256)throw new ReviewError(400,'invalid-snapshot');
   assets.push({photoId:p.photoId,variant,key:`snapshots/${i===0&&variant==='normalized'?id:randomUUID()}`,sha256:expected.sha256,bytes:expected.bytes,mime:expected.mime});buffers.push(buffer);
  }
 }
 return {id,record,assets,buffers,recordText:JSON.stringify(record)};
}
export function validateAssetManifest(record:CompletePhotoComparison,id:string,value:unknown):SnapshotAsset[]{
 const assets=z.array(z.object({photoId:photoIdSchema,variant:z.enum(['original','normalized']),key:z.string().regex(/^snapshots\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),sha256:z.string(),bytes:z.number(),mime:z.enum(['image/png','image/jpeg'])}).strict()).parse(value);
 if(assets.length!==record.photos.length*2||new Set(assets.map(a=>a.key)).size!==assets.length||new Set(assets.map(a=>a.photoId+':'+a.variant)).size!==assets.length)throw Error('Invalid asset manifest');
 for(const a of assets){const e=assetExpected(record,{photoId:a.photoId,variant:a.variant});if(e.bytes!==a.bytes||e.sha256!==a.sha256||e.mime!==a.mime)throw Error('Asset mismatch');}
 if(assets.find(a=>a.photoId===record.photos[0].photoId&&a.variant==='normalized')?.key!==`snapshots/${id}`)throw Error('Invalid primary anchor');
 return assets;
}
