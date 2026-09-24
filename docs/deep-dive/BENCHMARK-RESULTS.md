# Final benchmark results — Azure, Haiku and severity battery

**Start here for the completed September 18, 2026 tests.** The older root
`bench/RESULTS.md` and `bench/ava-foundry-v3/` are historical, not the final
seven-engine comparison. This is a versioned evidence publication, not a new
paid run, application change, deployment or invoice reconciliation.

## Decision in plain English

**Haiku + human confirmation is the prototype recommendation for the fast
external-provider lane, not an unattended-approval claim.** Azure Mistral
Document AI remains the Azure-specific alternative to evaluate, with explicit
warning-format review. GPT-5 mini has the highest saved field accuracy but its
model call alone misses the five-second priority. Every engine made at least
one false match. Requiring human confirmation of every final decision mitigates
reliance; it does not increase measured model accuracy or satisfy the original
internal zero-false-match gate retroactively.

The source assignment asks for **about five seconds**; Alex's selection priority
is five seconds or less. Model-call median is only a screening measure. **No
route demonstrates upload-to-displayed-result timing, customer-firewall
compatibility or production qualification in this benchmark.** OpenRouter
Haiku is not Azure Claude availability evidence. Azure Claude remained unresolved.

Decision source and requirement mapping: [MODEL-PROJECT-COMPARISON.txt](../../bench/final-evaluation-20260918/decision/MODEL-PROJECT-COMPARISON.txt); controlling assignment snapshot: [assignment-source.md](../../bench/final-evaluation-20260918/decision/assignment-source.md). The source report shortlisted two feasibility routes; the human-confirmed Haiku lane is a workflow recommendation, not a new empirical result.

## Canonical current scorecard

| Model / measured route | Calls | Correct fields / 1,484 | Accuracy | False matches / 104 negatives | Processing failures | p50 / p95 seconds | Retail estimate / 1,000 known-cost calls | Cost-known calls |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Haiku 4.5 — OpenRouter → Anthropic, chat | 212 | 1394 | 93.94% | 1 | 6 | 4.23 / 5.34 | $4.30 | 210/212 |
| Grok 4.1 Fast non-reasoning — Azure, chat | 212 | 1259 | 84.84% | 13 | 13 | 4.69 / 6.65 | $0.62 | 212/212 |
| GPT-4.1 mini — Azure, chat | 212 | 1204 | 81.13% | 6 | 39 | 6.22 / 7.49 | $1.29 | 212/212 |
| Mistral Large 3 — Azure, chat | 212 | 1389 | 93.60% | 11 | 2 | 6.66 / 17.83 | $1.97 | 212/212 |
| GPT-5 mini — Azure, Responses | 212 | 1463 | 98.58% | 12 | 1 | 10.99 / 14.28 | $2.78 | 212/212 |
| Kimi K2.6 — Azure, chat | 212 | 1107 | 74.60% | 4 | 53 | 21.89 / 35.99 | $13.63 | 212/212 |

### Separate OCR pipeline (not an identical model interface)

| Model / measured route | Calls | Correct fields / 1,484 | Accuracy | False matches / 104 negatives | Processing failures | p50 / p95 seconds | Retail estimate / 1,000 known-cost calls | Cost-known calls |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mistral Document AI 2512 — Azure, separate OCR annotation endpoint | 212 | 1454 | 97.98% | 13 | 0 | 4.30 / 5.05 | $3.00 | 212/212 |

All engines: **212 unique image/request observations**, **1,484 seven-field
opportunities**, **104 known-negative field opportunities**. Failures remain
incorrect in every field denominator. These are correlated transforms of 18
source fixture IDs, not 212 independent real-world labels. Model names above
refer to the exact tested configurations, not family-wide claims.

- p50 is the median; p95 uses linear interpolation at `(n−1) × 0.95` on sorted
  saved `latency_s`. All attempts, including failures, are included. This is
  nonstreaming request-to-completion, **not TTFT or full application latency**.
- Cost/1,000 is extrapolated from **recorded retail estimates / calls with known
  cost × 1,000**. It excludes unknown failed-call charges, not assumes them free.
  It is not a current price quote, usage invoice or production-cost guarantee.
  Hosting, storage, retries and human-review labor are excluded.
- Seven fields: brand, class/type, alcohol content, net contents, bottler/address,
  origin and government warning. Extraction correctness is not whole-label
  correctness, regulatory certification or physical font-size verification.
