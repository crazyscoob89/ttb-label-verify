# Phase 4 — bounded persistence-source slice

## Status / scope

**TESTED LOCAL SOURCE ONLY. Not Phase 4 completion, managed-session acceptance, actual database acceptance, or deployable activation.**

- Base: `9bc1d01f65bf6a4d3fcaf451abc5b38ed3121eab`, branch `ava/phase4-foundation`, worktree `/tmp/ttb-phase4-worktree`.
- Sole Phase 4 writer; builder self-review only. Parent/independent frozen-SHA review remains required. No ARGUS/bridge invocation, remote push, deployment, paid call, credential access, `.env` loading, service activation, DB connection or migration execution.
- Existing Phase 3 source, auth/storage/repository/spend contracts, routes, UI, benchmark, lockfile and shared status/plan files are unchanged. The only existing-file modification is `web/package.json` adding `test:db`; no dependencies added.
- Migration is **unapplied and one-shot**, not advertised as replayable. PostgreSQL syntax/managed compatibility and runtime behavior remain unverified; offline source assertions are not SQL execution.

## New source and exports

### `web/lib/persistence/supabase.ts`

Exports `SupabasePersistenceConfig` and `createSupabasePersistence(config)` returning existing-interface implementations:

| Property | Existing contract | RPC in `ttb_api` |
| --- | --- | --- |
| `sessions.verifySession(token)` | `ManagedSessionVerifier` | `session_context()` |
| `memberships.findMembership({userId, workspaceId})` | `WorkspaceMembershipReader` | `membership_context(p_workspace text)` |
| `evidence.insertImmutable(actor, record)` | `EvidenceStore` | `evidence_insert(p_workspace text, p_actor jsonb, p_record jsonb)` |
| `evidence.readActive(actor, evidenceId)` | `EvidenceStore` | `evidence_read(p_workspace text, p_actor jsonb, p_evidence_id uuid)` |
| `spend.reserve(binding)` | `SpendStore` | `spend_reserve(p_workspace text, p_binding jsonb)` |
| `spend.claim(binding, claimId)` | `SpendStore` | `spend_claim(p_workspace text, p_binding jsonb, p_claim_id uuid)` |
| `spend.complete(binding, claimId)` | `SpendStore` | `spend_complete(p_workspace text, p_binding jsonb, p_claim_id uuid)` |

Construct **per request, bearer and workspace** from trusted server configuration: exact HTTPS `origin`, `publishableKey`, `sessionToken`, `workspaceId`; optional trusted `fetch` and bounded `timeoutMs` (default 5 seconds, maximum 30). Never share across users, pass a service-role credential, hydrate dependencies from request JSON, or use this as a browser SDK. Construction and operations refuse a browser runtime. All RPCs use POST, pinned origin, `Content-Profile`/`Accept-Profile: ttb_api`, `redirect: error`, `cache: no-store`, a deadline covering headers/body, bounded streamed JSON (64 KiB), no generic retries and no logging. Errors expose only `Persistence unavailable`. Credentials are captured at construction; operation bodies are snapshotted before awaiting.

Auth/evidence replies are strict-decoded and scope/identity/lifetime/binding checked. A different token cannot use the captured request instance. Evidence insert requires the exact returned committed record; an error, malformed success, different record or lost acknowledgement cannot fabricate a receipt. Read may return an authorized `null`. Failed/ambiguous inserts are **not safe-to-retry receipts**.

Spend deliberately retains `Promise<unknown>` from the **existing** `SpendStore` contract. Use it through existing `executeReserved`, which remains the sole strict binding/state/claim/ledger decoder. No duplicate spend schema or alternative dispatch/policy helper was introduced. No raw RPC result is provider authorization.

**Identity trust boundary:** this is a concrete Supabase REST session adapter, not local JWT cryptography. The configured managed PostgREST gateway must verify JWT signatures and establish `auth.uid()`/`auth.jwt()`. SQL additionally checks the configured issuer, authenticated audience/role, expiry, live session ownership/`not_after`, user deletion/ban and current workspace membership. Caller `p_actor` is compared to that authority, not trusted. Do not expose a direct SQL runtime login that can forge `request.jwt.claims`. Managed JWT verification/session-revocation semantics are still an external acceptance gate.

### `web/db/migrations/001_identity_evidence.sql`

Eight durable private tables: `settings`, `memberships`, `applications`, `objects`, `evidence`, `evidence_access`, `spend_ledger`, `spend_reservations`.

