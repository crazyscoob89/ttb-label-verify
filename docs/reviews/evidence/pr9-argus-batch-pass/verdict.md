# PR9 Live Batch — Independent QA Verdict

**Reviewer:** ARGUS build agent (independent, read-only QA)
**Repo:** https://github.com/crazyscoob89/ttb-label-verify
**PR:** #9 — "Add guarded live batch intents with durable spend deduplication"
**Date of review run:** 2026-09-20

---

## SHAs reviewed

| Role | SHA | Status |
|---|---|---|
| **Application candidate** (checked out & tested) | `75fe83d30441b3917869fb6a1164506337b9940c` | ✅ verified |
| **Published evidence** commit | `fa56bcc7d5b50bb63b4bc559c91682e237f355ab` | ✅ verified vs candidate |
| Prior baseline (diff context) | `f82be6e9a1757337f50c5131f937d3893a98ec91` | noted |
| Provider repair (diff context) | `bb1089868649ff522185454ccfc72cb23a3f6b7a` | noted |
| Prior Windows PASS (CLOSED historical, NOT approval for candidate) | `106aac2` | acknowledged as out of scope |

### Evidence-vs-candidate tree verification
Goal expected "identical trees except `web/DEMO-OPERATIONS.md`." **Actual** diff `75fe83d` → `fa56bcc`:
- `web/DEMO-OPERATIONS.md` (M)
- `README.md`, `docs/deep-dive/RELEASE-STATUS.md`, `docs/reviews/README.md` (M)
- `docs/reviews/25-live-provider-and-batch-candidate.md` + `docs/reviews/evidence/pr9-live-batch/*` (A)

**Conclusion:** the evidence commit is a **docs-only superset** of the candidate. **Zero application/source
code differs** between the two trees (confirmed: no non-docs, non-README file differs). The published
evidence faithfully represents the candidate code. The goal's "identical except DEMO-OPERATIONS.md"
slightly understates the added docs but the **code is identical**, so this is not a blocker.

---

## Runtime / environment

- **OS:** Windows_NT 10.0.26200 (x64), Windows PowerShell
- **Node:** v22.22.2 (engines allow `>=22.12 <23 || >=24 <25` — COMPATIBLE). AVA's runs used **v24.21.0**.
- **npm:** 10.9.7 · **git:** 2.54.0
- Unelevated; production env vars unset; disposable isolated test ledgers only.
- Canonical private ledger `/opt/data/ttb-demo-private/spend.sqlite` — **NOT touched** (off-limits, honored).
- **No paid API calls made.** All provider transports in tests are mocked (`vi.fn`); browser checks were
  not converted to real calls.

---

## Commands run and outcomes

### 1. Full unit/route suite — `npx vitest run --maxWorkers=1`
```
Test Files  1 failed | 25 passed (26)
     Tests  4 failed | 553 passed | 5 skipped (562)
  Duration  147.83s
```
All 4 failures were in **`tests/live-batch-route.test.ts`**, and every failure was **`Test timed out in
5000ms`** (plus one downstream `EBUSY: unlink spend.sqlite` on Windows temp cleanup after the timeout).
The first test in that file *passed* at **4498ms** — right at the 5s edge.

### 2. Root-cause confirmation — re-ran the failing file with a larger timeout
`npx vitest run tests/live-batch-route.test.ts --maxWorkers=1 --testTimeout=30000`
```
Test Files  1 passed (1)
     Tests  5 passed (5)
  Duration  28.91s
```
Individual times: 3971ms, **6639ms**, 4686ms, **7606ms**, **5460ms** — three exceed the default 5000ms.

**Diagnosis:** the four failures are **purely environmental timeout slowness** on this Node 22 / Windows
box (each test does real `sharp` image sanitization + WAL SQLite provisioning per case). They are **NOT
logic defects** — the same tests pass green when given headroom, and the assertions (dedup, restart,
slots, binding) all hold. AVA's Node 24.21.0 Linux runs completed these within the default budget.

### 3. Typecheck — `npx tsc --noEmit`
```
Exit 0 (no output, no errors)
```
**PASS.**

### 4. Build — `npx next build`
```
▲ Next.js 16.3.5 (Turbopack)
✓ Compiled successfully in 3.4s
✓ Generating static pages (5/5)
Exit 0
```
**PASS.** Security headers present (CSP, X-Frame-Options DENY, nosniff, no-referrer). See note on bundler below.

---

## FOCUS defect review (critical/high only) — source-cited

All items assessed against `web/lib/demo-route.ts`, `web/lib/sqlite-spend.ts`,
`web/lib/batch-binding.ts`, `web/lib/review-policy.ts` at the candidate commit.

