# Phase 3 — single-label comparison and human review

## Candidate, authority and custody

**Builder-local gates complete; parent verification and consolidated independent review pending. This is not ARGUS PASS, live acceptance or deployment approval.**

Alex relayed the Phase 2 PASS and said **“lets go”**; AVA agreed. Parent had already merged Phase 1 PR #4 at `d1f07db9083b2a244d21f2d132f4105c951f475f` and Phase 2 PR #5 at `38406c12ac575c06ed55370148f907e45782ad33`. This worker started a clean native `/tmp/ttb-phase3-worktree`, branch `ava/app-phase-3`, at the latter SHA. The canonical Phase 2 worktree was not edited.

Sequential local implementation commits:

1. `a39e17d` — Sprint 1: default-deny comparison composition, exact-image offline fixtures, explicit single-input-to-result flow.
2. `6ca12cf761fc512031de03b0ef0ae388d085e364` — Sprint 2: human outcome policy/cards, evidence-bound confirmation, UNSAVED drafts, expanded browser acceptance and exact-byte preview CSP correction.

This record and selected logs are a separate documentation handoff. Parent controls any eventual publication/PR and one consolidated ARGUS gate. No remote Git writes, bridge/reviewer calls, paid provider calls, cloud services, migrations, provisioning, credentials or deployment were used. No Phase 4/5 functionality was implemented.

## Implemented boundaries

- **Access/API:** `POST /api/comparisons` always returns content-free 403 before reading the request body. Forged authorization and client `authorized`/fixture flags do not change this. No provider is imported into the route. Direct Node service tests inject trusted offline access; that injection is not server authentication.
- **Composition:** unchanged Phase 1 `preparePair`/`sanitizeImage` and strict `Application` feed an injected Phase 2 extraction interface and unchanged `compareApplication`. Input is bounded before copy/decode, snapshots precede asynchronous access, service timeouts/cancellation cannot produce passing fields, and processing errors remain separate from the seven findings. Completed output validates a strict fixture envelope, original observation schema, exact normalized image SHA-256 and source/version metadata. Other-image, extra-field, malformed and real-provider-source output is rejected in this offline phase.
- **Browser fixture path:** enabled only by `NODE_ENV=development` plus explicit `TTB_OFFLINE_DEMO=1`. Production cannot opt in. Four app-owned synthetic PNGs demonstrate match, readable ABV discrepancy, obscured ABV and processing failure. `offline-samples.json` binds immutable observations and declared application snapshots to exact normalized image hashes. The generator reads fixed synthetic observations, never applicant edits. Browser fetches are allowlisted same-origin sample paths, size/time bounded; exact bytes are hashed and shown via a revoked-on-reset object URL. Unit tests exercise those same PNGs through the Node service and prove output parity.
- **Arbitrary uploads:** the separate manual `PairInput` retains local field/file-declaration checks only. It honestly states that image content is unvalidated and the service unavailable. It never attaches known-sample findings to user files. Changing source, sample, application ID/version/ABV or resubmitting clears evidence and all review state; generation/abort fences reject stale A→B→A completions.
- **Human review:** v3-derived full-width single review, unavailable Batch tab, evidence table, enlarge dialog and green/red/amber icon-backed cards. Pass remains visible and blocked with specific reasons. Each mismatch/uncertainty needs an explicit supported human verified-match resolution to permit Pass; a confirmed defect or unresolved check blocks it. Supporting evidence and reason must each contain at least 10 non-whitespace characters. Machine observations/status/reasons are retained, never rewritten. This is a human assertion, not independent proof that the asserted correction is true.
- **Physical scope:** automatic physical print/type size stays unverified. Pass additionally requires a checked independent-assessment statement and notes, separate from final human confirmation. No legal certification is claimed.
- **Submission:** correction/escalation require relevant notes (at least 10 non-whitespace characters). All outcomes require co-located explicit confirmation, invalidated by edits. `Submit review` can only prepare a cloned/frozen **UNSAVED** in-memory draft. No authenticated identity, server timestamp, receipt ID, localStorage, durable history, government filing, reviewer assignment or notification is invented. Reload clears the draft. Failed/missing/unmapped comparisons cannot submit.

