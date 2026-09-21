# Hosted demo backend / custody operator notes

This backend preserves the shared demo identity. It is **not** managed-user authentication. The service-role secret must remain in server-only environment variables. Never grant these RPCs to `anon` or `authenticated`, and never expose `ttb_demo_private` through PostgREST. The two public RPCs have bounded, allowlisted operations and no fund/reset/reconcile operation.

## Composition (integration owner)

```ts
const objects = createSupabaseObjects(env); // media adapter
const stores = createHostedStores({env, objects});
createDemoHandler({env, stores, readInput: createHostedInputReader(env)});
createReviewHandler(env, stores);
createUploadHandler({env, quota: createHostedUploadQuota(env)});
```

Select `TTB_PERSISTENCE=supabase` explicitly. Missing factory/config is a denial, never a SQLite fallback. Existing absent/`sqlite` mode retains local stores and their private-volume requirements. Factory construction performs no network calls; handlers authorize before opening stores. Comparison extraction keeps its existing deadline; successful extraction awaits a separate maximum ten-second snapshot phase. A slow or failed snapshot leaves the paid comparison available but `snapshot-unavailable`, without promising a durable ID. Pending snapshot allocations and failed upload issuance retain quota permanently; do not reclaim ambiguous allocations automatically.

Apply `db/migrations/002_hosted_demo.sql` once as a trusted migration owner. It is standalone and deliberately refuses an existing schema rather than resetting it. It installs a zero-ceiling disabled ledger. It does not enable migration 001's separate ledger. The runtime's `service_role` has execute on `public.ttb_demo_spend(text,jsonb)` and `public.ttb_demo_review(text,jsonb)` only; private tables have explicit revocations, forced RLS and owner-only policies. Storage authority remains the separate media adapter's responsibility.

## Custody: explicit operator operation, not app startup

1. Stop/drain **all** old writers and permanently fence their dispatch authority. Retain the old DBs as evidence, not an active fallback. The exporter requires the operator's `--writers-stopped` assertion; it cannot independently verify distributed writer shutdown.
2. Prepare a private expected-totals JSON from current independently inspected source evidence, using fields `holds`, `unresolved`, `incurred`, `remaining`, `snapshots`, `reviews`. All money values are microusd. Previously reported seven $1 holds / $18 remaining are historical evidence, **not** permission to force those numbers into a changed source. Any mismatch or stranded work/claimed dispatch stops export for reconciliation.
3. With compatible Node 24 and the existing `tsx` dependency, from `web/`:

   ```sh
   node --import tsx scripts/export-demo-custody.ts /absolute/spend.sqlite /absolute/reviews.sqlite /private/expected.json /private/sealed.json --writers-stopped
   ```

   This opens both SQLite DBs read-only, query-only and WAL-aware in read transactions. Never use either runtime store constructor for export. It preserves full original binding/request/record strings, IDs, receipt timestamps and normalized bytes. Save the emitted SHA-256 separately in the custody record. A checksum is an integrity seal, **not** a signature or independent proof of trusted origin.
4. Explicitly authorized object staging plus SQL preparation:

   ```sh
   node --import tsx scripts/import-demo-custody.ts /private/sealed.json /private/import.sql ./lib/persistence/supabase-storage.ts --stage-authorized
   ```

   Module must export `createSupabaseObjects(env)`. This creates immutable `snapshots/<original-id>` objects, reads and verifies their exact bytes, and only then writes owner-executed SQL. **No destination SQL is executed by this script.** It does not enable spending. Output files are create-only mode 0600. If uploads already exist after a lost acknowledgment, use `--verify-existing` to verify **all** objects without rewriting them. A partial upload batch requires explicit operator reconciliation of missing objects; do not blindly replay or upsert.
5. Apply prepared SQL through the separately authorized owner connection with `ON_ERROR_STOP`. Import locks ledger and quota, rejects a nonempty/unfunded mismatch, is transactional, preserves liabilities, records transfer ID/hash, and remains disabled. Replaying the same sealed transfer is a no-op; a different transfer is refused. Do not use `provision-demo.ts` to create a new budget.
6. Independently compare every original row/string/ID/claim/state, all object hashes, counts and totals at destination; verify saved review reopen with the shared identity. Only after exclusive source fencing and sole-authority reconciliation may the authorized owner separately enable the successor. There is intentionally no runtime activation RPC. Never activate both ledgers or reactivate stale SQLite after managed spending.

The CLI imports a trusted local module supplied by the operator; this is not HTTP/user input. Test with synthetic source DBs first. No cloud credentials or canonical source paths are baked into scripts/tests.

## Disposable SQL proof

`tests/hosted-postgres.test.ts` is opt-in. Use a dedicated disposable PostgreSQL cluster with private Unix socket and bootstrap roles `anon`, `authenticated`, `service_role` (the last with BYPASSRLS to mirror Supabase). Set `TTB_HOSTED_TEST_SOCKET`, `TTB_HOSTED_TEST_PSQL`, `TTB_HOSTED_TEST_PORT`; run Vitest on that file using Node 24. It creates/drops only its randomly named test database and non-superuser migration owner. It checks broad-default-grant revocation, disabled-first admission, SQLite-to-Postgres exact custody and retry preservation, async route composition, two-slot races, single-winner claims, lost acknowledgments, no repeated dispatch, hard ceiling and retained liabilities, immutable reviews, quota concurrency and count/byte limits. The fetch seam forwards RPC arguments through local psql sessions: this proves actual SQL/adapter behavior, **not** Supabase gateway/JWT/Storage/Vercel deployment behavior.
