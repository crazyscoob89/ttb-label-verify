# Phase 1 — foundation and input contract

Status: **implementation candidate; ARGUS review pending**. Local gates below are implementation evidence, not independent approval or deployment.
Base: `07fdca636495c9d01db4d7a0aa378d51fa9fee43`; branch `ava/app-phase-1`.

## Sprint 1

Created a pinned Next.js/React/TypeScript shell under `web/`, Vitest unit discovery excluding browser specs, Playwright desktop/mobile smoke, localhost-only start/dev scripts, example environment names and no remote assets/fonts. `/` redirects to `/review`. No API/provider/auth/history surfaces exist.

Local evidence outside source: `/opt/data/ttb-phase1-evidence/`.

- `sprint1-red.log`: one assertion fails against the empty shell (expected foundation disclaimer).
- `sprint1-ci.log`: `npm --prefix web ci --no-audit --no-fund` succeeds.
- `sprint1-green.log`: `npm --prefix web run test`, 1 test passes.
- `sprint1-typecheck.log`: `npm --prefix web run typecheck`, succeeds (rerun after build also succeeds).
- `sprint1-build.log`: unrestricted Turbopack build fails with `Cannot allocate memory (os error 12)` while reading react-dom. This was not a TypeScript failure.
- `sprint1-build-affinity.log`: `NEXT_TELEMETRY_DISABLED=1 taskset -c 0,1 npm --prefix web run build`, succeeds. Allowed CPUs were 0–11; concurrency-limited retry is an environment workaround, not a product change. `turbopack.root` separately fixes ancestor-lockfile discovery.
- `sprint1-server.log`, `sprint1-e2e.log`: production server on `127.0.0.1:3100`; readiness HTTP succeeds; 2 browser tests pass, desktop and emulated Pixel 7. External requests are blocked and asserted absent; no browser page errors or horizontal overflow. Server stopped afterward.
- `sprint1-browser/**/foundation.png`: synthetic empty-shell desktop/mobile screenshots.

