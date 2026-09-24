# Vercel + Supabase public-demo operations

## Scope and runtime

Deploy this repository with Vercel **Root Directory `web`**, Next.js framework,
Node **24.x** (also pinned in `package.json` / lockfile), install `npm ci`, build
`npm run build`. The webpack build uses one Next worker to bound memory pressure;
no typecheck/lint/test bypass is enabled. Each API route declares Node runtime,
`force-dynamic`, and `maxDuration = 60`.

The app is a **public evaluator demo**, not individually authenticated reviewer
accounts. Reviewers do not enter a visible demo code. Saved receipts say
“Public demo use — NOT an individually authenticated reviewer”. Existing rules,
provider/model restrictions, at-most-once dispatch and spend ledger controls are
unchanged. New paid scan/model reservations are additionally capped at **50 per
UTC day** in the hosted database before provider dispatch; saved examples/history
and review-save retries do not consume that daily scan quota. A hosting migration
is not authorization for unbounded spend or a new ledger.

## Exact configuration

Use `.env.example` as the complete reference. The hosted configuration requires:

- `TTB_PERSISTENCE=supabase` (no automatic fallback).
- `TTB_SUPABASE_URL=https://<project-ref>.supabase.co`, exact origin: no slash,
  path, custom domain, query, userinfo, or HTTP.
- `TTB_SUPABASE_SERVICE_ROLE_KEY`: server-only project service-role credential;
  no anonymous/publishable key fallback. Deployment must verify its actual role.
- `TTB_SUPABASE_EVIDENCE_BUCKET=ttb-evidence` and
  `TTB_SUPABASE_UPLOAD_BUCKET=ttb-uploads` (distinct private buckets).
- `NEXT_PUBLIC_TTB_MEDIA_TRANSPORT=supabase-v1` and
  `NEXT_PUBLIC_TTB_SUPABASE_ORIGIN` exactly equal to `TTB_SUPABASE_URL`.
  These two settings are intentionally public and **must be present at build
  time**. They select the browser transport and exact CSP `connect-src` origin.
  Rebuild after changes. Runtime-only origin changes fail closed.
- `TTB_DEMO_ENABLED=true` only after the operator's custody/activation gates;
  exact HTTPS `TTB_DEMO_ORIGIN` matching the canonical browser/API origin;
  server-only `TTB_DEMO_ACCESS_SECRET` and server-only `OPENROUTER_API_KEY`.
  The demo access secret remains a server-side binding/signing secret, not a
  reviewer-entered credential.
- **NEW `TTB_MEDIA_SIGNING_SECRET`**, an independent, cryptographically random
  32-byte base64url value. Generate separately from the demo access secret,
  service key and provider key. Accepted encoding is 32–256 `[A-Za-z0-9_-]`
  characters; production generation must provide at least 32 random bytes.
  Equality with any of those other secrets is refused. Never give this signer
  to demo users, expose it in public env, put it into `next.config.env`, or log it.

Example local secret-generation command (run twice, store outputs privately):
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
The app does not generate keys or print secret values. Signer rotation invalidates
outstanding application tickets immediately; it does not revoke already issued
Supabase upload capabilities, reset quota, change saved evidence, or release spend.
The earlier media-worker report's use of the demo code as HMAC key is **superseded**.

Do not set `TTB_DEMO_DATA_DIR`, `TTB_REVIEW_DATA_DIR`, or
`TTB_DEMO_PERSISTENT_VOLUME` on hosted deployments. They are rejected, never opened.
Local compatibility is available with unset mode or explicit `sqlite` only outside
Vercel and without hosted/public media settings; see `DEMO-OPERATIONS.md`.

**Preview isolation:** do not copy production private credentials, provider key,
demo access secret or canonical ledger authority into Preview. Set `TTB_DEMO_ENABLED=false`;
the UI can build using just the public origin/transport and no private credentials.
Authenticated hosted API composition also rejects a non-production `VERCEL_ENV`.
All disabled/unauthenticated requests stop before body reads, module composition,
private IO or paid work. Missing/contradictory authenticated configuration returns a
redacted 503. Changing aliases requires an explicit canonical-origin change/rebuild.

## Actual composed routes

- `POST /api/uploads`: public-demo origin fence plus server-side demo configuration; bounded JSON declaration;
  durable upload quota reservation; create-only private signed Storage upload;
  server-only HMAC ticket bound to object UUID, filename, MIME, exact bytes,
  application and ten-minute deadline. No credentials/code go to browser Storage.
