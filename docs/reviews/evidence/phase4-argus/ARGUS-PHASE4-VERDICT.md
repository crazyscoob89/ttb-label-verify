# ARGUS PHASE 4 VERDICT — Source Foundation Candidate

**Verdict: PASS — for the SOURCE FOUNDATION scope ONLY.**

> **Explicit limitation:** actual database behavior, managed auth/session, the concrete
> private-object adapter, and durable review history remain **UNVERIFIED and OUT OF
> SCOPE**. They are explicitly NOT ACCEPTED by this review and are NOT claimed as
> passing. This is not full Phase 4 acceptance, migration authorization, provisioning
> approval, or deployment approval.

- Candidate: `f5007074a33e56214d4da865bd05121665cca1e7` (branch `ava/phase4-foundation`)
- Bundle: `PHASE4-SOURCE-CANDIDATE.bundle`, SHA256 `29497c73fa3509ee30216f56789c9869ac38a726019fbde9ae2501a59d93a24f` — **verified match** (argus-00, phase5 evidence dir)
- Common base: `d799821ab549ce2c7dbb6bce8811e2a9a461b204`; chain d799821 → 9bc1d01 (identity/storage/repository foundation) → f500707 (persistence source + fail-closed DB gate) verified (argus-01)
- Reviewer: ARGUS, read-only isolated detached worktree (`argus-phase4-review`); no edits/commits/pushes/merges; frozen AVA trees untouched; **no migration run, no DB contacted, no psql invoked against any target**
- Review date: 2026-09-19
- Environment: Windows (Jarvis-1), Node v22.22.2, `npm ci` from the candidate's frozen lockfile

## Change surface — verified exact

18 paths vs base; all new files except `web/package.json`, whose diff is exactly one added script line (`"test:db": "tsx scripts/db-gate.ts"`). No route/UI/lockfile/benchmark/BUILD-PLAN/IMPLEMENTATION-STATUS changes; zero new dependencies (argus-01).

## Gates — all independently reproduced

| # | Builder claim | ARGUS independent result | Evidence |
|---|---|---|---|
| P1 | 419 unit / 16 files | **419 passed / 16 files, exit 0, no skips** | argus-02-unit-full.log |
| P2 | typecheck exit 0 | **tsc --noEmit exit 0** | argus-03-typecheck.log |
| P3 | focused persistence 56 / 4 files | **56 passed / 4 files** | argus-05-focused-persistence.log |
| P4 | focused foundation 70 / 3 files | **70 passed / 3 files** | argus-04-focused-foundation.log |
| P5 | `test:db` refuses without config | **exit 1 with exact message "DB gate blocked: explicit isolated target configuration required"; no DB contacted** — EXPECTED fail-closed behavior, NOT a failure; the DB-behavior harness remains incomplete BY DESIGN | argus-06-dbgate-refusal.log |
| P6 | (build unclaimed for tranche 2) | **ARGUS extra: `next build` exit 0**; routes remain exactly `/`, `/_not-found`, `/api/comparisons`, `/review` — no route activation from dormant Phase 4 library code | argus-10-build.log |

## Required source checks — all confirmed, with citations

Full details with exact file:line citations in argus-07 (auth + Supabase adapter), argus-08 (storage + repository), argus-09 (SQL migration + gate scripts + secrets sweep).

