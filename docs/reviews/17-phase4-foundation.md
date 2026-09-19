# Phase 4 bounded identity/private-storage source foundation

## Status and custody

**SOURCE FOUNDATION ONLY. Phase 4 is not complete.** Local implementation and offline gates; no managed authentication, durable database, live object storage, route activation, provisioning, paid inference, push or deployment.

- Branch: `ava/phase4-foundation`.
- Frozen parent: `d799821ab549ce2c7dbb6bce8811e2a9a461b204` (Phase 3); accepted Phase 2 base: `38406c12ac575c06ed55370148f907e45782ad33`.
- Implementation worktree: `/tmp/ttb-phase4-worktree`. No edits to Phase 3 or Phase 5 worktrees.
- Builder self-review only. Independent phase review belongs to ARGUS through the parent; this worker did not invoke ARGUS. Neither passing injected tests nor this document is independent review approval.
- Only this document and six new modules/tests are in scope. Existing comparison/review/provider source, routes, UI, package/lockfile, benchmark archives, BUILD-PLAN and IMPLEMENTATION-STATUS are unchanged.

## Implemented boundary

### Identity (`web/lib/auth.ts`)

`createWorkspaceAuth({ sessions, memberships, now? }).authorize(unknown)` accepts only `{ sessionToken, workspaceId }`. The workspace is an **untrusted selector**, never authority. Session/user IDs, session expiry/revocation, membership role and active state come from separately injected server adapters. Actor/context/role/time additions to request input are rejected. The return contains no token. Both adapter replies are strict-decoded; unknown roles, wrong user/workspace, expiration and backend errors deny. There is no session cache or auth fallback. The default-deny result is `{ ok: false, code: 'access-denied' }`.

Roles are a closed foundation policy: owner/admin/reviewer can write; viewer can only read/sign. Changing this policy requires review. Time is integer Unix milliseconds from a server-injected clock, defaulting to `Date.now`.

Managed direction is Supabase Auth; the required verifier must establish signature, issuer, audience, expiration and server-side session revocation, not merely decode a JWT, trust `getSession` cached state or take roles from user metadata. No custom password storage or fake login UI was added. **Trusted auth injection tests do not establish managed-session acceptance.**

### Private image storage (`web/lib/storage.ts`)

`createPrivateStorage({ auth, objects, records, now?, signedOrigin })` exposes:

- `put(access, { image: { filename, mime, bytes: Buffer } })`: strict parse and byte snapshot before awaiting auth; invokes the existing real `sanitizeImage` decoder/re-encoder itself. No caller-supplied sanitized flag/hash/path can bypass decoding. Only sanitized bytes reach `PrivateObjectStore.putImmutable`; originals/source hashes are not persisted here. Generates a fresh UUID image version and the key `private/<verified-workspace>/<version-uuid>/<sanitized-sha256>.<png|jpg>`. Requires a private, immutable, create-if-absent exact byte/hash/version receipt. Rechecks actor/membership before and after storage. Returns an **internal image descriptor**, not a durable evidence/application receipt.
- `sign(access, { evidenceId })`: rejects object paths and caller TTL. Reads the exact active evidence binding through the authorized repository boundary before signing. Caps absolute expiry at the minimum of 60 seconds, evidence expiry and verified session expiry. Validates the exact key/version/expiry and configured HTTPS origin in the signer response. Re-reads evidence and authorization after signing; withholds the URL on revocation, binding drift, expired output, changed actor or shortened session lifetime. Returns only `{ evidenceId, url, expiresAt }` on success.

All failures return `{ ok: false, code: 'storage-unavailable' }` with no upstream exception content. There are no public bucket/upload endpoints or overwrite API. `private`, `immutable`, `ifNoneMatch: '*'` are adapter requirements, **not proof that a real bucket enforces them**.

