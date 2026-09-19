import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const path = new URL('../../db/migrations/001_identity_evidence.sql', import.meta.url);
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('offline SQL source contracts — NOT PostgreSQL execution proof', () => {
  it('defines the durable scope, immutable evidence and global spend tables', () => {
    for (const name of ['settings', 'memberships', 'applications', 'objects', 'evidence', 'evidence_access', 'spend_ledger', 'spend_reservations']) expect(sql).toContain(`CREATE TABLE ttb_private.${name}`);
    expect(sql).toContain('PRIMARY KEY (workspace_id, application_id, application_version)');
    expect(sql).toContain('attempt_id uuid NOT NULL UNIQUE');
    expect(sql).toContain('object_version_id uuid NOT NULL UNIQUE');
  });
  it('locks every security definer search path and revokes public/default runtime authority', () => {
    const definitions = sql.split(/CREATE FUNCTION /).slice(1);
    expect(definitions.length).toBeGreaterThan(8);
    for (const definition of definitions) if (definition.includes('SECURITY DEFINER')) expect(definition.split('$$')[0]).toContain('SET search_path = pg_catalog');
    expect(sql).toContain('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ttb_api FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA ttb_private FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE ROLE ttb_owner NOLOGIN NOSUPERUSER NOBYPASSRLS');
    expect(sql).toContain('CREATE ROLE ttb_purge NOLOGIN NOSUPERUSER NOBYPASSRLS');
    expect(sql).not.toMatch(/GRANT\s+ttb_owner\s+TO\s+(?:authenticated|anon|service_role)/i);
  });
  it('derives identity from verified gateway claims plus live auth rows, not caller JSON', () => {
    expect(sql).toContain('auth.uid()'); expect(sql).toContain('auth.jwt()');
    expect(sql).toContain('FROM auth.sessions'); expect(sql).toContain('FROM auth.users');
    expect(sql).toContain("claims->>'iss'"); expect(sql).toContain("claims->>'aud'");
    expect(sql).toContain('FOR SHARE'); expect(sql).toContain('clock_timestamp()');
    expect(sql).toContain('not_after'); expect(sql).toContain('banned_until');
    expect(sql).toContain('p_actor'); expect(sql).toContain('assert_actor');
  });
  it('rejects updates/deletes of source evidence and requires attested private object bindings', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON ttb_private.evidence');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON ttb_private.applications');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON ttb_private.objects');
    expect(sql).toContain('REFERENCES ttb_private.objects');
    expect(sql).toContain("RAISE EXCEPTION 'immutable source'");
    expect(sql).toContain("RAISE EXCEPTION 'application binding collision'");
    expect(sql).toContain('o.descriptor IS DISTINCT FROM');
  });
  it('rejects JSON null commodity and revalidates current reservation cost on claim', () => {
    expect(sql).toContain("NOT COALESCE(a->>'commodity' IN ('wine','distilled-spirits','malt-beverage'), false)");
    expect(sql).toContain("IF NOT ledger.enabled OR cost <> ledger.reservation_microusd OR r.state <> 'reserved'");
  });
  it('serializes global holds and single-winner dispatch without reclaim/refund or caller ceiling', () => {
    expect(sql).toContain('FROM ttb_private.spend_ledger WHERE singleton FOR UPDATE');
    expect(sql).toContain('ledger.incurred_microusd + ledger.unresolved_microusd + cost');
    expect(sql).toContain('cost <> ledger.reservation_microusd');
    expect(sql).toContain("r.state <> 'reserved'");
    expect(sql).toContain("SET state = 'claimed', claim_id = p_claim_id");
    expect(sql).toContain("SET state = 'unresolved'");
    expect(sql).toContain("RAISE EXCEPTION 'idempotency collision'");
    expect(sql).not.toMatch(/unresolved_microusd\s*=\s*unresolved_microusd\s*-/);
    expect(sql).not.toMatch(/p_(?:ceiling|budget|incurred|refund|settle)/);
    for (const name of ['spend_reserve', 'spend_claim', 'spend_complete']) expect(sql).toContain(`CREATE FUNCTION ttb_api.${name}`);
  });
});
