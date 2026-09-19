# Phase 2 Sprint 2 — provider/spend local candidate

## Ownership, base and scope

AVA, sole builder, implemented the local provider/spend slice on `ava/app-phase-2`, clean start **`0aeb7a40914c2e22847d275f14faf3872097d95f`**. Parent verification and ARGUS's one consolidated read-only **whole-Phase-2** review remain pending. Use the Git commit containing this record for the frozen candidate SHA; no self-referential SHA or independent PASS is invented here.

The supplied [Phase 1 ARGUS PASS](11-phase1-argus-pass.md) remains recorded by docs-only `6b0b1fb6e2804abdfbb55dd336beea4c9096a381`; it was not rerun/re-requested or reused as Phase 2 approval. Alex's local continuation approval and D5/D6 restrictions are unchanged. No remote writes, external research, ARGUS/bridge calls, live/paid provider calls, secret discovery, migrations, provisioning, deployment or phase-3/auth/history/database implementation occurred.

## Delivered files

- `web/lib/extraction/provider.ts`: request/result/metadata contract, fixed bounds, strict synchronous image snapshot/hash/request identity.
- `web/lib/extraction/openrouter.ts`: default-deny, explicitly injected server dependency gate; one allowlisted no-tools request; bounded body/deadline; strict shared evidence validation; conservative spend composition.
- `web/lib/extraction/fixture-provider.ts`: explicit offline deterministic source tag, never real extraction or fallback.
- `web/lib/spend.ts`: strict integer-money binding/receipt validation and reserve → atomic claim → unresolved completion interface. No production store or settlement implementation.
- `web/tests/extraction.test.ts`, `web/tests/spend.test.ts`, `web/tests/helpers/offline-spend-store.ts`: offline adversarial, timeout, duplicate/concurrent, failure and positive-control tests; test-only Map store clearly not global enforcement.
- [PROVIDER-BOUNDARY.md](../PROVIDER-BOUNDARY.md): exact integration API, local archived adapter provenance, prompt/evidence/source distinctions, limits, economic assumptions and future store acceptance contract.
- This handoff, selected gate evidence, implementation status and review register updates.

No existing web application/intake/UI/schema/rules files were modified. The provider is not connected to a route or UI. New dependencies were not needed; manifest/lockfile are untouched.

## RED → GREEN and executed gates

Runtime: **Node v24.21.0 / npm 11.19.0**, prepended from `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin`. Commands below ran from the repository root. Full original logs live at `/opt/data/ttb-phase2-evidence/`; Sprint 1 logs were preserved. [Selected sanitized evidence with original-log SHA-256s](evidence/phase2-sprint2-gates.log).

| Gate | Observed result | Original log |
| --- | --- | --- |
| Initial focused RED against default-deny scaffolds | Exit 1; **26 failed, 32 passed, 58 total**. Includes intended `failed` versus `complete` and no-dispatch assertions; negative default-deny tests already passed. One wire-inspection assertion initially encountered absent dispatch data; an explicit dispatch-count assertion now precedes inspection. | `sprint2-red.log` |
| Initial provider/spend implementation | Exit 0; **58/58 passed** | `sprint2-green-initial.log` |
| Initial project typecheck | Exit 2; literal type widening in metadata/binding, corrected with const metadata and typed SpendBinding; no contract weakening | `sprint2-typecheck-initial.log` |
| Envelope-hardening RED | Exit 1; **2 failed, 58 passed**. Error/unknown-root-key envelopes incorrectly returned `complete`; strict root allowlist corrected it. | `sprint2-envelope-red.log` |
| `npm --prefix web run test -- tests/extraction.test.ts tests/spend.test.ts` final | Exit 0; **70/70 passed**: 45 extraction, 25 spend, 2 files, no skips | `sprint2-focused-green.log` |
| `npm --prefix web run test` final | Exit 0; **261/261 passed**, 6 files, no skips; includes existing 117 rules tests | `sprint2-full-green.log` |
| `npm --prefix web run typecheck` final | Exit 0; no diagnostics | `sprint2-typecheck-green.log` |
| `NEXT_TELEMETRY_DISABLED=1 npm --prefix web run build` | Exit 1; Turbopack dependency-directory read failed with ENOMEM on WSL 9p mount | `sprint2-build.log` |
| `NEXT_TELEMETRY_DISABLED=1 taskset -c 0 npm --prefix web run build` unchanged retry | **Exit 0**; compiled, TypeScript and static page generation passed; unchanged routes `/`, `/_not-found`, `/review` | `sprint2-build-affinity.log` |
| Raw frozen-file and prior tracked-web integrity | Exit 0; **1,926 frozen tracked blobs** match base raw bytes; all previously tracked web files also unchanged | `sprint2-integrity.log` |

The build failure was investigated before retry: `/opt/data` is a WSL 9p mount; allowed CPUs were 0–11 and available system memory was not exhausted in the observed snapshot. Single-CPU affinity, without source/config/dependency changes, made the canonical build pass. This supports a filesystem/concurrency-related failure classification, not a fully established kernel root cause. The original failure remains evidence. Generic file-tool lint also intermittently reported ENOMEM or an unusable standalone `npx` checker; actual repository typecheck/build above are the acceptance results.

No Playwright/browser rerun, real PostgreSQL concurrency, provider-network timing, live OpenRouter response/parameter acceptance, actual extraction accuracy or billing reconciliation is claimed. Build success does not make the unwired provider a deployed feature.

## Preserved frozen trees

Working-file raw bytes were checked against Git blob hashes from the Sprint 1 base, not merely against `git status`:

- `bench/`: `2749b90811f2d5cb792440309a20afe3f30ef1f3`
- `fixtures/`: `e4a1dee3f045fc122b370741293ce901dc980346`
- `docs/ui/v3/`: `4508c1369c5343a7772433dea84f509ca9107423`

## Handoff contract and outstanding acceptance

1. `createOpenRouterProvider()` is inert. Future server composition must explicitly supply authorization, key, maximum integer reservation and a qualified durable shared store. Do not expose those dependencies as request parameters. The only real dispatch is private and gated.
2. `extract({ image, mimeType, reservationId, attemptId })` returns strict shared evidence with source/hash/request/model/schema/rules/prompt metadata or a content-free failure code. Input is image-only, snapshot before async work; intake decoding/sanitation and later application/version binding still belong to future orchestration. The provider prompt excludes expected applicant values and canonical warning wording.
3. `compareApplication(unknown, unknown)` from Sprint 1 remains unchanged: consume only valid extraction `evidence`; retain seven field outcomes, separate processing status and no overall auto-Pass. Persist/display the source tag; fixture data is not OCR.
4. `SpendStore.reserve/claim/complete` must atomically enforce cumulative incurred plus unresolved money, permanent reservation/attempt uniqueness, and a single-winner fresh claim. Receipts alone cannot verify a malicious or non-atomic store. The test store is **not** globally enforceable money control; real DB/process/crash concurrency remains Phase 4 unproven work.
5. Every dispatched attempt retains its full maximum liability after success, invalid output, error or timeout. No provider usage claim settles it. Only separately privileged verified external reconciliation may settle/release while preserving history and permanent deduplication. That process is intentionally not implemented/exposed here.
6. New retry = new authorized reservation and attempt, never implicit HTTP retry or fallback. Provider pricing/worst-case reservation adequacy, approved actual ceiling and overruns are unverified; live activation remains denied pending D5 and integration acceptance.

**Local Phase 2 candidate complete for parent verification; independent whole-phase review pending. Stop here.** No next-phase implementation or publication is included.
