# Current Foundry benchmark budget authorization

Alex's explicit instruction: **"increade the cap to $50"**.

The current ceiling is **$50 USD TOTAL**, not $50 additional, not a new per-run allowance, and not $50 per agent/model. The machine-readable authority is [`budget-authorization.json`](azure-severity-preservation-before/budget-authorization.json).

## Canonical execution and accounting

- The canonical future execution entrypoint is `recovery-v3/runner.py`; `recovery-v4/` contains offline closeout/reporting, not a newer runner.
- The canonical existing ledger is `recovery-v3/budget.sqlite`. Keep it intact. The cap change does not recreate, migrate, settle, clear, or reset it.
- The runner reads `total_cap_usd` from the root authorization JSON. The same value controls `Budget(...)`, the pre-dispatch comparison, and `over_cap_usd` diagnostics.
- The total includes inherited incurred/unknown liability from `recovery-v3/budget-basis.json`, the existing `inherited-incurred-and-unknown` ledger entry, all already-recorded usage, pending reservations, and unknown charges. The inherited-envelope equality assertion and durable identity/duplicate checks remain in force.
- This is a conservative dispatch/liability guard, not invoice-certified spend and not an account-wide provider billing cap. Unrelated historical experiments remain outside the existing comparison scope; no scope or accounting basis is silently changed.

## Historical evidence remains historical

The previous $10 authorization, guard decisions, blocked calls, recorded headroom, preflight results, source-hash references, and reports remain valid descriptions of their original execution. Do not replace their literals or regenerate those artifacts to imply that $50 was authorized then.

`harness.py` remains the **historical $10 original execution harness**; its reusable `Budget` implementation is still imported by the canonical runner. Its `main` is NOT the current execution entrypoint. `recovery-v3/accounting-before/`, `recovery-v3/preflight.py`, `recovery-v3/accounting_repair.py`, `recovery-v3/report.py`, and recovery-v4 report/evidence acceptance artifacts retain their historical $10 context and are NOT alternative current execution authorities. Do not run those historical writers to enact this cap change. Historical source hashes refer to their frozen source versions, not necessarily today's canonical runner.

The scale approval at `severity-ladder-preview-v1/SCALE-APPROVAL.md` remains intact. Its statement about the then-existing $10 allowance is superseded **only as to the current budget ceiling** by this authorization. The clean baseline, blur sigma 1–6, glare x1–x5 approval and all existing images/rendering parameters remain unchanged. A root-level supersession reference is used instead of modifying the historical approval.

## Scope of this change

Only cap/configuration, offline validation, and this approval record are authorized here. **No paid run/restart, publication, commit, fixture rebuild, or ledger reset.** Raising the ceiling does not restart the completed/budget-blocked batch, authorize retries of prior identities, or enqueue the approved scale automatically. AVA implements; ARGUS QA only.

## Offline verification

Run from `/opt/data`:

```sh
PYTHONPATH=/opt/data/benchmarks/ttb-foundry-20260918-v1/recovery-v3 /opt/data/asset-venv/bin/python -B -m unittest test_budget_authorization test_glare_exclusion test_runner -v
```

The new focused tests execute the actual canonical runner budget initialization and queue AST against **temporary SQLite ledgers only**, replacing dispatch with a local reservation recorder. They never call runner `main`, load credentials, construct paid requests, or invoke provider transport. Coverage: $50 ceiling, inherited known/unknown balances unchanged, total-inclusive exhaustion, matching over-cap diagnostic, direct ledger blocking, restart/duplicate prevention, and inherited-envelope mismatch rejection. Existing runner tests use local fake transports and temporary ledgers. Do not run broad discovery: unrelated historical acceptance code opens the real ledger.

See `budget-cap-validation.json` for final verification results, file hashes, historical preservation, and live-runner observations.
