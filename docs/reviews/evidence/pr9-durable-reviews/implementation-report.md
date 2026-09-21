# TTB durable save/reopen implementation — completed locally

## Commit and scope

- Repository: `/opt/data/ttb-prototype-delivery`
- Verified clean starting commit: `fa56bcc7d5b50bb63b4bc559c91682e237f355ab`
- Final local commit: **`e721936518e36b7c6d65b5649308f21d1b57e784`** — `Add private SQLite review snapshots, durable receipts and history reopen`
- No push, hosting purchase, cloud mutation, public exposure, paid provider call, real credential use, or ARGUS/MCP/other-agent call.
- The canonical spending database was not accessed. All persistence/provider proofs used new disposable private directories and a synthetic transport. Spending reservation/claim/no-retry/$25-cap implementation and dependencies were unchanged.
- Documentation worker files `docs/reviews/26-live-batch-argus-pass.md` and `docs/reviews/evidence/pr9-argus-batch-pass/` remain untracked, unstaged and untouched. README/status were left to the parent.

## Implemented behavior

1. A trusted comparison-service completion hook stores an immutable server-generated comparison, original parsed application, and normalized image bytes in separate private SQLite. The response adds an opaque comparison ID outside the existing comparison record, preserving bindingKey and all seven-field/human-review rules.
2. Save accepts only comparison ID, explicit ReviewIntent and idempotency key. It loads server-owned evidence, validates the existing human policy, and appends a review transaction with server-generated ID and SQLite timestamp. SAVED is returned only after COMMIT. Snapshot/review UPDATE and DELETE are denied by triggers. One review per immutable comparison; exact replay returns the original receipt, changed payload/key conflicts fail closed.
3. Shared-code-protected list, detail and original normalized-image endpoints support history reopening. Reads deliberately use POST for the same strict Origin fence as comparison/save. Every review endpoint/error/image is no-store; normalized images are not public assets. UI verifies image SHA-256 and uses revocable Blob URLs.
4. Single and batch submission now have truthful receipt-backed SAVED states. Lost responses remain UNSAVED/receipt-unconfirmed, with an unchanged explicit retry using the same key. Batch navigation retains confirmed receipts; replacement revisions do not inherit old confirmations, saved badges or counts. Shared demo identity is explicitly NOT an individually authenticated reviewer.
5. Store provisioning is explicit and create-new-only. Missing/insecure/wrong-schema stores are never initialized at runtime. History storage failure does not discard a completed comparison or initiate another provider call; without a server ID, the page can only create a clearly UNSAVED memory draft.
6. Limits: 200 snapshots/reviews, 10 MiB normalized image, 256 KiB record JSON, 128 MiB aggregate snapshot payload, 384 KiB streamed save request, 5-second body-read limit, two active review handlers/process, 50 history summaries/page, and a 40,960-page SQLite cap. Existing private POSIX/Windows security checks are reused.

## Real persistence proof

Desktop proof used production-built Next for the review endpoints, the real guarded comparison handler with a test-only synthetic provider transport, and real SQLite. No save/detail/evidence response was mocked.

