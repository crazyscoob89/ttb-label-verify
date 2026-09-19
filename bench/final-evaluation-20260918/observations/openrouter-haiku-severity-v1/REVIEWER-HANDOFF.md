# Reviewer / parent handoff — OpenRouter Haiku severity v1

## Execution ownership and current state

This artifact was authored **while paid execution was running**, not after completion. Read `execution-state.json` and execute the read-only verifier below for current state; `REPORT.txt` and `report.json` are refreshed after each saved call and at terminal state.

- Sole paid owner: AVA delegated subagent.
- Tool process session: `proc_6a36d851b4fc`.
- Tool wrapper PID: `10523`; actual Python runner PID: `10527` (also recorded in execution-state.json).
- Start UTC: `2026-09-18T18:52:49.515648+00:00`.
- Expected queue: **212 unique paid requests**, represented by **252 logical fixture/condition records** across the existing 18 IDs. No repeats.
- Actual route: `https://openrouter.ai/api/v1/chat/completions`, exact model `anthropic/claude-haiku-4.5`, pinned upstream Anthropic; provider fallback disabled.
- No cron, ARGUS invocation, support contact, Git commit, publication, deployment, other-model paid call or flat rerun.
- Do not launch another runner. The process holds the shared root `run.lock` through paid execution. A reserved or attempted identity is never retried, including missing-result attempts.

## Read-only independent verification

```sh
/opt/data/asset-venv/bin/python -B /opt/data/benchmarks/ttb-foundry-20260918-v1/openrouter-haiku-severity-v1/verify.py
```

This makes no API calls and does not write the ledger. It checks frozen protocol/image hashes, original input preservation, response/request hashes and generation IDs, schema-valid rows, exact preservation of every preexisting ledger entry, current liability, PID/cmdline and lock state. During execution a reserved in-flight request can make attempt count exceed saved rows. The report checkpoint can lag live results by one request.

For terminal state require `execution-state.json` to say `terminal: true`; `status: complete` additionally requires all212 unique rows. A `bounded-stop` must retain its exact reason and attempted-unscored IDs. Do not describe a running process or partial condition report as the completed benchmark.

## Authorized budget and accounting

- Canonical ledger, not a new allowance: `/opt/data/benchmarks/ttb-foundry-20260918-v1/recovery-v3/budget.sqlite`.
- Total-inclusive ceiling: **$50**.
- Preexisting current-batch liability: **$9.06296570**, including the unchanged `inherited-incurred-and-unknown` reserve. Every old entry must remain byte-equivalent by ID/nano/status.
- Per-request conservative reservation: **$0.4565**. Basis: complete200000-token documented context at the maximum published input/cache-write rate, plus max3000 output tokens, then10% margin. No tools/search/cache directives requested.
- Only finite nonnegative provider-returned `usage.cost` settles this run's reservation. Missing cost, HTTP failure or timeout retains it in full. Retail estimates are separate and never added to provider-observed charges.
- Full context reservation is deliberately much larger than actual typical usage; it is a liability bound, not forecast or invoice.
- `budget-before.snapshot.sqlite` is a read-only evidence snapshot, **never an execution ledger**.
- `budget-authorization.before.json` preserves the prior quote/cap-only scope; the root authorization now has an additive pointer to `authorization-addendum.json`, containing Alex's exact OpenRouter authorization and delegated task.
- Only preexisting STOP was `recovery-v3/accounting-before/STOP`, a verified historical accounting snapshot. Its bytes remain untouched. Any new or changed STOP blocks execution.

## Fixture and protocol provenance