- Alias-aware aggregation uses Azure `comparison_attempt_id` and Haiku `id`;
  checks each engine has 212 distinct image hashes; compares every condition
  against the saved comparison. **Do not sum clean + straight tables.**

Reproduce all values (including valid-only latency, calls within five seconds,
all-seven-correct counts, referrals and per-field numerators) with the portable
[offline verifier](../../bench/final-evaluation-20260918/verify.py):

```sh
python3 -B bench/final-evaluation-20260918/verify.py
python3 -B bench/final-evaluation-20260918/verify.py --json
python3 -B bench/final-evaluation-20260918/test_verify.py
```

These commands need only Python 3.10+ standard library, saved repository files,
and no credentials/network. An absolute path to `verify.py` works from any cwd.
They do not execute archived runners, regenerate observations or replay the scorer.

Saved input support: [azure-severity-v1/scored-rows.json](../../bench/final-evaluation-20260918/observations/azure-severity-v1/scored-rows.json); [openrouter-haiku-severity-v1/scored-rows.json](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/scored-rows.json); [derived aggregates](../../bench/final-evaluation-20260918/aggregates.json). Per-condition/per-field support: [azure-severity-v1/comparison.json](../../bench/final-evaluation-20260918/observations/azure-severity-v1/comparison.json) and [openrouter-haiku-severity-v1/report.json](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/report.json).

## Battery and coverage map

| Battery | Final accounted coverage | What it establishes / where to inspect |
|---|---|---|
| Early smoke and flat labels | Historical only; retained separately | API feasibility is not a representative benchmark; root `bench/RESULTS.md`, older AVA/ARGUS/provider/operator groups remain distinct |
| Synthetic bottles: straight + angle | 36 unique controls per Azure engine; 199 earlier unique controls reused, 17 Kimi catch-ups newly attempted | Explicit image and source-row reuse; no paid control replay |
| Approved severity: blur sigma 1–6, glare 1–5 | 16 unique images × 11 levels × 6 Azure engines = 1,056 new requests | Revised optical highlight ladder, not rejected opaque white occlusion |
| Azure final new queue | 1,073 planned = attempts = raw responses = saved rows; zero missing | All HTTP 200; **102 invalid processing outputs**, not transport failures or successful extraction |
| Haiku/OpenRouter current | 212 planned unique = attempts = raw responses = rows; 206 valid, 6 failures | 148 preserved + 64 new continuation observations; no historical request replay |
| Logical aliases | 252 Haiku logical records; 1,512 Azure logical records | Clean/straight and clean-parent substitutions alias exact image bytes; canonical total stays 212 per engine |
| Separate OCR | Mistral Document AI 2512 annotation interface | Evaluates an OCR pipeline, not identical chat schema |
| Error/recovery tests | Original RED/GREEN and final offline logs preserved | Continuation guard, spend accounting, schema failures; publication tests are separate |
| Deferred | Real-camera, held-out source-label validation, calibrated confidence, restricted-network and app latency | No benchmark PASS or reviewer attribution closes these gates |

- [Azure complete report](../../bench/final-evaluation-20260918/observations/azure-severity-v1/FINAL-COMPARISON.txt)
- [Azure planned/reused mapping](../../bench/final-evaluation-20260918/observations/azure-severity-v1/queue-manifest.json)
- [Azure coverage](../../bench/final-evaluation-20260918/observations/azure-severity-v1/coverage.json)
- [Haiku final report](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/FINAL-REPORT.md)
- [Haiku continuation audit](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/continuation-final-audit.json)
- [Image/truth provenance](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/manifest.json)
- [All source files, snapshots, scripts and test logs: browsable index](../../bench/final-evaluation-20260918/SOURCE-INDEX.md)
- [Actual image battery and preview/version navigation](../../bench/final-evaluation-20260918/IMAGE-INDEX.md)

### Failure details and corrected historical wording

Azure's final `execution-state.json` has an empty `failures_by_model` object:
that is **not zero processing failures**. The saved rows reconcile 102 invalid
new outputs, all HTTP 200. Canonical aggregates also include the reused controls.

Haiku's final prose mentions “two HTTP 502s and three schema-invalid responses”
as a **historical** subset, but the final audit/rows show **two HTTP 502s + four
HTTP-200 schema/processing failures = six**. The fourth HTTP-200 failure was in
the continuation. Both failed 502 requests have byte-identical error bodies but
different request identities. Neither was replayed or converted to success.
Earlier running handoffs and earlier cost totals remain historical snapshots.

## Financial evaluation (USD, not invoices)

