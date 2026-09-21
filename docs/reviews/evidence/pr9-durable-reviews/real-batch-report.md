# Bounded live-batch acceptance — PASS

Executed 2026-09-21T01:00:11.698Z through the frozen guarded UI and actual route. One two-row manifest, one explicit **Start live batch**, exactly **two actual provider attempts**. No retries/fallbacks, no source changes, no ledger provisioning/copy/reset/refunds, no new budget or authorization, no push/public hosting.

## Source acceptance versus observed runtime

**Source acceptance (parent-supplied):** ARGUS PASS for accepted code `75fe83d`; frozen documentation head `fa56bcc`, code-equivalent per delegation. Existing review: `/host-home/Projects/argus-pr9-live-batch-review/docs/reviews/verdict.md`. This run did not contact ARGUS or re-review the source. The frozen copy has no Git metadata.

**Executed source:** `/opt/data/ttb-live-batch-paid-75fe83d/web` only, copied existing `.next` production build, Node 24.21.0, loopback `127.0.0.1:3187`, origin `http://localhost:3187`. All 338 frozen source/build files were byte-identical before/after (dependency symlink excluded; never modified). Manifest digest: `d81c4bb2bd9e73ad4a5bd489dab19a50aae587eda19471433689a62544778c3d`.

**Observed runtime: PASS.** Real OpenRouter model `anthropic/claude-haiku-4.5`; both responses report backend `Amazon Bedrock`. Two guarded preparations, two guarded executions, two fresh catalog checks, two completion POSTs. No mocked response or alternate comparison path. Observation wrapper only logged real traffic and imposed a never-triggered >2-attempt fuse; requests/responses otherwise unchanged.

## Results and human-review usability

| Row | Seven-field machine result | Draft created |
|---|---|---|
| `match.png` | All seven match; ABV 40% vs 40 | **UNSAVED — Second reviewer** |
| `discrepancy.png` | Six match; ABV **mismatch**, 45% vs 40 | **UNSAVED — Request correction** |

For both rows, Submit was disabled before explicit confirmation and enabled afterward. Both drafts were successfully created and survived item navigation and Single/Batch tab switching. The manifest and both File objects remained retained. Machine findings were unchanged by review actions.

The discrepancy was explicitly marked **confirmed mismatch**, with supporting notes; Pass remained blocked and the machine mismatch remained visible. The matching row also correctly kept Pass blocked because no independent physical print/type-size assessment occurred. No physical-assessment checkbox was falsely checked. These are automated usability demonstrations of human-review controls, not authenticated human adjudications.

Final queue: **Compared 2; Failed 0; Queued 0; Running 0; Attempts 2; Occupied slots 0; UNSAVED drafts 2; Saved reviews 0; Remaining 2.** The remaining count correctly reflects that nothing was durably saved. Queue event evidence captures queued → two running → one complete → both complete → both drafts. There were zero browser page/console errors.

## Timings and concurrency

| Row | Prepare, browser ms | Execute, browser ms | Execute, server ms | Provider full body ms | Start → displayed ms | Draft click → displayed ms |
|---|---:|---:|---:|---:|---:|---:|
| match | 995.968 | 4670.127 | 4620 | 4385.922 | 5722 | 51.569 |
| discrepancy | 975.680 | 4762.844 | 4735 | 4434.545 | 5791 | 51.419 |

Batch Start → both settled on screen: **5795.398 ms**. Browser launch 744.482 ms; navigation 678.688 ms; manifest validation 194.759 ms; recorded harness body through review captures 12573.028 ms (excludes final browser-close teardown).

Observed maximum concurrency: **2** independently in UI occupied slots, browser comparison requests, real provider attempts, sampled ledger work rows, and sampled claimed holds. Ledger sampling interval: 50 ms. Full browser Navigation/Resource Timing entries and individual request phase/status/body/header timing records are in `browser-result.json`; provider dispatch/header/full-body timings are in `transport.jsonl`. This was a single warm-server acceptance run, not a benchmark.

## Cost labels — do not conflate

| Quantity | USD |
|---|---:|
| match provider-reported `usage.cost` metadata | $0.00462627 |
| discrepancy provider-reported `usage.cost` metadata | $0.00460152 |
| **New provider-reported cost metadata total** | **$0.00922779** |
| Shared authorization ceiling (unchanged) | $25.00 |
| Prior unresolved held upper bound | $3.00 |
| Newly added unresolved held upper bound | $2.00 |
| **Final unresolved held upper bound** | **$5.00** |
| **Remaining guarded capacity** | **$20.00** |

**Provider cost metadata is not a billing settlement.** The canonical ledger retains all five $1 unresolved upper-bound holds. Its incurred column remains zero because no reconciliation occurred, NOT because the calls were free. No hold release/refund/reset was performed.

The sole reused ledger is `/opt/data/ttb-demo-private/spend.sqlite` (unchanged inode `4222124653476316`). Before dispatch: $3 held, $22 capacity, zero active work/claimed/reserved slots. After and after shutdown: $5 held, $20 capacity, five unresolved holds, zero work slots; all original three hold rows unchanged.

## Shutdown and sanitation

Owned launcher/server PIDs are gone; Chromium was closed; no owned browser/runner remains; port 3187 is closed. Server exit 143 followed the intentional SIGTERM shutdown (not an application failure). Frozen source/build hashes are unchanged. Screenshots mask every password field; mask pixels were independently checked in all eight PNGs. Exact private API-key/access-code values are absent from captured artifacts. No raw request headers, auth, or provider request bodies were logged.

## Artifacts

- `receipt.json` — machine-readable source/runtime/cost/cleanup assertions and row details.
- `browser-result.json` — requests, complete seven-field response payloads, queue transitions, drafts, full browser timings, concurrency samples.
- `transport.jsonl` — actual catalog and completion observations, usage metadata, dispatch configuration, provider timing.
- `snapshot-before.json`, `snapshot-after.json` — full source/build hash manifests and read-only canonical ledger snapshots.
- `manifest.json`, `start-once.json` — exact approved inputs and single-use Start preflight.
- `match-comparison.txt`, `discrepancy-comparison.txt`, corresponding review text and masked PNGs, `batch-before-start.png`, `batch-settled.png`, `batch-final.png`.
- `server-handle.json`, `server-exit.json`, `server.log`, `sanitization.json` and evidence-only harness scripts.

## Issues / scope limits

No live application/provider failures; offline failure diagnosis was therefore not needed and no extra paid calls were made. Minor evidence-tool availability issues (missing `ss`/Pillow and an initial image-module path assumption) were resolved using socket/proc checks and the existing Sharp package; no installation, source edit, rebuild or paid rerun. A readiness probe preceded server-ready, then the ready signal and HTTP 200 were verified before the only batch run. Source and docs have not been pushed or modified. Only evidence files plus the authorized canonical ledger hold additions were written.
