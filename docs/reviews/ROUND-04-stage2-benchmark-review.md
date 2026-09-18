# Round 04 — Stage 2 Benchmark Deliverable Review

**Date:** 2026-09-17
**Reviewed SHA:** `2ca813eb09c918357ed2052de5548f66fdee9fc9` ("Add RESULTS.md integrity test (98 checks) guarding against report drift")
**Reviewer:** ARGUS (independent pass over the Stage 2 benchmark deliverable — fixtures, engine adapters, scorer, runner, and `bench/RESULTS.md`)
**Verdict: REVISE**

## Claims verified

This round reviewed the full Stage 2 benchmark deliverable at `2ca813e`:
18 synthetic fixtures, 3 candidate engines (`claude-haiku-4-5`,
`gpt-5-mini`, `claude-sonnet-4-5`), the deterministic scorer, the spend-
guarded runner, and `bench/RESULTS.md`'s headline recommendation. The
reviewer independently reproduced, offline, all **303 scoring unit-test
assertions** (`bench/test_scoring.py`) and all **98 integrity checks**
(`bench/test_results_integrity.py`) that re-derive every figure in
`RESULTS.md` from `bench/analysis.json` and `bench/raw_results.json` —
both suites passed as claimed, confirming the report's numbers were not
narrated from memory. The reviewer also independently confirmed the
headline recommendation: `claude-haiku-4-5` is the sole zero-false-match
engine (0/378) that clears the 60% Automation Rate floor (100%), while
`gpt-5-mini` (2 false matches) and `claude-sonnet-4-5` (3 false matches)
are both disqualified at Gate 1 — matching the report's stated gate logic
and the traced root cause (`A-WARN-BOLDBODY-01` / `government_warning_body_bold`
misread) exactly.

## Findings

1. **[Critical] Malformed/uncertain extraction could pass as match.** The
   scorer's fail-closed handling was incomplete: certain malformed or
   low-confidence extraction outputs (schema-adjacent but not fully valid,
   or a low-confidence formatting read) could still resolve to `match`
   rather than routing to `needs-review`, in tension with the Uncertainty
   Invariant established in planning (Round 01/02). This is the same class
   of risk the invariant was written to prevent, now found live in the
   scorer implementation rather than only in planning prose.
2. **[High] Spend fallback lacked an enforced global cap; retention
   wording conflict.** The benchmark runner's spend-guard fallback path was
   not backed by an enforced global ceiling equivalent to the hard-gate
   requirement established in planning (Round 03), and accompanying
   documentation contained wording that conflicted with the Provider Data
   Retention disclosure already established for the main application —
   risking the same claims-vs-artifact mismatch flagged as a lesson in
   Round 03.
3. **[High] Integrity test survived value-mutation without verdict
   update.** The 98-check integrity suite verified that reported figures
   matched `analysis.json`/`raw_results.json` as committed, but did not
   include a mutation test proving the suite would actually **fail** if a
   raw value were altered post-hoc and the report were not regenerated —
   i.e., the guard-against-drift claim was unproven against the specific
   failure mode it exists to catch (an evidence value silently changed
   after the report was written).

## Root cause

The benchmark deliverable correctly implemented the *scoring logic* and
the *reporting arithmetic* but had not yet been stress-tested against the
adversarial classes the planning docs (Rounds 01–03) already required:
uncertainty-never-passes at the extraction-validation layer specifically
(not just the rule layer), an enforced (not fallback-only) spend ceiling
matching the hard-gate standard, and a self-verifying integrity test that
proves its own sensitivity to drift rather than only checking current
values.

## Resolution SHA

