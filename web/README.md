# Local label-review foundation

Phase 1 implementation candidate; ARGUS review pending. Synthetic local use only.

## Run and verify

Node 22.12+ (22.x) or 24.x; the recorded gates used Node 24.21.0/npm 11.19.0.
Dependencies are exact-pinned with `package-lock.json`. From the repository root:

```sh
npm --prefix web ci
npm --prefix web run test
npm --prefix web run typecheck
NEXT_TELEMETRY_DISABLED=1 npm --prefix web run build
NEXT_TELEMETRY_DISABLED=1 npm --prefix web run start -- --port 3100
```

Open http://127.0.0.1:3100/review. In a separate terminal after HTTP readiness:

```sh
# Install a local test browser if one is not already installed:
# cd web && npx playwright install chromium
npm --prefix web run test:e2e
```

Playwright defaults to its installed Chromium. Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` points to an existing executable; `PLAYWRIGHT_OUTPUT_DIR` relocates screenshots and reports outside source. Stop the localhost server afterward. Tests do not launch/reuse an arbitrary server automatically.

On the recorded shared Linux host, an unrestricted Turbopack run failed with an allocation error. The unchanged build command passed under `taskset -c 0,1` (discover allowed CPUs before using this Linux-only workaround). This is not needed on all systems. The final unrestricted gate was also attempted; see the phase report for its actual result.

## What runs, and what does not

- `/` redirects to `/review`. The rendered app loads no remote fonts/assets and makes no provider requests.
- `PairInput` checks required application fields and advisory file declarations locally. It does **not read image bytes**, upload, decode, show comparisons, or submit a review. Positive feedback explicitly says image content remains unvalidated. Editing clears stale feedback.
- Node-only `lib/intake.ts` implements `sanitizeImage`, `bindPairs` and composed single-pair `preparePair`. These are exercised with in-memory synthetic buffers. They are **not connected to HTTP or the browser** in Phase 1.
- No `/api/intake` was added. `/api/comparisons`, review/history/evidence routes, sign-in, database, inference, global spending controls and batch processing remain absent. CSP and input validation are not authentication or production approval.
- No local storage, application-content logs, evidence files, provider credentials or database writes. Browser-managed form restoration, OS swap and platform retention are not controlled/certified by this foundation. Use synthetic data only.

## Intake contract

Application input is a strict object: `applicationId`, `applicationVersion`, `brand`, `classType`, `abv`, `netContents`, `producerName`, `producerAddress`, `commodity` (`wine`, `distilled-spirits`, `malt-beverage`), `imported` (boolean), and `origin: { kind: 'domestic' | 'imported', country: string }`.

No defaults. Identifiers with surrounding whitespace are rejected, not rewritten; other declared text is preserved. ABV accepts finite numbers or trimmed unsigned decimal strings in [0,100], rejects empty/boolean/hex/exponent/unit-suffixed inputs, and normalizes explicitly to a number. A missing value never becomes zero. `origin.kind` must agree with `imported`; domestic requires explicit US origin, imported rejects common US names. Country is still an applicant declaration, not verified geography or legal applicability. Government-warning input and undeclared keys are rejected.

Manifest: `[{ filename, application }]`, literal case-sensitive basename matching; no URLs/paths/order inference. Missing, extra or duplicate filenames and repeated application ID/version bindings reject the whole mapping before decoding. Up to 300 mappings; no batch queue, simultaneous decode, upload envelope or aggregate-memory acceptance is claimed.

Image input: `{ filename, mime, bytes: Buffer }`. Limits remain **10 MiB source, 20,000,000 decoded pixels**. Sanitized output also has a 10 MiB cap to bound downstream evidence; this additional cap can reject a compressed source whose re-encoding expands. PNG ancillary metadata has a separate **1 MiB total expanded-size limit**, including bounded inflate of text/ICC chunks before the decoder, because pixel limits do not constrain metadata decompression. PNG chunk CRCs are validated. These safeguards are explicit additional local limits, not changes to the proposed source/pixel caps. There is no hosting-envelope reduction because no upload route exists. Future HTTP integration must bound request streams, aggregate size and concurrency before buffering.

PNG/JPEG signatures, declared MIME, extension and Sharp decoder format must agree. Full decode uses strict failure-on-warning and the pixel cap. Container checks reject APNG, MPO, concatenated images and missing endings; corrupt/truncated inputs fail. Metadata is stripped by re-encoding (no keepMetadata), orientation is applied, and actual output MIME/dimensions plus SHA-256 of original and sanitized bytes are returned. Original bytes are copied synchronously before async decode to prevent caller-mutation races; they are not returned or durably retained. Errors from decoding use a fixed content-free message.

Synthetic fixtures are generated in memory by `tests/fixtures/synthetic.ts`; the 20MP rejection specimen is deliberately larger than the normal tiny images. Tests do not modify root `fixtures/`, `bench/` or frozen `docs/ui/v3/`.

See [phase review and exact evidence](../docs/reviews/10-phase1-foundation.md).
