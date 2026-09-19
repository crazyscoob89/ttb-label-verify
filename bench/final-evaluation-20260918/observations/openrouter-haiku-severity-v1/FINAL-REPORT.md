# Haiku OpenRouter severity — final bounded continuation report

Generated 2026-09-18T19:18:51.404249+00:00

**State: complete / queue-complete.** Saved 212/212 unique requested observations; 0 unattempted; 0 attempted without a saved row. Logical alias coverage 252/252.
Continuation added 64 of 64 unattempted glare-2 through glare-5 observations. 0 new transport failures. No previous request was retried; all prior 148 rows, attempts and responses and all 456 prior ledger entries are exactly preserved.

## OpenRouter → Anthropic only
Model `anthropic/claude-haiku-4.5`. Route `https://openrouter.ai/api/v1/chat/completions`. No provider fallback, automatic retries or paid smoke request. Historical two HTTP 502s and three schema-invalid responses remain failures.
Unique-request aggregate: 1394/1484 normalized fields correct (93.94%); 172/212 requests have every field correct. 206 schema-valid extractions; 6 processing failures.
False matches: 1/104 negative fields, across 1 requests. Valid referral calls: 26; valid referral fields: 39; failure-referral fields: 42. Failures are incorrect, not successful referrals.
Request-to-complete latency (all saved calls): p50 4.230s / p95 5.339s. Not TTFT or UI latency.

### By condition
Calls below deduplicate image bytes within each condition. Aliases across clean/straight share observations: do not sum condition calls as independent paid requests. Accuracy includes all failures as incorrect.

| Condition | Calls | Correct fields | Accuracy | False matches / negative fields | Valid referral calls | Failures | p50 / p95 s |
|---|---:|---:|---:|---:|---:|---:|---:|
| clean | 16 | 111/112 | 99.11% | 0/8 | 1 | 0 | 4.243 / 4.672 |
| straight | 18 | 125/126 | 99.21% | 0/8 | 1 | 0 | 4.250 / 4.664 |
| angle | 18 | 126/126 | 100.00% | 0/8 | 1 | 0 | 4.343 / 4.804 |
| blur-1 | 16 | 111/112 | 99.11% | 0/8 | 1 | 0 | 4.296 / 4.776 |
| blur-2 | 16 | 112/112 | 100.00% | 0/8 | 1 | 0 | 4.213 / 4.943 |
| blur-3 | 16 | 110/112 | 98.21% | 0/8 | 1 | 0 | 4.216 / 5.465 |
| blur-4 | 16 | 108/112 | 96.43% | 1/8 | 1 | 0 | 4.810 / 7.249 |
| blur-5 | 16 | 104/112 | 92.86% | 0/8 | 4 | 0 | 4.225 / 6.304 |
| blur-6 | 16 | 62/112 | 55.36% | 0/8 | 11 | 4 | 4.216 / 11.940 |
| glare-1 | 16 | 103/112 | 91.96% | 0/8 | 1 | 1 | 4.188 / 13.714 |
| glare-2 | 16 | 110/112 | 98.21% | 0/8 | 1 | 0 | 4.185 / 4.726 |
| glare-3 | 16 | 111/112 | 99.11% | 0/8 | 1 | 0 | 4.239 / 5.078 |
| glare-4 | 16 | 102/112 | 91.07% | 0/8 | 1 | 1 | 4.210 / 4.668 |
| glare-5 | 16 | 110/112 | 98.21% | 0/8 | 1 | 0 | 4.158 / 4.301 |

### Cost and liability (USD)
- OpenRouter provider-reported usage.cost: **$0.89336115**, known for 210/212 requests. Continuation increment: $0.27264699.
- Separate retail token estimate: $0.90238500; do not add to provider-reported cost.
- OpenRouter unresolved reservations: **$0.91300000**; original $0.913 is retained, never cleared.
- OpenRouter liability: $1.80636115. Inherited earlier batch liability: $9.06296570.
- Canonical shared ledger total: **$10.86932685 / $50 TOTAL**. Liability is not an invoice.

