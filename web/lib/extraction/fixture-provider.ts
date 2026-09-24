import { RULES_VERSION } from '../rules';
import {snapshotGroupRequest,type GroupExtractionProvider} from './group-provider';
import {photoSetEvidenceSchema,parsePhotoSetEvidence,GROUP_PROMPT_VERSION} from '../photo-contracts';
import { extractionEvidenceSchema, parseExtractionEvidence } from './schema';
import { PROMPT_VERSION, snapshotRequest, type ExtractionProvider } from './provider';

/** Explicit deterministic OFFLINE fixture; no OCR, inference, transport or spend.
 * Not selected automatically or used as fallback by the real adapter/UI.
 */
export function createFixtureProvider(input: unknown): ExtractionProvider {
  const fixture = extractionEvidenceSchema.safeParse(input);
  return {
    async extract(request) {
      if (!fixture.success) return { processing: 'failed', code: 'invalid-fixture' };
      try {
        const snapshot = snapshotRequest(request);
        return {
          processing: 'complete', evidence: parseExtractionEvidence(fixture.data),
          metadata: { source: 'fixture', model: 'offline-fixture', schemaVersion: 1, rulesVersion: RULES_VERSION, promptVersion: PROMPT_VERSION, imageSha256: snapshot.imageSha256, requestId: snapshot.requestId },
        };
      } catch { return { processing: 'failed', code: 'invalid-request' }; }
    },
  };
}

/** Explicit source-covered joint fixture. Never selected as live fallback. */
export function createFixtureGroupProvider(input:unknown):GroupExtractionProvider {
 const fixture=photoSetEvidenceSchema.safeParse(input);
 return {async extractGroup(request,signal){
  try{
   signal?.throwIfAborted();if(!fixture.success)return {processing:'failed',code:'invalid-request'};
   const snapshot=snapshotGroupRequest(request),evidence=parsePhotoSetEvidence(fixture.data,snapshot.photos.map(p=>p.descriptor.photoId));
   return {processing:'complete',evidence,metadata:{source:'fixture',model:'offline-fixture',schemaVersion:2,rulesVersion:RULES_VERSION,promptVersion:GROUP_PROMPT_VERSION,photoSetSha256:snapshot.photoSetSha256,photos:snapshot.photos.map(p=>({photoId:p.descriptor.photoId,imageSha256:p.descriptor.normalized.sha256})),requestId:snapshot.requestId}};
  }catch{return {processing:'failed',code:'invalid-request'};}
 }};
}
