# 16 — Final benchmark publication repair

## Executive disposition

Alex correctly identified a publication gap: the supplied master baseline
`38406c12ac575c06ed55370148f907e45782ad33` contained older benchmark/initial
corpus evidence, but not the completed Azure/Haiku severity comparison. AVA
prepared this additive evidence-only candidate from that exact baseline on
`ava/final-benchmark-publication`, in a separate native worktree. This record
is the publication owner's account, **not an independent empirical review**.

**Primary deliverable:** [final results, timing, cost and model decision](../deep-dive/BENCHMARK-RESULTS.md).
[Complete versioned archive](../../bench/final-evaluation-20260918/README.md).

This worker's scope ends at a local commit. Parent owns independent checks and
any authorized GitHub publication/promotion. No push, merge, HTTP publication,
paid/live inference, ARGUS call or application edit was performed here. The
existing Phase 2 checkout and frozen Phase 3 worktree were not changed. Human
publication authorization is separate from this worker's no-remote-write limit.

## What was repaired and why

- Visible root README and benchmark landing navigation now lead to the final
  seven-engine evidence rather than implying older flat results are current.
- Full final Azure/Haiku requests, attempts, raw failed/successful responses,
  saved rows/scoring, manifest/freeze/coverage and timing/usage are archived.
- Approved severity ladder and complete paid image battery are mapped with
  truth/source/generator/version evidence. Rejected opaque glare remains
  historical occlusion. Exact shared image bytes target existing paths.
- Earlier control rows, continuation snapshots, RED/GREEN logs, pricing repair,
  original caps/authorization, shared ledger and model-decision evidence remain
  traceable. Newer source files are additive versions, not overwrites of old Git
  records. Frozen runner sources use `.py.txt`, not runnable default entrypoints.
- A new stdlib-only read-only verifier resolves paths relative to the checkout,
  never imports old scripts or opens original absolute filesystem locations.
  It reproduces saved-score aggregates, not a hidden paid run or re-score.

## Source bytes, derived bytes and privacy

The [source map](../../bench/final-evaluation-20260918/source-map.json) records
original paths/SHA-256/bytes and published targets/SHA-256/bytes. Observations,
raw bodies, images, scored rows and SQLite snapshots retain exact bytes.
Six source JSON records have **only `$.processes` removed**, excluding unrelated
host command lines; these are declared sanitized derivatives. Their original
hashes are historical attestations from the copy operation, not hashes a reviewer
can reconstruct from removed process text. No benchmark body was redacted.

The copy audit required no open source-ledger descriptor, no WAL/journal,
`mode=ro&immutable=1` integrity check, and unchanged ledger bytes before/after.
All included source file hashes were rechecked after copying. Original SQLite
files were never opened for writes, and no source runner/ledger code was run.

Omissions are explicit: caches, locks, prior publication-worker operational
metadata; a directory-only `fixtures` reference (individual required files are
mapped); and an opaque inherited Git bundle (not canonical inference evidence,
redundant to explicit observations/scorer files and potentially unrelated old
configuration). No secret config, private general chat or unrelated legal/client
material is intended for publication. Original ZIP previews are preserved and
scanned inside their members, not blindly exempted as binary blobs.

The source tree remains authoritative and untouched. This archive does not
supply the missing original raw bodies for 99 historical log-only ARGUS
completions and does not manufacture an original independent review transcript.

## Reconciled results and material interpretation corrections

- Azure: 1,073 new planned/attempt/raw/row identities, zero missing; 199 unique
  controls reused. The new queue is 1,056 severity calls plus 17 Kimi controls.
  All new HTTP statuses are 200, with **102 invalid processing results**. The
  empty `failures_by_model` state field is not a quality-success summary.
- Haiku: 212 unique observations, 206 valid, six failures, 148 preserved plus 64
  continuation observations, no replay. Two HTTP 502 + **four** HTTP-200 invalid
  outputs. Final prose's “three schema-invalid” refers to the earlier subset,
  not the final total. Identical 502 body bytes do not mean duplicate requests.
- Canonical aggregates match the supplied decision report: 212 unique images
  per engine, 1,484 field opportunities and 104 negative fields. Clean/straight
  aliases are not additional paid calls. All failures stay in denominators.
