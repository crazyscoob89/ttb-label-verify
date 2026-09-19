# Phase 5 batch foundation — local implementation handoff

**Status: pure-library foundation implemented and unit-tested; independent review and integration pending.** This is worker evidence, not ARGUS QA or Phase 5 feature completion.

Base: `d799821ab549ce2c7dbb6bce8811e2a9a461b204` (frozen Phase 3).
Branch: `ava/phase5-batch-core`, worktree `/tmp/ttb-phase5-worktree`.
Only the two batch modules, their two test files and this document are added. No Phase 4 dependency, existing-source edit, package change, UI/route change, root-fixture change, migration, cloud operation, paid call, bridge call, push or deployment.

## Exported foundation

### `web/lib/batch-manifest.ts`

- `buildBatchManifest(filesInput, manifestInput): BatchManifest`
- `batchImageSchema`, `BatchImage`, `ManifestIssue`, `BatchEntry`, `ValidBatchEntry`, `BatchManifest`

Files are **references to sanitized images**, shaped `{filename, imageSha256}`. They are not browser file declarations or image bytes. The caller must derive the SHA from the existing trusted sanitation/intake boundary; this pure helper does not decode images or authenticate hashes.

The manifest is the existing explicit array vocabulary, either decoded JSON or JSON text:

```ts
[{ filename: 'exact.png', application: /* existing applicationSchema input */ }]
```

Joins are exact and case-sensitive, never list-order based. A filename-keyed JSON object is rejected: the array preserves duplicate filename mappings. Each exact filename produces one logical row, retaining all physical-file and manifest indexes for diagnostics. Duplicate physical names, duplicate mappings and duplicate application/version identities block all affected rows. Missing files/mappings, invalid file metadata, invalid declarations and invalid row shapes block locally; unrelated rows remain usable. Invalid filenames have separate diagnostic rows, with no inferred application or findings. Missing ABV is never converted to zero.

Both input arrays and their union of logical rows are bounded at 300; an empty union, malformed JSON, wrong envelope or oversized batch rejects the whole envelope. Counts refer to **logical rows**, not duplicate upload occurrences. Valid filename-derived IDs remain stable when inputs are reordered. Results are cloned/parsed snapshots and recursively frozen. There is no known-sample lookup or fallback.

### `web/lib/batch-state.ts`

- `createBatchState(manifest, {batchId, concurrency?})`
- `transitionBatch(state, action): BatchTransition`
- `acceptSavedReview(state, token, receipt, validator?): BatchTransition`
- `summarizeBatch(state)`
- Public types: `BatchState`, `BatchPairState`, `PairSnapshot`, `BatchAction`, `BatchTransition`, `BatchCommand`, `DispatchCommand`, `AttemptIdentity`, `AttemptToken`, `SaveReviewCommand`, `SaveToken`, `ReviewEdits`, `ReviewReceiptValidator`, `ValidatedReviewReceipt`.

`batchId` is a caller-provided fresh UUID. Concurrency defaults to two; only one or two are accepted. Reducers return `{state, commands, rejected}` and never run commands. Callers must serialize transitions against the current snapshot and execute only the returned commands once. States are trusted locally constructed snapshots, not an authenticated deserialization format. They are not a durable/global quota or idempotency store.

| Action | Behavior |
| --- | --- |
| `dispatch` | Queued pair only; requires fresh UUID attempt and reservation identities. |
| `dispatch-next` | Explicit bounded admission of queued pairs using caller-supplied fresh identities; stops at capacity. Does not include failed pairs. |
| `retry` | Explicit failed-pair-only dispatch; both identities must be new within this batch. |
| `settle` | Matches exact batch/pair/revision/attempt/reservation token; verifies complete application/hash/findings through existing review policy. Unknown, forged or stale tokens cannot complete another attempt. Never schedules more work. |
| `navigate` | Exact card ID, `next`, or `previous`; preserves drafts and acknowledged saved outcomes, clears active confirmation and pending save acceptance on an actual switch. Never dispatches or submits. |
| `replace` | Validates replacement application/image reference, same filename and nonduplicate application/version; increments revision even for A→B→A, snapshots old version, clears current result/intent/draft/saved state. Blocked manifest repair requires explicit rebuild. |
| `edit-intent`, `confirm`, `draft` | Selected complete pair only. Reuses `ReviewIntent` and `buildUnsavedDraft`; editing clears confirmation. A draft remains `UNSAVED`. Failed/missing comparisons cannot be reviewed. |
| `submit` | Emits a save request only for an unchanged current confirmed draft and a fresh submission UUID. No persistence occurs. |

