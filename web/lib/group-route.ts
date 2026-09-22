import {photoGroupDeclarationSchema,groupOperationSchema} from './photo-contracts';
import {preparePhotoGroup} from './intake';
import {mediaSigningSecret} from './runtime-env';
import {signGroupPreparation,verifyGroupPreparation,groupAttemptIds} from './group-binding';
import {createGroupComparisonService} from './group-compare-service';
import type {GroupRouteInput} from './group-media';
import type {GroupExtractionProvider} from './extraction/group-provider';
import type {DemoSpendStore,DemoReviewStore} from './demo-store-contracts';
import {InputError} from './demo-security';
export async function localGroupInput(form:FormData):Promise<GroupRouteInput>{
 const rawGroup=form.get('group'),rawOperation=form.get('operation');
 if(typeof rawGroup!=='string'||typeof rawOperation!=='string'||Buffer.byteLength(rawGroup)+Buffer.byteLength(rawOperation)>65536)throw new InputError(400);
 const group=photoGroupDeclarationSchema.parse(JSON.parse(rawGroup)),operation=groupOperationSchema.parse(JSON.parse(rawOperation));
 if([...form.keys()].length!==group.photos.length+2||form.getAll('group').length!==1||form.getAll('operation').length!==1)throw new InputError(400);
 const files=[];
 for(const p of group.photos){
  const key=`photo:${p.photoId}`,file=form.get(key);
  if(form.getAll(key).length!==1||!(file instanceof File)||file.name!==p.filename||file.type!==p.mime||file.size!==p.bytes)throw new InputError(400);
  files.push({photoId:p.photoId,image:{filename:p.filename,mime:p.mime,bytes:Buffer.from(await file.arrayBuffer())}});
 }
 return {schemaVersion:2,group,operation,files};
}
export async function handleGroupComparison(input:GroupRouteInput,deps:{request:Request;env:Record<string,string|undefined>;store:DemoSpendStore;provider:GroupExtractionProvider;duplicateAttempt?:()=>boolean;openReviews?:()=>Promise<DemoReviewStore>;signal:AbortSignal;started:number}):Promise<Response>{
 const {request,env,store,provider,signal,started}=deps;
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(['x-ttb-batch-phase','x-ttb-batch-intent','x-ttb-batch-binding'].some(h=>request.headers.has(h)))throw new InputError(400);
 const secret=mediaSigningSecret(env),operation=groupOperationSchema.parse(input.operation);
 const assertFresh=()=>{signal.throwIfAborted();if(input.expiresAt!==undefined&&input.expiresAt<=Math.floor(Date.now()/1000))throw new InputError(400);};
 if(operation.phase==='prepare'){
  const prepared=await preparePhotoGroup(input,signal);assertFresh();return json({prepared:signGroupPreparation(prepared,secret)});
 }
 const identity=groupAttemptIds(input.group.groupId,input.group.revision);
 if(operation.attemptId!==identity.attemptId||operation.reservationId!==identity.reservationId)throw new InputError(400);
 if(await store.hasIntent(identity.attemptId,identity.reservationId))return json({processing:'failed',code:'attempt-already-recorded'},409);
 let comparisonId:string|undefined,reviewAvailability=deps.openReviews?'snapshot-unavailable':'reviews-disabled';
 const compare=createGroupComparisonService({provider,authorize:()=>true,deadlineAt:started+50000,preparedAttempt:prepared=>{
  assertFresh();if(!verifyGroupPreparation(prepared,secret,operation))throw Error('Preparation mismatch');return identity;
 },completed:deps.openReviews?async(record,prepared,snapshotSignal)=>{
  let reviews:DemoReviewStore|undefined;
  try{
   snapshotSignal.throwIfAborted();reviews=await deps.openReviews!();snapshotSignal.throwIfAborted();
   if(!reviews.snapshotGroup)throw Error('Group persistence unavailable');
   const id=await reviews.snapshotGroup(record,prepared.photos.map(p=>({photoId:p.descriptor.photoId,original:p.original,normalized:p.normalized.bytes})),snapshotSignal);
   if(!snapshotSignal.aborted&&!signal.aborted){comparisonId=id;reviewAvailability='available';}
  }finally{await reviews?.close();}
 }:undefined});
 const result=await compare(input,signal);signal.throwIfAborted();
 if(result.processing==='failed'&&deps.duplicateAttempt?.())return json({processing:'failed',code:'attempt-already-recorded'},409);
 return json({result,comparisonId,reviewAvailability,elapsedMs:Math.round(performance.now()-started)},result.processing==='complete'?200:result.code==='invalid-input'?400:502);
}
