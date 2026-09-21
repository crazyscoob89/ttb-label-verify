# Label-review application

## Current managed hosting

The application now supports the guarded shared-code workflow on **Vercel +
Supabase**: lazy hosted RPC stores, private direct uploads, durable normalized
snapshots, saved review history and signed evidence links. Read
[HOSTED-OPERATIONS.md](HOSTED-OPERATIONS.md) and `.env.example` for exact configuration,
Node **24.x**, production/Preview isolation and the required server-only media
signer. All live paths remain default-deny; local SQLite is an explicit supported
alternative, never a hosted fallback. Source qualification is not a claim of
cloud deployment, custody transfer or paid-provider acceptance.

From `web/`: `npm ci`, `npm test -- --maxWorkers=1`, `npm run typecheck`, and
`NEXT_TELEMETRY_DISABLED=1 npm run build`. Build uses webpack and one Next worker
for bounded memory, with no skipped checks. Vercel project root is `web`.

## Historical Phase 3 foundation record (superseded behavior)

The remainder records the original Phase 3 local candidate, not current route,
feature or production availability. Later shared-code and durable-review work,
including managed hosting above, supersedes its “no live route/history” statements.
Historical commands/runtime ranges below are not the current Node 24 deployment
instructions.


Phase 3 local implementation candidate; parent verification and consolidated independent review pending. Synthetic local use only. Phase 1/2 acceptance is recorded separately; it is not Phase 3 approval.

## Run and verify

Node 22.12+ (22.x) or 24.x; the recorded gates used Node 24.21.0/npm 11.19.0.
Dependencies are exact-pinned with `package-lock.json`. From the repository root:

```sh
npm --prefix web ci
npm --prefix web run test
npm --prefix web run typecheck
NEXT_TELEMETRY_DISABLED=1 npm --prefix web run build
# Explicit OFFLINE fixture demo for the full browser suite (development only):
TTB_OFFLINE_DEMO=1 NEXT_TELEMETRY_DISABLED=1 npm --prefix web run dev -- --port 3100
```

Open http://127.0.0.1:3100/review. In a separate terminal after HTTP readiness:

```sh
# Install a local test browser if one is not already installed:
# cd web && npx playwright install chromium
npm --prefix web run test:e2e
```

Playwright defaults to its installed Chromium. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` points to an existing executable; `PLAYWRIGHT_OUTPUT_DIR` relocates screenshots and reports outside source. Stop the localhost server afterward. Tests do not launch/reuse an arbitrary server automatically.

The Phase 3 gate uses a native `/tmp` worktree and copied native dependencies, not cross-worktree symlinks. Production build passed without affinity workarounds. Historical shared-filesystem Phase 1/2 failures remain in their reports.

Production intentionally cannot enable the demo, even with `TTB_OFFLINE_DEMO=1`. Stop the development server before testing `NEXT_TELEMETRY_DISABLED=1 npm --prefix web run start -- --port 3100`; against production run only `npm --prefix web run test:e2e -- tests/e2e/smoke.spec.ts`. The full suite explicitly expects fixture mode. `/api/comparisons` always returns 403 before body parsing; neither demo selection nor submitted authorization flags can grant access.

## What runs, and what does not

- `/` redirects to `/review`. The rendered app loads no remote fonts/assets and makes no provider requests.
- `PairInput` checks required application fields and advisory file declarations locally. It does **not read image bytes**, upload, decode, show comparisons, or submit a review. Positive feedback explicitly says image content remains unvalidated. Editing clears stale feedback.
- Node-only `lib/compare-service.ts` composes unchanged `preparePair`/`sanitizeImage`, an explicitly injected offline extraction provider, strict extraction-envelope/image-hash checks and Phase 2 rules. Access defaults deny; tests inject trusted access directly. No live provider is wired.
- The labelled browser fixture path fetches only four committed synthetic PNGs, verifies their exact normalized hashes and uses immutable, independently fixed observations. It does not decode/analyze arbitrary uploads or proxy inference. Applicant edits never generate observed values. Result/preview/confirmation are reset on pairing changes; stale responses are fenced and object URLs revoked.
- Outcome cards and `review-policy.ts` require explicit human confirmation, relevant correction/escalation notes and an independent physical-size assessment before Pass. Documented human resolutions preserve original machine findings. Submit review prepares an **UNSAVED page-memory draft**, not a durable receipt or authenticated approval.
- No `/api/intake`, review/history/evidence route, sign-in, database, global spending implementation or batch queue was added. Batch is visibly unavailable until Phase 5. CSP and input validation are not authentication or production approval.
- No local storage, application-content logs, provider credentials or database writes. Only synthetic sample artwork is committed under `web/public/offline-samples`; no user evidence is stored. Browser-managed form restoration, OS swap and platform retention are not controlled/certified by this foundation.

## Intake contract

Application input is a strict object: `applicationId`, `applicationVersion`, `brand`, `classType`, `abv`, `netContents`, `producerName`, `producerAddress`, `commodity` (`wine`, `distilled-spirits`, `malt-beverage`), `imported` (boolean), and `origin: { kind: 'domestic' | 'imported', country: string }`.

No defaults. Identifiers with surrounding whitespace are rejected, not rewritten; other declared text is preserved. ABV accepts finite numbers or trimmed unsigned decimal strings in [0,100], rejects empty/boolean/hex/exponent/unit-suffixed inputs, and normalizes explicitly to a number. A missing value never becomes zero. `origin.kind` must agree with `imported`; domestic requires explicit US origin, imported rejects common US names. Country is still an applicant declaration, not verified geography or legal applicability. Government-warning input and undeclared keys are rejected.

Manifest: `[{ filename, application }]`, literal case-sensitive basename matching; no URLs/paths/order inference. Missing, extra or duplicate filenames and repeated application ID/version bindings reject the whole mapping before decoding. Up to 300 mappings; no batch queue, simultaneous decode, upload envelope or aggregate-memory acceptance is claimed.

Image input: `{ filename, mime, bytes: Buffer }`. Limits remain **10 MiB source, 20,000,000 decoded pixels**. Sanitized output also has a 10 MiB cap to bound downstream evidence; this additional cap can reject a compressed source whose re-encoding expands. PNG ancillary metadata has a separate **1 MiB total expanded-size limit**, including bounded inflate of text/ICC chunks before the decoder, because pixel limits do not constrain metadata decompression. PNG chunk CRCs are validated. These safeguards are explicit additional local limits, not changes to the proposed source/pixel caps. There is no hosting-envelope reduction because no upload route exists. Future HTTP integration must bound request streams, aggregate size and concurrency before buffering.

PNG/JPEG signatures, declared MIME, extension and Sharp decoder format must agree. Full decode uses strict failure-on-warning and the pixel cap. Container checks reject APNG, MPO, concatenated images and missing endings; corrupt/truncated inputs fail. Metadata is stripped by re-encoding (no keepMetadata), orientation is applied, and actual output MIME/dimensions plus SHA-256 of original and sanitized bytes are returned. Original bytes are copied synchronously before async decode to prevent caller-mutation races; they are not returned or durably retained. Errors from decoding use a fixed content-free message.

Synthetic fixtures are generated in memory by `tests/fixtures/synthetic.ts`; the 20MP rejection specimen is deliberately larger than the normal tiny images. Tests do not modify root `fixtures/`, `bench/` or frozen `docs/ui/v3/`.

See [Phase 3 handoff and exact evidence](../docs/reviews/16-phase3-single-review.md) and the historical [Phase 1 intake report](../docs/reviews/10-phase1-foundation.md).
