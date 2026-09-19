import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { accessInputSchema, serverTimeSchema, workspaceIdSchema, type WorkspaceAuth, type WorkspaceAuthorization } from './auth';
import { applicationSchema, filenameSchema, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from './contracts';
import { immutable } from './comparison-record';
import type { PrivateStorage } from './storage';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const imageDescriptorSchema = z.object({
  objectKey: z.string().min(1).max(512), objectVersionId: z.uuid(), sha256: hashSchema,
  mime: z.enum(['image/png', 'image/jpeg']), byteLength: z.number().int().positive().max(MAX_IMAGE_BYTES),
  width: z.number().int().positive().max(MAX_IMAGE_PIXELS), height: z.number().int().positive().max(MAX_IMAGE_PIXELS),
}).strict().refine(value => value.width * value.height <= MAX_IMAGE_PIXELS);
export type ImageDescriptor = z.infer<typeof imageDescriptorSchema>;
export function privateObjectKey(workspaceId: string, image: Pick<ImageDescriptor, 'objectVersionId' | 'sha256' | 'mime'>): string {
  return `private/${workspaceIdSchema.parse(workspaceId)}/${z.uuid().parse(image.objectVersionId)}/${hashSchema.parse(image.sha256)}.${z.enum(['image/png', 'image/jpeg']).parse(image.mime) === 'image/png' ? 'png' : 'jpg'}`;
}
export const evidenceRecordSchema = z.object({
  evidenceId: z.uuid(), workspaceId: workspaceIdSchema, createdBy: workspaceIdSchema,
  createdAt: serverTimeSchema, expiresAt: serverTimeSchema, revokedAt: serverTimeSchema.nullable(),
  application: applicationSchema, image: imageDescriptorSchema,
}).strict().refine(value => value.expiresAt > value.createdAt && value.image.objectKey === privateObjectKey(value.workspaceId, value.image));
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export const evidenceSelectorSchema = z.object({ evidenceId: z.uuid() }).strict();
export const imageUploadSchema = z.object({ filename: filenameSchema, mime: z.enum(['image/png', 'image/jpeg']), bytes: z.custom<Buffer>(Buffer.isBuffer).refine(value => value.length > 0 && value.length <= MAX_IMAGE_BYTES).transform(value => Buffer.from(value)) }).strict();

/** REQUIRED durable adapter, deliberately no memory/runtime fallback.
 * Both operations MUST enforce active membership, role, tenant, session validity,
 * expiry and revocation against authoritative state at their transaction boundary.
 * insertImmutable atomically commits or rejects, with unique evidence/object-version
 * identities and immutable workspace/application-ID/version -> application snapshot
 * bindings. No overwrite/upsert/rebinding, even on retries; timeout is ambiguous.
 * readActive returns one exact authorized record or null, never a caller object path.
 * Enforce RLS/ACL and lock ordering with revocation; snapshots here are NOT DB locks.
 * Return the exact committed row, NOT a fabricated success acknowledgement.
 */
export interface EvidenceStore {
  insertImmutable(actor: WorkspaceAuthorization, record: Readonly<EvidenceRecord>): Promise<unknown>;
  readActive(actor: WorkspaceAuthorization, evidenceId: string): Promise<unknown>;
}
export type EvidenceResult = { ok: true; value: EvidenceRecord } | { ok: false; code: 'evidence-unavailable' };
export function sameActor(a: WorkspaceAuthorization, b: WorkspaceAuthorization): boolean {
  return a.sessionId === b.sessionId && a.userId === b.userId && a.workspaceId === b.workspaceId && a.role === b.role;
}

/** Server-only read boundary, reused before and after signing. */
export async function readEvidence(dependencies: { auth: WorkspaceAuth; records: EvidenceStore; now?: () => number }, access: unknown, input: unknown): Promise<EvidenceResult> {
  const failed = { ok: false, code: 'evidence-unavailable' } as const;
  if (typeof window !== 'undefined') return failed;
  try {
    const request = accessInputSchema.parse(access);
    const selector = evidenceSelectorSchema.parse(input);
    const authorized = await dependencies.auth.authorize(request);
    if (!authorized.ok) return failed;
    const record = evidenceRecordSchema.parse(await dependencies.records.readActive(authorized.value, selector.evidenceId));
    const fresh = await dependencies.auth.authorize(request);
    const now = serverTimeSchema.parse((dependencies.now ?? Date.now)());
    if (!fresh.ok || !sameActor(authorized.value, fresh.value) || record.evidenceId !== selector.evidenceId || record.workspaceId !== fresh.value.workspaceId || record.revokedAt !== null || record.createdAt > now || record.expiresAt <= now) return failed;
    return { ok: true, value: immutable(record) };
  } catch { return failed; }
}

export function createEvidenceRepository(dependencies?: { auth: WorkspaceAuth; records: EvidenceStore; storage: PrivateStorage; now?: () => number; retentionMs: number }) {
  const failed = { ok: false, code: 'evidence-unavailable' } as const;
  return Object.freeze({
    async create(access: unknown, input: unknown): Promise<EvidenceResult> {
      if (!dependencies || typeof window !== 'undefined') return failed;
      try {
        // Parse/snapshot request, nested application and bytes before first await.
        const request = accessInputSchema.parse(access);
        const payload = z.object({ application: applicationSchema, image: imageUploadSchema }).strict().parse(input);
        const retentionMs = z.number().int().positive().max(30 * 24 * 60 * 60 * 1000).parse(dependencies.retentionMs);
        const authorized = await dependencies.auth.authorize(request);
        if (!authorized.ok || authorized.value.role === 'viewer') return failed;
        const stored = await dependencies.storage.put(request, { image: payload.image });
        if (!stored.ok || stored.value.workspaceId !== authorized.value.workspaceId || stored.value.createdBy !== authorized.value.userId) return failed;
        const fresh = await dependencies.auth.authorize(request);
        if (!fresh.ok || !sameActor(authorized.value, fresh.value)) return failed;
        const createdAt = serverTimeSchema.parse((dependencies.now ?? Date.now)());
        const record = immutable(evidenceRecordSchema.parse({ evidenceId: randomUUID(), workspaceId: fresh.value.workspaceId, createdBy: fresh.value.userId, createdAt, expiresAt: createdAt + retentionMs, revokedAt: null, application: payload.application, image: stored.value.image }));
        const committed = evidenceRecordSchema.parse(await dependencies.records.insertImmutable(fresh.value, record));
        // Schema parsing canonicalizes field order on both sides, including nested fields.
        if (JSON.stringify(committed) !== JSON.stringify(record)) return failed;
        const final = await dependencies.auth.authorize(request);
        if (!final.ok || !sameActor(fresh.value, final.value) || record.expiresAt <= serverTimeSchema.parse((dependencies.now ?? Date.now)())) return failed;
        return { ok: true, value: immutable(committed) };
      } catch { return failed; }
    },
    async read(access: unknown, input: unknown): Promise<EvidenceResult> {
      if (!dependencies) return failed;
      return readEvidence(dependencies, access, input);
    },
  });
}
