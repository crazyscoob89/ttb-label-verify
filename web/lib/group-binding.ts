import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { parseApplication } from './contracts';
import { photoSetCanonical, type PhotoDescriptor, type PreparedGroup } from './photo-contracts';
import type { PreparedPhotoGroup } from './intake';
export const photoSetHash=(photos:PhotoDescriptor[])=>createHash('sha256').update(photoSetCanonical(photos)).digest('hex');
function uuidV5(name:string):string {
 const namespace=Buffer.from('6ba7b8109dad11d180b400c04fd430c8','hex');
 const hash=createHash('sha1').update(namespace).update(name).digest().subarray(0,16);
 hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
 const h=hash.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function groupAttemptIds(groupId:string,revision:number){return {attemptId:uuidV5(`ttb:group-attempt:v2:${groupId}:${revision}`),reservationId:uuidV5(`ttb:group-reservation:v2:${groupId}:${revision}`)};}
export function signGroupPreparation(prepared:PreparedPhotoGroup,secret:string):PreparedGroup {
 const {group,photoSetSha256}=prepared;const ids=groupAttemptIds(group.groupId,group.revision);
 const canonical=JSON.stringify(['ttb-group-preparation-v2',group.groupId,group.revision,parseApplication(group.application),photoSetSha256,ids.attemptId,ids.reservationId]);
 const binding=`${photoSetSha256}.${createHmac('sha256',secret).update(canonical).digest('hex')}`;
 return {schemaVersion:2,groupId:group.groupId,revision:group.revision,photoSetSha256,photos:prepared.photos.map(p=>p.descriptor),...ids,binding};
}
export function verifyGroupPreparation(prepared:PreparedPhotoGroup,secret:string,input:{binding:string;attemptId:string;reservationId:string}):boolean {
 const expected=signGroupPreparation(prepared,secret);
 return input.attemptId===expected.attemptId&&input.reservationId===expected.reservationId&&input.binding.length===expected.binding.length&&timingSafeEqual(Buffer.from(input.binding),Buffer.from(expected.binding));
}
