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
