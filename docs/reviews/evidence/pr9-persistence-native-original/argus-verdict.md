# Round 24 — Independent Review: PR #9 Persistence (save-and-reopen)

**Verdict: PASS (with findings)**

Reviewer: ARGUS build agent (independent, read-only)
Date: 2026-09-20 (EDT)
Repo: https://github.com/crazyscoob89/ttb-label-verify

---

## 1. Commits reviewed (Step 0 — commit resolution)

Fetched PR #9 into the existing clone's refs without disturbing the stale detached checkout at `106aac2`:

```
cd "C:\Users\alexm\Projects\ttb-label-verify"
git fetch origin +refs/pull/9/head:refs/remotes/origin/pr-9 --no-tags
  * [new ref]  refs/pull/9/head -> origin/pr-9
```

Both target commits resolve. No substitution or guessing was required.

| Target | Resolved SHA | Type |
|---|---|---|
| persistence code `e721936` | `e721936518e36b7c6d65b5649308f21d1b57e784` | commit |
| published evidence `474c887` | `474c8879aea48582e79e738fc061ded287b7e858` | commit |
| `refs/remotes/origin/pr-9` head | `474c8879aea48582e79e738fc061ded287b7e858` | — |

Verified relationships:

- `git merge-base --is-ancestor e721936 474c887` → **YES** (474c887 is a docs-only commit on top of the persistence code).
- `git merge-base --is-ancestor 106aac2 474c887` → **YES** (the prior Windows ACL fix IS in this candidate's history).

**SHA actually reviewed and verified natively: `474c8879aea48582e79e738fc061ded287b7e858`** (contains `e721936518e36b7c6d65b5649308f21d1b57e784` as an ancestor).

Commit range `fa56bcc..474c887`:

```
474c887 docs: record ARGUS batch PASS and durable save-reopen evidence
e721936 Add private SQLite review snapshots, durable receipts and history reopen
fa56bcc docs: preserve live provider results and guarded batch review handoff
```

Diff scope: 57 files, +2951 / −70. Application code changes are confined to `web/lib/*`, `web/components/*`, `web/app/api/reviews/`, `web/scripts/provision-reviews.ts`, and `web/tests/*`; the remainder is docs/evidence.

**Review method:** clean detached scratch worktree at `C:\Users\alexm\Projects\ttb-pr9-review` (`git worktree add --detach`). No source file was edited, nothing committed, nothing pushed. The existing checkout remained at `106aac2`.

---

## 2. Commands run and exact observed outputs

Environment: Windows 10.0.26200 x64, normal (non-elevated) user, local NTFS, PowerShell 5.1 for the native ACL probe.

```
node --version
  v22.22.2
npm --version
  10.9.7
git --version
  git version 2.54.0.windows.1
```

Dependencies installed with `npm ci` in `web/`: `added 69 packages, and audited 70 packages in 32s`, `found 0 vulnerabilities`.

### 2.1 `npm test` (full suite, from `web/`)

```
> vitest run

 ❯ tests/live-batch-route.test.ts (5 tests | 5 failed) 31708ms
   × preparation sanitizes on server, binds application, and never reserves or dispatches 5193ms
   × same intent survives handler restart without another dispatch or hold; changed IDs do not evade dedup 5801ms
   × failed paid intent remains consumed with its full hold; replay never dispatches again 6828ms
   × edited application needs new preparation and explicit new attempt; no trusted browser hash/cost 6733ms
   × two server slots admit work, third fails closed and duplicate racing intent dispatches once 7147ms

 Test Files  1 failed | 27 passed (28)
      Tests  5 failed | 555 passed | 5 skipped (565)
   Start at  22:13:43
   Duration  82.57s
```

**Observed by me: 555 passed, 5 failed, 5 skipped, of 565 total.** I do **not** restate AVA's "565 passing" as my own — see Finding H-1.

Failure diagnostics were of exactly two shapes:

```
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ tests/live-batch-route.test.ts:68:1
```

```
Error: EBUSY: resource busy or locked, unlink
'C:\Users\alexm\AppData\Local\Temp\ttb-ledger-fixture-3CYGek\spend.sqlite'
 ❯ tests/live-batch-route.test.ts:13:53   (afterEach rmSync cleanup)
```

### 2.2 Attribution of the 5 failures (timeout vs. genuine defect)

Isolated re-run, default timeout:

```
npx vitest run tests/live-batch-route.test.ts
 Test Files  1 failed (1)
      Tests  4 failed | 1 passed (5)
   Duration  28.44s
```

Same file with a raised timeout only — no code change:

```
npx vitest run tests/live-batch-route.test.ts --testTimeout=120000
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  38.30s
```

**All 5 pass when only the timeout is raised.** `web/vitest.config.ts` sets no `testTimeout`, so these tests inherit Vitest's 5000 ms default. `live-batch-route.test.ts` has no `vi.setConfig({testTimeout:...})`, unlike the new persistence tests (`saved-reviews.test.ts` and `saved-review-route.test.ts`), which both declare `vi.setConfig({testTimeout:60000})`.

Each guarded ledger operation shells out to `powershell.exe -EncodedCommand` (`web/lib/ledger-security.ts` → `checkWindows`) for a read-only DACL/owner inspection. On this Windows box each such spawn costs on the order of hundreds of ms, and these tests perform many per test. The `EBUSY ... unlink` errors are the `afterEach` cleanup failing to delete a SQLite file whose handle was still open *because* the test was torn down mid-flight by the timeout — they are a consequence of the timeout, not an independent fault.

**This is a Windows test-harness configuration issue, not a product defect and not a security rejection.** The same five tests are recorded as passing in AVA's Linux evidence (`focused-unit.txt`: `tests/live-batch-route.test.ts (5 tests) 568ms` — i.e. ~57× faster than the 5 s budget on Linux, versus ~5–7 s per test here).

### 2.3 Prior-round Windows ACL fixture failures — RESOLVED

The brief asked specifically whether the earlier `sqlite-spend-native-security.test.ts` PowerShell 5.1 ACL fixture failures persist on this candidate. They do not:

```
npx vitest run tests/sqlite-spend-native-security.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Duration  36.89s
```

**11/11 pass.** The fix (`106aac2 fix: use literal Windows ACL APIs and verify unsafe test fixtures`) is an ancestor of this candidate. Fixture ACL writes stayed inside disposable temp dirs under `%TEMP%\ttb-ledger-fixture-*`; no elevation, no `SeSecurityPrivilege`, no host/shared ACL change.

### 2.4 The 5 skipped tests

Skips are platform guards, all legitimately inapplicable on Windows:

- `sqlite-spend-security.test.ts:94` — `test.runIf(process.platform !== 'win32')` POSIX provisioning check (1)
- `sqlite-spend-security.test.ts:99` — `test.runIf(...).each(['', '-wal', '-shm', '-journal'])` POSIX sidecar checks (4)

### 2.5 `npm run typecheck`

```
> tsc --noEmit
TYPECHECK EXIT: 0
```

Clean, zero diagnostics.

### 2.6 `npm run build`

```
> next build
▲ Next.js 16.3.5 (Turbopack)
✓ Compiled successfully in 5.8s
  Finished TypeScript in 7.2s
✓ Generating static pages using 7 workers (5/5) in 1144ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/comparisons
├ ƒ /api/reviews/[[...path]]
└ ○ /review

BUILD EXIT: 0
```

The new review endpoint is correctly emitted as dynamic (`ƒ`), consistent with `dynamic='force-dynamic'`.

---

## 3. Scope review of the persistence implementation

### Durable storage across restart — SUBSTANTIATED
`web/lib/review-store.ts` uses `node:sqlite` `DatabaseSync` against an explicitly provisioned private file (`reviews.sqlite`) resolved by `reviewPath()`. `PRAGMA journal_mode=DELETE; synchronous=FULL` is set both at provisioning and on every open — durable-by-default rather than WAL-with-late-checkpoint, which is the right conservative choice for a single-host demo. The label image (BLOB), the full comparison record (JSON) and the review intent are all stored server-side, so a reopen after restart reconstructs from the DB and not from browser memory. `saved-reviews.test.ts` explicitly closes and reopens the store mid-test and re-asserts the receipt, record, and image bytes.

### Schema / migrations — SOUND, deliberately minimal
`review_meta(version CHECK(version=1))` is asserted on every open; a mismatch throws and closes the handle. There is no auto-create and no auto-migrate at runtime: provisioning is only reachable via `scripts/provision-reviews.ts`, which hard-requires the literal argument `--create-new-private-review-store`. Missing store ⇒ `503 reviews-disabled`, never silent creation. Good fail-closed posture.

### Transactions and fail-closed behavior — CORRECT
`transaction()` wraps work in `BEGIN IMMEDIATE` / `COMMIT` with `ROLLBACK` on any throw. `snapshot()` computes capacity totals and inserts inside that transaction, so the bounds check cannot race. Append-only is enforced at the SQL layer by four triggers (`snapshots_no_update`, `snapshots_no_delete`, `reviews_no_update`, `reviews_no_delete`), verified by the test opening a raw `DatabaseSync` and confirming `DELETE FROM reviews` and `UPDATE snapshots` both throw. `foreign_keys=ON` plus `comparison_id REFERENCES snapshots(id)` prevents orphan reviews.

### Idempotency — CORRECT, and genuinely restart-surviving
`reviews.key` is `UNIQUE` and holds the client-supplied `idempotencyKey`. On replay the stored canonical `request` JSON is compared; identical ⇒ the original receipt is returned, divergent ⇒ `409 idempotency-conflict`. A second guard rejects a *different* key against an already-reviewed comparison (`409 comparison-already-reviewed`). Because the key lives in the DB, replay after a process restart returns the same receipt — the test asserts exactly this, and the route test further asserts replay consumes **no** additional provider call (`transport.mock.calls.length` unchanged).

### Auth / authorization on read paths — CORRECT
`demoAccess()` was factored out of `demo-route.ts` into `demo-security.ts` and is now applied identically to comparison, save, list, detail, and evidence. It requires: demo enabled, a 32–256 char secret, `timingSafeEqual` over SHA-256 of the supplied code, exact `Origin` match, request-URL origin match, and `sec-fetch-site` in `{same-origin, null}`. The route test loops all four endpoints × three header mutations (code / origin / site) and asserts `403` with `cache-control: no-store` and — notably — `denied.bodyUsed === false`, i.e. rejection happens before the body is read. Images are not public: `/evidence` runs `detail()` first, so it inherits the same fence. `POST`-only for reads is an unusual but deliberate and documented choice that keeps the Origin fence mandatory on every request.

### Spend-ceiling guards left intact — YES
`demo-route.ts` retains every ledger guard; the diff only *replaces the inlined copy* of `demoAccess`/`boundedBody` with the shared import (byte-for-byte equivalent logic) and adds the `completed` snapshot sink. The snapshot sink is wrapped in `try{...}catch{}` and explicitly cannot trigger a paid retry: on failure the completed comparison is still returned with `reviewAvailability:'snapshot-unavailable'` and no `comparisonId`. The review store is a *separate* file and `reviewPath()` refuses `TTB_REVIEW_DATA_DIR === TTB_DEMO_DATA_DIR`, so reviews can never touch the spend ledger. The route test asserts a save performs zero additional transport calls. `sqlite-spend-native-security.test.ts` (11/11) and `sqlite-spend-security.test.ts` pass.

### Bounds / DoS — REASONABLE
`REVIEW_LIMITS` caps 200 snapshots, 128 MiB total, 256 KiB per record, 384 KiB per request. `boundedBody` enforces both `content-length` and streamed size (the test proves a lying/absent `content-length` with an oversized stream still yields `413`), with a 5 s read timeout. `max_page_count=40960` caps the DB at the SQLite level. Concurrency limited to 2 (`429 busy`). `list()` is `LIMIT 50` with a validated integer offset.

### Evidence integrity binding — STRONG
`snapshot()` recomputes SHA-256 of the image and requires it to equal `record.imageSha256`, re-runs `checkedRecord()` (full Zod + recomputed comparison), and restricts MIME to png/jpeg. Save re-derives policy server-side via `buildUnsavedDraft(record, intent)` against the *stored* record, so a forged `bindingKey` or an unconfirmed/pass-blocked intent is rejected (`409`) — the route test proves the forged-`applicationVersion` binding and the `outcome:'pass'` case both `409`, and that passing an extra `record` field is `400` (strict schema rejects client-asserted comparison authority).

### Published evidence at 474c887 — LARGELY SUBSTANTIATED
- `SHA256SUMS` for `pr9-argus-batch-pass/`: I recomputed all 10 entries — **all OK**, including the cross-referenced `../../26-live-batch-argus-pass.md`.
- `manifest.json` for `pr9-durable-reviews/` discloses source vs. published SHA-256 per artifact and names the normalization transform; where text was normalized the two hashes differ, which is honest rather than concealed.
- Restart survival: `service-restart.txt` shows `READY pid=59962` → `READY pid=61128`, a real process replacement, with three `SYNTHETIC_PROVIDER_CALL` lines confirming the provider was simulated (consistent with the no-paid-calls constraint).
- Desktop + mobile: `browser-desktop.txt` / `browser-mobile.txt` each show `1 passed` for `durable-reviews.spec.ts`.
- Saved DB contents: `sqlite-verification.txt` reports `integrity_check: ok`, 3 snapshots, 2 reviews, `dbMode 600`, `identicalRecordAfterRestart: true`, with a normalized image SHA-256 matching the browser proof.
- Two-label batch catching the alcohol mismatch: `real-batch-report.md` shows `match.png` all seven fields matching, and `discrepancy.png` with ABV **45% vs 40** flagged as a confirmed mismatch, Pass blocked, both left **UNSAVED** with a truthful zero saved count. Ledger: $3 → $5 held, $20 remaining of $25, no release/refund/reset. Note this batch ran on baseline **75fe83d**, not on `e721936` — the doc states this plainly.

---

## 4. Findings (severity-ranked)

### Critical
None.

### High

**H-1 — The published "565 tests passed" claim does not reproduce on native Windows; it is a Linux-only result.**
`docs/reviews/27-durable-save-reopen-candidate.md` presents "**565 tests / 28 files passed**" in its verification table (attributed to the AVA parent on Node 24.21.0). On this Windows box the same suite yields **555 passed / 5 failed / 5 skipped**. The total of 565 matches, but 5 of those are *skipped* POSIX-only tests here and 5 more *fail*. The claim is therefore not portable and should be qualified as platform-specific. The underlying cause is environmental (H-2), not a product defect — which is why this is High and not Critical, and why it does not by itself sink the candidate.

**H-2 — `live-batch-route.test.ts` has no per-file timeout override and is not viable on Windows at the 5 s default.**
The two *new* persistence test files correctly declare `vi.setConfig({testTimeout:60000})`; `live-batch-route.test.ts` does not, and `vitest.config.ts` sets no global. Because every guarded ledger op spawns `powershell.exe` for ACL inspection, each test needs ~5–7 s on Windows versus ~0.1 s on Linux. Result: a red suite on any Windows developer machine or Windows CI runner, plus misleading cascading `EBUSY` cleanup errors. Fix is a one-liner (`vi.setConfig({testTimeout:60000})` in that file, or a global `testTimeout` in `vitest.config.ts`). I confirmed the tests are otherwise correct — they pass unmodified at `--testTimeout=120000`.

### Medium

**M-1 — Retention and orphan cleanup are absent by construction, and the brief lists them in scope.**
There is no retention policy, no TTL, no purge path, and no orphan-snapshot cleanup. Snapshots are created on *every* completed comparison, but a review is only written when a human explicitly saves — so unreviewed snapshots accumulate permanently and count against the 200 / 128 MiB caps. Once the cap is hit, `snapshot()` throws `507 review-capacity` and, from then on, new comparisons silently degrade to `reviewAvailability:'snapshot-unavailable'` — completed work becomes permanently unsaveable with no operator remedy short of provisioning a brand-new store. The `DELETE` triggers mean even a deliberate admin purge is impossible without recreating the DB. This is defensible for a bounded single-host demo and `27-...md` does disclose that "retention/erasure automation ... remain outside this demo implementation", but the capacity cliff deserves an explicit operator note and, eventually, a supported prune path.

**M-2 — The persistence tests' permission assertions are silently no-ops on Windows.**
Both `saved-reviews.test.ts:39` and `saved-review-route.test.ts:53` wrap their tamper checks in `if(process.platform!=='win32')`. So the assertions that a weakened-mode DB is rejected (`new ReviewStore(path)` throws / `/list` returns 503) never execute here. `ReviewStore` does call `assertPrivateLedger()` — which has a real, well-constructed native NTFS DACL path — but that Windows path is exercised only indirectly via the spend-ledger suite, never against `reviews.sqlite` specifically. A Windows-native negative test for the review store would close the gap.

**M-3 — No tenant/record scoping exists; identity is a single shared code.**
Every holder of `TTB_DEMO_ACCESS_SECRET` sees every saved review, every record and every label image via `/list`, `/{id}` and `/{id}/evidence`. There is no per-user or per-tenant partition. The code is honest about this — the receipt hardcodes the literal `identity: 'Shared demo access code — NOT an individually authenticated reviewer'`, which is also pinned by the Zod contract so it cannot be quietly dropped. Correctly scoped as a demo limitation, but it is a hard blocker for anything resembling real COLA review and must not be represented otherwise.

### Low

**L-1 — Mojibake in user-visible strings.** The em-dash in the `identity` literal and in the `use-durable-review.ts` UNSAVED error message appears as `â€"` (UTF-8 read as CP-1252) in `review-store.ts`, `saved-review-contract.ts`, and `use-durable-review.ts`. Because the literal is pinned identically in both producer and Zod validator the contract still matches, but the string is wrong and will render badly in the UI.

**L-2 — All HTTP verbs alias to the same handler.** `route.ts` exports `GET/PUT/PATCH/DELETE/OPTIONS/HEAD` all as `POST`, with non-POST rejected at `405` inside the handler. This is intentional (it guarantees the Origin fence runs first and prevents Next.js from serving an unfenced default), but it is surprising and merits a comment at the export site rather than only in `review-route.ts`.

**L-3 — Node version drift.** This box runs **v22.22.2**; the brief specified Node 24 and AVA's evidence was produced on Node 24.21.0. `package.json` engines allow `>=22.12.0 <23 || >=24 <25`, so v22.22.2 is in-range and `node:sqlite` is available (with the expected `ExperimentalWarning`). All gates passed under 22, but note this is not a Node 24 verification.

**L-4 — `node:sqlite` is still flagged experimental.** Every worker emits `ExperimentalWarning: SQLite is an experimental feature and might change at any time`. Acceptable for a demo; pin/track before any production use.

---

## 5. Verdict

**PASS.**

The persistence implementation at `e721936` (verified via `474c887`) is materially sound against the review scope. Server-owned evidence authority is real — the client cannot assert a comparison, forge a binding, or bypass policy. Saves are transactional, append-only at the SQL layer, and idempotent across process restart. Read paths carry the same Origin + constant-time shared-code fence as the paid route, including the private image endpoint. The spend-ceiling guards are untouched and independently verified (`sqlite-spend-native-security.test.ts` 11/11 on native Windows), and the snapshot sink is structurally incapable of causing a paid retry.

Typecheck and production build are clean (exit 0). The 5 test failures I observed are attributable to a missing per-file timeout override interacting with slow `powershell.exe` ACL inspection on Windows — proven by the same 5 tests passing unmodified at a raised timeout, with no source change. Per the brief, I am explicitly **not** reporting REVISE on an environment failure I can attribute to the harness rather than the code; and I am **not** reporting PASS on a timeout, because I isolated, reproduced, and root-caused each one rather than letting it stand as an unexplained red.

The prior round's Windows ACL fixture failures are genuinely resolved on this candidate, and those were fixture/setup errors — not security rejections — exactly as the brief cautioned.

PASS is conditional on the following being addressed, none of which blocks the persistence design itself:

1. **H-2** — add `vi.setConfig({testTimeout:60000})` to `live-batch-route.test.ts` (or a global `testTimeout`) so the suite is green on Windows.
2. **H-1** — qualify the "565 passed" claim as Linux/Node-24-specific; on native Windows the honest figure is 555 passed / 5 skipped, with 5 harness-limited.
3. **M-1** — document the 200-snapshot / 128 MiB capacity cliff and the permanent `snapshot-unavailable` degradation it causes; plan a supported prune path.
4. **M-2** — add a Windows-native negative permission test against `reviews.sqlite`.
5. **L-1** — repair the `â€"` mojibake in the receipt identity string and the UNSAVED error text.

PASS is a code-quality judgment on this tranche only. It is **not** deployment authority, not a COLA-approval claim, and not an endorsement of the shared-code identity model for real reviewers (M-3).

---

## 6. Constraint compliance

- Read-only: no source file edited; nothing committed; nothing pushed. Existing checkout left at `106aac2`. This verdict file is the only write.
- No paid or live model calls. All provider interaction was `vi.fn()` mock transport or `SYNTHETIC_PROVIDER_CALL`. No API credentials present in the environment.
- Canonical spending ledger never accessed or provisioned. All ledger work used disposable `%TEMP%\ttb-ledger-fixture-*` dirs, removed by the suite.
- No elevation, no `SeSecurityPrivilege` grant, no host/shared ACL changes. Fixture ACL writes confined to disposable scratch dirs.
- Verified natively on Windows, normal user, local NTFS.

**Reviewed SHA: `474c8879aea48582e79e738fc061ded287b7e858` (= `refs/pull/9/head`), containing persistence commit `e721936518e36b7c6d65b5649308f21d1b57e784`.**

Scratch worktree used for verification: `C:\Users\alexm\Projects\ttb-pr9-review` (disposable; remove with `git worktree remove`).
