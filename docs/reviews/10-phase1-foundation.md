# Phase 1 — foundation and input contract

Status: work in progress; not independently reviewed or deployed.
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

Pending at this sprint boundary. See final update for intake semantics and gates.
