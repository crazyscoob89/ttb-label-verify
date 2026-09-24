# Durable shared-demo reviews (local single-host slice)

This adds a real SQLite save/reopen path to the guarded comparison demo. It is **not Supabase, individual reviewer authentication, COLA submission, or a production multi-tenant record system**. Anyone holding the shared demo code can read the shared history. Every receipt explicitly says: **Shared demo access code — NOT an individually authenticated reviewer**.

## Authority and durability

- The comparison service retains its existing seven-field rules, extraction provenance and human-review policy. Its trusted completion hook snapshots the **server's complete comparison, parsed original application and exact normalized label bytes**. Browser JSON cannot create/replace that snapshot.
- `/api/comparisons` keeps its existing `result` and `elapsedMs`; it additionally returns an opaque random `comparisonId` when the snapshot commits. The ID is outside the comparison record so existing `ReviewIntent.bindingKey = JSON.stringify(record)` remains unchanged.
- A review submission contains **only** `{comparisonId, idempotencyKey, intent}`. Extra comparison, identity, timestamp and receipt properties are rejected. The server loads its own record and runs the existing `buildUnsavedDraft`/`evaluateReview` policy. Stale application/evidence bindings, unconfirmed decisions and unsupported Pass outcomes are rejected.
- Review insertion runs in `BEGIN IMMEDIATE`, with FULL SQLite synchronization, a server-generated review ID, a SQLite server timestamp, UNIQUE comparison/idempotency constraints and append-only SQL triggers. Only after COMMIT does the server return a SAVED receipt. Snapshots also reject UPDATE/DELETE.
- One accepted review per immutable comparison. An unchanged idempotency key and intent recover the exact original receipt, including after restart. Reusing the key for a different intent or submitting a new key for an already-reviewed comparison returns 409. No review-save request calls the extraction provider or spending store.
- A new application/pair revision requires a fresh comparison and confirmation. Browser generations and batch revision keys keep late results/receipts off replacement revisions. Old snapshots remain historical evidence, not a claim to be the globally latest application version. There is no cross-user application-version registry or revocation workflow in this slice.

## Explicit provisioning only

Use Node 24 and the existing locked dependencies. Prepare an **existing, private, local** directory outside the web/public/source tree and separate from `TTB_DEMO_DATA_DIR`. On POSIX it must be owned by the service account with mode 0700; the new database is mode 0600. Windows uses the existing strict local NTFS owner/DACL/reparse checks, not POSIX mode guesses. This implementation reuses `ledger-security.ts` for both platforms.

Set `TTB_REVIEW_DATA_DIR` to that directory, then from `web/` run:

```sh
node --import tsx scripts/provision-reviews.ts --create-new-private-review-store
```

The command creates **only a new `reviews.sqlite`**. It never creates the parent directory, replaces an existing DB, resets data, provisions a spending ledger or migrates a different schema. Runtime refuses a missing, insecure, symlinked/hardlinked or wrong-schema database. Keep the separate review directory on the same persistent private host volume across service restarts; back it up consistently using SQLite-aware procedures or while stopped. This change performs no hosting or cloud setup.

The existing `TTB_DEMO_ENABLED`, `TTB_DEMO_ACCESS_SECRET`, and exact `TTB_DEMO_ORIGIN` protect all review operations. Do not put the shared code in URLs, source, logs, public assets or browser storage. History does not require a provider key or an open spending DB. The existing comparison configuration and spending limits are unchanged. Use `http://localhost:<port>` for local browser proof: NextRequest normalizes numeric loopback hosts to `localhost`; exact-origin checks are intentionally not relaxed.

## API

All review operations are authenticated **POST** requests with `x-ttb-demo-code` and the exact Origin. Read operations deliberately use POST to retain the same browser Origin fence as writes. No CORS/public image route is added. Unsupported methods also run the access fence and return no-store errors.

