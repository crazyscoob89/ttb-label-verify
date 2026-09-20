# PR #9 — Repair Cycle #2 Native Windows Acceptance Verification

**Verdict: PASS**

**To:** AVA
**From:** ARGUS (read-only native Windows reviewer)
**Frozen SHA reviewed:** `106aac25a37e05840aa38e41ccc9f8db4c6009e6`
**Baseline compared against:** `1df409401e76cc964b5f774c4bd160e254532f1f`
**Date:** 2026-09-20
**Report path (outside checkout):** `C:\Users\alexm\.hermes\pr9-r2-verification\PR9-R2-NATIVE-WINDOWS-VERDICT.md`

---

## Environment

| Item | Value |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (x64) |
| Node | v22.22.2 |
| npm | 10.9.7 |
| Shell | Windows PowerShell 5.1 (the exact host that caused the r1 bracket defect) |
| **Elevation** | **NOT Administrator** (`IsInRole(Administrator) = False`) |
| Filesystem | local fixed NTFS |
| Checkout | detached HEAD at `106aac2`, clean tree, no branch moved |

Running **unelevated** is deliberate and material: it is the precise condition under which
the r1 fixture tests died on `SeSecurityPrivilege`.

---

## 1. Fresh full native reproduction — PASS

Full suite was run, not a spot-check of the two previously failing tests.

| Gate | Result |
|---|---|
| `npm ci` | PASS — 69 packages, 70 audited, **0 vulnerabilities** |
| `npm test` (full) | **PASS — 23/23 files; 506 passed, 5 skipped, 0 failed (511 total)** |
| `npm run typecheck` | PASS — exit 0 |
| `npm run build` | PASS — exit 0, Next 16.3.5, `/api/comparisons` = ƒ (dynamic) |

### Reconciliation with your Linux numbers
Linux reported 511 passed / 0 skipped. Windows reports 506 passed / **5 skipped**. The
5 skips are exactly the POSIX-only tests, enumerated from the JSON reporter:

```
native POSIX: provisioning refuses a public parent before creating ledger
native POSIX: opening rejects exposed ledger/sidecar
native POSIX: opening rejects exposed ledger/sidecar -wal
native POSIX: opening rejects exposed ledger/sidecar -shm
native POSIX: opening rejects exposed ledger/sidecar -journal
```

511 = 506 + 5. No Windows security test is skipped, and no Windows test is silently
opted out. The counts are fully consistent.

### The r1 failures are gone
All 11 tests in `sqlite-spend-native-security.test.ts` now pass natively (verbose run),
including the three that failed at `1df4094`:

```
✓ native security: exposed parent refuses provisioning before any ledger is created  1590ms
✓ native security: exposed parent denies existing ledger                             2540ms
✓ native security: exposed  denies existing ledger                                   2433ms
✓ native security: exposed -wal denies existing ledger                               2448ms
✓ native security: exposed -shm denies existing ledger                               2668ms
✓ native security: exposed -journal denies existing ledger                           2548ms
✓ native security: real WAL and SHM retain private permissions                       2475ms
✓ native security: directory junction/symlink in parent path is rejected              304ms
✓ native security: hardlinked ledger is rejected                                     1371ms
✓ native security: actual provisioning CLI accepts private Unicode/spaced directory  3501ms
✓ native security: renamed bracket paths preserve acceptance and reject real exposure 3939ms
```

---

## 2. Bracketed paths — fixed AND provably not a no-op — PASS

This was the key risk: a "fix" that simply stops rejecting brackets by weakening the check.
I probed the guard directly from out-of-tree code (`probes/bracket-probe.mts`), importing
`assertPrivateLedger` / `assertPrivateLedgerCreation` without modifying the repo.

| # | Scenario | Result | Expected |
|---|---|---|---|
| P1 | Safe bracketed dir `ledger [literal]`, creation check | **ACCEPTED** | accepted — r1 false positive fixed |
| P1 | Safe bracketed db `spend[literal].sqlite`, open check | **ACCEPTED** | accepted |
| P2 | Bracketed dir clean (positive control) | ACCEPTED | baseline sound |
| P2 | Bracketed **dir** + `Everyone:ReadAndExecute` | **REJECTED** | rejected — not a no-op |
| P3 | Bracketed **file** + `Everyone:ReadAndExecute` | **REJECTED** | rejected — not a no-op |
| P4 | Bracketed dir with **default inherited** ACL | **REJECTED** | rejected |
| P5 | ASCII control clean / exposed | ACCEPTED / **REJECTED** | isolates brackets as sole variable |

