import { z } from 'zod';

export const workspaceIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const serverTimeSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const accessInputSchema = z.object({
  sessionToken: z.string().min(1).max(8192).refine(value => !/[\s\u0000-\u001f\u007f]/.test(value)),
  workspaceId: workspaceIdSchema,
}).strict();
const sessionSchema = z.object({ sessionId: workspaceIdSchema, userId: workspaceIdSchema, expiresAt: serverTimeSchema, revoked: z.literal(false) }).strict();
const membershipSchema = z.object({ userId: workspaceIdSchema, workspaceId: workspaceIdSchema, role: z.enum(['owner', 'admin', 'reviewer', 'viewer']), active: z.literal(true) }).strict();
export type WorkspaceAuthorization = Readonly<{
  sessionId: string; userId: string; workspaceId: string; role: z.infer<typeof membershipSchema>['role'];
  sessionExpiresAt: number; checkedAt: number;
}>;
export type AuthResult = { ok: true; value: WorkspaceAuthorization } | { ok: false; code: 'access-denied' };

/** Server-only injection boundary. Implement using managed Supabase Auth verification,
 * NOT decoded/unverified JWTs, getSession cache, request JSON, user_metadata roles,
 * or custom passwords. Verify issuer/audience/signature/expiry AND session revocation.
 * No managed adapter is installed or accepted by this source-only tranche. */
export interface ManagedSessionVerifier { verifySession(sessionToken: string): Promise<unknown> }
/** Must query authoritative current workspace membership; never a browser claim/cache. */
export interface WorkspaceMembershipReader {
  findMembership(selector: Readonly<{ userId: string; workspaceId: string }>): Promise<unknown>;
}
export type WorkspaceAuth = ReturnType<typeof createWorkspaceAuth>;

export function createWorkspaceAuth(dependencies?: {
  sessions: ManagedSessionVerifier; memberships: WorkspaceMembershipReader; now?: () => number;
}) {
  return Object.freeze({
    async authorize(input: unknown): Promise<AuthResult> {
      const denied = { ok: false, code: 'access-denied' } as const;
      if (!dependencies || typeof window !== 'undefined') return denied;
      try {
        const request = accessInputSchema.parse(input);
        const session = sessionSchema.parse(await dependencies.sessions.verifySession(request.sessionToken));
        const clock = dependencies.now ?? Date.now;
        if (session.expiresAt <= serverTimeSchema.parse(clock())) return denied;
        const membership = membershipSchema.parse(await dependencies.memberships.findMembership(Object.freeze({ userId: session.userId, workspaceId: request.workspaceId })));
        const checkedAt = serverTimeSchema.parse(clock());
        if (session.expiresAt <= checkedAt || membership.userId !== session.userId || membership.workspaceId !== request.workspaceId) return denied;
        return { ok: true, value: Object.freeze({ sessionId: session.sessionId, userId: session.userId, workspaceId: membership.workspaceId, role: membership.role, sessionExpiresAt: session.expiresAt, checkedAt }) };
      } catch { return denied; }
    },
  });
}
