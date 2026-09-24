# Multi-photo integration and local acceptance

## Revision dispatch

- Historical singleton records without `rulesRevision` retain frozen revision 1; explicit revision 2 retains `rules.ts`.
- Historical singleton revision 3 retains `compareApplicationV3`; fresh singleton finalization now uses revision 5 bottle semantics.
- Historical photo-set revision 4 / aggregation v1 retains its frozen evaluators. Fresh photo-set records use `recordVersion: 2`, `rulesRevision: 6`, aggregation v2. The live execution client admits only that fresh pair; history readers explicitly replay both old and new pairs, never unknown revisions.
- No evaluator rewrites, historical snapshot mutation, ledger reset, or automatic migration.
- The browser replays complete group records and verifies their canonical SHA-256 before rendering comparison results or reopening history. Selected private images are separately checked for digest, size and MIME.

## Reproducible local checks

Use Node 24 and installed lockfile-compatible dependencies, one worker, and `NODE_OPTIONS=--max-old-space-size=512`.

```sh
node --import tsx scripts/generate-photo-fixtures.ts
node --import tsx scripts/generate-photo-ui-fixtures.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=30000
NEXT_TELEMETRY_DISABLED=1 npm run build
```

The unit timeout allows the existing multi-subprocess custody CLI test to complete on a loaded host. It changes no security deadline or production behavior. Optional PostgreSQL tests skip without explicit isolated configuration.

Start the built Next server on loopback only, then set `BASE_URL`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `PLAYWRIGHT_OUTPUT_DIR` (outside the source tree), and `V3_EVIDENCE_DIR`:

```sh
node node_modules/@playwright/test/cli.js test tests/e2e/photo-groups.spec.ts tests/e2e/v3-interface.spec.ts --timeout=30000
```

This suite is **mock API UI acceptance**, including the `@integration` cases. It is not storage or provider proof.

Stop that server before the independently managed durable suite:

```sh
node node_modules/@playwright/test/cli.js test tests/e2e/durable-photo-groups.spec.ts
TTB_DURABLE_EVIDENCE_DIR=/absolute/private/evidence node node_modules/@playwright/test/cli.js test tests/e2e/durable-reviews.spec.ts --project=desktop
```

The durable harness provisions separate disposable private SQLite stores, seeds old revision-1/2 reviews before the additive migration, and uses real authentication, multipart preparation, normalization, guarded provider dispatch, snapshot, review and all-media retrieval routes. Only the provider transport is synthetic; it never calls a paid provider. Configuration is whitelisted rather than inheriting hosted credentials. It proves Single and Batch grouping, complementary wine observations, conflict/confirmed-defect gating, lost-response idempotent save, different-PID restart, unchanged old histories and original/normalized SHA-256 values. It leaves proof JSON, sanitized diagnostics, service logs and screenshots under Playwright's output directory. Preserve failed runs under distinct directories.

The browser can abort a *completed* fetch signal, causing Chromium to discard its DevTools response body. Durable tests therefore wait for rendered results and read the actual immutable local snapshot, rather than replay multipart file uploads through `route.fetch()` or relying on late `response.json()`. The save-response-loss scenario still deliberately forwards the real JSON save once, then drops only its response.

## Migration boundary

Hosted migration `003_photo_groups.sql` is additive and must use the same approved migration owner as 002. Run `tests/photo-postgres.test.ts` only against a disposable local Unix-socket cluster, with `TTB_HOSTED_TEST_SOCKET`, `TTB_HOSTED_TEST_PORT`, and an absolute `TTB_HOSTED_TEST_PSQL` executable (including any required library-path wrapper). The test creates and removes only its own random database and owner role. It does not wipe the cluster or activate a production ledger.

Bottle repair additionally requires `004_bottle_semantics.sql`, on the **same existing Supabase project and migration owner** after the already-deployed 003, before fresh writers are released. It only widens the private asset admission to the exact 4/v1 or 6/v2 pairs. The disposable PostgreSQL test now executes actual 002→003→004, rejects new writes before 004 and crossed/unknown/null versions after it, verifies frozen history and function ownership/ACLs are unchanged, and checks funded-ledger preservation, strict media quotas and restricted-role access. No production execution is part of local acceptance. See `BOTTLE-INTEGRATED-ACCEPTANCE.md` for the incident regression and limits.

Existing local review stores require the explicit owner-run `scripts/migrate-review-photos.ts <absolute-private-reviews.sqlite> --confirm-additive-photo-migration`. Constructors do not migrate. Group preparation requires an independent `TTB_MEDIA_SIGNING_SECRET`, including in SQLite mode.

Local acceptance does **not** certify hosted migration execution, managed Storage, actual model accuracy/latency, the reported hosted Verify-access timeout, or deployment. Those remain parent-owned release gates.
