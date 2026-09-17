# Stage 2 bounded audit revision

Base: `2ca813eb09c918357ed2052de5548f66fdee9fc9`.

## Scope and ownership

Alex authorized AVA to revise the three audit findings. AVA implements this
tranche; ARGUS independently reviews its frozen commit. No app implementation,
provider call, deployment, canonical-branch merge, or production engine activation
is included. Work was AI-assisted; git identity alone is not an authorship claim.

## Changes

1. **Fail-closed extraction and matching.** Both adapter and scorer validate
   field types and finite numeric component confidence. Missing/malformed or
   uncertain warning formatting refers rather than passes. Name-only bottler
   extraction cannot verify a complete declared identity/address.
2. **Evidence-backed integrity gate.** The immutable raw observations and all
   fixture files are hash-pinned. Current verdicts/classes are re-derived and
   stored separately in `replayed_results.json`; all aggregates and the complete
   report are checked against that derivation. Missing evidence fails. The gate
   no longer relies on a fixed list of 98 cached-number assertions.
3. **Honest spending/retention boundaries.** Per-instance controls/manual kill
   switches cannot pass the global-spend gate. Required buffer-only processing
   is distinct from unverified implementation and external retention. Paid
   harness/probe CLI entrypoints are disabled; no guessed quota or manual
   'verified' boolean is presented as an enforced provider cap.

## Preserved evidence and numerical impact

- `raw_results.json`, all fixture images, all ground-truth JSON and the fixture
  manifest are byte-identical to the base commit.
- No paid observations were repeated. One saved GPT warning result becomes
  `needs-review` rather than `match` because its formatting confidence is low.
- Haiku remains the sole tested zero-observed-false-match candidate that meets
  the clean automation floor. This remains finite synthetic evidence, not a
  real-world safety guarantee.
- Correct referrals now count correctly in expected-outcome accuracy, while
  referrals remain separately visible as human workload. Important correction
  to the earlier audit wording: the missing-field fixture already recorded
  `needs-review`; its prose note was stale. No fixture truth was changed.
- Current normalized extraction accuracy is separately reported, not called
  verdict accuracy or character-level OCR accuracy.
- Engine-call timing is not deployed end-to-end timing. Token-derived estimates
  are not invoice totals; the raw runner threshold was $6 inside the authorized
  $20 budget, not proof of a global hard stop.

## Reproducible offline gate

Python 3.10+; standard library only. From the repository root:

```sh
python3 bench/test_scoring.py
python3 bench/test_extraction_safety.py
python3 bench/test_results_integrity.py
python3 bench/test_integrity_mutations.py
python3 bench/test_archived_spend.py
python3 bench/run_bench.py --dry-run
python3 -m compileall -q bench
```

Observed before commit: original 303 scoring assertions pass; 15 extraction
safety tests pass; 10 integrity mutation/control tests pass; 3 paid-entrypoint
lock tests pass. Integrity replays 162 unique call records and 1,134 field
outcomes, then verifies derived data and the complete report. Compilation and
`git diff --check` pass. Initial RED failures were captured before implementation
for the scorer bypasses, raw mutation/duplicate/missing/report-row drift, and paid
CLI entrypoints. Additional adjacent regressions supplement those RED cases.

For intentional offline regeneration only:

```sh
python3 bench/reporting.py
python3 bench/test_results_integrity.py
```

## Still open, not claimed complete

ARGUS independent review; app implementation and acceptance; verified global
spending controls; tested buffer-only processing; actual provider-chain retention;
engine perception on non-bold-heading and genuinely unreadable/cropped images;
and deployed end-to-end timing. New paid testing requires separate authority and
a proven spend bound. Public provider-backed access and non-synthetic use remain
blocked by the documented gates.