`eec5da7fb4e7e1c55b7726cbb225bb2161de8ce9` ("fix(bench): close validation
and evidence-integrity audit gaps") — authored as an AI-assisted AVA
tranche per the scope/ownership note in `docs/STAGE2_REVISION.md`
(Alex-authorized revision of these three findings; no app implementation,
provider call, deployment, canonical-branch merge, or production engine
activation included). This commit:
- Added fail-closed extraction/matching validation (adapter and scorer
  validate field types and finite numeric component confidence; missing,
  malformed, or low-confidence-formatted output routes to `needs-review`,
  not `match`) — closing finding 1.
- Replaced the fixed-list cached-number integrity gate with an
  evidence-backed integrity gate: raw observations and fixtures are
  hash-pinned, verdicts/classes are re-derived independently into
  `replayed_results.json`, and all aggregates/the full report are checked
  against that derivation rather than a static assertion list — closing
  finding 3, including new mutation tests proving the gate fails on
  altered evidence.
- Established honest spend/retention boundaries: per-instance controls
  cannot pass the global-spend gate; disabled paid harness/probe CLI
  entrypoints; removed any guessed-quota or manual "verified" claim not
  backed by an enforced cap; clarified buffer-only processing is distinct
  from unverified implementation and external retention — closing finding 2.
- Preserved all original evidence byte-identical to the base commit
  (`raw_results.json`, fixtures, ground truth); no paid observations were
  repeated.

All three findings were verified closed by reading the `eec5da7` diff and
the offline reproducible gate (`bench/test_scoring.py`,
`bench/test_extraction_safety.py`, `bench/test_results_integrity.py`,
`bench/test_integrity_mutations.py`, `bench/test_archived_spend.py`)
against each specific gap above. Independent ARGUS review of this tranche
was explicitly flagged as pending in the AVA commit message.

## Re-review of `eec5da7`: offline gate failing on untouched evidence

On independent re-verification of `eec5da7`, the reproducible offline gate
**failed** despite no evidence file having been intentionally changed —
the integrity replay did not reproduce the pinned raw-observation
fingerprint on this reviewer's checkout.

**[High] Finding:** Offline gate failure on evidence that was not
supposed to have changed, discovered by running the gate rather than
trusting the prior "all green" claim.

**Root cause diagnosis:** The committed raw-observation blob fingerprint
(`1b7fa04ba…`) was correct all along. The failure was caused by Git's
Windows `core.autocrlf=true` checkout behavior silently converting the
committed LF line endings of the pinned JSON evidence to CRLF on checkout,
which changed the **working-copy** byte content (and therefore its hash)
without changing the **committed** blob. This was confirmed by reproducing
the exact reviewer hash and failure in an isolated Windows-style checkout
before writing any fix. The wrong instinct here — which was explicitly
avoided — would have been to treat the mismatch as evidence corruption and
re-fingerprint/re-pin the evidence to match the (wrongly) converted
working copy; that would have silently baked a checkout artifact into the
pinned fingerprint and defeated the entire evidence-integrity gate's
purpose.

**Resolution SHA:** `e162de5373ce3ecdfd67b0e96085327df67abf31` ("fix(bench):
preserve evidence hashes across Windows checkouts") — added
`.gitattributes` to preserve pinned JSON/PNG bytes and prevent line-ending
conversion on checkout, added explicit UTF-8 I/O for replay/report
tooling, and added a checkout regression test that reproduces
`core.autocrlf=true` conversion and asserts the integrity gate now passes
against it. Neither the raw fingerprint nor any original evidence content
was changed — only the checkout-time byte preservation was fixed. The
existing 303 scoring assertions, 15 extraction safety tests, 10 integrity
tests, and 3 paid-entrypoint lock tests remained green; the new checkout
test is additional coverage, not a replacement.

**Caveat documented in the resolution itself:** the regression test
simulates Git's `core.autocrlf=true` checkout behavior; it does not
constitute native-Windows Python execution of the full gate.

## Final native-Windows re-verification: **verification in progress, verdict to be appended**

As of this writing, a native-Windows re-run of the full offline gate
(job `d4f934`) to confirm `e162de5` resolves the checkout issue under
actual Windows Python execution (not a simulated checkout) has not yet
completed. This section will be updated with the reproduced pass/fail
result and the final consolidated verdict for the `eec5da7` → `e162de5`
tranche once that run completes. Until then, this round is not closed.

**Verdict: REVISE → three defects fixed at `eec5da7`; checkout-portability
regression caught and fixed at `e162de5`; final native-Windows
re-verification in progress, verdict to be appended.**