- Uploaded synthetic PNG, submitted explicit application `DURABLE-SYNTHETIC-001 / original-v1`, received server comparison ID `ab0c7d14-cdca-4163-abe2-a2b33b5efb99`.
- Explicit human Second reviewer decision committed. The first HTTP save response was deliberately lost **after** the real server commit. Browser remained UNSAVED; unchanged retry sent the identical request/key and recovered the same receipt.
- Receipt: **`172b86fe-aa6e-48c2-b566-1f04b3407f63`**.
- Server timestamp: **`2026-09-21T01:51:41.602Z`**.
- Batch upload/comparison/human save also completed, with saved count/badge and navigation verified. Replacing its application revision cleared current-revision saved state without deleting history.
- Entire test service was stopped and a new OS service process started: **PID 59962 → PID 61128**. Browser reloaded, reentered the shared code, loaded history and reopened the saved single review.
- Preserved original parsed application and full comparison matched the original server result. The image was visibly decoded in-browser and its SHA-256 matched both the saved record and an independent readonly SQLite check.
- Normalized image: **79,690 bytes**, SHA-256 **`46912750a0d1708a9883e83ce8161f3e1eb811ab5060b6037473437ffc0095e3`**.
- Retained disposable review DB: **`/opt/data/ttb-durable-review-evidence/disposable-ttb-review-3fNK66/reviews/reviews.sqlite`**.
- Independent readonly verification: `PRAGMA integrity_check = ok`, **3 snapshots / 2 reviews**, mode **0600**, size **315,392 bytes**. Receipt timestamp and full original record identical after restart.
- Unauthenticated evidence request after restart returned **403**, with **no-store**. Browser page errors: **none**.
- Mobile repeated the same flow independently: **PID 62735 → PID 64327**, receipt `5ac372c5-5144-45ca-9906-cf5eeae42c8f`, disposable DB `/opt/data/ttb-durable-review-evidence/mobile/disposable-ttb-review-b62q5f/reviews/reviews.sqlite`.
- Test-created service processes were stopped; final process check showed no remaining Next/durable-test server.

## Verification and exact logs/artifacts

All paths below are under **`/opt/data/ttb-durable-review-evidence/`** unless specified otherwise.

### Tests/build

- `red.log`: initial focused test failed because the review store did not yet exist.
- `green-initial.log`: substantive first implementation RED found an SQL insert arity bug; it was repaired before GREEN.
- `green-final.log`: **214 tests passed, 10 files**, all with `--maxWorkers=1`. Includes real SQLite provisioning/reopen/immutability/capacity; missing/insecure stores; unauthorized/cross-origin/cross-site denial before body reads; forged comparison rejection; unsupported Pass and stale binding rejection; idempotency replay/conflicts; unknown IDs; streamed/declared oversize rejection; preserved comparison after snapshot failure; existing seven-field rules, policy, batch and private-store security regressions.
- `typecheck-final.log`: `tsc --noEmit`, exit 0 (empty success log).
- `build-final.log`: production webpack build, exit 0; includes dynamic `/api/reviews/[[...path]]`.
- `browser-final.log`: desktop durable browser acceptance, **1 passed**.
- `browser-mobile.log`: mobile durable browser acceptance, **1 passed**.
- `browser-regressions.log`: existing live single + live batch browser tests, **2 passed**, including the unconfigured-history UNSAVED path.
- `service-restart.log`: desktop service readiness PIDs and only three synthetic provider invocations (single + two batch comparisons); no save retry provider invocation.
- `mobile/service-restart.log`: equivalent independent mobile restart log.
- `sqlite-verification.log`: independent readonly SQLite integrity/count/receipt/application/image proof after service shutdown.
- `committed-files.txt`: exact 24-file commit manifest.

### Desktop evidence

- `01-unsaved-response-loss.png`
- `02-single-saved.png`
- `03-batch-saved.png`
- `04-reopened-after-restart.png`
- `preserved-normalized-label.png`
- `persistence-proof.json` — original complete comparison/application/intent, server receipt, process IDs, request replay equivalence, image digest, denial status, browser error list and exact private DB path. No access code or provider credential.
- `disposable-ttb-review-3fNK66/reviews/reviews.sqlite` — actual final disposable review DB.

Equivalent mobile screenshots, image and `persistence-proof.json` are under `mobile/`. Earlier disposable attempts/diagnostic logs remain local and are not represented as final acceptance evidence.

### Commands/runtime

Node: `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin/node`; existing locked node_modules; no install/dependency edits. From `web/`:

```sh
node node_modules/vitest/vitest.mjs run \
 tests/saved-reviews.test.ts tests/saved-review-route.test.ts \
 tests/review-policy.test.ts tests/demo-route.test.ts tests/live-batch-route.test.ts \
 tests/compare-service.test.ts tests/live-batch-state.test.ts tests/batch-state.test.ts \
 tests/rules.test.ts tests/sqlite-spend-security.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
CIRCLE_NODE_TOTAL=2 node node_modules/next/dist/bin/next build --webpack
```

