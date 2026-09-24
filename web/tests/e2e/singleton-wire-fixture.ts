import type {Route} from '@playwright/test';
import {createHash} from 'node:crypto';
import type {CompleteComparison} from '../../lib/comparison-record';
import {photoSetCanonical,type PhotoGroupDeclaration,type PhotoDescriptor} from '../../lib/photo-contracts';
import {finalizePhotoComparison,type CompletePhotoComparison} from '../../lib/photo-record';
// Strict one-photo mock wire adapter; synthetic only, using real finalization.
export async function singletonWire(route:Route,value:unknown,bytes:Buffer,onExecute:(record:CompletePhotoComparison)=>void,snapshot=true){
 const legacy=value as CompleteComparison;
 const request=route.request(),body=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'content-type':request.headers()['content-type']}}).formData();
 const group=JSON.parse(String(body.get('group'))) as PhotoGroupDeclaration,operation=JSON.parse(String(body.get('operation')));
 if(group.photos.length!==1)throw Error('This regression fixture expects one photo');
 const photoId=group.photos[0].photoId,sha256=createHash('sha256').update(bytes).digest('hex');
 const photos:PhotoDescriptor[]=[{...group.photos[0],sourceSha256:sha256,normalized:{sha256,bytes:bytes.length,mime:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}}];
 const photoSetSha256=createHash('sha256').update(photoSetCanonical(photos)).digest('hex'),attemptId='00000000-0000-4000-8000-000000000071',reservationId='00000000-0000-4000-8000-000000000072';
 const record=finalizePhotoComparison(group.application,group.groupId,group.revision,photos,photoSetSha256,{processing:'complete',evidence:{schemaVersion:2,photos:[{photoId,evidence:legacy.evidence}]},metadata:{source:'openrouter',schemaVersion:2,rulesVersion:'prototype-seven-fields-v1',promptVersion:'photo-set-observations-v2',model:'anthropic/claude-haiku-4.5',requestId:attemptId,attemptId,reservationId,photoSetSha256,photos:[{photoId,imageSha256:sha256}]}});
 if(operation.phase==='prepare')return route.fulfill({json:{prepared:{schemaVersion:2,groupId:group.groupId,revision:group.revision,photos,photoSetSha256,attemptId,reservationId,binding:photoSetSha256+'.'+'a'.repeat(64)}}});
 onExecute(record);return route.fulfill({json:{result:record,...(snapshot?{comparisonId:'00000000-0000-4000-8000-000000000011',reviewAvailability:'available'}:{reviewAvailability:'reviews-disabled'}),elapsedMs:23}});
}
