# Durable save/reopen candidate and real-batch proof

## Status

- Baseline: `fa56bcc7d5b50bb63b4bc559c91682e237f355ab`, code `75fe83d30441b3917869fb6a1164506337b9940c`, ARGUS PASS recorded in [round 26](26-live-batch-argus-pass.md).
- New application candidate: **`e721936518e36b7c6d65b5649308f21d1b57e784`**. AVA implemented; **new independent ARGUS review pending**. A following documentation commit publishes evidence without changing application code.
- New capability: server-owned immutable normalized label/application/comparison snapshots; explicit human review save; durable receipt; protected saved history and evidence reopen after restart. This is shared-code demo identity, not an authenticated individual reviewer or COLA approval.
- No public deployment, hosting purchase, production review-store provisioning or merge in this tranche.

## Two distinct acceptance lanes

### Real batch on the accepted baseline

A frozen copy of **75fe83d** ran one real two-label batch: two preparations, two guarded provider requests, maximum concurrency two, no retries/fallback. Correct label matched all seven fields; discrepancy label showed 45% versus expected40% alcohol. Both explicit automated review-control checks created **UNSAVED drafts**, retaining mismatch blocks and honest zero saved count. Both results displayed in 5795.398 ms from Start. This one warm run is not a latency/throughput guarantee.

The same canonical $25 ledger retained **$5 total unresolved holds**, leaving **$20 guarded capacity**. New provider-reported cost metadata was $0.00922779, not reconciled billing. Original holds unchanged, no provisioning/reset/refund/copy. All owned listeners stopped and frozen files unchanged. [Report](evidence/pr9-durable-reviews/real-batch-report.md) and [receipt](evidence/pr9-durable-reviews/real-batch-receipt.json).

### Durable save/reopen on the new candidate

The provider was simulated; SQLite, save/detail/evidence HTTP endpoints, browser UI and service restart were real. Desktop and mobile each exercised upload/comparison, explicit review, save, batch save, replacement-revision state clearing, complete service restart, browser reload, history lookup and original evidence reopen. A response deliberately lost **after** save commit left the UI UNSAVED; unchanged retry returned the same receipt without creating another review or provider call.

Desktop receipt: `172b86fe-aa6e-48c2-b566-1f04b3407f63`; service PID `59962` changed to `61128`. AVA parent separately opened the resulting **disposable** DB read-only: integrity check OK, 3 snapshots, 2 reviews, mode0600; saved timestamp and entire original comparison equalled the browser proof, normalized image SHA-256 matched. AVA also visually inspected the reopened-history screenshot. This is actual persistence proof, **not a paid-provider-to-saved-history acceptance run** and not native Windows proof.

## Design and failure behavior

See [saved-review operations](../SAVED-REVIEWS.md). Review data is a separate explicitly provisioned private SQLite file. Runtime never creates/resets a missing store and never uses the spend ledger for reviews. Trusted service output creates snapshots; save accepts a server snapshot ID and ReviewIntent, not client-asserted comparison authority. Server revalidates existing human policy before transactional append and receipt. Idempotency conflicts/stale bindings fail closed. Images require the shared capability on each read; responses are no-store. History is bounded and shared among code holders.

If snapshot storage is absent/fails, the already-completed comparison still returns honestly UNSAVED without a saveable server ID or automatic paid retry. Reload does not preserve unsaved edits; saved history recovers committed decisions. One immutable review per snapshot, no edit/revoke/delete/global-latest-version authority. Append-only SQL is not OS-owner tamper resistance. Individual authentication, retention/erasure automation and multi-host storage remain outside this demo implementation.

## Verification

| Check | Result | Evidence provenance |
|---|---|---|
| Focused persistence/integration unit suite | 214 tests / 10 files passed | Builder |
| Project typecheck and production Webpack build | Passed | Builder |
| Durable browser flow | Desktop1 + mobile1 passed, actual DB and service restart | Builder |
| Prior single/batch simulated browser regressions | 2 passed | Builder |
| Full combined unit suite | **565 tests / 28 files passed** | Independently executed by AVA parent, Node24.21.0 |
| Persisted receipt/full-record/image/integrity | Verified via separate readonly SQLite connection | AVA parent |
| New independent/native Windows review | **Pending** | Not inherited from baseline |

Initial RED found missing implementation; intermediate RED exposed SQL insert arity; both were repaired. Memory-limited build/browser attempts are preserved externally. Final build used bounded workers and browser Node heaps, not longer production deadlines. Every original and published selected artifact has a manifest hash; text normalization is disclosed. See [archive](evidence/pr9-durable-reviews/), including original implementation report, unit/build/browser logs, proof JSON and screenshot. Actual disposable databases and credential-bearing runtime helper directories are intentionally **not** published.

## Next gate

ARGUS reviews only `fa56bcc..e721936` for material defects in server evidence authority, transactional/idempotent saves, receipt/revision correctness, private endpoint access, immutable evidence recovery and noninterference with spending guards. No paid calls, no canonical ledger or non-disposable review DB, no source edits, no cloud work. Disposable fixture provisioning is permitted for tests. AVA owns fixes and publication. Hosting target/cost/exposure approval remains an external decision; a PASS is not deployment authority.
