import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceAuth } from '../lib/auth';
import { createPrivateStorage, type PrivateObjectStore } from '../lib/storage';
import type { EvidenceRecord, EvidenceStore } from '../lib/repository';
const now = 1_800_000_000_000;
const access = { sessionToken: 'opaque-session', workspaceId: 'workspace-a' };
const evidenceId = '11111111-1111-4111-8111-111111111111';
const objectVersionId = '22222222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);
const objectKey = `private/workspace-a/${objectVersionId}/${sha256}.png`;
const failed = { ok: false, code: 'storage-unavailable' };
function setup() {
  let time = now;
  const membership = { userId: 'user-a', workspaceId: 'workspace-a', role: 'reviewer', active: true };
  const session = { sessionId: 'session-a', userId: 'user-a', expiresAt: now + 120_000, revoked: false };
  const auth = createWorkspaceAuth({ sessions: { verifySession: async () => ({ ...session }) }, memberships: { findMembership: async () => ({ ...membership }) }, now: () => time });
  const record: EvidenceRecord = { evidenceId, workspaceId: 'workspace-a', createdBy: 'user-a', createdAt: now, expiresAt: now + 90_000, revokedAt: null, application: { applicationId: 'app-a', applicationVersion: 'v1', brand: 'Brand', classType: 'Wine', abv: 12, netContents: '750 mL', producerName: 'Producer', producerAddress: 'Address', commodity: 'wine', imported: false, origin: { kind: 'domestic', country: 'US' } }, image: { objectKey, objectVersionId, sha256, mime: 'image/png', byteLength: 100, width: 2, height: 2 } };
  const read = vi.fn<EvidenceStore['readActive']>(async () => structuredClone(record));
  const records = { readActive: read, insertImmutable: vi.fn<EvidenceStore['insertImmutable']>() };
  const put = vi.fn<PrivateObjectStore['putImmutable']>(async value => ({ objectKey: value.objectKey, objectVersionId: value.objectVersionId, sha256: createHash('sha256').update(value.bytes).digest('hex'), byteLength: value.bytes.length, private: true, immutable: true }));
  const sign = vi.fn<PrivateObjectStore['signRead']>(async value => ({ objectKey: value.objectKey, objectVersionId: value.objectVersionId, url: 'https://private.example.test/signed/synthetic', expiresAt: value.expiresAt }));
  const storage = createPrivateStorage({ auth, records, objects: { putImmutable: put, signRead: sign }, now: () => time, signedOrigin: 'https://private.example.test' });
  return { storage, put, sign, read, record, session, membership, setTime: (value: number) => { time = value; } };
}
async function image() { return { filename: 'label.png', mime: 'image/png', bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().withMetadata().toBuffer() }; }
describe('private immutable sanitized image storage foundation', () => {
  it('re-encodes raw input and stores only sanitized bytes under a server key', async () => {
    const s = setup(); const input = await image(); const originalHash = createHash('sha256').update(input.bytes).digest('hex');
    const result = await s.storage.put(access, { image: input }); expect(result.ok).toBe(true); if (!result.ok) return;
    const stored = s.put.mock.calls[0][0]; expect(stored.objectKey).toMatch(/^private\/workspace-a\/[a-f0-9-]{36}\/[a-f0-9]{64}\.png$/);
    expect(stored.sha256).not.toBe(originalHash); expect((await sharp(stored.bytes).metadata()).exif).toBeUndefined();
    expect(result.value.image.sha256).toBe(createHash('sha256').update(stored.bytes).digest('hex'));
    expect(stored).toMatchObject({ private: true, immutable: true, ifNoneMatch: '*' });
  });
  it('authorizes by evidence ID before signing and bounds URL TTL to 60 seconds', async () => {
    const s = setup(); const result = await s.storage.sign(access, { evidenceId });
    expect(result).toEqual({ ok: true, value: { evidenceId, url: 'https://private.example.test/signed/synthetic', expiresAt: now + 60_000 } });
    expect(s.sign.mock.calls[0][0]).toMatchObject({ objectKey, objectVersionId, expiresAt: now + 60_000 });
    expect(s.read.mock.invocationCallOrder[0]).toBeLessThan(s.sign.mock.invocationCallOrder[0]);
  });
  it('clips TTL to evidence and session expiry', async () => {
    const s = setup(); s.record.expiresAt = now + 25_000; s.session.expiresAt = now + 10_000;
    expect(await s.storage.sign(access, { evidenceId })).toMatchObject({ ok: true, value: { expiresAt: now + 10_000 } });
  });
  it.each([null, {}, { ...access, actor: 'forged' }, { ...access, workspaceId: 'workspace-b' }])('denies anonymous/forged/cross-workspace access %j', async credentials => {
    const s = setup(); expect(await s.storage.sign(credentials, { evidenceId })).toEqual(failed); expect(await s.storage.put(credentials, { image: await image() })).toEqual(failed); expect(s.sign).not.toHaveBeenCalled(); expect(s.put).not.toHaveBeenCalled();
  });
  it.each([{ objectKey }, { evidenceId, objectKey }, { evidenceId, expiresAt: now + 999_999 }, { evidenceId: '../arbitrary/object' }])('rejects arbitrary caller path or TTL %j', async input => {
    const s = setup(); expect(await s.storage.sign(access, input)).toEqual(failed); expect(s.sign).not.toHaveBeenCalled();
  });
  it('rejects a caller key or fabricated sanitized declaration on upload', async () => {
    const s = setup(); expect(await s.storage.put(access, { image: await image(), objectKey })).toEqual(failed);
    expect(await s.storage.put(access, { image: { bytes: Buffer.from('not an image'), mime: 'image/png', filename: 'label.png', sanitizedSha256: sha256 } })).toEqual(failed); expect(s.put).not.toHaveBeenCalled();
  });
  it.each(['expired', 'revoked', 'workspace', 'path', 'id', 'membership', 'session'])('does not sign %s evidence/access', async mode => {
    const s = setup();
    if (mode === 'expired') s.record.expiresAt = now;
    if (mode === 'revoked') s.record.revokedAt = now;
    if (mode === 'workspace') s.record.workspaceId = 'workspace-b';
    if (mode === 'path') s.record.image.objectKey = 'private/workspace-b/arbitrary.png';
    if (mode === 'id') s.record.evidenceId = objectVersionId;
    if (mode === 'membership') s.membership.active = false;
    if (mode === 'session') s.session.revoked = true;
    expect(await s.storage.sign(access, { evidenceId })).toEqual(failed); expect(s.sign).not.toHaveBeenCalled();
  });
  it.each(['expiry', 'revocation', 'binding-drift'])('withholds signed URL if %s changes during signing', async mode => {
    const s = setup(); s.sign.mockImplementation(async value => {
      if (mode === 'expiry') s.setTime(now + 60_000);
      if (mode === 'revocation') s.membership.active = false;
      if (mode === 'binding-drift') s.record.application.brand = 'rebound';
      return { objectKey: value.objectKey, objectVersionId: value.objectVersionId, url: 'https://private.example.test/signed/synthetic', expiresAt: value.expiresAt };
    }); expect(await s.storage.sign(access, { evidenceId })).toEqual(failed);
  });
  it('withholds a URL when the managed session lifetime shortens during signing', async () => {
    const s = setup(); s.sign.mockImplementation(async value => {
      s.session.expiresAt = now + 5_000;
      return { objectKey: value.objectKey, objectVersionId: value.objectVersionId, url: 'https://private.example.test/signed/synthetic', expiresAt: value.expiresAt };
    });
    expect(await s.storage.sign(access, { evidenceId })).toEqual(failed);
  });
  it('withholds a URL if the verified subject changes during signing', async () => {
    const s = setup(); s.sign.mockImplementation(async value => {
      s.session.userId = 'user-b'; s.membership.userId = 'user-b';
      return { objectKey: value.objectKey, objectVersionId: value.objectVersionId, url: 'https://private.example.test/signed/synthetic', expiresAt: value.expiresAt };
    });
    expect(await s.storage.sign(access, { evidenceId })).toEqual(failed);
  });
  it.each(['throw', 'public', 'wrong-hash', 'missing'])('never acknowledges %s object write receipt', async mode => {
    const s = setup(); s.put.mockImplementation(async value => { if (mode === 'throw') throw Error('sensitive upstream'); return mode === 'missing' ? null : { objectKey: value.objectKey, objectVersionId: value.objectVersionId, sha256: mode === 'wrong-hash' ? sha256 : createHash('sha256').update(value.bytes).digest('hex'), byteLength: value.bytes.length, private: mode !== 'public', immutable: true }; });
    expect(await s.storage.put(access, { image: await image() })).toEqual(failed);
  });
  it.each(['throw', 'wrong-origin', 'wrong-key', 'long-ttl', 'malformed'])('withholds %s signed response', async mode => {
    const s = setup(); s.sign.mockImplementation(async value => { if (mode === 'throw') throw Error('sensitive signing payload'); return mode === 'malformed' ? {} : { objectKey: mode === 'wrong-key' ? 'another-key' : value.objectKey, objectVersionId: value.objectVersionId, url: mode === 'wrong-origin' ? 'https://evil.example.test/file' : 'https://private.example.test/file', expiresAt: value.expiresAt + (mode === 'long-ttl' ? 1000 : 0) }; });
    expect(await s.storage.sign(access, { evidenceId })).toEqual(failed);
  });
  it('has no implicit storage fallback', async () => { expect(await createPrivateStorage().put(access, {})).toEqual(failed); expect(await createPrivateStorage().sign(access, { evidenceId })).toEqual(failed); });
});
