# Guarded live batch (local candidate)

This is the existing seven-field reviewer with a bounded live batch executor, not a saved-history, identity or deployment implementation.

## Workflow

- In Batch, choose guarded live mode (development offline mode remains available under the existing opt-in). Enter the existing demo access code and select JPEG/PNG **File** inputs plus the exact filename/application JSON manifest.
- Validate checks local declarations/mapping only. It neither buffers every image nor makes a provider/API call. Unprepared live images have a null normalized hash, not a raw-file hash pretending to be normalized evidence.
- **Start live batch** explicitly starts the queued revisions present at that click. At most two active slots upload/prepare/execute. The server sanitizes each active file, returns a preparation binding over normalized hash + filename + exact parsed application, then re-sanitizes and verifies that binding before comparison. Originals are retained only in page File references. The preview is labelled original, not sanitized server evidence.
- Edits use **Replace selected pair** with a new application version. The original File is retained; the revision becomes unprepared. Old preparation/completion responses cannot replace it. Replacement requires another explicit start; an older running attempt still occupies its slot until settlement.
- A failure is never retried automatically. **Retry selected pair (new paid intent)** creates new attempt/reservation UUIDs and may incur an additional hold. A timeout or lost response does not prove the original attempt did not run.
- Single/Batch tab navigation hides, rather than unmounts, workspaces. Files, results and drafts remain in page memory across tab switches. Reload and rebuilding the manifest discard page-memory state.

## Server invariants / no migration

`/api/comparisons` retains the same access/origin gate, private ledger checks, request limits, decoder, guarded comparison service, provider, price admission and persistent ledger. Batch requests add `x-ttb-batch-phase: prepare|execute`; execute supplies the reducer token in `x-ttb-batch-intent` and the preparation binding in `x-ttb-batch-binding`. There are still exactly two multipart fields, `image` and `application`. Browser-supplied costs or normalized hashes cannot replace server-derived values.

Preparation binding is a consistency check, **not a spend permit or saved receipt**. Its HMAC uses the existing demo access secret; holders of that shared code are not isolated authenticated identities. Security does not depend on a client being unable to construct a binding: the server recomputes normalized bytes/application binding on execute, and independently enforces all access/spend checks.

Stable attempt/reservation IDs reach the existing provider/store path. Existing `holds.attempt UNIQUE` and `holds.reservation PRIMARY KEY` permanently fence dispatch, including across connections/processes/restarts. An advisory lookup gives duplicate attempts HTTP 409; races still fail at atomic reserve/claim before any catalog/provider dispatch. No cached-result replay or fabricated receipt is returned. Holds remain after failure/uncertainty. Existing limits remain **$25 total / $1 hold per attempt / two work and claim slots / no refunds, automatic retries or fallbacks**.

No schema, schema version, provisioning, permissions/ACL, ledger-recovery or reset changes. No second database or store. Runtime never creates a missing ledger. Owner-authorized configuration and the existing private ledger remain prerequisites; this slice does not configure them.

## Limits and tests

- The 300-row manifest limit is not permission or budget for 300 paid calls. The shared ledger cap may refuse much earlier.
- No durable comparison/image store, reload recovery, authenticated reviewer, saved review, provider reconciliation or identity/history expansion. Review submission creates only a plainly labelled **UNSAVED** page-memory draft. All seven fields, evidence validation, local-rule recomputation and human-review requirements still apply to both fixture and OpenRouter records.
- A consumed intent cannot recover a lost result. Manual retry creates new liability; do not treat duplicate/timeout as a safe free retry.
- Test suites: `live-batch-route.test.ts` (disposable ledger + synthetic transport), `live-batch-state.test.ts` (client/reducer fences), and `tests/e2e/live-batch.spec.ts` (real multipart browser → guarded handler → synthetic provider transport on an isolated ledger). Existing batch, single, spend/security and provider compatibility regressions remain applicable. None of these is paid-provider acceptance.