**Revocation limitation:** these checks deny new signing and withhold a result when revocation is observed during signing. An already-disclosed bearer URL can survive later revocation until its expiry. Immediate per-download revocation requires an authenticated redemption/serving gateway; it must be resolved before live acceptance. This tranche does not claim to solve that with repeated application reads.

### Evidence repository (`web/lib/repository.ts`)

`createEvidenceRepository({ auth, records, storage, now?, retentionMs })` exposes:

- `create(access, { application, image })`: parses the existing strict application schema and snapshots nested application and image bytes before any await. Uploads through the real private-storage service, revalidates identity, then generates evidence ID, workspace, creator, creation time and expiration on the server. Calls `EvidenceStore.insertImmutable` and accepts only an exact schema-valid committed row matching the entire immutable application/image binding. Revalidates authority before returning the deeply frozen result.
- `read(access, { evidenceId })`: checks managed session and active membership every operation, reads one authorized record, checks exact ID/workspace, canonical object key, revocation and expiration, and checks authority again before returning a frozen snapshot.

`retentionMs` is required server configuration, bounded to a positive integer no greater than 30 days. This is an implementation ceiling, **not an approved retention/privacy policy**. No caller may supply identity, evidence ID, creation time, expiry or object path on create.

`EvidenceStore` is a narrow required durable adapter, not an in-memory implementation. It must enforce current membership/session/role/tenant/expiry in its database operation; serialize correctly with revocation; atomically enforce unique evidence/object-version identities and immutable `(workspace, applicationId, applicationVersion) -> application snapshot` bindings. It must never replace/upsert/rebind evidence. Object identity/hash/dimensions/type are strict-decoded. Revocation is a separate access-state concern; this source API has no rebinding, editing or deletion method.

A failed/ambiguous object write cannot produce a repository success receipt. A successful object write followed by repository failure may leave a private orphan. A committed database operation followed by lost acknowledgement or final authorization failure may be ambiguous. **No rollback, exactly-once persistence, safe retry or durable history is claimed.** Cleanup, tombstones and durable retry/reconciliation are deferred; do not automatically retry on these failure envelopes.

## Export / adapter integration contract

Primary exported factories/types:

- Auth: `createWorkspaceAuth`, `WorkspaceAuth`, `WorkspaceAuthorization`, `AuthResult`, `ManagedSessionVerifier`, `WorkspaceMembershipReader`.
- Storage: `createPrivateStorage`, `PrivateStorage`, `PrivateObjectStore`, `StoredImage`, `SignedEvidence`, `StorageResult<T>`, `MAX_SIGNED_URL_TTL_MS`.
- Repository: `createEvidenceRepository`, `EvidenceStore`, `EvidenceRecord`, `EvidenceResult`, `ImageDescriptor`, `readEvidence`.
- Shared strict schemas/helpers: `accessInputSchema`, `workspaceIdSchema`, `serverTimeSchema`, `evidenceRecordSchema`, `evidenceSelectorSchema`, `imageDescriptorSchema`, `imageUploadSchema`, `privateObjectKey`, `sameActor`.

Composition order: create one trusted auth service; supply one reviewed durable `EvidenceStore`; create private storage with that same auth/store and a configured private HTTPS origin; create repository with those same instances and approved retention configuration. Factories/adapters/clocks are **server-owned dependencies**, never hydrated from request JSON. `WorkspaceAuthorization` is an internal adapter snapshot, not a browser capability or database lock. Public operations accept credential/selector input and independently authorize; passing an authorization object as that input fails strict parsing. Keep raw repository/image descriptors internal rather than blindly serializing them through a future route.

No concrete Supabase/HTTP adapter was added: safe narrow contracts are preferable to partially wired credentialed networking without acceptance. Future adapters must implement the exact unknown-result envelopes decoded in these modules. Every adapter must use bounded I/O deadlines and redact failures; no token/provider/object URL logging. The wrappers fail closed on thrown/malformed results, but do not implement provider-specific cancellation or transaction protocols.

## Verified local TDD / gates

