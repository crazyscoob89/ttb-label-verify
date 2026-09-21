# PR #9 — native Windows acceptance gate for correction commit `bfc1949`

**Verdict: PASS** (independent native Windows verification of the Windows-only test timeout).

Scope: this is a code-quality and gate-verification judgment on the correction diff only. It is **not** deployment
authority, **not** merge authority, **not** a COLA-approval claim, and **not** an endorsement of the shared-code
identity model (M-3, still open).

---

## 1. What was verified, and on what

| Item | Value |
|---|---|
| Repo | `C:\Users\alexm\Projects\ttb-label-verify` |
| Commit under test | `bfc19494ff22ad3905bb98fb865af5c149f36941` |
| Checkout mode | detached HEAD, read-only; no source edits |
| `refs/pull/9/head` | `bfc19494ff22ad3905bb98fb865af5c149f36941` |
| `refs/heads/ava/prototype-delivery` | `bfc19494ff22ad3905bb98fb865af5c149f36941` |
| Refs identical? | **Yes** — PR head and branch resolve to the same SHA |
| Baseline compared against | `474c887` (contains `e721936`) |
| Host | native Windows 10.0.26200 x64 (`Jarvis-1`), no container, no WSL |
| Node / npm | **v22.22.2** / **10.9.7** |
| Vitest | 5.0.1 |
| Next.js | 16.3.5 (Turbopack) |

Working tree was clean apart from one untracked prior review doc
(`docs/reviews/24-pr9-persistence-e721936-verdict.md`). No tracked file was modified by this review; the only file
written is this report.

---

## 2. Observed results — native Windows, measured here

All three gates run from `web/`. **`npm test` was run with no `--testTimeout` on the CLI**, so the committed
file-local fix is what is being exercised.

### 2.1 `npm test` (`vitest run`, no global override)

```
 Test Files  28 passed (28)
      Tests  560 passed | 5 skipped (565)
   Start at  08:23:21
   Duration  55.78s (tests 95%, import 3%, transform 2%)
```

Machine-readable confirmation from a second run with the JSON reporter:

```
numTotalTests=565  passed=560  failed=0  pending=5  suites=46
```

**Exit code 0. Zero failures.**

### 2.2 Typecheck

`npm run typecheck` → `tsc --noEmit` → **exit 0**, no diagnostics.

### 2.3 Build

`npm run build` → `next build` (Turbopack) → **exit 0**.
Compiled in 1953ms; TypeScript pass 4.6s; 5/5 static pages generated. Routes emitted: `/`, `/_not-found`,
`/api/comparisons`, `/api/reviews/[[...path]]`, `/review`.

---

## 3. Discrepancy against the claimed "565 passed" — flagged

**There is a discrepancy, and it is a labelling discrepancy, not a defect.**

- Claimed: **565 passed** (AVA, Linux / Node 24.21.0).
- Observed here: **560 passed / 5 skipped / 0 failed, total 565** (native Windows / Node 22.22.2).

The totals agree at 565; the *passed* count does not, because five tests are platform-gated off on Windows. I do not
adopt AVA's 565-passed figure as my own — on this host the honest figure is **560 passed, 5 skipped, 0 failed**.

The five skipped tests are all in `tests/sqlite-spend-security.test.ts`:

1. `native POSIX: provisioning refuses a public parent before creating ledger`
2. `native POSIX: opening rejects exposed ledger/sidecar ` (empty suffix)
3. `native POSIX: opening rejects exposed ledger/sidecar -wal`
4. `native POSIX: opening rejects exposed ledger/sidecar -shm`
5. `native POSIX: opening rejects exposed ledger/sidecar -journal`

These are gated by `test.runIf(process.platform !== 'win32')`. **That gating is pre-existing at `474c887`** — I
confirmed the identical `runIf` lines in the `474c887` blob. `bfc1949` did not add, widen, or introduce any skip.

Critically, **the skips are not the previously-failing tests.** The five prior failures were in
`live-batch-route.test.ts`; the five skips are POSIX-only ACL tests in a different file. No failure was converted
into a skip.

To AVA's credit, doc `28-native-timeout-and-report-correction.md` already labels 565-passing as
"Linux / Node24 evidence" and preserves the original Windows failure counts rather than rewriting them as green.
H-1 from the prior review is therefore **resolved**.

---

## 4. Does the timeout genuinely fix the 5 ACL failures, without weakening anything?

**Yes on both counts.**

### 4.1 The fix works, and the mechanism is confirmed

All five tests in `live-batch-route.test.ts` now pass in the full-suite native run, with measured durations:

| Test | Duration |
|---|---|
| preparation sanitizes on server, binds application, and never reserves or dispatches | 10,312 ms |
| same intent survives handler restart without another dispatch or hold; changed IDs do not evade dedup | 13,292 ms |
| failed paid intent remains consumed with its full hold; replay never dispatches again | 9,167 ms |
| edited application needs new preparation and explicit new attempt; no trusted browser hash/cost | 12,135 ms |
| two server slots admit work, third fails closed and duplicate racing intent dispatches once | 7,289 ms |

Every one exceeds Vitest's 5,000 ms default — which is precisely why they failed before — and every one is
comfortably under the new 60,000 ms budget (worst case 13.3s, ~4.5× headroom). The root-cause explanation
(real PowerShell ACL/owner inspection per fixture) is corroborated by the observed cost. This is a genuine fix,
not a masked one.

### 4.2 No assertion was relaxed — proven by diff

The complete diff of **all** test files between `474c887` and `bfc1949` is three added lines in one file:

```diff
+// Real Windows PowerShell ACL checks can exceed Vitest's default test timeout.
+if (process.platform === 'win32') vi.setConfig({ testTimeout: 60_000 });
+
```

Structural comparison of the two files most relevant to the ACL claims:

| File | `expect(` old→new | `it`/`test(` old→new | `.skip`/`.todo` old→new |
|---|---|---|---|
| `web/tests/live-batch-route.test.ts` | 31 → 31 | 5 → 5 | 0 → 0 |
| `web/tests/sqlite-spend-security.test.ts` | 14 → 14 | 5 → 5 | 0 → 0 |

No assertion removed, none loosened, no test skipped or converted to `todo`, no `try/catch` swallowing added.
The change is additive, comment-documented, and **gated behind `process.platform === 'win32'`**, so Linux
behaviour is bit-for-bit unchanged.

I also confirm the fix is correctly scoped rather than blanket-applied:

- No change to `web/vitest.config.ts` — it still carries **no** global `testTimeout`, so the 5s default still
  governs all other suites and unrelated slow tests cannot hide behind this change.
- No change to `package.json` scripts — `test` is still plain `vitest run`.
- **No production/application code changed at all.** Outside `docs/`, the diff touches exactly one path:
  `web/tests/live-batch-route.test.ts`. Confirmed via `git diff --name-only 474c887 bfc1949`.

Choosing a file-local `vi.setConfig` over a global timeout was the right call, and the inline comment states the
reason. This is the minimal correct repair.

---

## 5. Re-check of prior findings

### M-1 — retention / prune path: **NOT addressed** (open, correctly disclosed)

No commits touched `web/lib` between `e721936` and `bfc1949` (`git log e721936..bfc1949 -- web/lib` is empty).
Searches for `prune|retention|purge|cleanup|evict|TTL` across `web/lib` and `web/app` return no snapshot-retention
machinery. `web/lib/review-store.ts:12` still hardcodes
`REVIEW_LIMITS = { snapshots:200, totalBytes:128*1024*1024, ... }`, line 62 still throws
`ReviewError(507,'review-capacity')` at the cap, and the append-only triggers (`snapshots_no_delete`,
`reviews_no_delete`) still make administrative purge impossible without recreating the DB.

The only `retentionMs` in the codebase is in `web/lib/repository.ts` — the unrelated evidence repository, not the
review snapshot store.

**Not silently addressed, and not silently dropped either.** Doc 28 explicitly parks M-1, restates the capacity
cliff, warns against disabling the append-only triggers as an operator workaround, and states "Do not promise
indefinite save capacity." That is the correct handling for an out-of-scope item. M-1 remains a real operational
limitation to resolve before any sustained use.

### M-2 — Windows permission tests are no-ops: **NOT addressed** (open, correctly disclosed)

Both guards are still present and unchanged:

```
web\tests\saved-reviews.test.ts:39:      if(process.platform!=='win32'){chmodSync(path,0o644); expect(()=>new ReviewStore(path)).toThrow();}
web\tests\saved-review-route.test.ts:53:  if(process.platform!=='win32'){chmodSync(join(reviews,'reviews.sqlite'),0o644);expect((await review(req('/list'))).status).toBe(503);}
```

So on this host those two tamper assertions still did not execute. There is still no Windows-native negative
permission test aimed specifically at `reviews.sqlite`. Doc 28 tracks this as an open test gap and — importantly —
does not overclaim: it states the passing native spend-ledger ACL checks "does not establish a dedicated
`reviews.sqlite` unsafe-ACL negative test." Accurate. No production guard was relaxed to make anything pass.

### L-1 — mojibake: **WITHDRAWN — my prior finding was wrong**

