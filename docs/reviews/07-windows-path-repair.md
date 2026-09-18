# Round 07: native Windows path-separator finding

- Reviewed candidate: `e162de5373ce3ecdfd67b0e96085327df67abf31`.
- Reviewer: ARGUS, as relayed by Alex in the project channel.
- Reviewer result: **REVISE**, three of six offline gates reported red on a fresh
  native Windows checkout. Original native run logs were not supplied here.
- Implementer: AVA. Resolution commit: `3e8d52b34aeaaed66813d768192c33b26993ff8e`.
- Severity: blocking required gate (record-owner classification).
- Closure: builder regression green; independent native Windows rerun pending.

## Root cause and impact

`replay.load_evidence()` discovers all fixture paths and compares that exact set
with POSIX-style keys in `evidence_manifest.json`. `str(relative_path)` renders
backslashes on Windows; identical existing files therefore fail the complete-
manifest comparison after their byte hashes have already passed. This is separate
from the LF/CRLF defect: preserving bytes does not normalize path representation.

## Minimal fix

Use `.as_posix()` on both discovered relative-path sets (ground-truth JSON and
fixture PNG). Preserve exact set equality, file hash checks, the original raw
fingerprint and evidence. No source fixtures, scoring rules, manifest entries,
provider calls, report metrics or spending gates are changed.

## Reproduction and tests

Added three tests to `bench/test_integrity_mutations.py`. A controlled path
representation shim returns `PureWindowsPath` from real `Path.relative_to()`
operations; file reads, fixture discovery, hashing, replay and report checking
remain real. This is not represented as native Windows execution.

1. Untouched evidence must pass the full gate with Windows path rendering;
   the new assertion failed before the fix (`1 != 0`) and passes afterward.
2. A missing manifest entry still raises the specific incomplete-manifest error.
3. Changed fixture bytes still raise the specific hash-mismatch error.

The existing ten integrity tests remain; the script now runs thirteen tests.
Command: `python3 bench/test_integrity_mutations.py`.
[RED evidence](evidence/path-separator-red.log) and
[GREEN evidence](evidence/path-separator-green.log) are preserved.

## Reviewer handoff

ARGUS reruns all six documented gate scripts on a fresh native Windows checkout
of the final frozen handoff SHA and verifies no benchmark evidence or fingerprint
changed. Verify the single [review register](README.md) and
[repository identity/reconciliation](REGISTER_RECONCILIATION.md). Return one
PASS/REVISE verdict; do not edit. AVA records the verdict after it is supplied.

## Frozen candidate verification

All six gate scripts, offline dry-run, compilation and whitespace check passed
on `b4656265cd3c3a1dd0fd16e4d74f5d2280267494` in fresh `core.autocrlf=false`
and `core.autocrlf=true` checkouts on Linux. Every pinned benchmark file matched
its original `2ca813e` bytes and recorded hash. The checkout remained clean.
[Full frozen-gate output](evidence/b465626-frozen-gates.log).
This report-only addition does not change the tested implementation; the final
handoff also requires a rerun at its exact committed SHA. Native Windows approval
remains ARGUS's independent gate, not implied by these Linux results.

## Final independent verdict: PASS

**Reviewed SHA:** `05312d0c2a61d061de903cfcba3dc0970a28dfe8`.
**Reviewer:** ARGUS. **Source:** final reviewer message pasted by Alex in the
project channel. This is an attributed summary; the raw native Windows log
was not included in the supplied message and is not fabricated here.

ARGUS reports all six gates passed on both a fresh default-settings native
Windows clone and the working tree. He confirms path normalization, tests and
documentation only; original evidence bytes unchanged; pinned fingerprint
intact; master untouched; zero reviewer commits. This closes the bounded
Stage 2 repair tranche, including both checkout line endings and path separators.

The supplied message contained literal `undefined` placeholders in its scoring
count and stage label. They are not repeated as valid values. Existing source
and frozen builder logs establish 303 scoring assertions, 162-call/1,134-verdict
replay, 13 integrity mutation/control tests, 15 extraction-safety tests, 3
paid-entrypoint tests and 1 checkout-portability test. The reviewer reports all
six scripts green; those individual count labels are mapped from their actual
scripts, not guessed from the malformed sentence.

This verdict supersedes the pending closure statements earlier in this record;
historical failures and environment-limited builder results remain preserved.
This append changes documentation only, not the reviewed implementation.

**Remaining decision boundary:** engine selection, merge to master, app build,
new provider spending, real-data use and deployment are not authorized by the
reviewer's PASS. Alex decides the next scope. The benchmark recommendation is
finite-test evidence, not a promise of zero real-world false matches.

**Schedule correction:** September 23, 2026 is Wednesday, not Tuesday. The
reported 'full day ahead of deadline' has not been verified against the
controlling assignment email/brief; this closeout does not certify that date.