- Separate NOLOGIN/NOSUPERUSER/NOBYPASSRLS `ttb_owner` and dormant `ttb_purge`; temporary migration-principal owner membership is removed at transaction end. Runtime `authenticated` receives only schema usage and seven exact RPC EXECUTE grants. PUBLIC/anon/authenticated/service_role receive no private table/helper authority. Security definers pin `search_path = pg_catalog`. All private tables have forced RLS with owner-only policies.
- The migration owner needs Supabase-auth grant authority. The definer gets narrowly scoped SELECT and `UPDATE(id)` on auth user/session tables solely because PostgreSQL `FOR SHARE` requires an UPDATE privilege; no function updates auth data. Runtime does not inherit these grants. Prove actual managed-role compatibility and effective/inherited ACLs before approval.
- User → session → membership row locks fence normal user bans/session deletion/membership revocation. Every operation derives authority from the verified gateway, not arbitrary JSON IDs. Wall-clock expiry is rechecked after relevant waits. Evidence access revocation is a separate locked row, not a source rewrite.
- `(workspace, applicationId, applicationVersion)` permanently binds one application snapshot. Evidence ID/object version are unique; application/image/evidence UPDATE and DELETE are trigger-denied. Evidence insert returns the stored row, not its input as an acknowledgement. Rebinding or duplicate evidence/object insertion fails atomically.
- Objects are owner-controlled **attestations**, not proof created from arbitrary request references. Evidence insert requires an exact pre-existing workspace/creator/version/key/hash/dimensions/type descriptor. There is no runtime object-attestation writer and no claim that a DB reference proves private bytes.
- The global spend singleton is locked before authority and reservation work, across all workspaces/users. The persisted ceiling includes all incurred and unresolved liability. Every reservation must match the owner-configured per-attempt hold; callers cannot supply a budget or reduce the hold. Both reservation and attempt IDs remain unique permanently. Exact reserved replay is idempotent; mismatched identities collide. Claim is a single-winner reserved→claimed transition with a unique claim ID; duplicate claims cannot dispatch. Current enablement/cost policy is rechecked at claim. Complete only marks unresolved, idempotently for the same claim, without releasing any hold. Completion after authority expiry may fail, but liability remains held.
- No reclaim, refund, settlement, history reset or purge operation exists. Timeout/crash/ambiguous acknowledgement preserves liabilities and identities. The initial ledger is **disabled with zero ceiling**. Issuer, membership and object tables are unseeded. Applying this source would not enable paid execution.
- Owner reconciliation, audited revocation/retention/purge capabilities, permanent tombstones after any future purge, and private-object attestation must be designed separately; do not add runtime owner fallbacks to make the foundation usable.

### Actual-DB gate scaffold

`npm run test:db` → `web/scripts/db-gate.ts` with `db-gate-config.ts` and `web/tests/db/catalog.sql`.

**This gate intentionally cannot PASS yet.** Absent authorization/configuration fails before invoking `psql`; it never skips, substitutes a fake store, launches a DB, applies migrations, or calls the unit suite. Narrower command-line suites are rejected. It reads no `.env` file.

For a future explicitly approved, already-migrated isolated loopback target, configuration must supply all of:

- `TTB_DB_GATE_AUTHORIZATION=isolated-phase4-db-tests-only`
- `TTB_DB_GATE_HOST` exactly matching a loopback URL host
- `TTB_DB_GATE_DATABASE=ttb_phase4_test_<isolated_suffix>` exactly matching the URL database
- `TTB_DB_GATE_URL` with explicit test credentials, no URL query/options/fragment

No owner URL or ambient PG configuration is used. The child has only explicit PG parameters, a connection/statement/lock deadline, no psqlrc, no password prompt and a read-only transaction default. Loopback-only transport uses no TLS; this is **not** a managed-target TLS envelope. The SQL performs real catalog/RLS/ACL metadata checks if ever authorized to run. Even a catalog success ends nonzero with `actual catalog only; concurrency/RLS behavior/durability suite UNIMPLEMENTED and UNRUN`. That blocker must be replaced by an independently reviewed full behavioral harness, not removed merely to get a green command. No configured-target execution occurred here.

## Local TDD and verification

Node `v24.21.0` via `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin`, `NEXT_TELEMETRY_DISABLED=1`. Full evidence: `/opt/data/ttb-phase4-evidence/persistence/`.

