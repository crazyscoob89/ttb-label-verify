import { describe, expect, it, vi } from 'vitest';
import { createSupabasePersistence, type SupabasePersistenceConfig } from '../lib/persistence/supabase';
import { createWorkspaceAuth } from '../lib/auth';
import { evidenceRecordSchema, privateObjectKey } from '../lib/repository';
import { executeReserved, type SpendBinding } from '../lib/spend';
import { application } from './fixtures/synthetic';

const now = Date.now();
const uid = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const eid = '33333333-3333-4333-8333-333333333333';
const cid = '44444444-4444-4444-8444-444444444444';
const session = { userId: uid, sessionId: sid, expiresAt: now + 120_000, revoked: false };
const member = { userId: uid, workspaceId: 'workspace-a', role: 'reviewer', active: true };
const actor = { sessionId: sid, userId: uid, workspaceId: 'workspace-a', role: 'reviewer' as const, sessionExpiresAt: session.expiresAt, checkedAt: now };
const image = { objectVersionId: eid, sha256: 'a'.repeat(64), mime: 'image/png' as const, byteLength: 100, width: 2, height: 2 };
const record = evidenceRecordSchema.parse({ evidenceId: eid, workspaceId: actor.workspaceId, createdBy: uid, createdAt: now, expiresAt: now + 60_000, revokedAt: null, application, image: { ...image, objectKey: privateObjectKey(actor.workspaceId, image) } });
const binding: SpendBinding = { reservationId: eid, attemptId: cid, requestId: sid, imageSha256: image.sha256, schemaVersion: 1, rulesVersion: 'prototype-seven-fields-v1', promptVersion: 'image-observations-v1', model: 'anthropic/claude-haiku-4.5', maxCostMicrousd: 100 };
const receipt = (state: 'reserved' | 'claimed' | 'unresolved', claimId: string | null) => ({ binding, state, claimId, ledger: { currency: 'USD', ceilingMicrousd: 1000, incurredMicrousd: 0, unresolvedMicrousd: 100 } });
function setup(handler: (name: string, body: Record<string, unknown>) => unknown = () => session, status = 200) {
  const transport = vi.fn<typeof fetch>(async (url, init) => new Response(JSON.stringify(handler(String(url).split('/').at(-1)!, JSON.parse(String(init?.body)))), { status }));
  const config: SupabasePersistenceConfig = { origin: 'https://isolated.example.test', publishableKey: 'synthetic-publishable', sessionToken: 'synthetic-bearer', workspaceId: 'workspace-a', fetch: transport, timeoutMs: 100 };
  return { config, transport, adapters: createSupabasePersistence(config) };
}

