# Engineering review register

## Report to Alex Martinez

**Decision owner:** Alex. **Current implementation and record owner:** AVA.
**Current independent reviewer:** ARGUS. Earlier planning/benchmark reviews were
performed by AVA while ARGUS owned implementation.

**Executive status:** `e162de5` remains **REVISE**: ARGUS reported three of six
gates failing on native Windows due to manifest path separators. The bounded
repair is `3e8d52b34aeaaed66813d768192c33b26993ff8e`; its new Windows-path
regression passes locally. Independent native Windows re-verification is pending.
This is not approval to merge, deploy, spend again, or start the application.

## Review rounds

| Round | Reviewed candidate | Verdict at that round | Record |
| --- | --- | --- | --- |
| 01 Planning | `4bf9f04230a1cfc5b4cf969323b200d479f456d2` | REVISE | [Planning](01-planning.md) |
| 02 Plan amendment | `605a78223a7c2a4b921c7f97623e81ec7e96d2b8` | REVISE | [Amendment](02-plan-amendment.md) |
| 03 Planning closeout | `fd35c2fa5d0cff0504735fbbd4a59c306a34de0f` | REVISE | [Closeout](03-planning-closeout.md) |
| 04 Stage 2 audit | `2ca813eb09c918357ed2052de5548f66fdee9fc9` | REVISE | [Audit](04-stage2-audit.md) |
| 05 Independent repair review | `eec5da7fb4e7e1c55b7726cbb225bb2161de8ce9` | REVISE, as relayed in channel | [Review and diagnosis](05-repair-review.md) |
| 06 Portability repair | `e162de5373ce3ecdfd67b0e96085327df67abf31` | Builder Linux checks passed; subsequent native Windows REVISE reported | [Validation](06-portability-validation.md) |
| 07 Windows path repair | `3e8d52b34aeaaed66813d768192c33b26993ff8e` | Builder regression passes; independent review pending | [Path repair](07-windows-path-repair.md) |

These are the source-backed rounds recovered for this register, not a claim
that every historical message or review job has been recovered. Planning
handoff `3702c90` is referenced in round 04; no separate final PASS is invented.
The subsequent native Windows REVISE is captured from Alex's relayed ARGUS
message in round 07. The original full job output has not been supplied.
See [register reconciliation](REGISTER_RECONCILIATION.md) for source mapping and
the preserved historical documentation from `62978a1`.

## Management findings and accountability

| Finding | Severity / impact | Implementation disposition | Owner / closure evidence |
| --- | --- | --- | --- |
| Malformed or uncertain extraction could pass | High: unsupported verification | Repaired in `eec5da7` | AVA; safety tests, ARGUS confirmation relayed in round 05 |
| Spend and retention claims exceeded proven controls | High: cost/privacy exposure if made public | Documentation corrected, paid entrypoints locked in `eec5da7`; production controls still unimplemented | AVA implements; ARGUS verifies; deployment remains held |
| Cached-value integrity check could falsely pass | High: unreliable release evidence | Replaced by evidence replay and mutation checks in `eec5da7` | AVA; round 05 confirms protection, but identifies checkout failure |
| Windows checkout transformed hash-pinned evidence | Blocking required gate; severity assigned by record owner | `.gitattributes`, UTF-8 I/O and regression in `e162de5` | Byte-conversion repair implemented; native review found separate path bug |
| Windows path separators rejected the complete manifest | Blocking required gate; severity assigned by record owner | Two `.as_posix()` corrections and three regressions in `3e8d52b` | AVA fixed; ARGUS independent native Windows closure pending |
| Review decisions remained outside Git | Process gap: incomplete management audit trail | This register preserves available reports and test logs | AVA owns publication; missing independent report remains explicit |

Evidence log copies preserve test output; trailing whitespace is normalized for
Git whitespace checks. They are not represented as byte-identical log archives.

## Reporting standard

Every future handoff must state: objective and scope; base/candidate SHA;
implementer and independent reviewer; finding and severity; evidence and exact
reproduction command; expected versus observed result; root cause and impact;
resolution SHA; verification environment and result; residual risks; next owner;
and any decision required from Alex. Unknowns remain unknown.

Preserve failed tests and original verdicts. Later corrections supplement rather
than erase history. Separate builder-reported results, reviewer-reported results,
and independently reproduced results. A proposed fix is not closure; a passing
local test is not a passing independent review or deployment. Reviewers report
read-only findings; the builder commits their attributed record without turning
it into a fabricated reviewer approval. Keep credentials, unrelated private
information and real customer content out of the repository.

## Open decisions and next action

1. ARGUS: verify the next frozen handoff containing `3e8d52b`, including native Windows
   evidence or an explicit platform limitation. AVA then records it verbatim or
   as a clearly attributed summary with the source artifact.
2. Alex: final engine selection and application-build authorization remain
   separate decisions; Haiku is still the provisional benchmark recommendation.
3. Before public/non-synthetic use: verify global spending enforcement,
   buffer-only implementation, actual provider-chain retention and app acceptance.
   Untested image coverage and deployed end-to-end timing remain open.

Supporting records: [revision details](../STAGE2_REVISION.md),
[benchmark report](../../bench/RESULTS.md),
[acceptance checklist](../ACCEPTANCE_CHECKLIST.md).