| Gate | Result | Log |
| --- | --- | --- |
| Adapter RED against deny scaffold (including positive composition/dispatch controls) | 17 failed / 17 passed, exit 1 | `01-adapter-red.log` |
| SQL source-contract RED before migration source existed | 5 failed, exit 1; **not DB RED** | `02-sql-red.log` |
| Adapter GREEN | 34 passed | `03-adapter-green.log` |
| DB config RED against permissive scaffold | 12 failed, exit 1 | `04-gate-red.log` |
| Initial SQL source check | 1 static assertion mismatch (qualified ledger names); corrected assertion, not SQL weakening | `05-sql-source.log` |
| Initial typecheck | Next augments ProcessEnv with required NODE_ENV; fixed config input to readonly string map and explicit child NODE_ENV | `06-typecheck-initial.log` |
| Self-review source regression RED | missing null-safe commodity check and current-cost claim guard; **static, not DB behavior** | `07-review-regression-red.log` |
| Gate config/refusal GREEN | 16 passed | `08-gate-green.log` |
| Final focused offline contracts | **56 passed**, 4 files, exit 0 | `09-focused-green.log` |
| Typecheck | passed, exit 0 | `10-typecheck.log` |
| Actual-DB gate with authorization/config explicitly unset | **exit 1**, expected `DB gate blocked: explicit isolated target configuration required`; no DB contacted | `11-db-gate-absent.log` |
| Full unit regression | **419 passed**, 16 files, exit 0 | `12-full-unit.log` |

Coverage includes malformed/mismatched/expired/revoked session envelopes; cross-workspace/context/creator/viewer rejection; failed evidence insert without receipt; mutable input snapshot; HTTP auth/conflict/server errors with no retry/data leakage; oversized/malformed response and ignored cancellation; reserve collision; reserve→claim→complete ordering; failed dispatch retaining unresolved accounting; completion failure; existing spend decoder rejection of binding/state/ledger drift. Gate subprocess assertions check the **intended configuration refusal**, not any arbitrary nonzero exit.

No PostgreSQL parser was available in the active Python environment, and none was installed. SQL source checks are string/contract tests only. New source was self-reviewed; no independent PASS is claimed. Build/browser E2E were not rerun in this bounded persistence lane.

## Exact remaining integration gates

1. **Authorized isolated database harness (local engineering, not just credentials):** implement complete real-DB behavioral tests before this gate can ever PASS. Obtain separate permission to provision/apply this migration. Exercise actual managed-auth schema compatibility, role creation/grants, fresh application/transaction rollback, and migration inventory/version control. This migration is one-shot; a second apply must fail rather than silently reset state.
2. **Actual concurrency/ACL/RLS/durability:** under restricted runtime, test direct DML/column/owner/purge/helper denial plus positive RPC controls; guessed cross-workspace IDs; viewers; revoked/expired sessions and membership; missing/null/malformed fields; immutable application rebinding/duplicate object/evidence IDs; failed insert rollback with no receipt. Use independent connections with observed blocking to prove ban/session/membership/access revocation races and expiry after lock waits. Race two global reservations at the ceiling and two claims on one reservation; prove exactly one winner. Test attempt/reservation collisions, replay, disabled/changed-cost policy, timeout/crash/reconnect/process restart, persisted holds and unchanged incurred history. All of this is **UNRUN**.
3. **Managed identity composition:** configure the trusted HTTPS gateway and expose only `ttb_api`; prove real issuer/audience/signature/expiry/session revocation and no client-forgeable GUC context. Verify the auth row-lock privileges and managed logout/timebox behavior. Add request-scoped server construction, cookie/token transport, origin/CSRF protections, and rate/aggregate limits. Do not activate existing routes yet.
4. **Private object adapter/attestor (unfinished local integration):** a concrete `PrivateObjectStore` was deliberately not added. Upload→exact-byte verification→restricted durable attestation cannot be honestly implemented by echoing a Supabase upload response. Build a separately scoped immutable private-bucket adapter and attestation capability, prove bucket ACLs/no overwrite/no public access, exact sanitized bytes/hash/version, orphan reconciliation and absolute signing expiry. Decide authenticated redemption versus short-lived bearer URLs for immediate revocation. No runtime owner credentials.
5. **Identity/history integration:** compose existing auth, private storage and evidence repository with these request-scoped adapters; create/read receipt DTOs and durable history/list pagination are still absent. This slice supplies exact-ID read only. Prove reload/restart/cross-workspace history and immutable saved receipts before calling anything Saved. No UI/login/history route was added.
6. **Spend activation:** approve authoritative worst-case reservation cost/global total budget and a separately audited reconciliation process; retain all holds/tombstones. Compose through existing `executeReserved` and provider authorization only after actual DB gates. The DB source is not pricing/provider acceptance and grants no paid-call permission.
7. **Independent review and release:** parent verifies this commit/logs, obtains frozen-SHA independent review, then separately authorizes any migration, managed provisioning, deployment or remote publication. Required security gate remains red. No phase completion claim.
