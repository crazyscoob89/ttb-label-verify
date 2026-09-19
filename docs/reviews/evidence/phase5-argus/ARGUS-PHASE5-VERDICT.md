# ARGUS PHASE 5 VERDICT — Offline Batch UI Candidate

**Verdict: PASS — for the OFFLINE BATCH scope ONLY.**

- Candidate: `6fca75bc52d7c7de97787b610ba0c9d2a1d5392e` (branch `ava/phase5-batch-core`)
- Bundle: `PHASE5-OFFLINE-CANDIDATE.bundle`, SHA256 `02859dd57bcac608974996fedeb8ec5ff7c506d099e81d63e98acf7fe381ea00` — **verified match** (argus-00)
- Common base: `d799821ab549ce2c7dbb6bce8811e2a9a461b204` (frozen Phase 3); chain d799821 → c1ef52a (batch core) → 6fca75b (UI) verified (argus-03)
- Reviewer: ARGUS, read-only isolated detached worktree (`argus-phase5-review`); no edits/commits/pushes/merges to the candidate; frozen AVA trees untouched
- Review date: 2026-09-19
- Environment: Windows (Jarvis-1), Node v22.22.2, `npm ci` from the candidate's frozen lockfile (no lockfile drift), Playwright bundled Chromium, owned loopback port 3105 only

## Scope of this verdict

This PASS covers **only** the offline fixture batch UI tranche: explicit-manifest batch preparation, bounded offline fixture comparison, horizontal review navigation, and production denial. It is **not** live batch-runtime acceptance, persistence acceptance, Phase 4 acceptance, publication, or deployment approval.

## Gates — all independently reproduced

| # | Builder claim | ARGUS independent result | Evidence |
|---|---|---|---|
| G1 | 326 unit tests / 11 files, no skips | **326 passed / 11 files, 0 skips** | argus-04-unit-full.log |
| G2 | typecheck exit 0 | **tsc --noEmit exit 0, zero diagnostics** | argus-05-typecheck.log |
| G3 | production build exit 0 (TTB_OFFLINE_DEMO=1) | **exit 0**; compile/types/static gen OK | argus-08-prod-build.log |
| G4 | **NEW** dev browser suite: 38 = 20 batch + 18 single, desktop+mobile | **38 passed (1.2m), exit 0, no skips** — first independent reproduction | argus-07-dev-browser-suite.log |
| G5 | 4 production denial tests | **4 passed (4.9s), exit 0** | argus-10-prod-browser-suite.log |
| G6 | 41 frozen base blobs unchanged | **Reproduced via git diff**: web/lib (except 2 new batch modules), API route, next.config CSP, package.json+lockfile (0 lines), fixtures/PNGs, docs/ui all identical to base | argus-03-phase5-diff-integrity.log |

Additional integrity: UI-commit diff = exactly the 17 files declared in `candidate-manifest.json`; SHA-256 spot check 5/5 match (argus-03).

## Required behaviors — verified (E2E + source citations in argus-11)

- **Explicit manifest pairing + blocked entries**: exact case-sensitive filename join, never list-order; duplicates/missing/invalid block affected rows with visible diagnostics (E2E "explicit manifest rejects missing, duplicate and invalid mappings without list-order pairing", desktop+mobile).
- **Max 300 / concurrency max 2**: `MAX_BATCH_PAIRS = 300` (`web/lib/contracts.ts:5`, frozen); envelope reject >300 (`batch-manifest.ts:16,37`); concurrency zod-clamped `.min(1).max(2)` default 2 (`batch-state.ts:72`), capacity rejection (`batch-state.ts:87`); E2E max-301 rejection passed.
- **Exact-image offline fixture comparisons**: browser SHA-256 vs committed catalog (`BatchUpload.tsx:74-76`); adapter re-verifies bytes (`offline-demo.ts:18`); byte identity, not filename, selects the fixture (E2E passed); unknown/corrupt uploads blocked.
- **Horizontal nav + isolated drafts + reset confirmation**: card rail + previous/next; per-pair drafts preserved across navigation, confirmation reset (E2E passed both viewports).
- **Stale A→B→A / version fencing**: replacement advances revision, discards intent, delayed completion fenced, old attempts hold slots until settlement (`batch-state.ts:89,61-62,197`; E2E passed).
- **No auto-retries; manual selected-item retry only**: reducer emits commands only on explicit actions (`batch-state.ts:108-112`); retry failed-pair-only (`:86`) with fresh identities; UI retries only the selected pair (`BatchWorkspace.tsx:103`); E2E passed.
- **Unknown uploads unavailable; production fixture controls absent + API 403**: 4-test production suite passed; **plus ARGUS direct probe**: POST `/api/comparisons` on the running production server returned HTTP 403 body exactly `{"processing":"failed","code":"access-denied"}` — even with `TTB_OFFLINE_DEMO=1` set, because `fixtureDemoEnabled` requires `NODE_ENV=development` (`web/lib/access.ts:4-6`). Denial does not depend on env absence.

## By-design absences — confirmed absent, NOT gaps

- **Arbitrary live extraction**: only executor is `compareOfflineSample` (`BatchWorkspace.tsx:62`), gated on `offlineEnabled && asset` known; `authorize-reserve-and-dispatch` is documented non-authorization.
- **Saved history / save receipts**: `acceptSavedReview` / `save-review` referenced in zero components; UI truthfully labels superseded versions as page-memory, "Not durable saved history. Reload clears all versions" (`BatchWorkspace.tsx:122,127`).

## No newly enabled production inference or client auth authority — confirmed

`runtimeAccess(): false` hard-coded and unchanged (`web/lib/access.ts:3`); `offlineEnabled` derived server-side only (`app/review/page.tsx:5`); the only client fetch is local allowlisted fixture PNGs (size-capped, timeout, aborted) (`BatchUpload.tsx:44`); no tokens/keys/storage/Authorization surface in any new code; API route byte-identical to base; zero new dependencies.

## Findings

**No critical or high findings. No required-gate failures.**

Minor notes (informational, no repair needed):
1. `candidate-manifest.json` exists only in the evidence directory, not the repo tree — consistent with "external, not committed" evidence protocol.
2. Builder's `typecheck-final.log` is 0 bytes (hash of empty file); ARGUS's independent run records the explicit exit code 0, superseding it.

## Out of scope / remains unverified

Live provider extraction, authenticated runtime executor, durable persistence/saved history, server save receipts, authenticated reviewer attribution, 300-image *browser* load (300 covered at pure-core level only), and everything deferred to Phase 4 runtime acceptance.

## ARGUS evidence index (this review)

argus-00-bundle-verification.log · argus-01-worktree-setup.log · argus-02-phase5-claims-map.log · argus-03-phase5-diff-integrity.log · argus-04-unit-full.log · argus-05-typecheck.log · argus-06-dev-server.log · argus-07-dev-browser-suite.log · argus-08-prod-build.log · argus-09-prod-server.log · argus-10-prod-browser-suite.log · argus-11-phase5-source-audit.log
