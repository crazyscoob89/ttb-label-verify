# Phase 5 — offline batch UI

## Candidate and scope

- Base: `c1ef52af05f9db5303e49cb7ba207d199ca6fe15` on `ava/phase5-batch-core`.
- Sole source worktree: `/tmp/ttb-phase5-worktree`. Local-only implementation; no push, merge, deployment, provisioning, migrations, credentials or paid inference.
- Both authorized UI slices are implemented: explicit batch preparation/queue and full-width individual review/navigation. This is **offline fixture UI acceptance**, not live batch-runtime or persistence acceptance.
- The exact final candidate SHA is recorded by the parent handoff and the external committed-gate evidence. This document is included in that candidate.

## Implemented behavior

1. `BatchUpload` accepts selected image files and an explicit JSON **array** of `{filename, application}` mappings, retaining duplicate occurrences. The existing manifest engine joins literal, case-sensitive filenames, never list position or inferred application values. Visible total/valid/blocked counts and per-entry diagnostics cover invalid applications, missing mappings/files and duplicates. Limits remain 300 files, 300 mappings and 300 logical entries.
2. Only the server's existing `fixtureDemoEnabled(NODE_ENV, TTB_OFFLINE_DEMO)` opt-in exposes **Load synthetic fixture batch**. The button loads the four existing local PNGs and supplies an editable, explicit application manifest. It does not start comparison.
3. Bounded sequential local reads check file declarations and SHA-256. Only a hash matching the committed synthetic catalog retains an offline asset. Unknown valid PNGs, corrupt same-name files and all production uploads remain blocked/unavailable. `invalid-file` is accompanied by a truthful runtime/unknown-image diagnostic; **this is not an arbitrary-image sanitizer**.
4. `BatchWorkspace` owns one current snapshot from `createBatchState`/`transitionBatch`. Queue execution uses the existing `compareOfflineSample` adapter, which rechecks exact image bytes before attaching independently authored fixture evidence. Filename-only sample selection is impossible; a renamed known PNG follows its bytes and the explicit manifest's application. No provider/API executor or save adapter is connected.
5. **Compare queued fixtures** starts the queued revisions present at that click, at the default/maximum concurrency of two. The UI consumes reducer commands but does not create a second pair-state engine. Completion drains only that explicitly started revision set. Failures are not re-enqueued; **Retry selected fixture** dispatches only the currently selected failed pair with fresh core identities.
6. `BatchSwitcher` implements the v3 horizontal text-card rail, previous/next controls and full-width active review. The rail renders no image thumbnails; only the active successful pair gets an exact-byte Blob preview. Inline/enlarged images decode at natural width 840 in desktop/mobile tests. URLs are revoked on evidence/selection changes and unmount.
7. `ReviewConfirmation` has an optional controlled interface; Single retains its existing local-state default. Batch edits, confirmation and draft creation use the existing reducer/review policy. Navigation preserves per-pair results, notes, resolutions and drafts while resetting confirmation. Failed/blocked pairs cannot create reviews. Physical assessment and supported human resolution requirements remain intact; machine findings are never rewritten by a human selection.
8. Explicit replacement requires valid application JSON with a changed application identity/version and an already validated synthetic asset. Core revision advances; current result/intent/draft clears. Old in-flight attempts retain their occupied slots until settlement; delayed completion cannot populate the replacement. Superseded page-memory version count is labeled **not durable saved history**.
9. Summary distinguishes compared, failed, blocked, running, queued, occupied slots, attempts, UNSAVED drafts, saved reviews/outcomes and remaining. No receipt validator is supplied, no save command is emitted, and saved reviews/outcomes remain zero. Reload clears memory. Leaving the Single/Batch mode also unmounts that mode and clears its page-memory work; card navigation within Batch preserves its work.

## Boundaries preserved

- All `web/lib` source (including batch core, review policy, offline adapter, runtime access and schemas), API route, package/lockfile, CSP config, synthetic image bytes and `docs/ui/v3` were verified byte-for-byte against the base: **41 Git blobs** in `frozen-integrity.log`.
- No Phase4 modules or shared BUILD-PLAN/IMPLEMENTATION-STATUS edits.
- No dependencies added.
- Single's nine scenarios still run on both browser projects: **18 tests**. Only their formerly disabled Batch-tab assertions were updated to reflect this authorized feature, and hardcoded origin guards now consume Playwright's configured `baseURL`. No Single scenario/assertion about evidence, review policy or failures was removed.
- Playwright accepts `BASE_URL` (default still `http://127.0.0.1:3100`). All execution here used the owned **127.0.0.1:3105** server. No unknown server reuse or non-loopback binding.
- Production fixture controls are absent. Even exact known file uploads cannot compare there. `/api/comparisons` still returns exactly HTTP 403 with `{processing:'failed',code:'access-denied'}` before interpreting the client body.

## TDD and executed gates

Evidence root: `/opt/data/ttb-phase5-evidence/ui/` (external, not committed).

