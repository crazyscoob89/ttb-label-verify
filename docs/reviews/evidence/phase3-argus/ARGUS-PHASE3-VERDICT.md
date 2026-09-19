# ARGUS — Phase 3 Consolidated Independent Review

**VERDICT: PASS**

- **Target:** `d799821ab549ce2c7dbb6bce8811e2a9a461b204` (branch `ava/app-phase-3`, frozen)
- **Base:** `38406c12ac575c06ed55370148f907e45782ad33`
- **Reviewer environment:** Windows-native, Node v22.22.2 (satisfies `engines`), npm 10.9.7, Playwright Chromium 1243 — an independent cross-platform reproduction distinct from the builder's Linux/Node 24 runs.
- **Method:** isolated detached git worktree at exact target (`C:\Users\alexm\Projects\ttb-phase3-review`), created from the verified `PHASE3-CANDIDATE.bundle`. Frozen candidate never edited/committed/merged; worktree `git status` clean throughout. No paid inference, no provisioning, no deployment, no migrations, no remote writes.

## Provenance verification

| Check | Result |
| --- | --- |
| `PHASE3-CANDIDATE.bundle` SHA-256 | `e2ecf3eb…4a5322` — matches handoff exactly |
| `PHASE3-REVIEW-SOURCE.zip` SHA-256 | `98af1eb2…623c7` — matches handoff exactly |
| `git bundle verify` | OK; contains only `ava/app-phase-3` at exact target; requires base, present in repo history |
| Worktree HEAD | `d799821ab549ce2c7dbb6bce8811e2a9a461b204`, clean tree |

## Required gates — all independently reproduced

| Gate | Builder claim | ARGUS independent result | Log |
| --- | --- | --- | --- |
| Unit tests | 293/293, 9 files, no skips | **293/293, 9 files, 0 skip/todo, exit 0** | `argus-repro-unit.log` |
| Typecheck | exit 0 | **exit 0, zero diagnostics** | `argus-repro-typecheck.log` |
| Production build | exit 0, 5/5 pages, `/api/comparisons` dynamic | **exit 0, 5/5 pages, identical route table** | `argus-repro-build.log` |
| Explicit-offline E2E (dev + `TTB_OFFLINE_DEMO=1`, port 3100) | 18/18 desktop/mobile | **18/18 (60.0s), exit 0, titles match case-for-case** | `argus-repro-dev-e2e.log`, `argus-dev-server.log` |
| Production smoke E2E | 4/4 desktop/mobile | **4/4 (5.6s), exit 0** | `argus-repro-prod-smoke-e2e.log` |
| Forged API request | both POSTs 403 | **Forged Bearer + `authorized:true`/`fixture:true` JSON → 403 `{"processing":"failed","code":"access-denied"}`; malformed binary → 403 same content-free body** | `argus-prod-boundary.log` |
| Production demo denial | opt-in override refused | **Prod started with `TTB_OFFLINE_DEMO=1`; zero demo/sample markers in `/` or `/review` HTML; `/samples/offline-samples.json` 404** | `argus-prod-boundary.log` |
| Archive-unchanged | 1,871 bench / 38 fixtures / 17 v3 byte-identical | **`git diff` base→target empty for bench (1,871), fixtures (38), docs/ui/v3 (17), Phase 1 `contracts.ts`/`intake.ts`, Phase 2 `rules.ts`/`extraction.ts`/`spend.ts`, `package.json`, `package-lock.json`; counts match builder exactly** | `argus-archive-unchanged.log` |

Servers were explicitly started/stopped on `127.0.0.1:3100`; final port probe closed after each phase. No test was skipped, weakened, or re-labelled; zero failures occurred in the reproduction (nothing to preserve beyond green logs, all verbatim in this directory with `argus-` prefix).

## Scope claims — source-verified

- **Default-deny HTTP route:** `app/api/comparisons/route.ts` returns content-free 403 *before* body parsing; no provider import; `runtimeAccess(): false` unconditional. Live probes agree.
- **Fixture gating:** `fixtureDemoEnabled(NODE_ENV, TTB_OFFLINE_DEMO)` evaluated **server-side** in `app/review/page.tsx` — production structurally cannot opt in; confirmed live.
- **Exact-image binding:** `offline-samples.json` binds each scenario to a normalized SHA-256; browser fetch is same-origin catalog path only.
- **CSP:** production headers observed live: `script-src` contains no `unsafe-eval`; `blob:` present only in `img-src` — the preview fix was applied narrowly as claimed.
- **UNSAVED in-memory decisions:** zero `localStorage`/`sessionStorage`/`indexedDB`/cookie usage and zero external URLs in app/components/lib; the E2E suite (reproduced green) asserts drafts remain unsaved and confirmations reset on edits/pairing switches.
- **Diff hygiene:** 33 changed files base→target, all Phase 3 app/docs additions — no bench/fixture/mock/manifest/Phase 1/Phase 2 drift.

## False-completion-claim review

None found. The review document is notably honest: it explicitly disclaims live acceptance, real-provider accuracy, physical-size verification, auth/persistence, durable history and Windows reproduction (the last now closed by this very review). Preserved RED logs are genuine failure evidence with the missing-module vs assertion-level distinction correctly labelled.

## Critical/high issues

**None.** No required-gate failure, no boundary bypass, no false claim. Cosmetic observations deliberately excluded per review charter.

## Standing limitations (unchanged, not blockers for Phase 3 acceptance)

Arbitrary-upload live inference, authentication/storage/history, reviewer identity, physical-size compliance and batch remain out of Phase 3 scope by design (Phase 4/5). This PASS covers the frozen candidate only; it is not deployment approval.

— ARGUS, 2026-09-19, consolidated single-pass review as requested.