- Browser sends the original image directly to the exact signed Storage URL using
  PUT; only `{ticket}` traverses `POST /api/comparisons`. Existing server sanitation
  is mandatory before spend. Batch reuses the ticket for prepare/execute; durable
  attempt IDs, claim CAS and unchanged paid path remain the dispatch fence.
- Completed comparison snapshots reserve durable quota, create the normalized
  evidence object, verify persisted bytes/hash/type, then commit SQL metadata.
  An unavailable snapshot never invents a durable comparison ID.
- `POST /api/reviews`, `/api/reviews/list`, `/api/reviews/<uuid>` use hosted RPC
  stores. `/api/reviews/<uuid>/evidence-link` returns a 60-second exact-origin
  capability; the browser verifies hash, size and MIME before displaying a Blob.
  The binary `/evidence` compatibility route remains implemented, but hosted UI
  uses the link to avoid Vercel binary response-size limits.

The lazy route selector never evaluates local SQLite modules on the hosted path.
Next may statically trace the unselected dynamic imports into server artifacts;
this does not authorize opening them. There is no startup provisioning or request
retry. A platform timeout/lost acknowledgment can leave conservative quota/work/
spend holds: investigate rather than resetting/replaying a paid request.

## Operator gates (separate authority; not startup actions)

1. Confirm the dedicated project and resource ownership. Apply the frozen
   `db/migrations/002_hosted_demo.sql` as its authorized owner. It starts with a
   **disabled, zero-ceiling ledger**. Never apply unrelated `001_identity_evidence`
   as a prerequisite to the public demo. Verify nonexposed private schema, forced
   RLS and revoked table privileges; only narrow RPC EXECUTE is granted to
   service_role, not anon/authenticated. Runtime cannot activate/fund/reset ledger.
2. Provision both buckets **private**, 10 MiB per object, JPEG/PNG MIME allowlist;
   no broad anon/authenticated read/write/update policies. Verify create-only
   upload semantics, CORS for the exact production origin, redirect refusal and
   real signed PUT/evidence read. The application never creates buckets/policies.
3. Preserve the sole canonical spend authority and saved history. Fence existing
   writers, take an explicit read-only fresh custody export, reconcile exact
   historical IDs/rows/bytes/holds and remaining budget, stage create-only evidence,
   then import as documented in `scripts/HOSTED-CUSTODY.md`. Do not infer today's
   totals from the historical seven $1 holds / $18 remaining report. This source
   integration does not open the canonical databases or perform a transfer.
4. Verify imported history and normalized-image hashes; verify new DB still
   disabled and old writers stopped. Only authorized operator activation can
   grant the successor exclusive authority. Rollback must preserve all successor
   holds; never just re-enable the old database or restore an older budget.
5. Configure production secrets privately; confirm public build settings, canonical
   HTTPS origin, no private env in client assets, disabled Preview and exact CSP.
   Do non-paid HTTP/browser upload/history acceptance before authorizing any live
   inference. Local synthetic tests are not real Supabase/Vercel acceptance.

## Retention and limits

There are separate durable 200-ticket / 128 MiB issuance and snapshot quotas.
The upload quota counts **declared issuance bytes**, not actual billed raw bytes:
Supabase signed PUT does not bind the declared length. Exact length is checked on
consumption; the bucket's 10 MiB cap and 200-ticket count provide the separate raw
upper bound. A failed issuance may retain its reservation. Provider upload URLs
may last two hours, longer than the ten-minute app ticket. Do not claim immediate
Storage revocation or automatic retention cleanup. Only an authorized operator
may remove expired raw uploads; **never delete saved evidence** as raw cleanup.

## Reproducible offline gates

From `web/` on actual Node 24, with locked dependencies:

```sh
node --version
npm test -- --maxWorkers=1
npm run typecheck
NEXT_TELEMETRY_DISABLED=1 npm run build
```

`hosted-composition.test.ts` exercises exported app routes with actual handlers,
RPC/Storage adapters, sanitizer, provider policy, batch prepare/execute, save,
list, detail and evidence using a synthetic transport (no paid calls). It traps
any runtime SQLite import. `hosted-media.test.ts` proves a code holder cannot
forge a valid media ticket. Real PostgreSQL tests require an explicitly supplied
private disposable local Unix socket and skip otherwise; that skip is not SQL
acceptance. The backend handoff separately carries an actual PG18.4 SQL gate
receipt and the frozen migration hash. Cloud gateway, Storage policy/CORS,
custody transfer and final hosted browser acceptance remain operator gates.