| Gate | Actual result | Evidence |
|---|---:|---|
| Browser behavioral RED before wiring | 7 missing/enabled-Batch assertions failed, then the delayed-completion scenario also failed at the missing UI boundary | `red-assertions.log`, `red-delayed.log` |
| First integrated batch desktop/mobile | 16 passed | `first-browser.log` |
| Existing focused batch core | 33 passed: manifest 14 + state 19 | `batch-unit.log` |
| Full Vitest regression | 326 passed in 11 files, no skips | `full-unit.log` |
| TypeScript, first and final | both exit 0 | `typecheck-first.log`, `typecheck-final.log` |
| Final development desktop/mobile browser suite | 38 passed: batch 20 + Single 18, no skips | `green-browser.log` |
| Next production build, `TTB_OFFLINE_DEMO=1` | exit 0; compilation, TypeScript and static generation successful | `build.log` |
| Production desktop/mobile UI + default-deny API | 4 passed, no skips | `production-browser.log` |
| Frozen source/assets | 41 exact base Git blobs unchanged | `frozen-integrity.log` |
| Owned server shutdown | development and final production port checks closed | `dev-port-closed.log`, `final-port-closed.log` |

The final batch suite also covers corrupted catalog responses, real unknown PNG bytes named `match.png`, renamed exact fixture bytes, mapping order reversal, isolated invalid/duplicate/missing mappings, pending validation invalidation, selected-only manual retry, per-pair drafts and confirmation resets, policy-controlled Pass, replacement revision fencing during two occupied slots, max-301 rejection, keyboard tab navigation, decoded previews and mobile overflow. Every batch case asserts zero external/provider/application-API traffic and zero uncaught browser errors.

### Preserved failed attempts / environment notes

- The mounted Node installation's `npm` launcher failed reading its own dependencies with `ENOMEM`; CPU affinity did not fix that launcher (`red.log`, `red-affinity.log`). Direct invocation of the **same installed Node24 and package CLI entrypoints** succeeded. No package or product workaround was introduced. This is an observed launcher/filesystem issue, not a claimed diagnosis of the kernel.
- The initial Playwright test import needed Node's JSON import handling. Tests now read the catalog with `readFileSync`; the missing-import run is retained in `red-direct.log`, not counted as behavioral RED.
- An expanded global traffic guard initially treated Next's development-only `POST /__nextjs_original-stack-frames` as forbidden (`full-browser.log`: 20 batch after-hook failures, all 18 Single cases passed). This request comes from React's existing development warning that the unchanged CSP forbids `eval`. The guard now allows **only that exact local development diagnostic path**; external requests, `/api/` requests and other non-GET requests still fail. The CSP was not weakened. Do not describe the development run as literally zero HTTP POSTs.
- `ss` is not installed; shutdown verification used a direct Python socket connection check. The server process manager also reports both owned sessions killed.

## Reproduce locally (same installed tools)

From this worktree's `web/` directory:

```sh
export PATH=/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin:$PATH
export NEXT_TELEMETRY_DISABLED=1
export BASE_URL=http://127.0.0.1:3105
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/data/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
```

Start the development server in a **tracked background terminal**, not shell `&`:

```sh
TTB_OFFLINE_DEMO=1 node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3105
```

After HTTP readiness, run `node node_modules/@playwright/test/cli.js test`. Stop the owned development process and verify the port is closed before building. Production verification deliberately retains the opt-in:

```sh
TTB_OFFLINE_DEMO=1 node node_modules/next/dist/bin/next build
TTB_OFFLINE_DEMO=1 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3105
# after readiness, in a separate terminal:
node node_modules/@playwright/test/cli.js test --config playwright.production.config.ts
```

Start/stop production through the tracked process tool as well; verify final port closure. Never substitute 3100 or widen the interface.

## Browser screenshots

Under `green-browser/`, desktop and mobile variants:

- `batch-explicit-manifest-re-eac0f--without-list-order-pairing-{desktop,mobile}/batch-manifest-blocked.png`
- `batch-exact-known-fixtures-87402-ver-receive-sample-evidence-{desktop,mobile}/batch-mismatch.png`
- `batch-card-and-previous-ne-26a0c-d-never-claim-saved-history-{desktop,mobile}/batch-draft-isolation.png`
- Existing Single screenshots include `single-mismatch.png`, `pass-unsaved.png`, `correction-unsaved.png` and `foundation.png` in their corresponding test directories.

`production-browser/` contains `production-batch-denied.png` for both viewports.

## Remaining authority / acceptance limitations

No arbitrary-upload processing, server image sanitation adapter, authenticated runtime executor, paid extraction, durable batch recovery, authenticated reviewer attribution, server save receipt or persisted review history is implemented or claimed. Those are intentionally unconnected Phase4/runtime dependencies, not simulated completions. Unknown-image processing and saved counts remain closed. Scale 300 is covered by the existing pure core tests; this tranche does not claim a 300-image browser load or live/durable concurrency acceptance. This local self-tested candidate is not independent review approval, publication or deployment.
