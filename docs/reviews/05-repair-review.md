# Round 05: independent repair review and checkout diagnosis

- Candidate: `eec5da7fb4e7e1c55b7726cbb225bb2161de8ce9`.
- Implementer: AVA. Reviewer: ARGUS / his reported review job.
- Verdict: **REVISE**, as supplied by Alex and ARGUS in the project channel.
- Provenance: this is an attributed reconstruction of the visible channel
  finding, not the original full reviewer artifact or a fresh independent rerun.

## What the reviewer accepted

The relayed report confirmed the fail-closed extraction safeguards, corrected
spend/retention documentation, and mutation-sensitive evidence integrity gate.
It reported preserved raw evidence, no paid calls, and an unchanged provisional
Haiku recommendation.

## Blocking finding

The required integrity gate and two claimed tests failed in the review checkout
on untouched evidence. The initial diagnosis was an incorrect hardcoded SHA-256.
The result was a real reproducibility failure: an unqualified all-gates-pass
statement did not cover the reviewer's checkout. The gate could not be closed.

## Root-cause correction, not dismissal of the finding

AVA reproduced Git LF-to-CRLF conversion with `core.autocrlf=true`.
The committed blob's fingerprint was correct; Git transformed checkout bytes.
The transformed hash matched the reviewer-reported fingerprint.

- Committed LF: `1b7fa04ba503de42ece3bcc382232fe2f5ccc19435f365eaf48ab9ce01efbcc0`.
- Transformed CRLF: `67167d2513ee4409979c28d4ab9828cd321b13977e9df3cb54cfde182776e300`.
- [Failing integrity output](evidence/portability-integrity-red.log).
- [Failing new checkout regression](evidence/portability-regression-red.log).

Replacing the fingerprint with a checkout-specific hash would break LF validation
and misidentify transformed bytes as the original evidence. The chosen repair
preserves evidence bytes with Git attributes and makes text I/O explicitly UTF-8.
Neither the raw data nor its pinned fingerprint was changed.

## Resolution and closure

- Resolution candidate: `e162de5373ce3ecdfd67b0e96085327df67abf31`.
- Builder evidence: [round 06](06-portability-validation.md).
- Severity: blocking required release gate (record-owner classification;
  no numerical severity was supplied in the relayed reviewer text).
- Independent closure: **pending**. Do not rewrite this historical REVISE as PASS.
- Management lesson: document the platform and checkout assumptions with every
  green-gate claim; test byte-sensitive evidence under Git conversion settings.