E2E command: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/hermes/.playwright/chromium-1217/chrome-linux64/chrome PLAYWRIGHT_OUTPUT_DIR=/opt/data/ttb-phase1-evidence/sprint1-browser npm --prefix web run test:e2e` (server started separately with `npm --prefix web run start -- --port 3100`). The executable override is optional; default uses a Playwright-installed Chromium.

## Sprint 2

Sprint 1 commit: `308cab4a078c8e0069c063551d71f977294dbd11`.

Implemented `lib/contracts.ts`, Node-only `lib/intake.ts`, `components/PairInput.tsx`, in-memory synthetic fixtures, intake/unit/UI regressions and browser interactions. Full application fields, explicit import/origin context and filename manifest binding are enforced without defaults. Blank/missing ABV never becomes zero; decimal normalization is deliberate; identifier whitespace is rejected instead of changing identity. Editable warning/unknown fields are rejected. Mapping is filename-based, not array-order-based; missing/duplicate/extra bindings reject before decoding. Repeated application ID/version pairs reject because multi-panel input is deferred.

Image acceptance requires buffer input, JPEG/PNG signature, declared MIME, extension and decoder format agreement, complete single-frame containers, full strict decode and re-encode. EXIF/ICC/XMP are stripped, orientation applied, actual output dimensions/MIME and source/sanitized SHA-256 returned. No original buffer is returned or persisted. There are no provider/filesystem transport or content logging calls in intake. The source is snapshotted synchronously before asynchronous decoding.

Limits: original 10 MiB / 20 MP caps retained. Additional explicit safeguards: sanitized output ≤10 MiB and PNG ancillary metadata ≤1 MiB expanded total. These bound downstream bytes and compressed metadata separately from pixels; they are documented in the UI and `web/README.md`, not silent reductions of the source/pixel caps. CRC and bounded zlib inflate checks precede the PNG decoder. Full future HTTP/body-stream and aggregate/concurrency limits are **not** implemented; there is no upload route.

### Browser boundary — intentionally not connected

The browser checks application fields plus advisory file name/type/size only. It never reads/sends selected image bytes, and positive feedback explicitly says image content is unvalidated. Editing clears stale feedback; comparison remains disabled. The fixed warning is not an applicant input. The page shows the seven-category scope with no comparison results or review success. The frozen v3 mock remains separate and unchanged.

**No `/api/intake` was added.** `/api/comparisons`, review/evidence/history APIs, login, managed identity, inference, spend controls, storage/DB/history and batch queue remain absent. Local POST `/api/comparisons` and GET `/history` each returned 404 (absence, not authentication proof). The 300-pair manifest helper is not a batch-upload service. No provider secrets, `.env` values, paid calls, cloud provisioning, migrations, pushes, merges or deployments were performed.

### RED/GREEN evidence and reproduced issues

All paths below are relative to `/opt/data/ttb-phase1-evidence/`:

- `sprint2-intake-red.log`: initial test authoring error (`await` inside synchronous assertion); not behavioral RED. Corrected before implementation.
- `sprint2-intake-assertion-red.log`: 64 failing tests against unimplemented interfaces, including absent ABV, duplicate mapping, unsafe bytes and missing positive sanitation output.
- `sprint2-intake-green.log`: initial 64 intake cases pass. Later test extensions are covered in closure below.
- `sprint2-ui-red.log`: rendered form assertion fails on missing Application ID; browser-declaration helper already passes. `sprint2-e2e-red.log`: new form action absent in Sprint 1 browser shell.
- `sprint2-unit-green.log`: initial 67 unit tests pass. `sprint2-e2e.log` records 2 selector failures: Next's route announcer also uses `role=alert`. Test locator was scoped to the form; product alert semantics were not weakened. `sprint2-e2e-green.log`: 4 browser tests pass.
- `sprint2-animation-fixture-red.log`: the earlier rejection-only APNG specimen fails a new valid-CRC/two-frame fixture assertion. Fixture upgraded to genuine generated APNG; first frame decodes in Sharp but intake rejects the animation. `sprint2-intake-final.log` records 67 intake cases before the later metadata-bound addition.
- `sprint2-metadata-red.log`: real acceptance defect reproduced—tiny-pixel PNG carrying >1 MiB inflated text was accepted before the explicit metadata guard. `sprint2-metadata-green.log`: repaired bound plus JPEG/PNG EXIF/ICC positive controls pass. Final tests also accept and strip bounded compressed zTXt/iTXt, preventing blanket metadata rejection.
- `sprint1-build.log`: original unrestricted Turbopack allocation failure. Affinity-limited retries passed; subsequent `final-build.log` and **`closure-build.log` both pass unrestricted**. No permanent host-specific CPU restriction is in product scripts.
- `closure-ci.log`: npm warns that esbuild's install script lacks an allowScripts entry; installation, tests, Next build and a real `tsx --eval` smoke still succeed. No private global credentials or configuration were changed.
- Initial per-file `git show` preservation proof exceeded a 120-second tool timeout. It was replaced by one Git tree listing and byte-derived Git object hashes, avoiding 1,926 subprocesses. `verify-frozen.py`, `final-frozen.log`, `frozen-byte-verification.json`: **all 1,926 frozen tracked files byte-identical** to the starting commit, including `bench/`, root `fixtures/` and `docs/ui/v3/`.

### Final local gate (closure logs supersede earlier `final-*` snapshots)

| Command / evidence | Observed result |
| --- | --- |
| `npm --prefix web ci` / `closure-ci.log` | Exit 0; npm reports 0 vulnerabilities, with esbuild script warning noted above |
| `npm --prefix web run test` / `closure-unit.log` | Exit 0; **74 tests**, 3 files: 71 intake, 2 form/declaration, 1 shell; no skips |
| `npm --prefix web run typecheck` / `closure-typecheck.log` | Exit 0 |
| `NEXT_TELEMETRY_DISABLED=1 npm --prefix web run build` / `closure-build.log` | Exit 0, unrestricted Turbopack; `/`, `/_not-found`, `/review` only |
| Production server + HTTP readiness / `closure-server.log` | Localhost `127.0.0.1:3100`; ready before browser tests; stopped afterward |
| `npm --prefix web run test:e2e` with executable/output overrides / `closure-e2e.log` | Exit 0; **4 tests**, desktop + mobile, no skips |
| `web/node_modules/.bin/tsx --eval 'console.log("tsx local smoke OK")'` / `closure-tsx.log` | Exit 0 |
| Absent future routes / `closure-absent-routes.log` | POST comparisons 404; GET history 404 |
| `git diff --check` and frozen-path diff | Clean; no frozen-path change |

Browser tests cover root redirect, labels, no mobile horizontal overflow, zero external render requests/page errors, missing image, missing ABV, valid field check, invalid identity, stale-feedback clearing, disabled comparison and no requests on form interaction. Screenshots are browser capture evidence, not independent visual approval:

- `closure-browser/smoke-local-only-foundatio-1b15d-requests-or-mobile-overflow-desktop/foundation.png`
- `closure-browser/smoke-local-only-foundatio-1b15d-requests-or-mobile-overflow-mobile/foundation.png`

Reproduction from `/opt/data/ttb-governance-docs`: use the gate commands above; start server separately with `NEXT_TELEMETRY_DISABLED=1 npm --prefix web run start -- --port 3100`, wait for `curl --fail http://127.0.0.1:3100/review`, then run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/hermes/.playwright/chromium-1217/chrome-linux64/chrome PLAYWRIGHT_OUTPUT_DIR=/opt/data/ttb-phase1-evidence/review-browser npm --prefix web run test:e2e`. On other machines omit the executable override and install Playwright Chromium locally. No external app network/provider is required.

## Handoff and scope

Changes are confined to `web/`, root README, `docs/IMPLEMENTATION-STATUS.md`, and this report. Raw logs/screenshots stay outside source. Dependency/cache directories and environment values are ignored. The final Sprint 2 SHA and exact changed-path inventory are supplied in the implementation handoff outside source to avoid a self-referential commit hash. Parent owns publication and verification; ARGUS owns one consolidated read-only review of the frozen phase. Phase 2 has not started.

Remaining acceptance: independent review, real browser→server intake wiring with bounded HTTP envelopes, auth/private evidence/history, inference and rules, global spend authority, DB/provider/hosting retention and live deployment. None are claimed by these local tests. No platform-wide retention, native-syscall audit or production security certification is inferred from buffer-only helper execution.