**Conclusion:** brackets are now handled literally *and* the security semantics are
unchanged for bracketed paths. The fix discriminates on permissions, not on punctuation.
Switching `Get-Acl`/`Get-Item` → `[IO.File]::GetAttributes` +
`GetAccessControl('Access, Owner')` is the correct root-cause fix for PS 5.1 glob expansion
of `[...]` under `-LiteralPath`.

---

## 3. The two negative security tests — genuinely exercised, unelevated — PASS

I reproduced the fixture's exact `expose` logic and the test's assertion sequence
out-of-tree (`probes/vacuity-probe.mts`), **as a non-admin user**, reporting each stage
separately so a setup error can never masquerade as a security pass.

Ran as admin: **False**

| Target | stage1 clean accepted | stage2 unelevated expose | stage3 unsafe ACE proven on disk | stage4 guard rejects | Verdict |
|---|---|---|---|---|---|
| PARENT DIR | PASS | **PASS (exit 0, no SeSecurityPrivilege)** | PASS | **PASS** | NON-VACUOUS |
| DB FILE | PASS | **PASS (exit 0, no SeSecurityPrivilege)** | PASS | **PASS** | NON-VACUOUS |
| WAL SIDECAR | PASS | **PASS (exit 0, no SeSecurityPrivilege)** | PASS | **PASS** | NON-VACUOUS |

Observed ACL after exposure (stage 3), confirming the unsafe state genuinely existed
before rejection was asserted:

```
S-1-1-0=ReadAndExecute, Synchronize/Allow | S-1-5-21-...-1001=FullControl/Allow
```

**Total failures: 0.**

Two independent reasons the r1 vacuity defect is closed:

1. **Mechanism:** the fixture now reads `AccessControlSections::Access` only (no SACL
   section), so `SetAccessControl` no longer demands `SeSecurityPrivilege`. Confirmed
   empirically at exit 0 unelevated — not merely by reading the diff.
2. **Structure:** the fixture performs its own readback and throws
   `'Fixture exposure not observed'` if the ACE did not land, and the tests now assert a
   positive control (`expect(...).not.toThrow()`) *before* the mutation. A broken inspector
   or a failed fixture write now fails the test instead of earning a false "rejected" pass.

This directly resolves my r1 objection that the failure mode was indistinguishable from a
real rejection.

---

## 4. CAS ceiling / dedup on Windows — PASS

`web/lib/spend.ts`, `web/lib/sqlite-spend.ts`, `web/lib/demo-route.ts`, `web/lib/auth.ts`
and `web/app/api/comparisons/` are **byte-identical** between `1df4094` and `106aac2`
(`git diff --name-only` returns empty for those paths). I nonetheless re-verified
empirically on Windows at this SHA rather than inheriting the prior result
(`probes/cas-probe.mts`):

```
ceiling=25000000 reservation=1000000
PASS reserve #1 fresh                                  -> ACCEPTED
PASS reserve replay same reservationId+attemptId       -> REJECTED(UNIQUE constraint failed: holds.attempt)
PASS reserve replayed attemptId w/ new reservationId   -> REJECTED(UNIQUE constraint failed: holds.attempt)
PASS claim #1 (first winner)                           -> ACCEPTED
PASS claim #1 again with different claimId (replay)    -> REJECTED(Claim denied)
PASS complete with WRONG claimId                       -> REJECTED(Completion denied)
PASS complete with correct claimId                     -> ACCEPTED
PASS complete replay after unresolved                  -> REJECTED(Completion denied)
ceiling: reservations accepted=25, unresolved=25000000, ceiling=25000000
PASS total 25000000 <= ceiling 25000000
PASS accepted count 25 === ceiling/reservation 25
PASS concurrent burst of 30 at ceiling admitted=0
PASS post-burst total 25000000 <= 25000000
FAILURES: 0
```

Ceiling is exact (25/25, never 26), dedup is permanent on both `reservationId` and
`attemptId`, claim is single-winner, and completion is bound to the correct `claimId`.
`BEGIN IMMEDIATE` + `UPDATE ... WHERE state='reserved'` + `changes !== 1` remains a correct
CAS on Windows.

*Methodology note:* my first probe run reported 4 failures. That was a defect in **my probe**
(an incomplete `SpendBinding` missing `imageSha256`/version fields) — the store correctly
rejected the invalid bindings. Corrected probe shown above: 0 failures. Recording this so
the intermediate log in `probe-cas.log` is not misread.

---

## 5. `/api/comparisons` fail-closed — PASS

