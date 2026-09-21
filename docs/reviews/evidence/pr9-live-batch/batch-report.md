# Live batch candidate — implementation and verification report

## Exact source identity / disposition

- Canonical checkout: `/opt/data/ttb-prototype-delivery` (sole source writer).
- Exact base / commit parent: `bb1089868649ff522185454ccfc72cb23a3f6b7a`.
- Exact new SHA: **`75fe83d30441b3917869fb6a1164506337b9940c`**.
- Commit: `Add guarded live batch intents with durable spend deduplication`.
- Branch: `ava/prototype-delivery`; local commit only, **not pushed or deployed**.
- Verified parent SHA and clean `git status --porcelain` after commit. `git diff --cached --check` passed before commit.
- Scope: one guarded live batch feature plus the requested retained Single/Batch workspace state and necessary review-control isolation. No identity/full-history/infrastructure expansion.

## Implemented

1. **Reuse existing UI/queue, preserve offline mode.** BatchUpload retains original `File` objects outside immutable reducer state. Live manifest validation checks declarations and explicit filename/application mapping locally; no eager whole-batch image buffering or API/provider call. Unprepared live image hashes are explicitly `null`. Development-only offline sample opt-in and exact fixture-byte checks remain.
2. **Explicit bounded execution.** Start snapshots only currently queued revisions. At most two local active slots prepare/upload/execute; all server calls use the existing `/api/comparisons` handler. Manual retry creates a fresh, explicitly labelled paid intent. No automatic HTTP/provider retry, fallback, refreshed intent on timeout, or automatic execution of edited revisions.
3. **Server-derived binding.** Preparation uses existing `preparePair` sanitation and returns normalized SHA-256 plus a filename/exact parsed application binding. Execution uploads the retained File again; the same comparison service re-sanitizes and verifies the binding before provider admission. No browser cost or claimed normalized hash can replace a server-derived value. Unicode pair IDs are safely serialized in ASCII HTTP headers.
4. **Durable per-intent dedup without migration.** The comparison service's trusted post-preparation seam forwards validated batch attempt/reservation UUIDs instead of generating new IDs. Existing ledger UNIQUE/PRIMARY KEY constraints and atomic reserve/claim remain the actual permanent dispatch fence. A small advisory lookup returns HTTP 409 for an already-recorded attempt/reservation; racing requests still fail at atomic reserve. Successful, failed and uncertain consumed intents cannot silently dispatch again across ledger connections/restarts. No cached-result or fabricated receipt is returned.
5. **Existing spending/security unchanged.** Same private SQLite store and access/origin checks, same two global work/claim slots, same $25 hard ceiling and $1 retained hold, same model/provider/catalog admission, no refunds/reclaim/reset. No schema/version/provisioning/security-policy changes or second persistence system. Only disposable isolated test ledgers were provisioned.
6. **Revision and review correctness.** Server preparation is accepted only for the active batch/pair/revision/attempt; stale preparation cancels before execution. Stale/out-of-order completions cannot replace new application revisions, and superseded attempts continue occupying their slots until settled. All seven field findings remain. The shared review policy now accepts the already-supported OpenRouter source as well as fixtures, retaining strict evidence validation, rule recomputation and human policy; submission still creates only an **UNSAVED** draft.
7. **Tab state retained safely.** Single and Batch remain mounted behind hidden panels. Files, input text, results, queue state and drafts survive tab switches. Review label IDs and radio group names are now unique per mounted component, preventing hidden Single controls from capturing Batch labels/radio selection.

### Important authority distinction

Preparation binding uses the existing shared demo access secret, not a new server-only identity system. It is a consistency check, **not a spend permit, authenticated reviewer identity, durable result, or saved-review receipt**. Holders of the shared access code are not mutually isolated identities. Server sanitation/recomputation and independent durable spend admission remain authoritative even if an authorized client constructs a binding itself.

## RED / GREEN evidence

Runtime used: `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin/node` (v24.21.0), existing locked dependencies. Build/test servers had production credential/data-directory variables unset and `TTB_DEMO_ENABLED=false`. Synthetic route tests supplied their own isolated configuration/transport. Browser harnesses forwarded real multipart file bytes to the guarded handler with a synthetic provider transport and disposable ledger. All listeners were loopback-only and were stopped afterward.

| Check | Result | Evidence |
|---|---|---|
| Initial RED route suite, before server implementation | 4/4 failed: existing route had no preparation protocol | `/opt/data/ttb-live-batch-red.log` |
| Intermediate RED browser integration | Exposed fixture-only review validation rejecting live completions, and hidden-label ambiguity; subsequently corrected | `/opt/data/ttb-live-batch-e2e-red.log` |
| Final focused Vitest suite | **17 files, 318 tests passed** | `/opt/data/ttb-live-batch-green.log` |
| Final production-build browser checks: new live batch + existing live single, desktop/mobile | **4 passed** | `/opt/data/ttb-live-batch-e2e.log` |
| Offline Batch / Single / human-review regressions, desktop/mobile, including independent retained drafts and unique DOM IDs | **36 passed** | `/opt/data/ttb-live-batch-offline-e2e.log` |
| Final `npm run typecheck` | Exit 0 | `/opt/data/ttb-live-batch-typecheck.log` |
| Final `npm run build -- --webpack` | Exit 0; optimized build and TypeScript complete | `/opt/data/ttb-live-batch-build.log` |

