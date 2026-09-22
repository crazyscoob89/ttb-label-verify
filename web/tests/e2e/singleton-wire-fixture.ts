import type {Route} from '@playwright/test';
import {createHash} from 'node:crypto';
import type {CompleteComparison} from '../../lib/comparison-record';
import {EVIDENCE_PATHS,photoSetCanonical,type PhotoGroupDeclaration,type PhotoDescriptor,type PhotoProvenance} from '../../lib/photo-contracts';
import {FIELD_KEYS} from '../../lib/rules';
import type {CompletePhotoComparison} from '../../lib/live-photo-client';
// Strict one-photo mock wire adapter for historical v3 UI regression scenarios.
// No provider request, policy bypass, database or real scan is involved.
export async function singletonWire(route:Route,value:unknown,bytes:Buffer,onExecute:(record:CompletePhotoComparison)=>void,snapshot=true){
 const legacy=value as CompleteComparison;
 const request=route.request(),body=await new Response(new Uint8Array(request.postDataBuffer()!),{headers:{'content-type':request.headers()['content-type']}}).formData();
 const group=JSON.parse(String(body.get('group'))) as PhotoGroupDeclaration,operation=JSON.parse(String(body.get('operation')));
 if(group.photos.length!==1)throw Error('This regression fixture expects one photo');
 const photoId=group.photos[0].photoId,sha256=createHash('sha256').update(bytes).digest('hex');
 const photos:PhotoDescriptor[]=[{...group.photos[0],sourceSha256:sha256,normalized:{sha256,bytes:bytes.length,mime:'image/png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}}];
 const provenance={} as PhotoProvenance;
 for(const path of EVIDENCE_PATHS){const [key,leaf]=path.split('.'),field=legacy.evidence[key as keyof typeof legacy.evidence],value=leaf?(field as unknown as Record<string,unknown>)[leaf]:field;const text=value&&typeof value==='object'&&'text' in value?value.text:value;
  provenance[path]={sourcePhotoIds:text==null?[]:[photoId],conflict:false,variants:typeof text==='string'||typeof text==='boolean'?[{value:text,sourcePhotoIds:[photoId]}]:[]};}
 const fields=structuredClone(legacy.comparison.fields);for(const key of FIELD_KEYS){const field=fields[key],sourcePhotoIds=EVIDENCE_PATHS.some(path=>(path===key||path.startsWith(key+'.'))&&provenance[path].sourcePhotoIds.length)?[photoId]:[];Object.assign(field,{sourcePhotoIds,conflict:false,reasons:[...field.reasons,...(field.status==='mismatch'?[`${key}: proven defect in photo ${photoId}.`]:[])]});}
 const photoSetSha256=createHash('sha256').update(photoSetCanonical(photos)).digest('hex'),attemptId='00000000-0000-4000-8000-000000000071',reservationId='00000000-0000-4000-8000-000000000072';
 const record={...legacy,recordVersion:2,groupId:group.groupId,revision:group.revision,photos,photoSetSha256,photoEvidence:{schemaVersion:2,photos:[{photoId,evidence:legacy.evidence}]},aggregationVersion:'photo-set-aggregation-v1',provenance,extraction:{schemaVersion:2,promptVersion:'photo-set-observations-v2',model:'anthropic/claude-haiku-4.5',requestId:attemptId,attemptId,reservationId},comparison:{...legacy.comparison,rulesRevision:4,fields}} as CompletePhotoComparison;
 if(operation.phase==='prepare')return route.fulfill({json:{prepared:{schemaVersion:2,groupId:group.groupId,revision:group.revision,photos,photoSetSha256,attemptId,reservationId,binding:photoSetSha256+'.'+'a'.repeat(64)}}});
 onExecute(record);return route.fulfill({json:{result:record,...(snapshot?{comparisonId:'00000000-0000-4000-8000-000000000011',reviewAvailability:'available'}:{reviewAvailability:'reviews-disabled'}),elapsedMs:23}});
}