Route is unchanged by this diff. `app/api/comparisons/route.ts` is still just
`export const POST = createDemoHandler();`. The handler returns `403 access-denied` unless
**all** of `TTB_DEMO_ENABLED === 'true'`, a 32–256 char `TTB_DEMO_ACCESS_SECRET`,
`OPENROUTER_API_KEY`, a canonical `TTB_DEMO_ORIGIN`, an absolute `TTB_DEMO_DATA_DIR`, and
`TTB_DEMO_PERSISTENT_VOLUME === 'single-private-volume-v1'` are set — then additionally
enforces constant-time secret comparison (`timingSafeEqual` over SHA-256), `origin` match,
request-origin match, and `sec-fetch-site ∈ {same-origin, null}`. Ledger security is
validated by `SqliteSpendStore` **before** any body read or provider work. Build output
confirms the route is dynamic (ƒ), not statically prerendered. Defaults deny.

---

## 6. Secret scan `1df4094..106aac2` — CLEAN

Full diff scanned for `sk-or-v1`, `sk-ant-`, `sk-proj-`, `ghp_`, `github_pat_`, `AKIA`,
PEM private-key headers, JWTs (`eyJhbGciOi`), Slack tokens, Google `AIza`, `client_secret`,
inline passwords and long bearer tokens. **No matches.** The diff touches only docs/review
records, evidence logs, `ledger-security.ts`, the test fixture, and two test files. Added
literals are synthetic/structural only. No `.env` beyond `.env.example`.

---

## 7. No live/paid provider calls — CONFIRMED

- `vitest.config.ts` excludes `tests/e2e/**`; only `tests/**/*.test.ts` run.
- Every `createDemoHandler(...)` / `createOpenRouterProvider(...)` in tests receives an
  injected `vi.fn()` transport or synthetic key (`offline-test-key`, `offline`).
- The single `openrouter.ai` occurrence in tests is a URL **assertion**
  (`expect(url).toBe(OPENROUTER_ENDPOINT)`), not a request.
- A genuine 73-character `OPENROUTER_API_KEY` was present in the ambient environment for
  the entire run and **no network call was made** — strong evidence the default-deny gate
  holds rather than merely being untested.
- No ledger was provisioned outside disposable scratch directories; no spend occurred.

---

## Read-only compliance

| Invariant | Status |
|---|---|
| HEAD | detached at `106aac2` — no local branch moved or created |
| Working tree | clean (`git status --short` empty) |
| Edits to repo files | **none** |
| Commits / pushes / merges | **none** |
| `node_modules/` | gitignored; `npm ci` could not dirty tracked state |
| Fixture/ACL writes | confined to scratch dirs under `C:\Users\alexm\.hermes\...`, all removed |
| Elevation / privilege grants | none; ran unelevated throughout |

**No commit was made, deliberately.** The goal mandates "do not edit/commit/push/merge";
a checkpoint commit would violate the very constraint under verification. All probe code
lives outside the checkout.

---

## Evidence files (all outside the repo)

```
C:\Users\alexm\.hermes\pr9-r2-verification\
├── PR9-R2-NATIVE-WINDOWS-VERDICT.md   <-- this report
├── fullsuite.log                       full npm test output
├── typecheck.log                       tsc --noEmit
├── build.log                           next build
├── probe-bracket.log                   bracket accept/reject matrix
├── probe-cas.log                       CAS/ceiling/dedup results
├── probe-vacuity.log                   4-stage non-vacuity proof
└── probes\
    ├── bracket-probe.mts
    ├── cas-probe.mts
    └── vacuity-probe.mts
```

---

## Verdict

**PASS.**

Both r1 blocking defects are genuinely resolved on native Windows, and resolved for the
right reasons:

- **(a) Bracketed-path false positive — fixed at root cause.** Literal .NET file/ACL APIs
  replace the PS 5.1 provider cmdlets. Safe bracketed paths are accepted; unsafe bracketed
  paths (Everyone ACE on dir or file, default-inherited ACL) are still rejected. Verified
  not to be a no-op.
- **(b) Vacuous negative tests — fixed at root cause.** DACL-only access with no audit
  section removes the `SeSecurityPrivilege` dependency; confirmed unelevated at exit 0.
  Positive controls plus fixture readback mean a broken inspector or failed mutation now
  fails loudly instead of counting as a security success.

Full native suite is green with counts that reconcile exactly against Linux. CAS ceiling
and dedup hold under replay and concurrency on Windows. The route remains fail-closed, the
diff is secret-free, and no paid calls occurred even with a live API key present.

One prior non-blocking suggestion remains open and is **not** a condition of this PASS:
failures still collapse to the single string `Private ledger security check failed`, so
operators cannot distinguish "not NTFS" from "inherited ACL" from "stray ACE". Worth an
internal (non-HTTP-surfaced) reason code in a future change.

Nothing in scope blocks this PR. Native Windows acceptance is granted for
`106aac25a37e05840aa38e41ccc9f8db4c6009e6`.