| Quantity | Amount | Meaning |
|---|---:|---|
| New Azure final queue | $4.35116825 | Observed retail estimate for 1,073 newly saved requests; not all historical Azure spend |
| Haiku provider `usage.cost` | $0.89336115 | Known for 210/212 requests; distinct from its $0.90238500 retail estimate |
| Haiku unknown-charge reserve | $0.91300000 | Two unresolved failed calls; retained in full, not zero-priced |
| Inherited incurred-and-unknown reserve | $7.85583230 | Historical conservative liability retained unchanged |
| Shared final liability | **$15.22049510 / $50 total cap** | Includes historical amounts, Haiku and unresolved reservations; do not add Haiku again |

The original lower cap and pricing repair history are preserved in earlier
budget authorization/accounting snapshots. The $50 authorization was a
**total-inclusive ceiling**, not an additional allowance. Earlier Haiku report
liability $10.86932685 predates the final Azure queue, not a competing final total.
The copied SQLite ledger is an immutable evidence snapshot, never an execution
ledger. The verifier reads it with `mode=ro&immutable=1`, reconciles integer
nano-dollar totals and checks earlier ledger entries remain unchanged.
Azure float serialization tails are rounded to eight decimal USD places only
in the derived financial summary; original rows are untouched.

Financial sources: [recovery-v3/budget.sqlite](../../bench/final-evaluation-20260918/observations/recovery-v3/budget.sqlite); [budget-authorization.json](../../bench/final-evaluation-20260918/observations/azure-severity-preservation-before/budget-authorization.json); [azure-severity-v1/authorization-addendum.json](../../bench/final-evaluation-20260918/observations/azure-severity-v1/authorization-addendum.json); [azure-severity-v1/comparison.json](../../bench/final-evaluation-20260918/observations/azure-severity-v1/comparison.json); [openrouter-haiku-severity-v1/report.json](../../bench/final-evaluation-20260918/observations/openrouter-haiku-severity-v1/report.json).

## How the experiment changed, without rewriting history

1. Initial smoke calls established a route could answer, not model qualification.
2. Flat-label work expanded to rendered bottles/angles. Original source pixels,
   truths and historical operator/settings differences remain traceable.
3. Broad white-band “glare” was rejected as opaque occlusion. Its images, failures
   and costs remain **historical**, excluded from the approved severity results.
4. Revised blur-v3/glare-v4 previews and the approved sigma 1–6 / glare 1–5
   reference ladder informed the complete paid corpus. Reference-preview files
   are not additional model observations. Clean-parent substitutions and aliases
   are explicit; D-WARP retains inherited degradation.
5. Pricing/ledger controls were repaired and bounded continuation completed the
   remaining authorized requests. Failed and unknown observations were retained,
   not silently retried, relabeled or omitted to improve accuracy.
6. Speed priority and warning false matches changed the decision: highest raw
   accuracy alone is insufficient; human-confirmed Haiku is a conditional demo
   direction, with OCR as a separate Azure feasibility alternative.

## Integrity, review attribution and limits

This publication preserves original source bytes except **six JSON source
records with host process-list fields removed** to avoid unrelated private
operational data. Exact paths, original/published hashes and omitted JSON paths
are in [source-map.json](../../bench/final-evaluation-20260918/source-map.json).
Images/historical bytes already identical in Git are linked rather than copied
again. Frozen code is captured as `.py.txt` reference evidence: **do not execute
`azure.py --run`, `run.py`, authorization, regeneration or archived tests**.
Only the standalone publication verifier/tests above are supported here.

The historical independent benchmark PASS was reported in project discussion
and attributed in the saved decision report; the original complete reviewer
transcript/verdict artifact is not available in this publication. That is
**reported attribution, not a newly reproduced independent review**. The latest
ARGUS Phase 2 PASS concerns application source, not this empirical benchmark.
This publication reproduces hash/coverage/ledger/aggregate checks, **not a full
raw-response frozen-scorer replay** and not a visual-readability certification.

No held-out calibration, real-camera reliability, universal five-second claim,
Azure Claude/firewall proof or unattended-safe approval follows from these
results. Native visual QA was representative, not exhaustive field-level
annotation. The historical 99 log-only ARGUS completions still lack original raw
outputs; see the mapped `recovery-v2/verification.json` and `reconciliation.json`
in the [source index](../../bench/final-evaluation-20260918/SOURCE-INDEX.md). They remain
unknown, not fabricated or promoted to canonical current observations.

See the [publication review record](../reviews/16-final-benchmark-publication.md)
for boundaries, omissions, tests and parent-owned publication status.
