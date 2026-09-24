import type { SpendStore } from './spend';
import type { CompletePhotoComparison } from './comparison-record';
import type { GroupPhotoBytes } from './group-assets';
import type { PhotoSelector } from './photo-contracts';
import type { CompleteComparison } from './comparison-record';
import type { SavedReceipt } from './saved-review-contract';
import type { ReviewStore } from './review-store';
export type MaybePromise<T> = T | Promise<T>;
export const DEMO_CEILING = 25_000_000;
export const DEMO_RESERVATION = 1_000_000;
export const REVIEW_LIMITS = { snapshots:200, totalBytes:128*1024*1024, recordBytes:256*1024, requestBytes:384*1024 } as const;
export class ReviewError extends Error { constructor(public status:number,public code:string){super(code);} }
export interface DemoSpendStore extends SpendStore {
 acquireWork(id:string):MaybePromise<void>;
 releaseWork(id:string):MaybePromise<void>;
 hasIntent(attemptId:string,reservationId:string):MaybePromise<boolean>;
 close():MaybePromise<void>;
}
export type EvidenceLink = {url:string;sha256:string;bytes:number;mime:string;expiresIn:number};
export interface DemoReviewStore {
 snapshot(record:CompleteComparison,image:Buffer,mime:string):MaybePromise<string>;
 snapshotGroup?(record:CompletePhotoComparison,photos:GroupPhotoBytes[],signal?:AbortSignal):MaybePromise<string>;
 save(input:unknown):MaybePromise<SavedReceipt>;
 list(offset?:number):MaybePromise<ReturnType<ReviewStore['list']>>;
 detail(id:string):MaybePromise<ReturnType<ReviewStore['detail']>>;
 evidence(id:string,selector?:PhotoSelector):MaybePromise<{bytes:Buffer;mime:string}>;
 evidenceLink?(id:string,selector?:PhotoSelector):Promise<EvidenceLink>;
 close():MaybePromise<void>;
}
export interface DemoStoreFactory {
 openSpend():MaybePromise<DemoSpendStore>;
 openReviews():MaybePromise<DemoReviewStore>;
}
export interface HostedEvidenceObjects {
 putEvidence(id:string,bytes:Buffer,mime:string,sha256:string,signal?:AbortSignal):Promise<{key:string}>;
 getEvidence(key:string,sha256:string,bytes:number,mime:string,signal?:AbortSignal):Promise<Buffer>;
 signEvidence(key:string,sha256:string,bytes:number,mime:string):Promise<EvidenceLink>;
}
