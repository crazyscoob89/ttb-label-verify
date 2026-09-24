# Live provider proof and guarded batch candidate

## Executive status

AVA implementation; ARGUS independent review **pending**. Prior native Windows PASS remains scoped to `106aac25a37e05840aa38e41ccc9f8db4c6009e6`; it does not automatically accept these new changes.

- Provider compatibility repair: `bb1089868649ff522185454ccfc72cb23a3f6b7a`, parent `f82be6e9a1757337f50c5131f937d3893a98ec91`.
- Frozen combined code candidate: `75fe83d30441b3917869fb6a1164506337b9940c`.
- This record is a later documentation-only addition; no subsequent application edits.
- Real single-label extraction/comparison succeeded on the provider repair. Live batch and review correction have synthetic acceptance only. Durable saved history and deployment remain open.

## Findings, causes and corrections

### First real call: failure retained, not counted as a match

The guarded application sent one synthetic readable label to OpenRouter Haiku. Catalog admission succeeded; provider HTTP 200 became application HTTP 502 because the strict adapter rejected `service_tier`, `native_finish_reason`, and nullable `reasoning`. A complete Markdown JSON fence independently failed the raw JSON parser. Browser displayed provider-failed and produced no match. The $1 hold was retained.

The repair accepts only bounded known metadata and a single complete outer JSON fence. It still rejects prose salvage, multiple fences, malformed/unknown evidence, error/refusal/truncation signals and unexpected metadata. Spending, retry, timeout and model-selection policies are unchanged. The original synthetic-label completion is committed as `web/tests/fixtures/openrouter-captured-completion.json` and exercised by `openrouter-compatibility.test.ts`. Offline replay proved exact extracted-evidence equality without a network call; same-attempt retry still failed.

### Renewed live proof, not a benchmark

A delegated AVA acceptance runner drove actual browser file selection and form submission through the guarded route at the exact provider-repair SHA. AVA inspected its receipt, source diff and screenshot. AVA did not independently rerun these paid requests.

| Synthetic case | Actual result | Browser submit-to-displayed result |
|---|---|---:|
| Matching label | All seven field findings match | 5360.36 ms |
| Discrepancy label | Alcohol observed 45%, expected 40%; mismatch; other fields match | 4720.77 ms |

The timing values are two observations, not a latency guarantee or representative accuracy estimate. Full provider data and authoritative timing precision are in the local receipt; table values are rounded. One run exceeded five seconds. No batch throughput, difficult-camera performance or hosted-network claim follows from these examples.

The live run also exposed a second defect: review-policy still allowed only fixture provenance and rejected OpenRouter records. Consequently this run proves extraction/comparison, **not a completed human review**. The subsequent batch candidate repairs that discriminator and preserves evidence revalidation and human decision requirements. Its synthetic browser tests cover review drafts, not real saved submissions.

### Batch candidate

See [live batch contract](../deep-dive/LIVE-BATCH.md). Retained File inputs are prepared and sanitized by the server; execution verifies the image/application binding again. Explicit start/manual retry, two slots, stale-revision fences and the existing transactional ledger constrain execution. Existing unique attempt/reservation constraints provide durable deduplication without a schema migration or ledger reprovisioning. The preparation signature uses the shared demo access capability; it is a consistency check, not an authenticated reviewer identity or independent spending permit.

Single and Batch panels remain mounted so tab switching retains inputs, results and drafts. React-generated unique control IDs/radio groups prevent hidden workspace controls from capturing visible selections. Reload still loses drafts. All outcomes remain explicitly UNSAVED; deduplication is not result recovery or saved history.

## Verification and provenance

Node v24.21.0, Linux environment.

| Gate | Result | Provenance |
|---|---|---|
| Provider RED | 5 failing / 85 passing | Builder before repair |
| Provider focused GREEN | 90 passing | Builder and separately rerun by AVA parent |
| Provider candidate full unit/type/build | 555 tests; type/build passed | Builder logs |
| Batch focused unit gate | 318 tests / 17 files | Builder logs |
| Batch + single simulated-provider browser | 4 passing | Builder logs |
| Offline desktop/mobile browser | 36 passing | Builder logs |
| Combined candidate full unit suite | **562 tests / 26 files passed** | AVA parent independently executed |
| Batch candidate type/build | Passed | Builder logs |
| New independent/native Windows review | **Pending** | Not inherited from old PASS |

The builder's initial unconstrained test run exhausted memory; serial workers completed. An earlier offline mobile timing assertion failed during overlapping load; the subsequent full serial browser run passed. Those earlier logs are preserved externally, not erased. No security or timeout policy was relaxed. No paid calls were made by the batch implementation worker.

## Accounting and operational custody

Three total paid attempts in this delivery sequence: one failed parse and two successful comparisons. **$3 unresolved holds, $22 remaining hold capacity under the same $25 authorization.** Reported provider charges are untrusted metadata, not reconciled billing and not grounds for returning holds. No automatic retry/fallback, refund, budget reset or additional authorization ledger occurred.

The sole local ledger is `/opt/data/ttb-demo-private/spend.sqlite`. Do not provision another ledger, copy it into a concurrently active deployment, restore an earlier version or reset it. Local reopen/restart checks passed; the host-backed 9p/DrvFS mount is not qualified cloud storage or a power-loss guarantee. Any hosting move needs exclusive ledger custody and verified local filesystem locking.

All acceptance listeners were loopback-only and were stopped; no public URL or cloud resource was created. Existing Azure billing access was discovered, but no suitable already-running host was verified in the inspected identity's inventory. Exact hosting SKU/cost/approval and HTTPS/persistent-storage acceptance remain unresolved.

## Evidence locations and next owner

External original reports/logs are retained in the shared host home:

- `/opt/data/ttb-live-acceptance/`: first failure, exact captured response, accounting, screenshots and commands.
- `/opt/data/ttb-openrouter-repair/`: RED/GREEN, type/build/unit and exact captured-response replay.
- `/opt/data/ttb-live-r2-bb10898/evidence/`: two renewed live cases, receipt, masked screenshots, accounting and shutdown proof.
- `/opt/data/ttb-live-batch-report.md` and referenced `ttb-live-batch-*.log`: batch builder evidence, including failed checks.
- `/opt/data/ttb-integrated-parent-unit.log`: parent full combined gate.

On Jarvis-1 these `/opt/data/` paths correspond to `C:\Users\alexm\.hermes\`. Evidence directories also contain private operational helpers/access material: **do not publish or bulk-copy those directories**. Use exact report/receipt/log/screenshot allowlists. A selected publication-safe evidence archive accompanies this record under `evidence/pr9-live-batch/`.

ARGUS: read-only consolidated review of `f82be6e..75fe83d`, with disposable test fixtures permitted. Return PASS/REVISE for material security, spending, duplicate-dispatch, primary-flow and false-green defects; no paid calls, canonical ledger access, source edits, new hosting or re-review of unrelated historical scope. AVA owns repairs and durable save/reopen work; Alex owns new hosting cost/exposure decisions. No merge/deployment acceptance is implied.
