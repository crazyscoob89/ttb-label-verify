export type DbGateTarget = Readonly<{ host: string; port: string; database: string; username: string; password: string }>;
const blocked = (): never => { throw new Error('DB gate blocked: explicit isolated target configuration required'); };
/** No dotenv, owner fallback, production URL, URL options or implicit target.
 * Loopback is intentionally the only supported scaffold target. Managed-provider
 * acceptance needs a separately reviewed target authorization/TLS envelope.
 */
export function validateDbGateConfig(env: Readonly<Record<string, string | undefined>>): DbGateTarget {
  try {
    if (env.TTB_DB_GATE_AUTHORIZATION !== 'isolated-phase4-db-tests-only' || !env.TTB_DB_GATE_URL || !env.TTB_DB_GATE_HOST || !env.TTB_DB_GATE_DATABASE) return blocked();
    const url = new URL(env.TTB_DB_GATE_URL);
    const database = url.pathname.slice(1);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
      || url.hostname !== env.TTB_DB_GATE_HOST || !/^ttb_phase4_test_[a-z0-9_]+$/.test(database)
      || database !== env.TTB_DB_GATE_DATABASE || url.search || url.hash || !url.username || !url.password) return blocked();
    const username = decodeURIComponent(url.username), password = decodeURIComponent(url.password);
    if (!/^[A-Za-z0-9_]+$/.test(username) || /[\x00-\x1f\x7f]/.test(password)) return blocked();
    return Object.freeze({ host: url.hostname === '[::1]' ? '::1' : url.hostname, port: url.port || '5432', database, username, password });
  } catch { return blocked(); }
}