A dispatch command is named **`authorize-reserve-and-dispatch`**, not an authorization permit. The future trusted executor MUST authorize each attempt, atomically reserve and claim its spend identities via the existing protected spend/provider boundary, and bind sanitized bytes to the command's SHA. It must not call a provider directly because a command exists. Fresh IDs are not authority to spend. Server-side deduplication, global concurrency, cumulative quota and unresolved-liability accounting remain mandatory; no local retry releases a server reservation.

Replacement does not free an unresolved dispatch slot. Its old token stays in `inFlight` until an explicit terminal settlement; that settlement can release the local slot but cannot populate the new revision. Background comparisons correctly remain pair-bound across navigation. By contrast, delayed **review-save receipts** are selection-epoch fenced: A→B→A navigation does not revive abandoned confirmation or save acceptance. Historical versions are page-memory snapshots only, not durable audit history.

`reviewed` counts only current complete pairs with accepted saved receipts. `remaining = total - reviewed`, so blocked and failed rows remain outstanding. Outcomes use existing `Outcome` values (`pass`, `correction`, `second-review`), not regulatory approval. Draft, compared, failed, blocked, queued and running counts remain distinct. `complete` means every logical row has an accepted saved review, not merely that extraction finished. Superseded active attempts are visible separately in `inFlight` even while their replacement pair is queued.

## Saved-review authority and unimplemented dependencies

Frozen Phase 3 has **no server saved-review receipt schema**. `ValidatedReviewReceipt` is a normalized integration-adapter result, not an invented replacement repository wire schema. No production validator is supplied. `acceptSavedReview` denies without an adapter, denies adapter exceptions/rejections, checks exact save-token binding and outcome, and does not trust an HTTP-like success object. Tests use an explicitly test-only stand-in validator.

The Phase 4 integration owner must supply a pure decoder/validator for the actual authenticated repository receipt contract, proving committed persistence, actor/access and exact evidence/intent/request identity. A permissive adapter invalidates this boundary. Late or ambiguous server commits rejected by the selection/version fence need authoritative reload/reconciliation; they must not be blindly resubmitted. Durable idempotency, recovery, saved-history hydration, and save-failure reconciliation are **not implemented here**.

Additional deferred dependencies: UI/browser navigation, upload/aggregate-request limits and sanitation wiring, request authentication, durable storage, authorized command executor, actual spend-store/provider composition, and integrated browser/persistence acceptance. Existing `CompleteComparison`/review policy are fixture-source-only; this tranche does not add a live-provider result contract.

## TDD and verified local gates

Runtime: `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin` first on PATH; `NEXT_TELEMETRY_DISABLED=1`. Existing dependencies were copied into this worktree, preserving symlinks. No install or lockfile change.

Logs: `/opt/data/ttb-phase5-evidence/`.

| Evidence | Result |
| --- | --- |
| `01-manifest-red.log` | 14 behavioral failures against a deny scaffold (including the 300-pair positive control). |
| `02-manifest-green.log` | 14 manifest tests pass. |
| `03-state-red.log` | 17 failures, one already-denied negative case against a no-command scaffold; positive dispatch/receipt controls fail as expected. |
| `04-focused.log`, `05-typecheck.log`, `06-full-regression.log` | Initial GREEN: 32 focused tests, project typecheck, 325 full unit tests. |
| `07-completion-red.log` | Focused regression exposes an unserializable async completion throwing through existing policy; 18 other tests intentionally filtered. |
| `08-final-focused.log` | `npm test -- tests/batch-manifest.test.ts tests/batch-state.test.ts`: **33 passed**, no skips. |
| `09-final-typecheck.log` | `npm run typecheck`: **PASS**. |
| `10-final-regression.log` | `npm test`: **326 passed / 11 files**, no skips. |

The serialization regression was contained in the new batch wrapper; existing review-policy source was not changed. The editor's standalone lint helper used incompatible/default TypeScript options and reported target/import errors; the repository-configured typecheck passed. No configuration was weakened to suppress those helper diagnostics.

Coverage includes 300-entry mapping and bounded dispatch, exact stable pairing, invalid/missing declarations, duplicate/missing mappings and physical names, unrelated findings rejection, fresh retry identity requirements, failed-not-reviewed behavior, per-record draft isolation, confirmation reset, stale retry tokens, image/application ABA, navigation/save ABA, saved-receipt default denial and adapter failure, history retention, immutable state isolation, and consistent completion counters.

No production build or duplicate browser run was performed for these unconnected pure modules. These gates establish local implementation confidence only, not independent review, durable persistence, production authority, or release readiness.
