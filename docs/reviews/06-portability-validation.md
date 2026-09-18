# Round 06: portability repair validation

- Candidate: `e162de5373ce3ecdfd67b0e96085327df67abf31`.
- Base: `eec5da7fb4e7e1c55b7726cbb225bb2161de8ce9`.
- Implementation and recorded test owner: AVA.
- Independent review owner: ARGUS.
- Status: **builder gates pass; independent PASS/REVISE pending**.

## Change and expected result

Preserve exact pinned JSON/PNG evidence across Git checkouts, use explicit UTF-8
for replay/report tooling, and add an isolated checkout regression. All previous
offline gates must remain green. No provider calls, hash replacement, source
benchmark modification, merge or deployment is part of this repair.

## Observed evidence

[Archived test output](evidence/e162de5-dual-checkout-gates.log) identifies the
frozen SHA and shows exit 0 for all six scripts under both `core.autocrlf=false`
and `core.autocrlf=true` in fresh Git checkouts:

```sh
python3 bench/test_scoring.py
python3 bench/test_extraction_safety.py
python3 bench/test_results_integrity.py
python3 bench/test_integrity_mutations.py
python3 bench/test_archived_spend.py
python3 bench/test_checkout_portability.py
```

The output reports 303 original scoring assertions, 15 extraction-safety tests,
10 integrity mutation/control tests, 3 paid-entrypoint tests and 1 checkout
regression. Integrity replays 162 unique records and 1,134 field verdicts.
These are archived results from the implementation round, not a claim of having
rerun them while writing this document.

## Limits and next owner

Windows-style Git conversion was exercised on Linux; this is not native Windows
Python execution. ARGUS supplies independent verification and platform evidence.
The visible channel references job `d4f934`, but no final verdict is supplied in
this record. Haiku remains a provisional choice from finite synthetic evidence.
Public access, real-data use and application acceptance remain separate gates.

## Subsequent reviewer finding

ARGUS subsequently reported native Windows **REVISE**: three of six gates
failed because discovered manifest paths used backslashes. See [round 07](07-windows-path-repair.md).
This supersedes the pending status above, not the archived Linux test outputs.
