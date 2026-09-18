# Extraction Benchmark — Verified Offline Replay

Original run: 2026-09-17T21:52:37.756423+00:00. No new inference calls were made for this revision.

- Recorded observations: 162 calls; 18 synthetic fixtures; N=3; 3 engines.
- `raw_results.json` preserves the original parsed extractions, usage, and historical verdict caches byte-for-byte. It is not a verbatim provider-response archive.
- `replayed_results.json` contains current-rule verdicts and their explicit changes from the original run; `analysis.json` is recomputed from that replay.
- `evidence_manifest.json` pins the raw file and every fixture image/ground-truth file; the required gate rejects missing, changed, duplicate, or incomplete evidence.

## Current-rule comparison

| Engine | False matches / negative outcomes | False matches / all outcomes | Referrals | Clean automation | Unstable fixtures | Median engine-call s | p95 individual-call s | Token-derived USD |
|---|---|---|---|---|---|---|---|---|
| gpt-5-mini | 2/24 (8.33%) | 2/378 (0.53%) | 7/378 | 84/84 (100.0%) | 2 | 11.61 | 15.55 | $0.148198 |
| claude-haiku-4-5 | 0/24 (0.00%) | 0/378 (0.00%) | 6/378 | 84/84 (100.0%) | 0 | 4.00 | 4.34 | $0.231611 |
| claude-sonnet-4-5 | 3/24 (12.50%) | 3/378 (0.79%) | 13/378 | 84/84 (100.0%) | 1 | 5.71 | 6.43 | $0.682026 |

Median engine-call latency is the median of each fixture's N=3 median. p95 uses the ordered individual call observations (floor-index 0.95*(n-1)). Neither includes browser upload, app intake, deterministic rule execution, or result rendering; the deployed ~5-second target is not certified here.

## Separate accuracy measures

| Engine | Normalized extracted-value accuracy | Recorded expected-outcome agreement | Expected safe-outcome accuracy | Adversarial warning correct | Failed calls |
|---|---|---|---|---|---|
| gpt-5-mini | 376/378 | 375/378 | 375/378 | 7/9 | 0 |
| claude-haiku-4-5 | 378/378 | 378/378 | 378/378 | 9/9 | 0 |
| claude-sonnet-4-5 | 368/378 | 368/378 | 368/378 | 6/9 | 1 |

Extracted-value accuracy compares observations with constructed label_actual, not applicant declarations or model confidence. Seven fields are evaluated; a warning is correct only when heading/case, normalized body words, and all three boolean formatting properties agree. Other text uses case/punctuation normalization. Null is correct only for a constructed absent field. This is not character-level OCR accuracy; it is independent of verdict accuracy.
Recorded expected-outcome agreement uses the unchanged fixture expected map. Despite a stale explanatory note claiming otherwise, A-FIELD-MISSING-01 already records needs-review for its two absent fields; those correct referrals were previously excluded by the aggregate correct counter. Safe-outcome accuracy explicitly expects referral for absent required observations and agrees with the recorded map on this corpus. No source truth has been redefined to inflate accuracy. Correct referrals are human workload, not false matches or false mismatches. Physical warning type size is a separate mandatory human check and is excluded from these seven-field statistics.

## Explicit replay changes

1 field verdict(s) changed under the corrected validation/confidence rules:
- gpt-5-mini / W-BRAND-WRONG-01 / repeat 2 / government_warning: match → needs-review.

No source extraction, usage observation, fixture image, or fixture semantic truth was altered to produce these changes.

## Engine recommendation

**Provisional recommendation: claude-haiku-4-5**. It is the only tested candidate with zero observed false matches and at least 60% clean-field automation under the corrected rules.

Zero observed false matches is a finite-test observation, not proof of zero real-world errors. The bold-body warning fixture explains the recorded false matches; the clean control and bold-body variant were visually reviewed. One injection phrase does not demonstrate general prompt-injection immunity.

## Cost and routing limits

- Sum of per-call rounded token-derived estimates: $1.061835; original unrounded accumulator recorded $1.061848. The small difference is per-call rounding.
- The original report additionally stated $0.0200 for a probe and $0.0773 for smoke validation, producing a reported rounded total of $1.1591. Their per-call records are not present here; this combined figure is not independently verified or an invoice total.
- The recorded runner estimator threshold was $6.00, within the authorised $20 overall budget. Its per-process estimate and headroom were not proof of an account-wide hard cap. Unknown timeout charges are not zero-cost evidence.
- Anthropic candidates used OpenRouter; GPT-5-mini used the direct OpenAI Responses API. These are different transport paths. Pricing constants are historical assumptions, not newly verified provider quotations.
- Paid benchmark execution is disabled in this archived revision; --dry-run remains available. No automated rerun is authorised by regenerating evidence. Before a future paid run, establish a proven spending bound including failures and previously incurred spend.

## Remaining acceptance boundaries

- A non-bold warning heading and unreadable-value behavior are covered by offline rule regressions, not new image-based engine observations. Non-bold-heading and genuinely unreadable/cropped image extraction remain untested by this run.
- No web app, production deployment, public-access spending cap, provider-retention validation, or deployed end-to-end latency acceptance is implied.
- Public provider-backed access remains disabled until a verified enforced account/key cap or tested shared global quota exists. Manual kill switches and per-instance quotas cannot substitute.
- Application processing must be verified buffer-only; synthetic offline fixtures/results intentionally persist on disk. Browser, platform, OpenRouter and upstream-provider handling require separate disclosures. Synthetic-only until actual route retention is verified.

## Reproduction

```sh
python3 bench/reporting.py
python3 bench/test_results_integrity.py
python3 bench/test_integrity_mutations.py
```

Generation is offline and preserves the immutable input evidence. The required integrity gate independently recomputes current verdicts, all derived records, aggregates and this complete rendered report; missing evidence fails rather than skips.
