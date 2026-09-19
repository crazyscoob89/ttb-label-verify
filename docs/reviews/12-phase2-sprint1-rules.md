# Phase 2 Sprint 1 — local deterministic rules handoff

## Scope and authority

AVA implemented this bounded local sprint after agreeing with the supplied [ARGUS Phase 1 PASS](11-phase1-argus-pass.md). Alex's approval: **“go as long as you are in agreement”**. Sole checkout `/opt/data/ttb-governance-docs`, new branch `ava/app-phase-2`, clean start at `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a`.

Documentation-only PASS/authority commit: `6b0b1fb6e2804abdfbb55dd336beea4c9096a381`. Its `web/`, `bench/`, `fixtures/`, `docs/ui/v3/` trees were verified unchanged from the Phase 1 candidate **before** rules implementation. This record ships with the following local Sprint 1 implementation commit; use Git for its exact SHA rather than a self-referential candidate hash.

No remote writes, paid/live model calls, research, ARGUS calls, provisioning, migrations or deployment were performed. Sprint 2/provider/spend, UI/auth/history and HTTP wiring were not implemented. ARGUS's new consolidated review remains pending until the entire Phase 2 is frozen.

## Delivered

- `web/lib/rules.ts`: pure per-pair seven-field comparison and detached original evidence/reasons; separate processing failure; fixed warning and permanently unverified physical-size notice.
- `web/lib/extraction/schema.ts`: shared strict bounded evidence schema/parser, with no provider match/verdict authority.
- `web/tests/rules.test.ts`, `web/tests/fixtures/comparisons.json`: synthetic per-pair vectors and adversarial rules/schema cases; no archived fixture rewriting.
- [RULES-POLICY.md](../RULES-POLICY.md): exact API/schema, local sources, precedence, unit grammars, numeric semantics and conservative exclusions for the next worker.

## Executed gates (builder, not independent reviewer)

Full originals: `/opt/data/ttb-phase2-evidence/`. Selected ANSI-free, trailing-whitespace-stripped excerpts/copies with original log hashes: [phase2-sprint1-gates.log](evidence/phase2-sprint1-gates.log).

| Gate | Actual result | Full log |
| --- | --- | --- |
| `npm --prefix web run test -- tests/rules.test.ts` initial RED | Exit 1; 115/115 failed against explicit unimplemented comparison/schema scaffolds. Assertion RED (`complete` expected, `failed` observed), not missing import or infrastructure failure. | `rules-red.log` |
| Initial implementation GREEN | Exit 0; 115/115 passed | `rules-green-initial.log` |
| Corrective ABV RED | Exit 1; 1 failed, 116 passed. `101%` vs declared 40 was incorrectly downgraded to needs-review instead of readable mismatch. Added precision regression coverage also passed. | `abv-discrepancy-red.log` |
| Final focused gate, compatible Node | Exit 0; **117/117 passed** | `rules-node24-green.log` |
| `npm --prefix web run test`, compatible Node | Exit 0; **191/191 passed, 4 files**, no skips | `regression-node24-green.log` |
| `npm --prefix web run typecheck`, compatible Node | Exit 0 | `typecheck-node24-green.log` |
| Raw frozen-file integrity and review import | 1,926 tracked blobs exactly match base Git blob IDs; imported original reviewer paragraphs exactly match DOCX extraction | `integrity.log` |

Final compatible runtime: Node `v24.21.0`, npm `11.19.0`, available locally at `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin`. Reproduce by prepending that directory to PATH and running the commands above from the repo root. No dependency install was needed. Earlier RED/GREEN runs used inherited Node `v20.19.2` / npm `9.2.0` (outside this app's supported engines); those logs are preserved, **not** used as the final supported-runtime acceptance gate. All required final gates were rerun successfully under Node 24.

One initial typecheck failed because synthetic JSON inference made observation text non-nullable. Test helpers were corrected to use the actual shared parsed schema; no production contract or assertion was weakened. `typecheck-initial.log` retains the failure; `typecheck-corrected.log` and the Node 24 gate pass. The generic file-edit tool's standalone TypeScript lint ignored project compiler options and also emitted misleading target/module diagnostics; the repository's actual `tsc --noEmit` is the gate. Git lacked default author configuration; per-command identity matching existing AVA commits was used, without global/repository configuration changes.

No production build or Playwright rerun is claimed for this library-only sprint. Existing intake/UI source, dependencies and lockfile are untouched. This is not full Phase 2, end-to-end extraction, model accuracy, auth, persistent history, global spend enforcement or release acceptance.

## Frozen trees and remaining assumptions

The preserved base tree IDs are:

- `bench/`: `2749b90811f2d5cb792440309a20afe3f30ef1f3`
- `fixtures/`: `e4a1dee3f045fc122b370741293ce901dc980346`
- `docs/ui/v3/`: `4508c1369c5343a7772433dea84f509ca9107423`

The doc-only commit also preserved `web/`: `d6798d97f840dcb83cd87b71b25467c107d29f8a`. Sprint 1 intentionally adds the four named web files only; existing application/intake/schema/UI source is unchanged.

Open source assumptions are explicit in RULES-POLICY: metric mL/L only, bounded decimal grammar, case/whitespace/NFC-only ordinary text, no legal synonyms/address/country aliases, only import-dependent origin applicability, unchanged Application numeric precision, and no physical-size certification. Unsupported/ambiguous representations require review rather than silently pass. The current schema validates observation structure, **not truthfulness of extraction or image binding**. Future provider/UI owners must retain byte limits, no-tools/no-verdict authority, binding, escaped rendering and fail-closed transport/spend boundaries.

Phase 1 nonblockers remain open: predeployment CSP nonce policy, future batch aggregate memory/concurrency controls, and explicit uncompressed iTXt-bound testing when metadata handling changes. This sprint does not modify those surfaces.