## Exported contracts for the next owner

- `lib/access.ts`: `runtimeAccess(): false`; `fixtureDemoEnabled(nodeEnv, optIn): boolean`.
- `lib/compare-service.ts`: `ComparisonInput = { file: ImageInput; binding: { filename; application: unknown } }`; `createComparisonService({ provider, authorize?, timeoutMs? })(input, signal?) -> Promise<ComparisonRecord>`. Trusted dependency injection only; service is not an anonymous HTTP capability. The whole operation has a maximum 20-second local deadline; provider interface itself has no cancellation argument, so late completions are ignored, not proof an arbitrary injected provider stopped work.
- `lib/comparison-record.ts`: `ComparisonRecord` is a content-free processing failure or `CompleteComparison { processing, application, imageSha256, source:'fixture', evidence, comparison }`. Completed snapshots are recursively frozen. `finalizeComparison` strictly validates the fixture extraction envelope and image binding.
- `lib/offline-demo.ts`: `samples`, `Scenario`, `compareOfflineSample(scenario, application, exactImageBytes)`. This is a fixture demonstration, not browser OCR or an inference client.
- `lib/review-policy.ts`: `ReviewIntent`, `HumanResolution`, `Outcome`, `UnsavedDraft`; `reviewBinding`, `newReviewIntent`, `evaluateReview`, `buildUnsavedDraft`. Policy recomputes findings from validated application/evidence to reject forged passing-field projections. The full-snapshot binding key is an in-memory fence, **not** a signature, server ID or durable concurrency mechanism. Future persistence must reauthorize and revalidate server-side.

## Executed builder gates

Native worktree, copied real `node_modules` from the approved native dependency tree; no dependency manifest/lockfile changes, no install needed. Environment:

```sh
export PATH=/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin:$PATH
export NEXT_TELEMETRY_DISABLED=1
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/data/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
```

All commands below ran from `/tmp/ttb-phase3-worktree/web`.

| Gate | Result | Full local log under `/opt/data/ttb-phase3-evidence/` |
| --- | --- | --- |
| Sprint 1 `npm test` | 279/279, 8 files | `sprint1-unit-green.log` |
| Sprint 1 `npm run typecheck` | exit 0 | `sprint1-typecheck-final.log` |
| Sprint 1 explicit offline `npm run test:e2e` | 8/8 desktop/mobile | `sprint1-e2e-green.log` |
| Final `npm test` | **293/293, 9 files**, no skips | `final-unit.log` |
| Final `npm run typecheck` | **exit 0** | `final-typecheck.log` |
| Final `npm run build` | **exit 0**, 5/5 generated pages; comparison route dynamic | `final-build.log` |
| Final explicit offline `npm run test:e2e` | **18/18 desktop/mobile**, no skips | `final-verified-e2e.log` |
| Production `npm run test:e2e -- tests/e2e/smoke.spec.ts` | **4/4 desktop/mobile** | `production-smoke-e2e.log` |
| Production HTTP probes with opt-in env and forged/malformed requests | Demo remains unavailable; both POSTs 403 | `production-boundary.log` |
| Raw frozen-tree verification | All tracked archived bytes match base | `frozen-integrity.log` |

Browser servers were explicitly started on `127.0.0.1:3100`, curl-checked for HTTP 200, tested in a separate call, and stopped afterward. Development handle `proc_13f7b2abce64`; production handle `proc_3a4df6a6680a`. Production was started with `TTB_OFFLINE_DEMO=1` to test the override refusal. Final connection probe returned HTTP 000 after shutdown. The production build is not a fixture-mode inference deployment.

