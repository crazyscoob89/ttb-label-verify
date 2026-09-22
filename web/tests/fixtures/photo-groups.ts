import {randomUUID} from 'node:crypto';
import {photoGroupDeclarationSchema,type PhotoSetEvidence} from '../../lib/photo-contracts';
import {parseExtractionEvidence} from '../../lib/extraction/schema';
import {finalizePhotoComparison} from '../../lib/photo-record';
import {preparePhotoGroup} from '../../lib/intake';
import {image,application} from './synthetic';
import fixtures from './comparisons.json';
export async function groupInput(count=2){
 const files=await Promise.all(Array.from({length:count},async(_,i)=>({photoId:randomUUID(),image:{filename:`photo${i}.png`,mime:'image/png' as const,bytes:await image('png',4+i,3)}})));
 const group=photoGroupDeclarationSchema.parse({schemaVersion:2,groupId:randomUUID(),revision:1,application,photos:files.map(f=>({photoId:f.photoId,role:'other',filename:f.image.filename,mime:f.image.mime,bytes:f.image.bytes.length}))});
 return {schemaVersion:2 as const,group,files};
}
export const evidence=()=>parseExtractionEvidence(fixtures.evidence);
export function photoEvidence(ids:string[]):PhotoSetEvidence{return {schemaVersion:2,photos:ids.map(photoId=>({photoId,evidence:evidence()}))};}
export async function groupFixture(count=2){
 const input=await groupInput(count),prepared=await preparePhotoGroup(input);
 const extraction={processing:'complete',evidence:photoEvidence(prepared.photos.map(p=>p.descriptor.photoId)),metadata:{source:'fixture',model:'offline-fixture',schemaVersion:2,promptVersion:'photo-set-observations-v2',rulesVersion:'prototype-seven-fields-v1',photoSetSha256:prepared.photoSetSha256,photos:prepared.photos.map(p=>({photoId:p.descriptor.photoId,imageSha256:p.descriptor.normalized.sha256})),requestId:randomUUID()}};
 const record=finalizePhotoComparison(prepared.group.application,prepared.group.groupId,prepared.group.revision,prepared.photos.map(p=>p.descriptor),prepared.photoSetSha256,extraction);
 const photos=prepared.photos.map(p=>({photoId:p.descriptor.photoId,original:p.original,normalized:p.normalized.bytes}));
 return {input,prepared,extraction,record,photos};
}