- Accepted original straight/angle bytes reused; rejected white-band glare untouched and excluded.
- Approved baseline, blur sigma1..6 and glare1..5 are rendered from documented clean parents using EXACT accepted C-SPIRITS optical geometry, seed, original intensity coefficients, cap0.65 and quantization. Each level starts from its source, not a previous degraded output.
- All12 reference PNGs exactly match the approved preview hashes. Additional independent native rerenders passed. The complete generated corpus and original images were hash-verified.
- D-BLUR maps to the original clean C-SPIRITS parent; D-GLARE maps to clean C-MALT. Those source substitutions were inherited from reviewed preview provenance, not reconstructed lettering. D-WARP retains its original perspective/mild blur and is not described as pristine.
- Clean-parent duplicates are aliases, not additional unique labels. Clean and identical straight share one request. The primary per-condition denominator is unique image bytes: clean/each severity level16; original straight18; angle18. Across all conditions there are212 unique request identities, not a sum of independent per-condition samples.
- Same original extraction system/user text, max3000 output tokens, JSON-object request, schema validator and deterministic scorer. No temperature override, output correction, schema repair or failure-row exclusion. Markdown fence stripping matches the historical adapter and raw text is preserved.
- Route pinning/no-fallback is explicitly additional to historical default OpenRouter routing. Returned provider/model are retained for every response.
- Representative native vision QA happened before any Haiku inference. The contact sheet plus native full images and1:1 detail crops were inspected. Fine warning/bottler text at sigma6 was marked uncertain. Unreviewed fields remain explicitly `not-individually-reviewed`; there is no claim of exhaustive human character inspection.

## Exact local evidence handles

All paths below are relative to `/opt/data/benchmarks/ttb-foundry-20260918-v1/openrouter-haiku-severity-v1/`:

- `REPORT.txt`, `report.json`: current per-condition correctness, field denominators, false matches/negative cases, valid referrals vs processing failures, p50/p95 request latency, confidence bins and costs; final refreshed on terminal state.
- `scored-rows.json`: every logical observation/alias scored with original truth and visibility annotation.
- `rows/`: one raw-observation record per completed unique attempt, including unsuccessful extraction/transport rows.
- `responses/`: exact raw provider bodies and HTTP error bodies; generation IDs/usage preserved.
- `attempts/`: durable-before-dispatch metadata; an atomic metadata row is also stored in canonical ledger table `openrouter_attempts`.
- `coverage.json`, `execution-plan.json`: planned aliases, coverage, settings, rates, routes, hashes and queue.
- `execution-state.json`, `execution.log`: terminal/running state and measured progress.
- `manifest.json`, `images/`: all252 controlled image records/files;212 unique byte hashes.
- `visibility.json`, `qa/`: pre-inference visibility record and QA images.
- `freeze.json`, `immutable-inputs.json`, `corpus-tests.json`, `integrity-tests.json`: protocol/source freeze and corpus checks.
- `tests-red.log`, `tests-green.log`, `tests-green-expanded.log`, `tests-final.log`, `runner-offline-tests.log`: retained test history. Final12 offline tests passed; a negative-case test fixture needed its deliberate false ABV set to the application's declared value, rather than an unrelated spirit ABV. No product behavior was weakened.
- `openrouter-models.raw.json`, `model-metadata.json`, `model-endpoints.raw.json`, `metadata-provenance.json`: retrieved pricing/capability/context evidence.
- `ledger-before.json`, `budget-before.snapshot.sqlite`, `authorization-addendum.json`, `budget-authorization.before.json`, `authorization-preflight.json`: inherited liability and approval evidence.
- `adapter.py`, `build_corpus.py`, `freeze.py`, `run.py`, `report.py`, `test_offline.py`, `verify.py`, `authorize.py`: implementation/reproduction source. Do not rerun corpus generation or authorization against frozen outputs.
- `artifact-hashes.json`: generated automatically at runner terminal state (not promised present while running).

Preserved historical comparison: `/opt/data/benchmarks/ttb-foundry-20260918-v1/recovery-v4/REPORT.txt`. Historical raw import authority: `/opt/data/projects/ttb-label-verify-revision/bench/replay.py` and frozen `raw_results.json`; hash verified. The report includes fixed repeat1 historical Haiku flat/bottle pairs without rerunning flat labels.

## Review boundaries / remaining work

At this handoff: execution was verified live with real successful provider responses, no technical blocker. Remaining work is to let the bounded queue reach completion/stop, rerun the read-only verifier, inspect the final report and have the parent/reviewer independently adjudicate results. This handoff is **not ARGUS QA PASS**; no reviewer was contacted.

Synthetic controlled-image findings are not universal confidence thresholds or arbitrary-camera validation. Confidence calibration and held-out **source-label** validation remain unperformed; sibling transforms must not leak across calibration/test partitions. An OpenRouter/Anthropic result does not prove Azure availability, customer-tenant hosting/network boundaries, or Azure latency. Timing is nonstreaming request-to-complete, not TTFT or UI end-to-end.