Browser acceptance used `NODE_OPTIONS=--max-old-space-size=512`, one worker, and the already-installed Chromium headless executable `/opt/data/qa/bermuda-mobile/browsers/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`. Tests: `tests/e2e/durable-reviews.spec.ts` with desktop then mobile; real test service starts/stops itself. Existing live-browser regression tests used a separate loopback-only production server on port 3187, verified HTTP 200 before testing and stopped afterward. No trace with secret headers was recorded.

## Exact committed files

```text
docs/SAVED-REVIEWS.md
web/app/api/reviews/[[...path]]/route.ts
web/app/review/page.tsx
web/components/BatchQueue.tsx
web/components/BatchSwitcher.tsx
web/components/BatchWorkspace.tsx
web/components/PairInput.tsx
web/components/ReviewConfirmation.tsx
web/components/ReviewWorkspace.tsx
web/components/SavedReviewHistory.tsx
web/lib/compare-service.ts
web/lib/demo-route.ts
web/lib/demo-security.ts
web/lib/live-batch-client.ts
web/lib/review-policy.ts
web/lib/review-route.ts
web/lib/review-store.ts
web/lib/saved-review-contract.ts
web/lib/use-durable-review.ts
web/scripts/provision-reviews.ts
web/tests/e2e/durable-reviews.spec.ts
web/tests/fixtures/durable-server.ts
web/tests/saved-review-route.test.ts
web/tests/saved-reviews.test.ts
```

## Issues encountered / known limits

- Initial default Next build exhausted memory with seven workers (`build.log`). Setting `CIRCLE_NODE_TOTAL=2` bounded it to one worker and the final build passed. A transient browser/service-start ENOMEM was resolved by the 512 MiB Node heap cap and installed headless Chromium. Production deadlines were not changed.
- NextRequest normalizes numeric loopback URLs to localhost. The browser proof uses `http://localhost:<port>` for both configured and browser origin rather than weakening exact-origin security. Temporary diagnostics were removed before the final build/commit.
- Tool per-file auto-lint sometimes used standalone tsc defaults and emitted unrelated target/esModuleInterop errors. The actual project typecheck and production build both passed on the final source.
- WSL/POSIX exercised here; existing Windows security logic was reused, but this is not a new native-Windows browser acceptance claim.
- Shared-code authorization is intentionally shared identity, not individual accountability. Every holder can view shared history. No enterprise authentication, Supabase rebuild, multi-tenant ACL, public evidence URL, government filing, or legal certification.
- One immutable review per comparison; no edit/revoke/delete workflow. Staleness means exact snapshot/intent and browser revision binding, not a global “latest application version” authority. Historical snapshots remain historical even when a browser replaces its current pair.
- Failed snapshot persistence preserves the comparison but cannot produce a saveable server ID. There is no browser re-upload of comparison authority to recover such a snapshot and no automatic paid retry. A process crash/lost original comparison response is not turned into a fabricated saved receipt.
- Retry keys persist only in bounded page memory. After browser reload, private history recovers committed reviews; unsaved edits are not a durable draft feature.
- Append-only means application/SQL enforcement, not tamper resistance against the OS/DB owner. Retention, erasure, backup automation, cross-host coordination and hosted deployment are still operational follow-ups. Store capacity fails closed without reset/pruning.
- Synthetic provider proof is not real-model accuracy or real-batch acceptance. Source provenance remains `openrouter` because the real adapter was used with a test-only mocked transport; reports/screenshots are synthetic acceptance evidence, not paid inference claims.

**No unresolved implementation authority blocker.** Before a non-disposable hosted use, the operator must explicitly prepare a separate private persistent review directory, run the documented create-new provisioning command, configure `TTB_REVIEW_DATA_DIR`, and perform the separate authorized real-batch/hosting acceptance. This task did not provision or mutate those environments.
