import { z } from 'zod';
import { accessInputSchema, serverTimeSchema, workspaceIdSchema, type ManagedSessionVerifier, type WorkspaceAuthorization, type WorkspaceMembershipReader } from '../auth';
import { evidenceRecordSchema, type EvidenceStore } from '../repository';
import type { SpendBinding, SpendStore } from '../spend';

/** Trusted server configuration only. Construct once PER request/bearer/workspace;
 * never share an instance across users. No service-role key, env loading, session
 * cache, decoded-JWT authority, memory store, automatic retries or logging.
 * The configured PostgREST gateway MUST verify Supabase JWT signatures. SQL then
 * verifies issuer/audience/expiry and authoritative auth.sessions + membership.
 * This adapter does not activate that gateway or the unapplied migration.
 */
export type SupabasePersistenceConfig = {
  origin: string; publishableKey: string; sessionToken: string; workspaceId: string;
  fetch?: typeof fetch; timeoutMs?: number;
};
const unavailable = (): never => { throw new Error('Persistence unavailable'); };
const roles = z.enum(['owner', 'admin', 'reviewer', 'viewer']);
const sessionSchema = z.object({ sessionId: z.uuid(), userId: z.uuid(), expiresAt: serverTimeSchema, revoked: z.literal(false) }).strict();
const memberSchema = z.object({ userId: z.uuid(), workspaceId: workspaceIdSchema, role: roles, active: z.literal(true) }).strict();
const actorSchema = z.object({ sessionId: z.uuid(), userId: z.uuid(), workspaceId: workspaceIdSchema, role: roles, sessionExpiresAt: serverTimeSchema, checkedAt: serverTimeSchema }).strict();
const MAX_RESPONSE_BYTES = 65_536;

export function createSupabasePersistence(config: SupabasePersistenceConfig): {
  sessions: ManagedSessionVerifier; memberships: WorkspaceMembershipReader;
  evidence: EvidenceStore; spend: SpendStore;
} {
  let origin: string, token: string, workspace: string, key: string, timeout: number;
  let transport: typeof fetch;
  try {
    if (typeof window !== 'undefined') return unavailable();
    const url = new URL(config.origin);
    if (url.protocol !== 'https:' || url.origin !== config.origin || url.username || url.password) return unavailable();
    origin = url.origin;
    const access = accessInputSchema.parse({ sessionToken: config.sessionToken, workspaceId: config.workspaceId });
    token = access.sessionToken; workspace = access.workspaceId;
    key = z.string().min(1).max(8192).regex(/^[^\s\x00-\x1f\x7f]+$/).parse(config.publishableKey);
    timeout = z.number().int().min(1).max(30_000).parse(config.timeoutMs ?? 5_000);
    transport = config.fetch ?? globalThis.fetch;
  } catch { return unavailable(); }

  async function safe<T>(operation: () => Promise<T>): Promise<T> {
    try { if (typeof window !== 'undefined') return unavailable(); return await operation(); }
    catch { return unavailable(); }
  }
  async function rpc(name: string, body: unknown): Promise<unknown> {
    // Serialize before the first await; no later caller mutation changes dispatch.
    const payload = JSON.stringify(body);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(`${origin}/rest/v1/rpc/${name}`, {
            method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json', 'Content-Profile': 'ttb_api', 'Accept-Profile': 'ttb_api' }, body: payload,
          });
          if (!response.ok || response.redirected || !response.body) return unavailable();
          const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
          try {
            for (;;) {
              const next = await reader.read(); if (next.done) break;
              size += next.value.byteLength;
              if (size > MAX_RESPONSE_BYTES) return unavailable();
              chunks.push(next.value);
            }
            return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          } finally { void reader.cancel().catch(() => {}); }
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Persistence unavailable')); }, timeout); }),
      ]);
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  }
  function checkedActor(input: WorkspaceAuthorization, write = false) {
    const actor = actorSchema.parse(input);
    if (actor.workspaceId !== workspace || actor.sessionExpiresAt <= Date.now() || actor.checkedAt > Date.now() || (write && actor.role === 'viewer')) return unavailable();
    return actor;
  }
  function checkedRecord(input: unknown, id?: string) {
    const row = evidenceRecordSchema.parse(input);
    if (row.workspaceId !== workspace || (id && row.evidenceId !== id) || row.revokedAt !== null || row.expiresAt <= Date.now() || row.createdAt > Date.now()) return unavailable();
    return row;
  }
  function spendRpc(name: string, binding: Readonly<SpendBinding>, claimId?: string) {
    // SpendStore intentionally returns unknown. executeReserved is the SINGLE
    // canonical strict binding/state/ledger decoder; do not fork its policy here.
    return safe(() => rpc(name, { p_workspace: workspace, p_binding: binding, ...(claimId === undefined ? {} : { p_claim_id: z.uuid().parse(claimId) }) }));
  }
  return Object.freeze({
    sessions: Object.freeze({
      verifySession: (candidate: string) => safe(async () => {
        if (candidate !== token) return unavailable();
        const session = sessionSchema.parse(await rpc('session_context', {}));
        if (session.expiresAt <= Date.now()) return unavailable();
        return session;
      }),
    }),
    memberships: Object.freeze({
      findMembership: (selector: Readonly<{ userId: string; workspaceId: string }>) => safe(async () => {
        const selected = z.object({ userId: z.uuid(), workspaceId: workspaceIdSchema }).strict().parse(selector);
        if (selected.workspaceId !== workspace) return unavailable();
        const member = memberSchema.parse(await rpc('membership_context', { p_workspace: workspace }));
        if (member.userId !== selected.userId || member.workspaceId !== workspace) return unavailable();
        return member;
      }),
    }),
    evidence: Object.freeze({
      insertImmutable: (input: WorkspaceAuthorization, record: Parameters<EvidenceStore['insertImmutable']>[1]) => safe(async () => {
        const actor = checkedActor(input, true); const snapshot = checkedRecord(record);
        if (snapshot.createdBy !== actor.userId) return unavailable();
        const result = checkedRecord(await rpc('evidence_insert', { p_workspace: workspace, p_actor: actor, p_record: snapshot }), snapshot.evidenceId);
        if (JSON.stringify(result) !== JSON.stringify(snapshot)) return unavailable();
        return result;
      }),
      readActive: (input: WorkspaceAuthorization, evidenceId: string) => safe(async () => {
        const actor = checkedActor(input); const id = z.uuid().parse(evidenceId);
        const result = await rpc('evidence_read', { p_workspace: workspace, p_actor: actor, p_evidence_id: id });
        return result === null ? null : checkedRecord(result, id);
      }),
    }),
    spend: Object.freeze({
      reserve: (binding: Readonly<SpendBinding>) => spendRpc('spend_reserve', binding),
      claim: (binding: Readonly<SpendBinding>, claimId: string) => spendRpc('spend_claim', binding, claimId),
      complete: (binding: Readonly<SpendBinding>, claimId: string) => spendRpc('spend_complete', binding, claimId),
    }),
  });
}
