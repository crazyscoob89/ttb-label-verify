# Renewed live browser acceptance — finite result

Source: `bb1089868649ff522185454ccfc72cb23a3f6b7a`. All 96 frozen tracked web files matched that Git tree before execution and remained unchanged. Existing production build; Node 24; no rebuild, canonical source edit, unit suite or benchmark.

## Result
**Live extraction/comparison works; human-review workflow remains blocked.** Exactly two paid inference POSTs, sequential match then discrepancy; no retry/fallback. Both application and provider returned HTTP 200. No browser page errors.

| Synthetic case | Exact machine outcome | Displayed server elapsed | Browser submit → displayed | Provider headers / observed complete | Held after / remaining | Reported cost* |
|---|---|---:|---:|---:|---:|---:|
| match | Seven fields `match` | 4640 ms | 5360.36 ms | 1367.42 / 4439 ms | $2 / $23 | $0.00462627 |
| discrepancy | ABV `mismatch`: observed `45%`, expected `40`; other six `match` | 4591 ms | 4720.77 ms | 1308.81 / 4433 ms | $3 / $22 | $0.00460152 |

Both pages displayed: “Live provider observations compared using local rules. Human review required; nothing saved.” Both displayed `Pass` / `BLOCKED`. The discrepancy displayed “ABV: unequal declared/observed decimal percentage; no regulatory tolerance applied.” **Mismatch was never accepted.** No reviewer attestation or review submission was made.

## Remaining blocker (offline diagnosed; no additional paid call)
`web/lib/review-policy.ts:18` still defines `source:z.literal('fixture')`. Complete live records carry `source: openrouter`, so schema parsing returns null at lines 20–21 and eligibility fails at line 34. Exact displayed error: “Complete, mapped comparison evidence is required. Failed or missing records cannot be reviewed.” Thus even the valid matching result cannot produce a live human-review draft; “Request correction” and “Second reviewer” appear AVAILABLE but cannot submit either.

`offline-diagnosis.json` reproduces this using captured responses only. A source-only in-memory counterfactual, with explicitly hypothetical physical-assessment/confirmation inputs, unlocks the matching record; mismatch and human-confirmed mismatch remain blocked. No production record or source was changed. This is not full end-to-end review acceptance.

## Guardrails, accounting and shutdown
Same sole ledger `/opt/data/ttb-demo-private/spend.sqlite`: $25 ceiling; $1 pre-existing unresolved hold → $3 final unresolved holds; $22 remaining capacity. Exactly $2 newly held. Ledger incurred remains $0, **not a claim of zero provider spend**. No refund/reset/copy/provisioning. Provider-reported cost this run: $0.00922779; reported upstream: $0.009321. *Untrusted cost metadata; full $1 retained for each attempt. Catalog-derived worst-case request bound: $0.88500000.

Existing guarded production route, origin, access code and reservation checks reused unchanged. Credentials supplied privately; no request headers, HAR or browser trace recorded. Loopback bind only (`127.0.0.1`); canonical browser/configured origin `http://localhost:3187`. Original first-run artifacts preserved.

Stopped launcher and server; recorded PIDs absent, no matching server/browser processes, TCP 3187 refused (errno 111). Final separate-process ledger reopen: all three holds unresolved, no active work slots. Credential scan of evidence: no credential bytes found (runtime credential file stays outside this evidence directory).

## Evidence
- `receipt.json`: source SHA, exact field outcomes, complete Playwright request/navigation/resource timings, provider status/usage, held vs reported costs, shutdown proof.
- `match-result.png`, `discrepancy-result.png`: full-page masked screenshots; `*-before.png` retained.
- `match-displayed.txt`, `discrepancy-displayed.txt`: exact full displayed text.
- `*-result.json`, `transport.jsonl`, ledger snapshots, `source-manifest.json`, `offline-diagnosis.json` and adapted helpers. No secrets embedded.
