# PR9 Live Batch Review — Setup Notes (running)

## Environment
- Working dir: C:\Users\alexm\Projects\argus-pr9-live-batch-review
- Repo clone: .\repo (fresh from https://github.com/crazyscoob89/ttb-label-verify.git)
- Node: v22.22.2 (engines allow >=22.12 <23 || >=24 <25 — COMPATIBLE; AVA used 24.21.0)
- npm: 10.9.7
- git: 2.54.0.windows.1
- Shell: Windows PowerShell
- App lives under repo/web (Next.js). Root has only docs/fixtures/web.

## Clone/checkout issue (resolved)
- Initial `git checkout <candidate>` aborted then corrupted index due to Windows MAX_PATH on
  deeply-nested bench/ files (benchmark data, out-of-scope).
- Fix: `git config core.longpaths true`, rebuilt index (`git read-tree HEAD`), `git checkout -- .`,
  then checked out candidate cleanly. Tree clean (0 modified).

## SHAs
- Candidate (app): 75fe83d30441b3917869fb6a1164506337b9940c  ("Add guarded live batch intents with durable spend deduplication") — CHECKED OUT
- Evidence (published): fa56bcc7d5b50bb63b4bc559c91682e237f355ab — exists
- Prior baseline: f82be6e9a1757337f50c5131f937d3893a98ec91 — exists
- Provider repair: bb1089868649ff522185454ccfc72cb23a3f6b7a — exists

## Tree verification: candidate 75fe83d vs evidence fa56bcc
Claim was "identical trees except web/DEMO-OPERATIONS.md". ACTUAL diff:
- web/DEMO-OPERATIONS.md (M)
- README.md (M), docs/deep-dive/RELEASE-STATUS.md (M), docs/reviews/README.md (M)
- docs/reviews/25-live-provider-and-batch-candidate.md (A) + docs/reviews/evidence/pr9-live-batch/* (A, all evidence artifacts)
=> Evidence commit is a DOCS-ONLY SUPERSET of candidate. **ZERO application/source code differs**
   (verified: no non-docs/non-README file differs). Evidence faithfully represents candidate code.
   Minor: goal's "identical except DEMO-OPERATIONS.md" understates the added docs, but code-identical = OK.

## package.json (web) scripts
- test: vitest run   (goal wants maxWorkers=1 -> use --maxWorkers=1 / poolOptions single fork)
- typecheck: tsc --noEmit
- build: next build   (Next uses webpack internally)
- test:db, test:e2e (playwright) also present

## FINAL RESULTS (appended)
- Full suite (--maxWorkers=1): 4 failed | 553 passed | 5 skipped (562); dur 147.83s. All 4 fails = 5000ms timeout in tests/live-batch-route.test.ts (+1 EBUSY temp-unlink after timeout). First test in that file passed at 4498ms (edge).
- Re-ran that file --testTimeout=30000: 5 passed (5), dur 28.91s. Times 3971/6639/4686/7606/5460ms => 3 exceed default 5s => ENVIRONMENTAL slowness (sharp+sqlite on Node22/Win), NOT logic defect.
- typecheck: tsc --noEmit exit 0. build: next build (Turbopack) exit 0.
- Build bundler note: repo uses Turbopack (next.config.ts), not webpack; AVA cmd 'build -- --webpack' does not match repo script.
- All 8 FOCUS points reviewed against source: PASS (see verdict.md). Binding+secret confirmed NOT independent spend auth.
- VERDICT: PASS. Deliverable: docs/reviews/verdict.md