AVA disputed this, and AVA is correct. I re-checked at the byte level on the working files at `bfc1949`:

| File | `C3 A2 80` (mojibake) | `E2 80 94` (proper em-dash) |
|---|---|---|
| `web/lib/review-store.ts` | 0 | 1 |
| `web/lib/saved-review-contract.ts` | 0 | 1 |
| `web/lib/use-durable-review.ts` | 0 | 1 |

The source bytes are valid UTF-8 containing a correct U+2014. Reading the blobs at `e721936`, `474c887` and
`bfc1949` shows the identity literal renders identically and correctly as
`'Shared demo access code — NOT an individually authenticated reviewer'` at all three revisions.

My original L-1 was a **console/transcoding artifact in my own tooling**, not a defect in the repository. AVA
resolved this the right way: it preserved my claim in the record rather than deleting it, and declined to "fix"
correct bytes. L-1 is withdrawn, not silently patched — note that `web/lib`, where these files live, received no
commits at all in this range, so no quiet edit was possible.

### Other standing findings (unchanged)

- **M-3 — shared identity.** Still a single shared `TTB_DEMO_ACCESS_SECRET`; every holder sees every review and
  every label image. Hard blocker for real COLA review. Correctly disclosed, unchanged.
- **L-2 — all HTTP verbs alias to `POST`.** Unchanged; intentional Origin-fence design, still merits an
  export-site comment.
- **L-3 — Node version drift.** This run is **Node 22.22.2**, in-range per `engines`
  (`>=22.12.0 <23 || >=24 <25`) but **not** Node 24. AVA's Linux evidence is Node 24.21.0. This verification is
  therefore explicitly a *supported Node 22* result, not a Node 24 one.
- **L-4 — `node:sqlite` experimental.** Every worker still emits
  `ExperimentalWarning: SQLite is an experimental feature and might change at any time`, in both test and build.
  Acceptable for a demo; pin/track before production.

---

## 6. Secret scan

Scanned all tracked files at `bfc1949` for `sk-or-v1-…`, `sk-…`, `ghp_…`, `github_pat_…`, `AKIA…`,
`-----BEGIN … PRIVATE KEY-----`, `xox[baprs]-…`, `AIza…`.

- 18 pattern hits, **all false positives**, all at line 91/59 inside `"encrypted_content"` base64 blobs in
  `bench/**` provider-response fixtures. These are opaque model-response envelopes whose random base64 happens to
  contain `sk-`-like substrings (e.g. `sK-g5j4C5TShQaiVvh3PwZIula3…`). Not credentials.
- All 18 are **pre-existing** — `git diff --name-only 474c887 bfc1949` touches nothing under `bench/`.
- Scanning only the files introduced by `bfc1949` yields exactly one hit:
  `web/tests/live-batch-route.test.ts:25` → `OPENROUTER_API_KEY: 'synthetic-key'`, a self-labelled synthetic test
  literal alongside `const secret = 'synthetic-only-access-code-0123456789abcdef'`.

**No real credential is committed.** Clean.

---

## 7. Constraint compliance

- Read-only, detached checkout at the exact SHA — no source file modified.
- `npm test` run with **no** CLI timeout override, as required.
- No push, no remote commit, no branch update, no merge, no deploy.
- No paid inference, no live provider calls, no live review-store or spend-ledger access (all fixtures synthetic
  and disposable).
- Counts reported are **measured on this host**; AVA's Linux figures are cited only as AVA's claim and explicitly
  contrasted.
- Only file written: this report.

---

## 8. Conclusion

The correction commit does exactly what it claims and nothing more. Three added lines, win32-gated, one test file,
zero production code, zero assertions touched, zero new skips. The five previously-failing ACL tests genuinely pass
on native Windows with real ACL inspection intact and 4.5× timing headroom; the fix is scoped so it cannot mask
slowness anywhere else in the suite. Typecheck and build are clean, and the secret scan is clean.

The "565 passed" discrepancy is a platform-labelling artifact that AVA had already corrected in writing before I
looked; on this host the figure is **560 passed / 5 skipped / 0 failed**, with the skips pre-existing and unrelated
to the failures being fixed.

M-1 and M-2 remain genuinely open and are accurately disclosed rather than quietly closed. L-1 was my error and is
withdrawn. M-3 remains the significant limitation for any real-world use.

**PASS** for this tranche.

---

*Independent native Windows verification. Host `Jarvis-1`, Windows 10.0.26200 x64, Node v22.22.2, npm 10.9.7.
Commit `bfc19494ff22ad3905bb98fb865af5c149f36941`. Report date 2026-09-21.*
