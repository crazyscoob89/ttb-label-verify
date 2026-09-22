import {runtimeAccess} from './access';
import {preparePhotoGroup,snapshotPhotoGroup,type GroupComparisonInput,type PreparedPhotoGroup} from './intake';
import {immutable,type ComparisonRecord,type CompletePhotoComparison,type FailureCode} from './comparison-record';
import {finalizePhotoComparison} from './photo-record';
import {groupAttemptIds} from './group-binding';
import type {GroupExtractionProvider} from './extraction/group-provider';
export function createGroupComparisonService(options:{provider:GroupExtractionProvider;authorize?:()=>boolean|Promise<boolean>;deadlineAt?:number;preparedAttempt?:(group:PreparedPhotoGroup)=>{attemptId:string;reservationId:string};completed?:(record:CompletePhotoComparison,group:PreparedPhotoGroup,signal:AbortSignal)=>Promise<void>}){
 return async(input:GroupComparisonInput,signal?:AbortSignal):Promise<ComparisonRecord>=>{
  const fail=(code:FailureCode):ComparisonRecord=>({processing:'failed',code});
  let snapshot:GroupComparisonInput;try{snapshot=snapshotPhotoGroup(input);}catch{return fail('invalid-input');}
  try{if(await (options.authorize??runtimeAccess)()!==true)return fail('access-denied');}catch{return fail('access-denied');}
  let prepared:PreparedPhotoGroup,identity:{attemptId:string;reservationId:string};
  try{signal?.throwIfAborted();prepared=await preparePhotoGroup(snapshot,signal);identity=options.preparedAttempt?.(prepared)??groupAttemptIds(prepared.group.groupId,prepared.group.revision);}catch{return fail(signal?.aborted?'cancelled':'invalid-input');}
  try{
   signal?.throwIfAborted();const result=await options.provider.extractGroup({schemaVersion:2,photoSetSha256:prepared.photoSetSha256,photos:prepared.photos.map(p=>({descriptor:p.descriptor,image:p.normalized.bytes})),...identity},signal);
   if(result.processing==='failed')return fail(result.code==='unconfigured'?'unconfigured':'provider-failed');
   if(result.metadata.source==='openrouter'&&(result.metadata.attemptId!==identity.attemptId||result.metadata.reservationId!==identity.reservationId))return fail('invalid-extraction');
   const record=immutable(finalizePhotoComparison(prepared.group.application,prepared.group.groupId,prepared.group.revision,prepared.photos.map(p=>p.descriptor),prepared.photoSetSha256,result));
   const snapshotWindow=Math.max(0,Math.min(10000,(options.deadlineAt??Infinity)-performance.now()-25));
   if(!signal?.aborted&&options.completed&&snapshotWindow>0){
    const controller=new AbortController();const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([options.completed(record,prepared,combined),new Promise<void>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve();},snapshotWindow);})]);}catch{/* Paid result stays UNSAVED. */}finally{clearTimeout(timer);controller.abort();}
   }
   return record;
  }catch{return fail(signal?.aborted?'cancelled':'invalid-extraction');}
 };
}