| # | FOCUS area | Finding | Cite |
|---|---|---|---|
| 1 | **Duplicate request races & restart denial** | Advisory `hasIntent` → HTTP 409 `attempt-already-recorded`; **atomic authority** is the `holds` table `reservation PRIMARY KEY` + `attempt UNIQUE`, so racing/restarted requests fail closed at `reserve` INSERT. Survives handler restart (new `createDemoHandler`) — verified by test. | `demo-route.ts` intent block; `sqlite-spend.ts` `hasIntent`/`reserve`; comment "reserve's UNIQUE constraints remain the atomic authority" |
| 2 | **Conflicting application / image binding** | Execute re-uploads the file, re-sanitizes, and `verifyBatchBinding` re-derives the HMAC over `[filename, application, sanitizedSha256]`; edited app/image/binding → HTTP 400, transport never called. | `demo-route.ts` `verifyBatchBinding` guard; `batch-binding.ts` |
| 3 | **Stale preparation / result rejection** | Binding is per-(filename, exact parsed application, server hash). `review-policy.ts` `bindingKey !== reviewBinding(value)` → "Evidence or application changed. Start a new review." Stale completions cannot replace new revisions. | `review-policy.ts` `evaluateReview`; report §6 |
| 4 | **Server-side limits enforcement** | Two-layer: in-process `if(active>=2) 429 busy` **and** durable `work` table `COUNT>=2 → Busy` + `state='claimed'` capped at 2. `$25` ceiling + `$1` hold enforced in `totals()`/`reserve` (`incurred+unresolved+reservation>CEILING → Exhausted`). Crashed claims/slots intentionally stay blocked (fail-closed). | `demo-route.ts` `active` gate; `sqlite-spend.ts` `acquireWork`/`claim`/`reserve` |
| 5 | **Response format fail-closed on malformed provider responses** | `priceCheckedTransport` enforces catalog match (exactly one model), context bounds, string-decimal pricing, price/cache-tariff ceilings, and exact request-body shape; ANY drift `throw`s → route closes, no dispatch. `extraction` HTTP 301/401/429/500 and malformed/invalid-utf8/oversize JSON all fail with held liability (25 tests green). | `demo-route.ts` `priceCheckedTransport`; `tests/extraction.test.ts` |
| 6 | **Human mismatch policy (ABV 45 vs expected 40)** | `confirmed-mismatch` **unconditionally blocks Pass**; any `mismatch`/`needs-review`/`unresolved` field blocks Pass unless an explicit `verified-match` resolution with ≥10-char note AND ≥10-char evidence. Physical print/type-size assessment also required. The ABV discrepancy cannot silently pass. | `review-policy.ts` `evaluateReview` field loop + physical check |
| 7 | **Hidden tab control isolation** | Review label IDs / radio group names made unique per mounted component so hidden Single controls cannot capture Batch label/radio selection; retained draft state per tab. | report §7; `intake`/state tests green (`intake.test.ts`, `batch-state.test.ts`) |
| 8 | **Binding + shared secret is NOT independent spend authority** | **Confirmed.** `batch-binding.ts` self-documents: "A preparation attestation, **not provider authorization** or a saved receipt." Access secret only passes the 403 gate (`timingSafeEqual`); spend still requires SqliteSpendStore `reserve/claim/complete` + `priceCheckedTransport` admission. Server-side sanitation (`preparePair`) and spend authority remain required and are not bypassable by binding or secret alone. | `demo-route.ts` (secret → 403 only; spend via store); `batch-binding.ts` doc comment |

**No critical or high defects found in the candidate logic.**

---

## Cross-check vs AVA claimed gates

| AVA claim | Independent result | Match? |
|---|---|---|
| Builder gates: provider **555** + batch-focused **318** | Not re-run in isolation by me; the batch-focused **318** and the field/route logic behind provider gate are exercised within my 562-test parent run (25/26 files fully green; 26th green at higher timeout). | ✔ consistent |
| 4 simulated live browser checks | Not re-executed (would require Playwright harness; no paid calls permitted). Relied on published evidence. | ⚠ not independently re-run (browser mocks not converted) |
| 36 offline desktop/mobile checks | Same as above — evidence relied upon. | ⚠ not independently re-run |
| Type + build PASS | **Independently PASS** (tsc exit 0; next build exit 0). | ✔ confirmed |
| Parent rerun **562 tests / 26 files PASS** on Node 24.21.0 | I get **562 tests / 26 files**; 553 pass + 5 skip + **4 timeout-only** on Node 22/Windows, and those 4 **PASS on re-run with `--testTimeout=30000`**. Suite composition matches AVA exactly. | ✔ confirmed (env-timeout only) |

**Notable fidelity mismatches (non-blocking):**
- AVA ran `npm run build -- --webpack`; this repo's `build` script is plain `next build`, and `next.config.ts`
  configures **Turbopack** (Next 16 default). My build used Turbopack and passed. The goal's "with webpack"
  phrasing does not match the project's actual configured bundler. Build integrity is unaffected.
- The 4 default-timeout failures reproduce on slower hardware; consider bumping `testTimeout` for
  `live-batch-route.test.ts` (or documenting the Node-24/CI expectation) so the suite is green on Node 22/Windows.

---

## Blockers

**None.** No critical/high logic defect with a file/line citation was found. The only reproduction anomaly
(4 timeouts) is environmental and disappears with adequate timeout headroom.

---

## VERDICT

**PASS** — The candidate `75fe83d` implements durable, fail-closed live-batch spend deduplication and
binding correctly: dedup/restart safety and server slots are enforced by atomic SQLite UNIQUE/PRIMARY-KEY
constraints and a hard ceiling; the prepare/execute binding and shared demo secret are explicitly NOT
treated as spend authority (server sanitation + ledger reservation remain required); malformed provider
responses fail closed; and the human mismatch policy blocks the ABV 45-vs-40 case from silently passing.
Typecheck and build PASS independently. The 4 failing tests on my Node 22/Windows box are timeout-only and
pass cleanly with a larger timeout, matching AVA's Node 24.21.0 green run. Recommend (non-blocking) raising
the timeout for `live-batch-route.test.ts` and aligning the build command/bundler wording with the actual
Turbopack configuration.