### RED evidence and corrections (preserved, not relabelled)

- `sprint1-red.log` / `sprint1-fixture-red.log`: new-library tests initially failed because modules did not yet exist; these are missing-feature/import RED, not claimed assertion executions. `sprint1-e2e-red.log` is the actual browser assertion RED for missing fixture workflow.
- `sprint2-policy-red.log`: missing policy module. After an explicit deny-only scaffold, `sprint2-policy-assertion-red.log` contains **5 assertion failures / 9 passes**, then the implemented policy passes all 14. `sprint2-e2e-red.log` captures missing outcome controls before implementation.
- First Sprint 1 full gate exposed a stale historical shell assertion, a Next route-announcer locator ambiguity and a dev-only same-origin font GET in a former zero-total-requests assertion. Updated selectors/copy and retained the substantive no-external/no-API/no-mutation boundary. Initial focused typecheck found a test MIME literal widened to `string`; narrowed it without weakening input checks.
- Visual inspection caught a real broken-image preview despite green DOM-level tests: CSP excluded `blob:`. `preview-csp-red.log` proves decoded width **0 instead of 840**. Added inline/enlarged image decode assertions and allowed `blob:` **only in img-src**. Final 18-case gate and visual inspection verify actual decoded imagery. Earlier `final-e2e.log` is superseded by `final-verified-e2e.log` and is not presented as visual acceptance.
- The write tool's context-free standalone TypeScript lint emitted unsuitable-target/module errors; the repository-configured typecheck and production build are the authoritative passing checks. No project strictness/exclusions were weakened.
- Native Git lacked author configuration; commits use command-scoped established AVA author identity, without changing global config.

## Screenshots and visual source

Visual source: unchanged `docs/ui/v3/REVIEW-MOCK.html` and its named `SINGLE-*`, `OUTCOMES-*` screenshot inventory. Implemented typography/colors/cards/full-width layout from that accepted source, without redesigning frozen mocks or copying unsafe HTML handlers.

Final desktop/mobile screenshot sets live at `/opt/data/ttb-phase3-evidence/final-verified-browser/`, including:

- `review-outcomes-Pass-requi-7095d-on-remains-an-unsaved-draft-{desktop,mobile}/pass-unsaved.png`
- `review-outcomes-blocked-mi-f2979-preserving-human-resolution-{desktop,mobile}/correction-unsaved.png`
- `single-explicit-known-samp-2d97a-enlargement-and-stale-reset-{desktop,mobile}/single-mismatch.png`

Supplemental corrected desktop visual inspection: `/opt/data/cache/screenshots/browser_screenshot_438224b91eed40b89844e8bc027735ef.png`; preview renders, all seven rows and three outcome cards fit and remain readable. Earlier broken-preview screenshot is preserved separately. The development runtime emits React's eval-disabled debugging warning under the inherited script CSP and shows a dev issue badge; no production script-policy relaxation was made. This dev badge can overlap a small part of the preview and is not a product review outcome.

## Integrity, limitations and next gate

Raw Git blob verification against `38406c1`: **1,871 bench files, 38 root fixtures, 17 frozen v3 files**, byte-identical. Phase 1 `contracts.ts`/`intake.ts`, Phase 2 `rules.ts`, extraction/provider/spend sources, and dependency manifests remain unchanged. Exact inventory digests and selected sanitized stdout are in [phase3-gates.log](evidence/phase3-gates.log); full originals remain local.

No blocking local gate remains at handoff. Deliberate boundaries: all useful comparison/review browser behavior is an explicitly opted-in development fixture demonstration; real upload acceptance, provider/auth, server persistence, actual reviewer identity and audit history require Phase 4. Batch is Phase 5. No real-provider accuracy, measured model latency, physical-size compliance, database durability/concurrency, Windows-native reproduction or live deployment is certified. Parent should verify the exact local commits and then request one consolidated independent Phase 3 review, not per-sprint loops.