Focused suite command (from canonical `web`, with the Node directory on PATH):

```sh
npm test -- --maxWorkers=1 \
  tests/live-batch-route.test.ts tests/live-batch-state.test.ts \
  tests/batch-state.test.ts tests/batch-manifest.test.ts \
  tests/demo-route.test.ts tests/compare-service.test.ts tests/review-policy.test.ts \
  tests/openrouter-compatibility.test.ts tests/extraction.test.ts tests/spend.test.ts \
  tests/sqlite-spend.test.ts tests/sqlite-spend-security.test.ts \
  tests/sqlite-spend-native-security.test.ts tests/sqlite-spend-windows-script.test.ts \
  tests/intake.test.ts tests/offline-demo.test.ts tests/pair-input.test.ts
```

New coverage includes: two admitted slots/third refusal; same-intent replay and racing duplicate with no extra provider dispatch/hold; dedup after a failed attempt and reopened handler/store; edited application requiring new preparation/revision; rejection of changed image, forged binding and browser cost; raw-versus-normalized hash distinction using metadata-bearing input; out-of-order/stale preparation and completion; invalid-file preparation with no execution; File identity/Unicode header preservation; execution-response loss without retry; all seven fields; explicit retry; honest UNSAVED counts; and Single/Batch independent retained inputs/drafts/controls. Existing multi-process SQLite/security and provider compatibility tests also passed.

### Issues encountered and disposition

- An unconstrained multi-worker Vitest run exhausted available memory (`ENOMEM`). Reran with `--maxWorkers=1`; final focused suite fully passed. Initial resource-failure log: `/opt/data/ttb-live-batch-resource-failure.log`.
- Development webpack evaluation conflicts with the repository's existing CSP. Used default Turbopack development mode for offline acceptance; **did not relax CSP**. Production webpack build/browser acceptance passed. Development server restart was needed to discard stale compiled source after edits in this environment.
- One unchanged mobile Single timing test missed its five-second assertion during an earlier overlapping check run (35/36 passed). The entire browser suite was rerun without concurrent build/unit load and passed 36/36. Earlier log: `/opt/data/ttb-live-batch-offline-transient.log`. No timeout/security settings were weakened.
- Retaining both workspaces exposed duplicate pre-existing review-control IDs/radio names, fixed with React `useId`; batch tests now target the visible panel rather than hidden duplicate label text. New browser coverage explicitly checks no duplicate IDs and independent retained outcomes.

## Committed files (20)

New:
- `docs/LIVE-BATCH.md`
- `web/lib/batch-binding.ts`
- `web/lib/live-batch-client.ts`
- `web/tests/live-batch-route.test.ts`
- `web/tests/live-batch-state.test.ts`
- `web/tests/e2e/live-batch.spec.ts`

Modified:
- `web/components/BatchQueue.tsx`
- `web/components/BatchUpload.tsx`
- `web/components/BatchWorkspace.tsx`
- `web/components/OutcomeCards.tsx`
- `web/components/ReviewConfirmation.tsx`
- `web/components/ReviewWorkspace.tsx`
- `web/lib/batch-manifest.ts`
- `web/lib/batch-state.ts`
- `web/lib/compare-service.ts`
- `web/lib/demo-route.ts`
- `web/lib/review-policy.ts`
- `web/lib/sqlite-spend.ts`
- `web/tests/e2e/batch.spec.ts`
- `web/tests/e2e/live-demo.spec.ts`

No changes to ledger-security implementation, spend execution helper, provider adapter, provisioning scripts, DB migrations, dependency manifests/lockfile, or CSP. Generated development `next-env.d.ts` changes were removed by the final production build; not committed.

## Limitations / handoff

- **No paid calls, production-ledger access, real credential access, bridge/agent calls, public exposure, provisioning of operational infrastructure, push, or deployment.** This is synthetic local acceptance, not renewed paid-provider or native-Windows acceptance. Frozen external provider-repair acceptance target was not modified.
- The existing ledger was sufficient; **no incompatible migration or external-authority blocker** was encountered. Operational live execution still requires the owner's existing enabled configuration and private ledger. Remaining production budget was not inspected.
- The 300-row manifest limit is not a budget grant. Existing liabilities can cause refusal well before all rows execute. Failures/timeouts retain holds; new explicit retries can incur new liability.
- Durable **deduplication**, not durable results/history: consumed intents return conflict/failure rather than recovered results. No result/image cache, reload recovery, saved review receipt, authenticated reviewer, provider reconciliation, or history service. Rebuilding a manifest/reloading loses local state; it does not auto-resume or automatically retry.
- Single's pre-existing non-batch request behavior remains otherwise unchanged; stable-intent deduplication is scoped to the new batch protocol.
- Preview shows original File bytes, clearly distinguished from the server-normalized hash bound to results. To change a live pair's file, rebuild the manifest; application-only replacement retains the File and requires a fresh explicit comparison.

Report location: `/opt/data/ttb-live-batch-report.md` (outside repository; not part of the feature commit).