describe('Supabase persistence transport contracts (offline, NOT DB proof)', () => {
  it('verifies the bound bearer through the authoritative session RPC without decoding a JWT locally', async () => {
    const s = setup(); expect(await s.adapters.sessions.verifySession('synthetic-bearer')).toEqual(session);
    expect(s.transport).toHaveBeenCalledTimes(1);
    const [url, init] = s.transport.mock.calls[0];
    expect(url).toBe('https://isolated.example.test/rest/v1/rpc/session_context');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer synthetic-bearer', apikey: 'synthetic-publishable', 'Content-Profile': 'ttb_api', 'Accept-Profile': 'ttb_api' } });
    expect(JSON.parse(String(init?.body))).toEqual({});
  });
  it('composes managed identity and scoped membership with the existing auth service', async () => {
    const s = setup(name => name === 'session_context' ? session : member);
    expect(await createWorkspaceAuth({ sessions: s.adapters.sessions, memberships: s.adapters.memberships, now: () => now }).authorize({ sessionToken: 'synthetic-bearer', workspaceId: 'workspace-a' })).toEqual({ ok: true, value: actor });
  });
  it.each(['http://isolated.example.test', 'https://user:pass@isolated.example.test', 'https://isolated.example.test/path', 'https://isolated.example.test?x=1'])('rejects unsafe configured origin %s', origin => {
    expect(() => createSupabasePersistence({ ...setup().config, origin })).toThrow('Persistence unavailable');
  });
  it('rejects browser construction', () => {
    vi.stubGlobal('window', {});
    try { expect(() => createSupabasePersistence(setup().config)).toThrow(); } finally { vi.unstubAllGlobals(); }
  });
  it('rejects a different token and cross-workspace selector before transport', async () => {
    const s = setup(); await expect(s.adapters.sessions.verifySession('other')).rejects.toThrow('Persistence unavailable');
    await expect(s.adapters.memberships.findMembership({ userId: uid, workspaceId: 'other' })).rejects.toThrow('Persistence unavailable');
    await expect(s.adapters.evidence.readActive({ ...actor, workspaceId: 'other' }, eid)).rejects.toThrow('Persistence unavailable');
    expect(s.transport).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...session, revoked: true }, { ...session, expiresAt: 1 }, { ...session, userId: 'not-uuid' }, { ...session, token: 'leak' }])('rejects malformed/revoked/expired session %j', async value => {
    await expect(setup(() => value).adapters.sessions.verifySession('synthetic-bearer')).rejects.toThrow('Persistence unavailable');
  });
  it.each([{ ...member, userId: sid }, { ...member, workspaceId: 'other' }, { ...member, active: false }, { ...member, role: 'superuser' }])('rejects mismatched membership %j', async value => {
    await expect(setup(() => value).adapters.memberships.findMembership({ userId: uid, workspaceId: 'workspace-a' })).rejects.toThrow('Persistence unavailable');
  });
  it('returns only the exact committed evidence, sends a snapshot and no upsert preference', async () => {
    const s = setup(() => record); const input = structuredClone(record);
    const pending = s.adapters.evidence.insertImmutable(actor, input); input.application.brand = 'mutated';
    expect(await pending).toEqual(record);
    expect(JSON.parse(String(s.transport.mock.calls[0][1]?.body))).toEqual({ p_workspace: 'workspace-a', p_actor: actor, p_record: record });
    expect(s.transport.mock.calls[0][1]?.headers).not.toHaveProperty('Prefer');
  });
  it.each([null, { ok: true }, { ...record, evidenceId: sid }, { ...record, application: { ...record.application, brand: 'rebound' } }])('failed/mismatched insert never fabricates a receipt %j', async value => {
    await expect(setup(() => value).adapters.evidence.insertImmutable(actor, record)).rejects.toThrow('Persistence unavailable');
  });
  it('reads exact scoped records and preserves authorized absence', async () => {
    expect(await setup(() => record).adapters.evidence.readActive(actor, eid)).toEqual(record);
    expect(await setup(() => null).adapters.evidence.readActive(actor, eid)).toBeNull();
    await expect(setup(() => ({ ...record, evidenceId: sid })).adapters.evidence.readActive(actor, eid)).rejects.toThrow();
  });
  it('denies viewer insert, expired actor and creator mismatch before dispatch', async () => {
    const s = setup(() => record);
    for (const a of [{ ...actor, role: 'viewer' as const }, { ...actor, sessionExpiresAt: 1 }, { ...actor, userId: sid }]) await expect(s.adapters.evidence.insertImmutable(a, record)).rejects.toThrow();
    expect(s.transport).not.toHaveBeenCalled();
  });
  it.each([401, 403, 409, 500])('rejects HTTP %s without receipt, retry or upstream data leakage', async status => {
    const s = setup(() => ({ message: 'SECRET PAYLOAD' }), status);
    await expect(s.adapters.evidence.insertImmutable(actor, record)).rejects.toThrow(/^Persistence unavailable$/);
    expect(s.transport).toHaveBeenCalledTimes(1);
  });
  it('rejects non-JSON, oversized replies, and transports that ignore cancellation', async () => {
    for (const response of [new Response('not-json'), new Response('x'.repeat(70_000))]) {
      const s = setup(); s.transport.mockResolvedValue(response);
      await expect(s.adapters.sessions.verifySession('synthetic-bearer')).rejects.toThrow(/^Persistence unavailable$/);
    }
    const s = setup(); s.transport.mockImplementation(() => new Promise(() => {}));
    await expect(s.adapters.sessions.verifySession('synthetic-bearer')).rejects.toThrow(/^Persistence unavailable$/);
    expect(s.transport).toHaveBeenCalledTimes(1);
  });
  it('dispatches only after reserve and single-winner claim, then retains unresolved liability', async () => {
    const s = setup((name, body) => receipt(name === 'spend_reserve' ? 'reserved' : name === 'spend_claim' ? 'claimed' : 'unresolved', typeof body.p_claim_id === 'string' ? body.p_claim_id : null));
    const work = vi.fn(async () => 'done'); expect(await executeReserved(s.adapters.spend, binding, work)).toEqual({ ok: true, value: 'done' });
    expect(s.transport.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual(['spend_reserve', 'spend_claim', 'spend_complete']);
    expect(work).toHaveBeenCalledTimes(1);
    for (const [, init] of s.transport.mock.calls) expect(JSON.parse(String(init?.body))).not.toHaveProperty('ceilingMicrousd');
  });
  it('rejects reservation collision without dispatch or retry', async () => {
    const s = setup(() => ({ error: 'collision' }), 409); const work = vi.fn(async () => true);
    expect(await executeReserved(s.adapters.spend, binding, work)).toEqual({ ok: false, code: 'spend-unavailable' });
    expect(work).not.toHaveBeenCalled(); expect(s.transport).toHaveBeenCalledTimes(1);
  });
  it('failed dispatch still completes unresolved, completion error never releases or retries', async () => {
    const s = setup((name, body) => receipt(name === 'spend_reserve' ? 'reserved' : name === 'spend_claim' ? 'claimed' : 'unresolved', typeof body.p_claim_id === 'string' ? body.p_claim_id : null));
    expect(await executeReserved(s.adapters.spend, binding, async () => { throw Error('timeout'); })).toEqual({ ok: false, code: 'execution-failed' });
    const fail = setup((name, body) => name === 'spend_complete' ? {} : receipt(name === 'spend_reserve' ? 'reserved' : 'claimed', typeof body.p_claim_id === 'string' ? body.p_claim_id : null));
    expect(await executeReserved(fail.adapters.spend, binding, async () => true)).toEqual({ ok: false, code: 'spend-unavailable' });
    expect(fail.transport).toHaveBeenCalledTimes(3);
  });
  it('uses the existing spend validator to reject binding/state/ledger mismatch before work', async () => {
    for (const reply of [{ ...receipt('reserved', null), binding: { ...binding, attemptId: sid } }, receipt('claimed', cid), { ...receipt('reserved', null), ledger: { currency: 'USD', ceilingMicrousd: 50, incurredMicrousd: 0, unresolvedMicrousd: 100 } }]) {
      const s = setup(() => reply); const work = vi.fn(async () => true);
      expect(await executeReserved(s.adapters.spend, binding, work)).toEqual({ ok: false, code: 'spend-unavailable' }); expect(work).not.toHaveBeenCalled();
    }
  });
});
