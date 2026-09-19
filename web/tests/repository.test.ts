import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceAuth } from '../lib/auth';
import { createEvidenceRepository, type EvidenceRecord, type EvidenceStore } from '../lib/repository';
import { createPrivateStorage, type PrivateObjectStore } from '../lib/storage';

const now = 1_800_000_000_000;
const access = { sessionToken: 'opaque-session', workspaceId: 'workspace-a' };
const application = { applicationId: 'app-a', applicationVersion: 'v1', brand: 'Brand', classType: 'Wine', abv: 12, netContents: '750 mL', producerName: 'Producer', producerAddress: 'Address', commodity: 'wine', imported: false, origin: { kind: 'domestic', country: 'US' } };
const failed = { ok: false, code: 'evidence-unavailable' };
async function setup() {
  let record: EvidenceRecord | null = null;
  const membership = { userId: 'user-a', workspaceId: 'workspace-a', role: 'reviewer', active: true };
  const auth = createWorkspaceAuth({ sessions: { verifySession: async () => ({ sessionId: 'session-a', userId: 'user-a', expiresAt: now + 120_000, revoked: false }) }, memberships: { findMembership: async () => ({ ...membership }) }, now: () => now });
  const insert = vi.fn<EvidenceStore['insertImmutable']>(async (_actor, value) => { if (record) throw Error('conflict'); record = structuredClone(value); return structuredClone(record); });
  const read = vi.fn<EvidenceStore['readActive']>(async () => record && structuredClone(record));
  const records = { insertImmutable: insert, readActive: read };
  const put = vi.fn<PrivateObjectStore['putImmutable']>(async value => ({ objectKey: value.objectKey, objectVersionId: value.objectVersionId, sha256: createHash('sha256').update(value.bytes).digest('hex'), byteLength: value.bytes.length, private: true, immutable: true }));
  const sign = vi.fn<PrivateObjectStore['signRead']>(async () => null);
  const storage = createPrivateStorage({ auth, objects: { putImmutable: put, signRead: sign }, records, now: () => now, signedOrigin: 'https://private.example.test' });
  const repo = createEvidenceRepository({ auth, records, storage, now: () => now, retentionMs: 3_600_000 });
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().withMetadata().toBuffer();
  return { repo, put, insert, read, membership, input: { application: structuredClone(application), image: { filename: 'label.png', mime: 'image/png', bytes } }, getRecord: () => record, setRecord: (value: EvidenceRecord) => { record = value; } };
}

describe('immutable evidence repository source foundation', () => {
  it('binds a server-owned image version to a frozen application, identity and server time', async () => {
    const s = await setup(); const result = await s.repo.create(access, s.input);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value).toMatchObject({ workspaceId: 'workspace-a', createdBy: 'user-a', createdAt: now, expiresAt: now + 3_600_000, revokedAt: null, application });
    expect(result.value.evidenceId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.value.image.sha256).toBe(createHash('sha256').update(s.put.mock.calls[0][0].bytes).digest('hex'));
    expect(Object.isFrozen(result.value.application.origin)).toBe(true);
    expect((await s.repo.read(access, { evidenceId: result.value.evidenceId }))).toEqual(result);
  });
  it('snapshots mutable application and bytes before any asynchronous authorization', async () => {
    const s = await setup(); const pending = s.repo.create(access, s.input);
    s.input.application.brand = 'FORGED LATER'; s.input.application.origin.country = 'CA'; s.input.image.bytes.fill(0);
    const result = await pending; expect(result.ok).toBe(true); if (result.ok) expect(result.value.application).toEqual(application);
  });
  it.each([null, { ...access, userId: 'admin' }, { ...access, workspaceId: 'workspace-b' }])('denies anonymous/forged/cross-workspace create %j', async credentials => {
    const s = await setup(); expect(await s.repo.create(credentials, s.input)).toEqual(failed); expect(s.put).not.toHaveBeenCalled(); expect(s.insert).not.toHaveBeenCalled();
  });
  it.each(['actor', 'workspaceId', 'createdAt', 'expiresAt', 'evidenceId', 'objectKey'])('rejects caller-owned %s', async field => {
    const s = await setup(); expect(await s.repo.create(access, { ...s.input, [field]: 'forged' })).toEqual(failed); expect(s.put).not.toHaveBeenCalled();
  });
  it('denies revoked membership and viewer writes', async () => {
    const s = await setup(); s.membership.active = false; expect(await s.repo.create(access, s.input)).toEqual(failed);
    s.membership.active = true; s.membership.role = 'viewer'; expect(await s.repo.create(access, s.input)).toEqual(failed); expect(s.put).not.toHaveBeenCalled();
  });
  it('rechecks membership after object storage before committing', async () => {
    const s = await setup(); s.put.mockImplementation(async value => { s.membership.active = false; return { objectKey: value.objectKey, objectVersionId: value.objectVersionId, sha256: createHash('sha256').update(value.bytes).digest('hex'), byteLength: value.bytes.length, private: true, immutable: true }; });
    expect(await s.repo.create(access, s.input)).toEqual(failed); expect(s.insert).not.toHaveBeenCalled();
  });
  it.each(['throw', 'malformed', 'binding-drift'])('does not acknowledge %s persistence', async mode => {
    const s = await setup(); s.insert.mockImplementation(async (_actor, record) => { if (mode === 'throw') throw Error('sensitive DB payload'); return mode === 'malformed' ? { ok: true } : { ...record, application: { ...record.application, brand: 'changed' } }; });
    expect(await s.repo.create(access, s.input)).toEqual(failed);
  });
  it('storage failure never produces an evidence receipt', async () => {
    const s = await setup(); s.put.mockRejectedValue(new Error('sensitive storage payload')); expect(await s.repo.create(access, s.input)).toEqual(failed); expect(s.insert).not.toHaveBeenCalled();
  });
  it('denies expired, revoked, mismatched-ID and cross-workspace records', async () => {
    const s = await setup(); const created = await s.repo.create(access, s.input); expect(created.ok).toBe(true); if (!created.ok) return;
    for (const change of [{ expiresAt: now }, { revokedAt: now }, { workspaceId: 'workspace-b' }, { evidenceId: '11111111-1111-4111-8111-111111111111' }]) {
      s.setRecord({ ...created.value, ...change }); expect(await s.repo.read(access, { evidenceId: created.value.evidenceId })).toEqual(failed);
    }
    s.setRecord(created.value); s.membership.active = false; expect(await s.repo.read(access, { evidenceId: created.value.evidenceId })).toEqual(failed);
  });
  it('cannot replace an immutable binding through create', async () => {
    const s = await setup(); const first = await s.repo.create(access, s.input); expect(first.ok).toBe(true);
    s.input.application.brand = 'replacement'; expect(await s.repo.create(access, s.input)).toEqual(failed); expect(s.getRecord()?.application.brand).toBe('Brand');
  });
  it('has no implicit durable or memory fallback', async () => { expect(await createEvidenceRepository().create(access, {})).toEqual(failed); expect(await createEvidenceRepository().read(access, {})).toEqual(failed); });
});