- **C1 Forged/cross-workspace/expired/revoked denial**: `revoked: z.literal(false)` / `active: z.literal(true)` make revoked/inactive replies unparseable (`web/lib/auth.ts:9-10`); strict schemas reject injected actor/role/time fields (`auth.ts:5-8`); expiry checked before AND re-checked after the membership await (`auth.ts:39,41-42`); cross-workspace/wrong-user exact-match denies; catch-all → `access-denied` (`auth.ts:45`). Adapter: captured-token pinning (`supabase.ts:97`), workspace pinning, viewer-write deny, future-`checkedAt` deny (`supabase.ts:77-80`). SQL: `session_context` verifies gateway `auth.jwt()`/`auth.uid()`, issuer (from unseeded settings — denies until owner seeds), aud/role, exp, live session row, ban/deletion, `not_after` clamp (`001_identity_evidence.sql:172-206`); `assert_actor` compares caller JSON to derived authority, never trusts it (`:224-241`).
- **C2 Scoped server authority**: server-injected adapters only; browser runtime refused at construction and per operation (`supabase.ts:30,44`; `storage.ts:39,58`; `repository.ts:74`); exact-HTTPS-origin pinning; per-request/bearer/workspace construction; workspace is an untrusted selector everywhere.
- **C3 Immutable bindings**: `evidenceRecordSchema` refine forces `image.objectKey === privateObjectKey(workspaceId, image)` (`repository.ts:18-23`); server generates all identity/time fields — zero caller-supplied identity/path (`repository.ts:86`); SQL `BEFORE UPDATE OR DELETE` triggers deny mutation of evidence/applications/objects (`sql:156-165`); applications PK + ON CONFLICT DO NOTHING + FOR SHARE re-read + `IS DISTINCT FROM` → permanent one-snapshot binding (`sql:266-272`); evidence/object-version uniqueness (`sql:117-118`).
- **C4 SQL grants/search_path/RLS/lock ordering**: roles NOLOGIN/NOSUPERUSER/NOBYPASSRLS; temporary owner membership revoked at transaction end (`sql:10,339-340`); `authenticated` gets only schema USAGE + exactly seven RPC EXECUTEs (`sql:332-338`); auth-schema grants narrow — `UPDATE(id)` solely as the `FOR SHARE` prerequisite, and no function writes auth.* (only `SELECT ... FOR SHARE` at `:198,:201`); every function pins `search_path = pg_catalog` (no unpinned SECURITY DEFINER); ENABLE + FORCE RLS with owner-only policies on all eight tables (`sql:148-155`); deterministic lock order user → session → membership → source/access, spend ledger singleton FOR UPDATE before authority for all writers, `clock_timestamp()` rechecks after lock waits; no ABBA pattern found at source level.
- **C5 Atomic reservations/claims/unknown-liability**: ledger CHECK `incurred + unresolved <= ceiling`; **initial ledger disabled with ceiling 0 — applying this migration could not enable paid execution** (`sql:132`); exact-replay idempotent vs `idempotency collision` on any mismatch (`sql:331-334`); single-winner claim via singleton lock + UNIQUE claim_id, owner-configured hold only (`sql:338-339`); complete marks `unresolved` without releasing holds (`sql:341-343`); no release/reclaim/refund/reset path exists anywhere; attempt/reservation/claim IDs permanently unique.
- **C6 Response validation**: 64 KiB streamed cap, ok/redirect/body checks (`supabase.ts:60-70`); evidence insert requires the exact committed-row echo (double strict parse + canonicalized JSON equality) — error/malformed/lost-ack cannot fabricate a receipt (`supabase.ts:112-116`; `repository.ts:87-88`); authorized `null` read supported; spend stays `Promise<unknown>` with existing frozen `executeReserved` as sole decoder.
- **C7 No retry-without-idempotency**: single-attempt RPC with abort+timeout race, zero retry loops in any module; failed/ambiguous insert yields no receipt and nothing re-dispatches.
- **C8 No secrets in source/logs**: all failures collapse to `Persistence unavailable` / `access-denied` / `storage-unavailable`; no console/log statements; no token/URL/byte content in errors; no `.env` loading; sweep clean (sole hit = gate config parsing explicit operator-supplied test credentials, not an embedded secret).

## Defect vs. absent-future-adapter distinction (per handoff)

**Real source defects found: NONE (critical/high: zero).**

Explicitly absent future adapters / external gates — **NOT defects**: concrete `PrivateObjectStore`, managed Supabase session verifier acceptance, durable review history/list, orphan reconciliation, authenticated redemption gateway (disclosed bearer URLs survive revocation until expiry — honestly documented at `storage.ts:17-19`), and the complete DB behavioral harness (`test:db` cannot pass by design; even catalog success ends nonzero with the UNIMPLEMENTED-suite blocker, `scripts/db-gate.ts:21-22`).

## Out of scope / remains unverified (must not be claimed)

Actual DB behavior (RLS/grant enforcement on a real target, concurrency races, migration applicability/one-shot semantics), managed JWT verification/session revocation, private-object runtime behavior/bucket ACLs, durable history, and all of the builder's own "exact remaining integration gates" 1–7 in `docs/reviews/19-phase4-persistence-source.md`.

## ARGUS evidence index (this review)

argus-01-phase4-claims-map.log · argus-02-unit-full.log · argus-03-typecheck.log · argus-04-focused-foundation.log · argus-05-focused-persistence.log · argus-06-dbgate-refusal.log · argus-07-source-audit-auth-adapter.log · argus-08-source-audit-storage-repo.log · argus-09-source-audit-sql-gate.log · argus-10-build.log
(Bundle + worktree setup: argus-00/argus-01 in ttb-phase5-evidence.)
