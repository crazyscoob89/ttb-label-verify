# Phases 4 and 5 — scoped ARGUS PASS and reviewed-source publication

## Decision record for Alex

**Independent reviewer: ARGUS. Implementation/publication owner: AVA.**
ARGUS's supplied verdicts dated 2026-09-19 are PASS with no critical/high findings,
but only within the following distinct scopes:

| Scope | Exact reviewed target | Original verdict / evidence |
| --- | --- | --- |
| Phase 4 **source foundation ONLY** | `f5007074a33e56214d4da865bd05121665cca1e7` | [Verbatim verdict](evidence/phase4-argus/ARGUS-PHASE4-VERDICT.md), [raw logs and manifest](evidence/phase4-argus/README.md) |
| Phase 5 **offline batch ONLY** | `6fca75bc52d7c7de97787b610ba0c9d2a1d5392e` | [Verbatim verdict](evidence/phase5-argus/ARGUS-PHASE5-VERDICT.md), [raw logs and manifest](evidence/phase5-argus/README.md) |

Common reviewed base: `d799821ab549ce2c7dbb6bce8811e2a9a461b204`.
These are attributed original reviewer reports, not fabricated approval of the
new composition. ARGUS used isolated read-only native Windows worktrees on
Jarvis-1, Node v22.22.2 and frozen-lockfile dependencies. All original reports
and accompanying ARGUS gate/source-audit logs are retained byte-for-byte with
SHA-256, sizes, encodings and source paths. UTF-16 BOMs, CRLF, console mojibake
and development eval-disabled warnings remain intact. Local reproduction below
is AVA's Linux work, not a claim of a second native Windows execution.

## Independent results and interpretation

- **Phase 4:** 419 unit tests / 16 files; typecheck; 70 focused foundation tests;
  56 focused persistence tests; extra production build. `test:db` exits 1 with
  `DB gate blocked: explicit isolated target configuration required` — expected
  fail-closed behavior, **not database acceptance**. No DB was contacted.
- **Phase 5:** 326 unit tests / 11 files; typecheck; production build; 38 dev
  browser cases (20 batch + 18 single, desktop/mobile); 4 production-denial
  cases. Independent POST probe returned 403 even with `TTB_OFFLINE_DEMO=1`.
  Exact fixture-image binding, explicit manifest pairing, max-300 core bound,
  concurrency max 2, navigation/draft isolation, stale-result fencing and
  explicit selected-item retry were verified. No automatic live retries.
- No critical/high source findings or required-gate failures were reported.
  Absent future adapters and external acceptance gates are not relabelled bugs
  or silently treated as delivered functionality.

Original builder handoffs remain unchanged: [foundation](17-phase4-foundation.md),
[persistence source](19-phase4-persistence-source.md), [batch core](18-batch-foundation.md),
[offline UI](20-phase5-batch-ui.md). Their pending-review wording is superseded
only for these exact scoped candidates; historical failures stay historical.

## Isolated composition and new local gates

The publication clone `/tmp/ttb-phase45-reviewed-publication`, branch
`ava/phase45-reviewed-publication`, starts at authenticated live master
`209f50721d5ffdcd64573288272639ce7b0dfe7e` (Phase 3 PR #7). Normal local merges
preserve both original reviewed histories and current master; no cherry-pick,
squash, source rewrite or conflict resolution was needed. The Phase 4 delta is
18 paths and Phase 5 delta 22 paths; the sets are disjoint. Every changed source
and original builder document is byte-identical to its reviewed target.

Composition commit: `597c5840136ca27641bc4718999148f9bb417350`.
A separate documentation/evidence-only commit records this acceptance. The
[composition proof](evidence/phase45-publication/composition-proof.json) records
all reviewed path/blob mappings, common base, targets, web tree and preserved
benchmark/fixture/design objects. Later history, connected-runtime and new
DB-harness work are explicitly excluded, including unpublished builder ancestry.

AVA reran the new composition with Node **v24.21.0**, copied frozen Phase 5
`node_modules`, no dependency or lockfile changes and a credential-free
allowlisted process environment:

| New composition gate | Result |
| --- | --- |
| `npm test` | **452 passed / 18 files**, exit 0 |
| `npm run typecheck` | Exit 0 |
| `npm run build` with `TTB_OFFLINE_DEMO=1` | Exit 0; same four routes |
| `npm run test:db` without configuration | Expected exit 1, exact refusal; no database connection |

[Whitespace-normalized AVA gate log copies, environment and hashes](evidence/phase45-publication/README.md).
Original AVA raw bytes remain in the external evidence directory; original and
published hashes are recorded. All supplied ARGUS artifacts remain verbatim.
Browser suites were **not rerun** in this publication lane. ARGUS's independent
38+4 browser results are preserved rather than mislabelled new composition E2E.
The full UI/API/CSP/fixture source remains the reviewed Phase 5 source; its only
additional web paths are reviewed dormant Phase 4 libraries/tests/SQL and one
`test:db` package script. Unit/type/build test the newly composed surface.

## Preservation and promotion gates

The complete pre-publication master is retained as an ancestor; all existing
paths outside README/status/register edits and the reviewed deltas remain
unchanged. `bench/`, `fixtures/`, `docs/ui/`, the root
[latest benchmark report](../deep-dive/BENCHMARK-RESULTS.md) and the README's prominent
benchmark entry section remain byte-for-byte intact. See the
[versioned final benchmark archive](../../bench/final-evaluation-20260918/README.md).
No observations, outcomes, archived costs or evidence fingerprints are rewritten.

Before publication, verify exact commit scope/ancestry and source identity,
source-to-staged original hashes, all new documentation links, secrets in
introduced commits and decoded logs, strict authored-file whitespace and full
`cr-at-eol` whitespace. Default diagnostics for verbatim CRLF logs are retained,
not repaired by corrupting originals. Explicitly force-stage only manifest-listed
ignored logs. No broad ignore or evidence normalization change is needed.

Alex's existing continuation/source-promotion authority applies; a reviewer PASS
alone is not promotion authority. Use a normal SHA-pinned PR merge into freshly
verified master only after checking draft/head/base, applicable statuses/checks,
protection/rules and mergeability. No protection bypass, invented hosted PASS,
force push or branch deletion. Initial GitHub inspection reports no workflows or
webhooks, unprotected master, and plan-tier 403 for protection/rules APIs (not
an authentication failure). Empty hosted checks are not hosted CI success.
The PR and live remote receipts, not this pre-promotion record, establish merge
completion. External verification helpers/receipts are retained at
`/opt/data/ttb-phase45-publication-evidence/` for independent parent readback.

## Still not accepted; next owner

**Not full Phase 4, not live batch, not durable history, not deployment.**
Real DB migration applicability, RLS/grants and concurrency behavior; managed
JWT/session verification/revocation; concrete private-object storage/ACLs;
authenticated redemption and orphan reconciliation; authenticated runtime
executor/provider extraction; durable review history/server save receipts;
authenticated reviewer attribution; and 300-image browser load remain unverified.
The existing DB behavioral harness is deliberately incomplete and cannot pass.
The future harness/runtime work elsewhere is not imported or approved here.

Current UI comparisons are development-only exact synthetic fixtures; production
comparison access remains default-deny. Drafts and versions are page-memory and
clear on reload. Acceptance budget remains **zero**. No paid calls, cloud/service
activation, DB connections/migrations, live acceptance or deployment occurred.
AVA owns subsequent isolated implementation; ARGUS reviews its separate frozen
candidate. Alex retains external-action/release decisions. No repeated approval
is requested for this already-authorized bounded publication.
