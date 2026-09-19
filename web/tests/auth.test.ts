import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceAuth } from '../lib/auth';

const now = 1_800_000_000_000;
const access = { sessionToken: 'opaque-managed-session', workspaceId: 'workspace-a' };
function setup() {
  const verifySession = vi.fn(async () => ({ sessionId: 'session-a', userId: 'user-a', expiresAt: now + 120_000, revoked: false }));
  const findMembership = vi.fn(async () => ({ userId: 'user-a', workspaceId: 'workspace-a', role: 'reviewer', active: true }));
  const auth = createWorkspaceAuth({ sessions: { verifySession }, memberships: { findMembership }, now: () => now });
  return { auth, verifySession, findMembership };
}
const denied = { ok: false, code: 'access-denied' };
describe('server-trusted workspace authentication (offline adapter tests only)', () => {
  it('derives identity, role and time from trusted adapters, never the selector', async () => {
    const s = setup();
    expect(await s.auth.authorize(access)).toEqual({ ok: true, value: { sessionId: 'session-a', userId: 'user-a', workspaceId: 'workspace-a', role: 'reviewer', sessionExpiresAt: now + 120_000, checkedAt: now } });
    expect(s.verifySession).toHaveBeenCalledWith(access.sessionToken);
    expect(s.findMembership).toHaveBeenCalledWith({ userId: 'user-a', workspaceId: 'workspace-a' });
  });
  it.each([null, {}, { ...access, userId: 'admin' }, { ...access, role: 'owner' }, { ...access, actor: { userId: 'admin' } }, { ...access, checkedAt: now }, { sessionToken: '', workspaceId: 'workspace-a' }])('denies anonymous or forged actor/context %j', async input => {
    const s = setup(); expect(await s.auth.authorize(input)).toEqual(denied); expect(s.verifySession).not.toHaveBeenCalled();
  });
  it('rechecks session and active membership on every authorization', async () => {
    const s = setup(); expect((await s.auth.authorize(access)).ok).toBe(true);
    s.findMembership.mockResolvedValue({ userId: 'user-a', workspaceId: 'workspace-a', role: 'reviewer', active: false });
    expect(await s.auth.authorize(access)).toEqual(denied);
    expect(s.verifySession).toHaveBeenCalledTimes(2); expect(s.findMembership).toHaveBeenCalledTimes(2);
  });
  it('denies cross-workspace membership', async () => {
    expect(await setup().auth.authorize({ ...access, workspaceId: 'workspace-b' })).toEqual(denied);
  });
  it.each(['expired', 'revoked', 'malformed', 'failure'])('denies %s session', async mode => {
    const s = setup();
    if (mode === 'failure') s.verifySession.mockRejectedValue(new Error('sensitive upstream payload'));
    else s.verifySession.mockResolvedValue({ sessionId: 'session-a', userId: 'user-a', expiresAt: mode === 'expired' ? now : now + 120_000, revoked: mode === 'revoked', ...(mode === 'malformed' ? { unexpected: true } : {}) });
    expect(await s.auth.authorize(access)).toEqual(denied); expect(s.findMembership).not.toHaveBeenCalled();
  });
  it('denies unknown roles and membership backend errors', async () => {
    const s = setup(); s.findMembership.mockResolvedValue({ userId: 'user-a', workspaceId: 'workspace-a', role: 'superuser', active: true });
    expect(await s.auth.authorize(access)).toEqual(denied);
    s.findMembership.mockRejectedValue(new Error('private backend details')); expect(await s.auth.authorize(access)).toEqual(denied);
  });
  it('has no implicit auth fallback', async () => { expect(await createWorkspaceAuth().authorize(access)).toEqual(denied); });
});
