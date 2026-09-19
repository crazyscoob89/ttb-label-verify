import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { accessInputSchema, serverTimeSchema, type WorkspaceAuth, type WorkspaceAuthorization } from './auth';
import { immutable } from './comparison-record';
import { sanitizeImage } from './intake';
import { evidenceSelectorSchema, imageDescriptorSchema, imageUploadSchema, privateObjectKey, readEvidence, sameActor, type EvidenceStore, type ImageDescriptor } from './repository';

export const MAX_SIGNED_URL_TTL_MS = 60_000;
/** Server-only managed private-object adapter. No implementation/fallback is supplied.
 * putImmutable MUST store only supplied sanitized bytes in a PRIVATE bucket, use
 * create-if-absent semantics, reject replacement, and verify exact bytes/version
 * before acknowledging. ObjectVersionId is the server application version UUID,
 * not an arbitrary provider ETag. Map it durably to a non-overwritable object.
 * signRead MUST sign only that exact private object/version, never a bucket/path
 * from request JSON; enforce the absolute expiry, no CDN/public cache fallback.
 * Adapter errors/results must not log tokens, image content or signed URLs.
 * An issued bearer URL can survive later revocation until expiry; immediate
 * redemption-time revocation requires an authenticated serving gateway instead.
 */
export interface PrivateObjectStore {
  putImmutable(input: Readonly<ImageDescriptor & { actor: WorkspaceAuthorization; bytes: Buffer; private: true; immutable: true; ifNoneMatch: '*' }>): Promise<unknown>;
  signRead(input: Readonly<{ actor: WorkspaceAuthorization; objectKey: string; objectVersionId: string; expiresAt: number }>): Promise<unknown>;
}
export type StorageResult<T> = { ok: true; value: T } | { ok: false; code: 'storage-unavailable' };
export type StoredImage = { workspaceId: string; createdBy: string; image: ImageDescriptor };
export type SignedEvidence = { evidenceId: string; url: string; expiresAt: number };
export type PrivateStorage = ReturnType<typeof createPrivateStorage>;
const putReceiptSchema = z.object({ objectKey: z.string(), objectVersionId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(), private: z.literal(true), immutable: z.literal(true) }).strict();
const signReceiptSchema = z.object({ objectKey: z.string(), objectVersionId: z.uuid(), url: z.string().min(1).max(8192), expiresAt: serverTimeSchema }).strict();

export function createPrivateStorage(dependencies?: { auth: WorkspaceAuth; objects: PrivateObjectStore; records: EvidenceStore; now?: () => number; signedOrigin: string }) {
  const failed = { ok: false, code: 'storage-unavailable' } as const;
  return Object.freeze({
    /** Buffer-only source API. Returns an internal descriptor, NOT durable evidence.
     * Repository create must bind/commit it before evidence-ID access can sign it.
     * Failures can leave a private orphan; never retry/overwrite or claim rollback.
     */
    async put(access: unknown, input: unknown): Promise<StorageResult<StoredImage>> {
      if (!dependencies || typeof window !== 'undefined') return failed;
      try {
        const request = accessInputSchema.parse(access);
        const payload = z.object({ image: imageUploadSchema }).strict().parse(input);
        const authorized = await dependencies.auth.authorize(request);
        if (!authorized.ok || authorized.value.role === 'viewer') return failed;
        const sanitized = await sanitizeImage(payload.image);
        const fresh = await dependencies.auth.authorize(request);
        if (!fresh.ok || !sameActor(authorized.value, fresh.value)) return failed;
        const version = { objectVersionId: randomUUID(), sha256: sanitized.sanitizedSha256, mime: sanitized.mime };
        const image = immutable(imageDescriptorSchema.parse({ ...version, objectKey: privateObjectKey(fresh.value.workspaceId, version), byteLength: sanitized.bytes.length, width: sanitized.width, height: sanitized.height }));
        const receipt = putReceiptSchema.parse(await dependencies.objects.putImmutable(Object.freeze({ ...image, actor: fresh.value, bytes: Buffer.from(sanitized.bytes), private: true, immutable: true, ifNoneMatch: '*' })));
        if (receipt.objectKey !== image.objectKey || receipt.objectVersionId !== image.objectVersionId || receipt.sha256 !== image.sha256 || receipt.byteLength !== image.byteLength) return failed;
        const final = await dependencies.auth.authorize(request);
        if (!final.ok || !sameActor(fresh.value, final.value)) return failed;
        return { ok: true, value: immutable({ workspaceId: final.value.workspaceId, createdBy: final.value.userId, image }) };
      } catch { return failed; }
    },
    async sign(access: unknown, input: unknown): Promise<StorageResult<SignedEvidence>> {
      if (!dependencies || typeof window !== 'undefined') return failed;
      try {
        const request = accessInputSchema.parse(access);
        const selector = evidenceSelectorSchema.parse(input);
        const origin = new URL(dependencies.signedOrigin);
        if (origin.protocol !== 'https:' || origin.origin !== dependencies.signedOrigin) return failed;
        const record = await readEvidence(dependencies, request, selector);
        if (!record.ok) return failed;
        const authorized = await dependencies.auth.authorize(request);
        if (!authorized.ok) return failed;
        const now = serverTimeSchema.parse((dependencies.now ?? Date.now)());
        const expiresAt = Math.min(now + MAX_SIGNED_URL_TTL_MS, record.value.expiresAt, authorized.value.sessionExpiresAt);
        if (expiresAt <= now) return failed;
        const receipt = signReceiptSchema.parse(await dependencies.objects.signRead(Object.freeze({ actor: authorized.value, objectKey: record.value.image.objectKey, objectVersionId: record.value.image.objectVersionId, expiresAt })));
        const url = new URL(receipt.url);
        if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password || url.hash || receipt.objectKey !== record.value.image.objectKey || receipt.objectVersionId !== record.value.image.objectVersionId || receipt.expiresAt !== expiresAt) return failed;
        // Re-read authority and immutable binding after asynchronous signing; withhold
        // URL if expiry/revocation/rebinding was observed before disclosure.
        const current = await readEvidence(dependencies, request, selector);
        const final = await dependencies.auth.authorize(request);
        if (!current.ok || !final.ok || !sameActor(authorized.value, final.value) || expiresAt > final.value.sessionExpiresAt || JSON.stringify(current.value) !== JSON.stringify(record.value) || expiresAt <= serverTimeSchema.parse((dependencies.now ?? Date.now)())) return failed;
        return { ok: true, value: Object.freeze({ evidenceId: selector.evidenceId, url: receipt.url, expiresAt }) };
      } catch { return failed; }
    },
  });
}