- Shared final liability: $15.22049510 / $50 total; Haiku $0.89336115 usage cost
  is already included. Azure new retail estimate is $4.35116825. Reservations,
  retail estimates, provider-returned costs and invoices remain distinct.
- Original Azure JSON float tails differ below displayed monetary precision;
  derived summary quantizes the sum to eight decimals, without touching rows.
- Timing is request-to-completion, including failures; p95 is linearly
  interpolated. No all-seven-within-five-seconds or app-timing claim.

## Review attribution, independent checks and missing proof

The saved model decision report attributes a second benchmark PASS relayed by
Alex: coverage/hash/accounting checks and sampled scoring/false-match
adjudication, not full raw-response frozen-scorer replay. The complete original
reviewer artifact is unavailable here. Preserve this as **reported attribution**,
not a newly reproduced ARGUS verdict. Recent ARGUS Phase 2 PASS is application
source review and must not be confused with benchmark review.

Publication verifier scope: hashes and source mappings, freeze identities,
queue/raw/row/coverage and aliases, control reuse, image/truth closure,
continuation preservation, every condition's saved metrics, canonical aggregate
recomputation and immutable ledger arithmetic/prior-entry preservation.

Required publication gates: standalone verification, negative tests, empty-env
foreign-cwd execution, generated local links, token/known-secret scan, exact
changed-path and old-tree preservation, staged byte identity, and cold-checkout
verification. Gate execution status is recorded below after running them.

Not established: full raw-response frozen-scorer replay, real-camera/unseen-label
qualification, calibration, exhaustive visual readability, production security,
Azure Claude/customer-firewall feasibility, end-to-end application timing or
invoice reconciliation. Human confirmation is a proposed reliance control,
not a statistical repair or a pass of the old zero-false-match criterion.

## Builder gate results

- **PASS — standalone coverage/integrity/aggregate verifier** and **9/9 verifier
  tests**, including genuine mutation rejection and empty-environment foreign-cwd
  execution. [Captured builder test output](../../bench/final-evaluation-20260918/publication-checks/network-denied-tests.log).
- **PASS — cold staged-tree checkout**, with the same nine tests under kernel
  socket denial. Linux `unshare -n` was unavailable (`Operation not permitted`);
  a libseccomp syscall-denial wrapper with a positive EPERM control was used
  instead, inherited by subprocesses. [Validation wrapper source](../../bench/final-evaluation-20260918/publication-checks/linux-network-denial-wrapper.py.txt)
  is reference evidence; the portable verifier itself needs no libseccomp.
- **PASS — generated/navigation local links**, all 6,790 included source
  hashes rechecked, and **1,998 unchanged baseline files** byte-compared to Git.
  Only the two navigation files that existed at baseline were modified; other
  publication paths are additions. No application/governance implementation changed.
- **PASS — exact staged-path allowlist and index/worktree byte identity**;
  ignored evidence was force-added only by an enumerated log-file allowlist.
  All files remain below the native 100 MB limit; no LFS was added.
- **PASS — secret checks**, scanning all new files, mapped shared files and
  original ZIP members against 14 locally available credential values and
  bounded token/header/private-key patterns; no hits. Positive controls passed.
  [Value-free scan record](../../bench/final-evaluation-20260918/security-scan.json).
- **PASS — strict authored-code/document whitespace.** Full raw-evidence
  `git diff --check` intentionally still reports **716 trailing-whitespace
  diagnostics in 356 original response files** (provider padding blank lines),
  not newly authored defects. CRLF allowance alone does not remove these.
  [Exact path/hash adjudication](../../bench/final-evaluation-20260918/publication-checks/whitespace-adjudication.json)
  proves the original bytes were preserved; none were normalized for green QA.

Publication-tool issues encountered and corrected: per-file `git show` baseline
comparison timed out, replaced with batched blob reading; SQLite connection
resource warnings fixed with explicit closing; generated index EOF blank lines
removed. These affected only new publication tools/docs, never benchmark source,
raw responses, scores or images. The original float-tail issue is explained
above. No empirical metric discrepancy was found in saved-score reconciliation.

The final source/documentation candidate is reverified after this record update.
Parent must independently inspect and publish the resulting commit; this record
is neither a claim that GitHub master has advanced nor a merge/deployment receipt.
