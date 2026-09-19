# Label review application implementation plan

> **Execution update:** Alex has authorized phased implementation. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) supersedes the historical documentation-only gates below for local source work. Paid calls, cloud provisioning and deployment remain gated; design text is not evidence of implemented controls.

> **For Hermes:** Use the subagent-driven-development skill for approved bounded implementation tasks, while preserving AVA as the sole build owner and ARGUS as read-only phase reviewer. This planning package does not authorize dispatching application builders.

**Goal:** Deliver the frozen two-tab review experience as a working, testable standalone application with reliable comparison, explicit human decisions and attributable history.

**Architecture:** One Next.js service with separate intake, extraction, rules, persistence and UI modules. A managed identity/database/private-object layer stores versioned evidence and append-only review events. The browser never receives provider/service credentials or decides authorization.

**Tech stack — proposed pending scope approval:** Next.js App Router, TypeScript, Zod, Sharp, Vitest, Playwright; Supabase Auth/Postgres/private Storage; Vercel evaluation hosting. Haiku through OpenRouter initially, behind a provider interface; Azure/Foundry only after actual route, output, network and timing verification. Dependency versions are pinned during the authorized foundation sprint, not invented here.

## 0. Authority, evidence and freeze

- **Authorized now:** docs, existing mock/screenshot publication and review branch. **Not authorized:** application scaffolding, provisioning, migrations, paid calls, benchmark reruns, public deployment or production data.
- **Existing baseline:** `a83e35c0e6ed283f508b30ae4bfe292658038fa9`, with root `bench/`, `fixtures/` and historical docs. There is no `web/` application in that tree. Later sprints start from the latest accepted integrated application HEAD, not this historical baseline blindly.
- **One design:** [v3 assets](ui/v3/README.md), byte-frozen by `docs/ui/v3/manifest.json`. No more cosmetic mock iterations. Missing input/history/auth flows are specified below and implemented only after approval; the HTML remains a reference, not copy-pasted production authority.
- **Controlling scope amendment:** [governance design](GOVERNANCE-AND-AUDIT-DESIGN.md). Legacy `PLAN.md`, `THREAT_MODEL.md` and `ACCEPTANCE_CHECKLIST.md` retain historical no-account/no-persistence assumptions; use their matching/upload safety requirements, not those superseded target-design assumptions. The amendment is proposed, not silently activated.
- **Requirements:** the [original source](https://github.com/treasurytakehome-rgb/instructions/blob/62bd63cd2f6b5af088b1d3c3b039c48cfcb012ef/README.md) controls assignment claims. Accounts/history are additions. Seven-category comparison, simple UX, batch operation, approximately five-second results and a deployed testable URL remain core. The September 24 target is not permission to weaken acceptance.
- **Cut order:** correctness/readable evidence/safe errors never cut; identity/history next; visual polish and advanced assignment/notifications first to defer. Do not ship half-working features. If governance cannot finish cleanly, obtain Alex's explicit scope reduction, remove that feature from the demo and label it designed-only; never fake identity or durable history.

## 1. Decisions before execution

Alex's scope approval must settle D1–D4. D5–D6 must close before paid/deployed acceptance; lack of those approvals does not permit spending or a public preview.

| ID | Proposed decision / evidence still needed |
| --- | --- |
| D1 | Individual invite-only evaluator accounts; one workspace, reviewer/admin roles. No public signup or SSO. Managed auth feasibility must be tested, not assumed. |
| D2 | Supabase evaluation database/private storage plus Vercel hosting; deliberately persist sanitized synthetic evidence and immutable snapshots. Region, project ownership and vendor retention settings to verify before provisioning. |
| D3 | Proposed 30-day evaluation retention from ingestion; coordinated purge of content/history, with backup/log/account lifecycle explicitly resolved. No indefinite data-retention promise. |
| D4 | Approve the six phases below and manual second-review status only. Advanced assignment, notifications and multi-stage chains are deferred. |
| D5 | Explicit current provider/hosting budget, global reservation ceiling, per-call worst-case bound and authorized live test matrix. No reuse/reset of historical benchmark allowance by implication. |
| D6 | Deployment access method, isolated preview target and restricted-network acceptance conditions. Determine what network boundary Alex wants demonstrated; do not call an internet-only preview an internal Azure deployment. |

### Contracts and exact target surfaces

Create the application under `web/`; never modify archived benchmark observations/fixtures to make app tests pass. Use synthetic app-test fixtures owned under `web/tests/fixtures/`.

- Input: one JPEG/PNG + explicit application ID/version, brand, class/type, ABV, net contents, producer/address and commodity/import/origin context. The government warning uses the fixed reference, not an applicant-editable substitute. Propose 10 MiB/file, 20 megapixels, up to 300 batch pairs, client concurrency 2, no automatic paid retries and a 20-second processing timeout; validate these engineering limits against actual hosting caps before approval of live use. A timeout is not zero billing or successful cancellation.
- Batch import: explicit JSON manifest with unique image filename → application record mapping; never infer pairing from list order. Block duplicates/missing pairs individually before any call. Single entry supports manual fields; multi-panel labels are deferred unless separately scoped.
- Results: exactly seven fields with match/mismatch/needs-review/not-applicable plus separate processing state. Malformed provider output is processing failure, not seven passing fields. `Pass` is a human review outcome, not an eighth extraction field or legal certification.
- Warning: compare actual extracted wording; assess all-caps/bold heading and body formatting using evidence. Uncertain formatting refers for human review. Do not copy the mock's predefined string equality and claim actual image checking. Physical type size remains explicitly unverified.
- `POST /api/comparisons`: validates/authenticates the pair, reserves global budget, normalizes/hashes image, calls permitted adapter, applies deterministic rules, and saves immutable comparison/evidence. May return explicit failed state; no credentials or provider payload leakage.
- `POST /api/reviews`: receives comparison ID, expected evidence/application versions, chosen outcome, confirmation, resolutions/notes and idempotency key. Ignores/rejects supplied actor/time fields; server establishes identity and timestamp, validates eligibility and appends atomically.
- `GET /api/reviews` and `GET /api/reviews/[id]`: authorized history/pagination and exact snapshot. `POST /api/evidence/[id]/access`: short-lived private image access after authorization. All routes default deny; no anonymous inference/history access.
- UI routes: `/login`, `/review` (Single/Batch tabs), `/history`, `/history/[id]`. Logout provided; no public registration or admin-console build.

## 2. Execution cadence and commands

Each numbered sprint is one bounded deliverable made of small RED → GREEN → refactor tasks, not a calendar-duration promise. Add the named test, observe its intended failure, implement only that contract, run its focused gate plus typecheck, then commit exact paths. ARGUS reviews once per frozen phase, not every small commit. Finish one consolidated repair tranche before moving on.

**Future commands:** no `npm` commands below work in today's docs-only repo. Phase 1 Sprint 1 owns creating `web/package.json`, lockfile, test configs and scripts: `test` (Vitest run), `typecheck` (`tsc --noEmit`), `build` (`next build`), `test:e2e` (Playwright), and later `test:db` (required database gate). Example after that sprint: `npm --prefix web run test -- tests/rules.test.ts`. Run from repository root. Database gates must fail, not skip or silently substitute memory, when their isolated database is unavailable. Install/setup instructions must become clone-and-run accurate before release.

## Phase 1 — Foundation and input contract

### Phase 1 — Sprint 1 of 2: application test harness

**Create:** `web/package.json`, `web/package-lock.json`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/playwright.config.ts`, `web/app/layout.tsx`, `web/app/review/page.tsx`, `web/tests/smoke.test.ts`, `web/tests/e2e/smoke.spec.ts`, `web/.env.example` (names only).

**Steps:** pin compatible dependencies (including `tsx` for the Phase 6 measurement harness); install locally only; create passing test/build commands and empty route shell; fail then satisfy smoke assertions. **Gate:** `npm --prefix web ci`, `npm --prefix web run test`, `npm --prefix web run typecheck`, `npm --prefix web run build`. Test harness/configuration is code, so this sprint cannot start under documentation-only approval. No hosting or model call.

### Phase 1 — Sprint 2 of 2: pairing and upload validation

**Create:** `web/lib/contracts.ts`, `web/lib/intake.ts`, `web/tests/intake.test.ts`, `web/tests/fixtures/`, `web/components/PairInput.tsx`.

**RED specimens:** duplicate filename mappings reject; absent declared ABV does not become zero; disguised MIME, oversized bytes/pixels and corrupt image reject before provider call. **Implement:** schema, manual application input, explicit pairing, buffer re-encode/metadata strip, source and normalized-image hashes. **Gate:** `npm --prefix web run test -- tests/intake.test.ts`; inspect accepted bytes and decoded dimensions, not just client extension. No DB/inference yet.

**Phase exit:** reproducible build and safe intake, no production access; exact commit to ARGUS.

## Phase 2 — Correct comparison and provider boundary

### Phase 2 — Sprint 1 of 2: deterministic comparison rules

**Create:** `web/lib/rules.ts`, `web/tests/rules.test.ts`, `web/tests/fixtures/comparisons.json`.

**RED specimens:** normalized brand variants match; 45 versus 40 ABV mismatches; changed warning wording/bold-body defect mismatches when readable; uncertain extraction needs review; missing applicable origin cannot be treated not-applicable. **Implement:** seven-field per-pair rules with reasons and explicit commodity/import applicability, never a global all-labels green response. **Gate:** `npm --prefix web run test -- tests/rules.test.ts`. Do not port historical scorer bugs or rewrite benchmark truth.

### Phase 2 — Sprint 2 of 2: provider and spend reservation contracts

**Create:** `web/lib/extraction/provider.ts`, `web/lib/extraction/openrouter.ts`, `web/lib/extraction/fixture-provider.ts`, `web/lib/spend.ts`, `web/tests/extraction.test.ts`, `web/tests/spend.test.ts`.

**RED specimens:** invalid JSON/missing schema/HTTP failure never yields match; quota-store outage rejects dispatch; two concurrent attempts cannot spend the same reservation; timeout stays reserved until reconciled; retries require new authorized reservation. **Implement:** schema-constrained no-tools extraction, endpoint/model allowlist, no silent fallback, request identifiers and shared-store reservation interface. Offline tests use deterministic fake provider/store; actual database concurrency proof belongs to Phase 4. **Gate:** `npm --prefix web run test -- tests/extraction.test.ts tests/spend.test.ts`. No live calls until D5 authorization; a fake-store pass does not close global spend enforcement.

**Phase exit:** source-backed rules and fail-closed provider contract; no unsupported reliability claim from offline tests.

## Phase 3 — Single-label review experience

### Phase 3 — Sprint 1 of 2: comparison service and input-to-result flow

**Create:** `web/lib/compare-service.ts`, `web/lib/access.ts`, `web/app/api/comparisons/route.ts`, `web/components/ComparisonWorkspace.tsx`, `web/components/ProcessingState.tsx`, `web/tests/compare-service.test.ts`, `web/tests/e2e/single.spec.ts`.

**Implement after RED:** compose intake/extraction/rules, expose one explicit Submit for comparison, loading/timeout/corrupt-file states, readable preview/enlarge and displayed application pairing. Access interface defaults deny; service is exercised directly/offline before managed auth is wired in Phase 4. Fixture mode is unmistakably labelled and cannot activate in a real provider deployment. **Gate:** focused service tests and `npm --prefix web run test:e2e -- tests/e2e/single.spec.ts` with mock mode explicit. No claim of measured model latency.

### Phase 3 — Sprint 2 of 2: decisions and human confirmation

**Create:** `web/lib/review-policy.ts`, `web/components/OutcomeCards.tsx`, `web/components/ReviewConfirmation.tsx`, `web/tests/review-policy.test.ts`; extend `single.spec.ts`.

**RED specimens:** mismatch Pass remains visible but blocked with reason; failed/unmapped records cannot submit; switching evidence resets confirmation; unresolved required checks block Pass; a recorded human resolution retains prior machine result/reason. **Implement:** v3 color+icon cards, co-located confirm/Submit review, correction/escalation notes, honest physical-size limitation, explicit unsaved draft until server commit. **Gate:** policy tests and single-flow E2E. No fabricated durable receipt before Phase 4.

**Phase exit:** frozen design implemented against offline services; core failure handling retained, not “polish” to cut.

## Phase 4 — Identity, persistence and historical review

### Phase 4 — Sprint 1 of 2: managed identity and immutable evidence storage

**Create:** `web/lib/auth.ts`, `web/lib/storage.ts`, `web/lib/repository.ts`, `web/db/migrations/001_identity_evidence.sql`, `web/app/login/page.tsx`, `web/app/api/evidence/[id]/access/route.ts`, `web/tests/auth.test.ts`, `web/tests/db/identity-evidence.test.ts`, `web/tests/db/spend.test.ts`, `web/scripts/db-gate.ts`.

**Implement after RED:** isolated service approved under D1–D3, server session verification, membership checks, private immutable normalized-image objects, versioned application/comparison records, real shared atomic spend reservations. Wire access/repository implementations into `/api/comparisons`; no caller-supplied object path authority. Add `test:db` in package scripts; migrations only against an explicitly approved isolated DB, never inherited production settings. **Gate:** `npm --prefix web run test:db -- identity-evidence spend`, negative anonymous/cross-workspace/revoked-session tests and actual concurrent DB reservation proof. Record external identity/storage destinations; no provider data sent in this sprint without separate approval.

### Phase 4 — Sprint 2 of 2: append-only decisions and history

**Create:** `web/db/migrations/002_review_events.sql`, `web/lib/review-service.ts`, `web/app/api/reviews/route.ts`, `web/app/api/reviews/[id]/route.ts`, `web/app/history/page.tsx`, `web/app/history/[id]/page.tsx`, `web/lib/retention.ts`, `web/tests/db/review-events.test.ts`, `web/tests/db/retention.test.ts`, `web/tests/e2e/history.spec.ts`.

**RED specimens:** actor spoof rejected; stale version returns conflict; duplicate idempotency key returns same event; app role cannot update/delete events; save failure cannot show Saved; restarting server preserves history; corrected image opens original approved version via the old event. **Implement:** transactional chain append, immutable evidence binding, history access controls, privileged retention path and honest expired-state UI. Migration role and purge role remain distinct from runtime app role. **Gate:** real `test:db` review/retention tests plus history E2E; deletion includes objects, snapshots and associated events per approved policy, with provider/backups limitations documented. No automated second-review assignments/notifications.

**Phase exit:** attributable durable review history actually proven; not an in-memory simulation. If incomplete, stop for explicit scope reduction rather than disguise it.

## Phase 5 — Batch workflow and recovery

### Phase 5 — Sprint 1 of 2: paired batch queue

**Create:** `web/lib/batch-manifest.ts`, `web/components/BatchUpload.tsx`, `web/components/BatchQueue.tsx`, `web/tests/batch-manifest.test.ts`, `web/tests/e2e/batch.spec.ts`.

**RED specimens:** 300 explicitly paired synthetic entries validate; duplicate/missing mappings reject their entries; unrelated files never inherit a sample's results; concurrency stays bounded. **Implement:** explicit batch manifest input, per-item processing state, valid/blocked counts and global-budget-aware dispatch. **Gate:** manifest tests and batch E2E using fake provider for scale; 300-entry validation is not authorization for 300 paid calls.

### Phase 5 — Sprint 2 of 2: quick switching and completion

**Create:** `web/components/BatchSwitcher.tsx`, `web/lib/batch-state.ts`, `web/tests/batch-state.test.ts`; extend batch E2E.

**RED specimens:** card/Previous/Next changes preserve each record's outcome and reset confirmation; a failed item cannot become completed; manual retry targets only that pair and reserves again; navigation never resubmits an existing review. **Implement:** v3 horizontal card rail, full-width workspace, reviewed/remaining/blocked counts, replace-image/new-version path and visible final batch summary. **Gate:** desktop/mobile E2E, keyboard/contrast/overflow checks. Bulk approve and auto-assignment remain out of scope.

**Phase exit:** usable Single/Batch experience with safe partial failure, not merely multiple-file selection.

## Phase 6 — Release acceptance and evaluation delivery

### Phase 6 — Sprint 1 of 2: consolidated acceptance package

**Create:** `web/tests/e2e/acceptance.spec.ts`, `web/scripts/measure-e2e.ts`, `docs/APP-ACCEPTANCE.md`, `docs/DATA-DESTINATIONS.md`, `docs/DEPLOYMENT.md`.

**Run:** unit/type/build/real DB gates and `npm --prefix web run test:e2e`. After separate spend approval, run `(cd web && npx --no-install tsx scripts/measure-e2e.ts)` against the agreed isolated endpoint and fixed synthetic matrix. Phase 1 owns the `tsx` dependency; Phase 6 owns this script. Record exact route/model/rules, cold/warm conditions, browser upload-to-results distribution, failures and misses of the five-second target. Source-label-disjoint held-out evaluation and readable real-camera/digital-artwork inputs need explicit permitted data; sibling transforms are not independent validation. Human confirmation remains required because observed model errors are real; do not call the historical zero-false-match gate met.

Freeze read-back of auth, image access, history, retention, log redaction, atomic quota and no-tools prompt-injection tests. Validate actual vendor retention/training/settings before non-synthetic use. No new inference is authorized by this plan.

### Phase 6 — Sprint 2 of 2: approved isolated deployment and final verification

**Modify:** repository `README.md`, `docs/DEPLOYMENT.md`, `docs/APP-ACCEPTANCE.md`, review register. Deploy only after Alex approves target/costs/access and ARGUS's candidate review passes. Provide individual evaluator access privately, verify actual URL/login/upload/comparison/save/history/logout from a fresh browser and verify hosted database/object boundaries. Test restricted-network/Foundry feasibility separately as agreed under D6; report a genuine blocker rather than relabeling OpenRouter internet success as Azure success. Document clone/setup commands, configuration names, rollback and maintenance/retention owner.

**Phase exit:** source published, accessible testable deployed URL, reproducible setup, observed acceptance evidence, exact remaining limitations and one independent final verdict. Build, tests, deployment and user acceptance remain separate status entries. If a required gate fails, do not claim completed release merely because the share date arrived.

## 3. Approval checklist and review handoff

- [ ] ARGUS reviews this exact spec/plan candidate once; blocking defects only, no parallel implementation.
- [ ] Alex approves D1–D4 and the scope amendment before Phase 1.
- [ ] D5–D6 and explicit provisioning/deployment authority obtained before corresponding side effects.
- [ ] Paid-run budget and immutable historical benchmark evidence preserved.
- [ ] Each phase yields exact SHA, test evidence, open risks and one ARGUS PASS/REVISE.
- [ ] No mock screenshot/test is cited as actual OCR, live auth, database durability or deployment proof.

Current authorization remains **documentation-only**. This plan is a proposed executable sequence, not evidence that the application exists.