## Azure / Foundry — separately preserved historical lane
No Azure, Kimi, historical-flat or other model calls were made in this continuation. The immutable prior Azure/Foundry report remains `../recovery-v4/REPORT.txt`; its original budget-cap wording describes that earlier phase, not the current $50 authorization.
That prior report records five deployments completing 18 straight + 18 angle calls each; Kimi only 10 straight + 9 angle, with 17 unattempted then. All six tested Foundry deployments had at least one angle false match. Its old white-band glare results are rejected occlusion controls, not the corrected severity corpus. Its $2.11716390 observed estimate plus approximately $0.024 rounded smoke costs and unresolved charges are historical accounting, not new OpenRouter spend. Do not add them again to inherited/shared liability.
Historical Haiku flat reference: 378/378 normalized fields, 0/24 negative-field false matches, p50 4.001s / p95 4.342s. That was OpenRouter → Anthropic, not Azure. It was not rerun.
This Haiku severity phase supplies new OpenRouter evidence only; it does not close Azure coverage gaps, establish Azure availability/compliance/latency, or complete real-camera/held-out validation. The earlier report’s statement that Haiku had no bottle results is historical and superseded only by the present OpenRouter results.

## Integrity, tests and operational recovery
Raw historical HTTP error bodies both contain only `error code: 502`; no auth/billing/rate-limit explanation was present. The initial runner was stopped and shared lock free before continuation.
The original runner counted all historical transport failures and could not resume as-is. Only `run.py` gained an explicit one-use `--continue-once` guard and its entry in `freeze.json` was updated. The old versions are preserved under `continuation-1-before/`. The consumed authorization marker prevents a second continuation. Model/adapter/fixture/prompt/schema/scorer and historical evidence hashes were not changed.
Regression sequence: `test_continuation.py` RED (3 failures / 4 tests: missing one-use support), then GREEN (4/4). Existing `test_offline.py`: 12/12 pass. Both suites deny network; temporary ledgers only. Existing `verify.py`: PASS. Exact command prefix: `/opt/hermes/.venv/bin/python -B` followed by the absolute script path in this directory.
Execution: session `proc_41783bb8206d`, PID `20865`; terminal=True; verified process exited and shared lock released.

## Evidence
- `REPORT.txt`, `report.json`: complete frozen-scoring per-condition/per-field metrics and historical context.
- `scored-rows.json`, `coverage.json`, `rows/`, `attempts/`, `responses/`: observation-level evidence, aliases, failures and raw responses.
- `continuation-final-audit.json`: unique-request aggregate, exact preservation checks, failure identities, false matches and any missing denominators.
- `final-verification.json`, `execution-state.json`, `continuation-1-execution.log`: terminal state and independent verification.
- `continuation-1-before/`: prior report/state, source versions, 148 rows/attempts/responses, ledger backup and preservation hashes.
- `continuation-tests-red.log`, `continuation-tests-green.log`, `continuation-offline-tests.log`, `runner-offline-tests.log`: test evidence.
- `../recovery-v3/budget.sqlite`: sole canonical shared ledger.

## Limitations
Synthetic controlled renders, not universal photo accuracy or confidence thresholds.
No calibrated threshold or held-out evaluation completed; hold out source labels, never sibling transforms.
Per-condition denominators dedupe identical bytes; the same observation can serve clean and straight with explicit provenance. Do not sum conditions as independent paid calls.
OpenRouter -> Anthropic only. Results do NOT establish Azure tenant availability, hosting, network compliance or latency.
Latency is nonstreaming request-to-complete, not TTFT or UI latency.
Visibility is pre-inference representative native QA plus explicitly labelled unreviewed fields, not exhaustive human character inspection.

**Requested Haiku severity request coverage is complete; failures remain failures. This is not completion of the wider cross-provider or real-camera experiment.**
