# Archived review report

Source: AVA artifact `ttb-audit-2ca813e.txt`. Copied into the repository retrospectively.
This records the verdict at that candidate, not current project approval.
Historical file line references apply to the reviewed SHA.

**Subsequent factual correction:** the original missing-field fixture already expected `needs-review`; the audit statement that it encoded mismatch was mistaken. See `docs/STAGE2_REVISION.md`. The original report below is preserved, not silently edited.

```text
TTB LABEL VERIFY — AVA CONSOLIDATED REVIEW
Planning candidate: 3702c905fd07d3eeb69f26e4760c9de2d3198d5b
Benchmark candidate: 2ca813eb09c918357ed2052de5548f66fdee9fc9
Verdict: REVISE. Preserve the benchmark evidence and provisional Haiku recommendation; this is a bounded repair tranche, not a restart.

SCOPE / PROVENANCE
Retrieved both exact commit snapshots through authenticated read-only GitHub GETs. No repository edits, pushes, deployments or paid inference calls. Ran offline tests locally and mocked adapter responses in memory. Inspected the bold-body fixture and clean wine control visually; did not visually review every fixture. Four planning documents are byte-identical between the two candidates.
Local snapshots: /opt/data/reviews/ttb-3702c90 and /opt/data/reviews/ttb-2ca813e
Source hash manifest: /opt/data/artifacts/ttb-audit-2ca813e-source-sha256.txt

VERIFIED / KEEP
- Reproduced 303 scoring assertions and 98 report-integrity checks, all passing.
- Confirmed 162 unique engine/fixture/repeat records; 54 calls per engine.
- Re-derived every stored verdict and class from extracted values plus committed fixture application/expected records: zero differences. Recomputed analysis.json in memory: identical to committed file.
- On this finite synthetic matrix, Haiku has 0 observed false matches; GPT-5-mini has 2; Sonnet has 3. All five observed false matches concern the bold warning body. Visual inspection confirms the bold-body fixture differs from its non-bold clean control.
- Haiku's reported approximately four-second median and 100% clean-subset automation are supported by the recorded data and committed formulas. This is provider-call benchmarking, not deployed app acceptance.
- Token-derived recorded main-run costs sum to $1.061835. The report's $1.1591 additionally includes stated probe/smoke costs; the downloaded tree does not contain their per-call records, so that aggregate was not independently invoice-verified. A timeout can still incur provider cost; zero recorded usage is not proof of zero billing.
- Previously accepted ABV consistency, module separation and application logging allowlist are not reopened.

ONE CONSOLIDATED REPAIR TRANCHE

1. HIGH — FAIL-OPEN VALIDATION AND PARTIAL-ID MATCHING
Files: bench/engines.py:38-50,378-387; bench/scoring.py:148-173,234-245,264-300,319-362.
The adapter marks a payload schema_valid merely because keys exist. It does not validate value types or require the confidence map. The scorer treats missing confidence as confident and ignores confidence on warning boldness/caps flags. Identity checks against booleans also allow string-valued flags to evade intended formatting checks.
Executed end-to-end mocked-adapter reproductions, using the clean-wine oracle payload:
(a) Delete confidence -> schema_valid=True, government_warning=match.
(b) Set heading_bold='false', body_bold='true', heading_all_caps='true' -> schema_valid=True, government_warning=match.
(c) Set confidence.government_warning_body_bold=0.01 -> government_warning=match.
Separately, rule_bottler({'bottler_info':'Harbor Cellars'}, {'bottler_info':'Harbor Cellars, 999 Wrong Road, Miami FL'}) returns match. Reverse substring matching treats a name-only extraction as verification of an unverified full declared name/address.
Required closure:
- Validate string/null and boolean/null types; require valid finite, non-boolean numeric confidence in [0,1] for each evaluated component, or refer the affected field.
- Include every load-bearing warning formatting flag in its confidence gate; missing/unknown/malformed confidence must not pass.
- Compare required bottler entity/address components without allowing a shorter extracted fragment to verify the whole declaration. Unreadable components refer; known different components mismatch.
- Add offline regressions for these exact cases. Re-score preserved raw extractions after the change and report any changed metrics. Do not spend again merely to recompute.
These findings do NOT establish that the existing Haiku recorded calls contain those malformed payloads. They establish that the benchmark rules are not yet safe to reuse as the app's fail-closed comparison layer.

2. HIGH — ORIGINAL SPEND/RETENTION PLANNING CLOSEOUT IS STILL OPEN
Files: docs/THREAT_MODEL.md:169-201,263-309,353-386; docs/PLAN.md:227-245.
The new verified-provider-cap gate is an improvement, but its fallback at THREAT_MODEL.md:184-196 permits a manual environment kill switch plus a PER-INSTANCE daily quota to pass the public-access gate. That does not supply the cross-instance spend ceiling the same document requires. The earlier closeout explicitly excluded this substitution.
Retention now acknowledges the external provider, but THREAT_MODEL.md still promises absolute memory-only/zero-file behavior while allowing library temporary files. That is not the requested honest single policy. Library behavior must be chosen and verified, not simultaneously denied and permitted.
Required closure:
- Public provider-backed access stays disabled until a verified enforced provider cap OR shared atomic quota/other proven global bound is in place. Manual disablement/per-instance throttling remain defense in depth, not substitute acceptance.
- Choose buffer-only processing, or disclose and verify actual ephemeral behavior. Scope all no-storage wording to application-controlled handling; document platform, browser and actual provider chain separately. This benchmark used OpenRouter, so disclosure cannot name only Anthropic.
- Retain synthetic-only data until the selected route's retention is verified.
- Do not claim the benchmark runner proves a global $20 cap: run_bench.py:106-135 resets spend per invocation and uses $0.05 guessed headroom; engines.py:347-355 assigns zero cost to uncertain failures. For future paid runs, reserve a justified worst-case per-call allowance including failures and prior authorized spend, or use a verified account/key hard cap. This review does not authorize another paid run.

3. HIGH FOR THE CLAIMED RELEASE GATE — INTEGRITY CHECK CAN REPORT FALSE GREEN
Files: bench/test_results_integrity.py:35-54,69-105; bench/analyze.py:46-54,122-159.
The integrity test checks cached metrics against hardcoded expected numbers and selected text tokens; it does not re-derive verdicts/classes from raw extractions and fixture truth. Executed in-memory mutation: change Haiku's C-WINE-01 extracted brand to WRONG BRAND while leaving its cached match unchanged. All 98 checks still pass and print 'every figure traces to recorded data.' No committed file was modified for this test.
Required closure:
- Inside the integrity gate, rescore every raw record against the fixture application/expected data and compare every stored verdict/class; verify unique expected engine/fixture/repeat coverage.
- Recompute aggregates and compare against analysis.json and the report's corresponding cells, rather than checking that numbers appear somewhere in the document.
- Missing required benchmark evidence must fail the required integrity gate, not return successful SKIP (lines 35-39).
- Regression: the demonstrated raw-brand mutation must make the gate fail.
The current committed raw rows DO reconcile when checked independently; the defect is the gate's claimed protection against future drift, not demonstrated corruption of the current results.

COMPLETE THE ORIGINAL REPORT CONTRACT WITHIN THAT TRANCHE
Not a new architecture or demand for a new paid benchmark:
- BENCHMARK_PLAN.md:125-127 still conflates extracted-value accuracy and verdict accuracy. Report a separate extraction metric using label_actual, and label verdict accuracy separately. Do not rename verdict correctness as OCR accuracy.
- Preserve the N=3 and >=60% clean automation floor already added; these close those two earlier planning requests.
- Missing-field referral is now a defensible explicit runtime decision, but fixture expected truth still encodes mismatch; separate correct referral from errors in accuracy reporting, without relabelling raw observations silently.
- The earlier requested non-bold-heading and genuinely unreadable/cropped cases are not demonstrated by the present manifest. Treat their engine behavior as untested, not passed; add offline rule regressions now. Any new paid extraction evaluation needs existing budget authority confirmed, not an automatic rerun.
- False-match percentages currently divide by all 378 outcomes. Report that denominator explicitly (as the report does), and preferably show negative-conditioned counts too: GPT 2/24=8.33%, Haiku 0/24, Sonnet 3/24=12.5%. Do not describe 0 observed errors on this matrix as zero real-world risk.
- engines.py:328-331 stops its latency clock at provider return, before deterministic scoring and without app upload/intake/UI. Label these engine-call measurements; deployed end-to-end ~5-second acceptance remains for the app stage. This limitation does not reverse the measured ranking.
- raw_results.json stores parsed extraction plus usage/scoring fields, not complete verbatim provider responses; adjust the report's provenance wording accordingly.

ENGINE / OWNERSHIP / STOP CONDITION
Haiku remains the evidence-supported provisional choice for this tested configuration. No reason found to throw away the run or automatically pay to repeat it. Full planning/benchmark closure is not PASS until the bounded items above are resolved.
Alex's role swap stands: AVA owns the next authorized implementation/repair tranche; ARGUS performs one consolidated review of its frozen SHA. This review did not start the app or select a paid production route on Alex's behalf. Engine approval and app execution remain the next human gate.
After repair, review the repair diff and affected invariants only; do not reopen accepted unrelated architecture.

SCHEDULE CORRECTION
September 23, 2026 is Wednesday, not Tuesday. The actual take-home submission deadline must be checked against its controlling brief/email; this audit did not verify that deadline. Do not substitute the separate application deadline from remembered summaries.
```