Runtime: Node `v24.21.0`, copied local dependencies (real `cp -a`, preserving `.bin` symlinks), `NEXT_TELEMETRY_DISABLED=1`. No install/network service setup was needed. Evidence directory: `/opt/data/ttb-phase4-evidence/`.

| Gate | Result | Exact log |
| --- | --- | --- |
| Auth behavioral RED against deny-only scaffold | 16 failed, exit 1 | `01-auth-red.log` |
| Auth GREEN | 16 passed, exit 0 | `02-auth-green.log` |
| Storage/repository behavioral RED against deny-only scaffolds | 52 failed, exit 1 | `03-storage-repository-red.log` |
| Initial focused GREEN | 68 passed, exit 0 | `04-foundation-green.log` |
| Initial typecheck / full test / build | passed; full test 361 passed | `05-typecheck.log`, `06-full-test.log`, `07-build.log` |
| Self-review regression RED: shortened session lifetime and changed subject during signing | 2 failed / 32 passed, exit 1 | `08-signing-race-red.log` |
| Final focused GREEN | **70 passed**, 3 files, exit 0 | `09-final-focused.log` |
| Final full `npm test` | **363 passed**, 12 files, exit 0 | `09-final-test.log` |
| Final `npm run typecheck` | **passed**, exit 0 | `09-final-typecheck.log` |
| Final `npm run build` | **passed**, exit 0 | `09-final-build.log` |

Initial RED results were real assertions, not missing-module/import errors. Positive controls were included, so a deny-all implementation cannot satisfy the suite. The later race RED genuinely exposed successful URL disclosure; the repair adds final actor/session-expiry checks. The final full suite includes the existing actual `/api/comparisons` forged-request 403/body-not-consumed test. The build retains only the existing `/`, `/_not-found`, `/api/comparisons`, `/review` routes.

The file-edit tool emitted context-free TypeScript diagnostics (wrong default target/esModuleInterop); the repository's own typecheck and Next build both pass. No source/settings were weakened to accommodate that tooling noise.

Final log SHA-256:

```
172f867c910f91c9027d633232e1e13cecb644434b102b79c022c8e88bd59d26  09-final-focused.log
5cb2dedb570b7af9ac1489225a75380f59663a771b3f6068b97af3d39390bf37  09-final-test.log
df991ddc07d9027cc19f9fa1cb13b96e9d13dafbc94083d37f124c7379a2b098  09-final-typecheck.log
ace5c824d45c243cbf9f7afc386598df38524c9c97dc8f545814ef4f6fd0c47f  09-final-build.log
```

## Deferred gates / next bounded slice

1. Parent integrates/reviews this exact local commit; independent reviewer issues a frozen-SHA verdict. This is not Phase 4 sign-off.
2. Implement the managed Supabase session verifier and authoritative membership adapter; test real issuer/audience/signature/expiry/revocation and browser credential/CSRF/origin transport. No password subsystem.
3. Implement/replay the durable evidence schema/adapter with RLS, least-privilege ACLs, immutable snapshots, exact result decoding, two-session revocation races and concurrent duplicate/rebinding attempts. A test fixture that rejects a duplicate is not durable/global enforcement.
4. Implement the private immutable object adapter; prove actual bucket privacy, denied anonymous/public/cross-workspace access, create-if-absent collision handling, exact sanitized bytes, signer absolute TTL behavior and no cache leaks. Decide and prove authenticated redemption for immediate revocation. Validate cleanup/reconciliation of orphaned/ambiguous writes.
5. Only after review and external gates: compose approved server routes and browser flows with request aggregate limits/rate limits, safe receipt DTOs and no-store/referrer controls. Existing runtime remains default-deny until then.

**Unrun:** browser E2E, live managed-session acceptance, database/RLS/concurrency integration, actual object retrieval/expiry/revocation, deployment and external security gates. No credentials/provider data were used in logs; test session strings and HTTPS URLs are synthetic local fixtures.