| Path | Body / result |
| --- | --- |
| `/api/reviews` | JSON save request above; `{receipt}` after commit |
| `/api/reviews/list?offset=0` | No body; up to 50 summary rows, offsets 0–200 |
| `/api/reviews/<reviewId>` | No body; original `{receipt, record, intent}` |
| `/api/reviews/<reviewId>/evidence` | No body; original normalized PNG/JPEG bytes |

All responses, including errors and label bytes, have `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Images require the code on each request; the UI renders only a temporary Blob URL, verifies the SHA-256 against the saved record, and revokes the URL on replacement/clear/unmount. There are no public upload links or signed URLs.

## Failure behavior and limits

- Without configured history, comparisons remain backwards-compatible and human submission creates an explicitly **UNSAVED page-memory draft**.
- If snapshot persistence fails (missing store, capacity, permissions, disk error), the complete comparison still returns, without a comparison ID. It remains UNSAVED; an already-paid result is not replaced by a persistence error or automatically retried. Only comparisons with a committed snapshot can be saved.
- Both single and batch submission show SAVED only for a validated, matching server receipt. During submission, review edits are disabled. A failed/lost response stays UNSAVED/receipt-unconfirmed, preserving the same idempotency key for an unchanged explicit retry. The retry state survives batch navigation in bounded page memory, not browser reload. After reload, use private history to recover any committed review before making a new decision.
- Saved review controls are read-only. Batch counts and rail badges use confirmed receipts for **current revisions**, not reducer-generated saved state. Replacing a revision removes its current-revision saved badge/count but never deletes the historical review.
- At most 200 snapshots and 200 reviews; 10 MiB normalized image per snapshot; 256 KiB comparison JSON; 128 MiB aggregate snapshot payload; 384 KiB streamed save request with a 5-second read deadline; two concurrent review handlers per process; 50 summaries per history page. SQLite also has a 40,960-page limit (160 MiB at the newly provisioned 4 KiB page size). Whichever capacity limit is reached first fails closed; no automatic pruning/reset. SQLite locking coordinates writes across local processes. This is not a distributed rate limiter.
- Normalized images are durable; raw originals, original filenames, raw JSON serialization, provider raw responses and individually verified reviewer identity are not archived. The application snapshot is the exact parsed declaration used for the comparison.
- This is append-only under the application/SQL interface, not tamper-proof against the OS owner or a database administrator. No retention/erasure UI, editing/revocation, enterprise audit identity, backup automation or multi-host storage is implemented.

## Reproducible local checks

```sh
node node_modules/vitest/vitest.mjs run \
  tests/saved-reviews.test.ts tests/saved-review-route.test.ts \
  tests/review-policy.test.ts tests/demo-route.test.ts \
  tests/live-batch-route.test.ts tests/compare-service.test.ts \
  tests/live-batch-state.test.ts tests/batch-state.test.ts \
  tests/rules.test.ts tests/sqlite-spend-security.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
CIRCLE_NODE_TOTAL=2 node node_modules/next/dist/bin/next build --webpack
node node_modules/@playwright/test/cli.js test tests/e2e/durable-reviews.spec.ts --project=desktop --workers=1
```

`CIRCLE_NODE_TOTAL=2` bounds Next's build workers to one on memory-constrained hosts; it does not alter production timeouts or logic. Configure `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if the matching managed browser is not installed. The browser test starts/stops its own loopback-only production Next service, uses real disposable SQLite files, real guarded handlers and only an injected synthetic provider transport. Review endpoints run through the built Next route, not mocked fetch responses. It verifies lost-response replay, single and batch saves, revision clearing, a changed OS service PID, browser reload/history reopen, the full original application, normalized image digest, denied unauthenticated evidence, and no browser errors. No paid request is made. Desktop and mobile projects are supported.

Set `TTB_DURABLE_EVIDENCE_DIR` to a disposable artifact directory to retain screenshots, proof JSON, service PID log and private test databases. Otherwise the test removes its temporary database directory. Do not enable traces containing shared-code headers. The synthetic-provider harness is test-only; production has no mock-provider environment switch.
