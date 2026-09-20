# Bounded live acceptance — BLOCKED, safely failed closed

Date: 2026-09-20 (UTC). Evidence directory: `/opt/data/ttb-live-acceptance/` (0700).

## Scope and source
- Canonical checkout `/opt/data/ttb-prototype-delivery`, branch `ava/prototype-delivery`, HEAD `f82be6e9a1757337f50c5131f937d3893a98ec91`.
- Accepted app SHA `106aac25a37e05840aa38e41ccc9f8db4c6009e6`; `git diff <accepted> HEAD -- web` is empty (`accepted-web-diff.txt`).
- Reviewed operations, env example, provisioning, ledger/security, route, provider, and PairInput source before activation.
- Built an external copy of all 94 tracked web files, with existing locked dependencies linked read-only. Production Next build (`--webpack`) and TypeScript phase passed under Node **v24.21.0**. Canonical source stayed untouched: all 94 original file hashes identical afterward and Git status clean.
- No hosting, deployment, public exposure, ARGUS/agent dispatch, batch, persistence implementation, guard weakening, provider bypass, or benchmark runner execution.

## Precise blocker
The first readable matching synthetic label reached the real guarded route and provider. Catalog preflight passed. OpenRouter returned HTTP 200, but the app returned **HTTP 502 / provider-failed**, correctly producing **no comparison/match**.

`web/lib/extraction/openrouter.ts:28–37` strictly rejects actual provider envelope fields:
1. `choices[0].message.reasoning`
2. `choices[0].native_finish_reason`
3. root `service_tier`

The model content also begins with a Markdown ` ```json ` fence, so the unchanged `JSON.parse(message.content)` at line 99 would independently fail if envelope compatibility were repaired. This second fault was proven offline against the exact captured response, without normalizing it or making another request.

`blocker-proof.json` records actual Zod errors using the unchanged schema extracted from source. `transport.jsonl` records the real catalog and completion response through a pass-through fetch observer. The observer issued **no requests**, changed no headers/body/response, and recorded no secrets or request headers.

**Stop decision:** one paid inference attempt used out of maximum three. Mismatch and uncertain cases were not dispatched because the generic transport-envelope failure already blocks all results. No automatic retry or paid debugging replay.

## Browser evidence and timing
Playwright Chromium performed actual file selection, form entry, secret-field entry, and **Submit for comparison**, not an API-only simulation.
- Fixture: approved repo synthetic `web/public/offline-samples/match.png`; application from `web/lib/offline-samples.json`, ID changed to `LIVE-match`.
- Browser-visible outcome: “Comparison unavailable (provider-failed). No match was produced. A spend hold may remain; do not automatically retry.”
- Displayed/server elapsed: **4674 ms**; browser click-to-visible elapsed: **5423 ms**.
- Browser JS errors: none.
- Screenshots: `match-before.png`, `match-result.png` (access-code field masked).
- Exact response and visible text: `match-result.json`, `match-displayed.txt`.

### Nonpaid local-origin correction
First browser submission using `http://127.0.0.1:3187` failed **403 access-denied**, displayed **2 ms** (browser **1229 ms**). No catalog/provider dispatch and no ledger hold occurred (`ledger-after-origin-denial.json`).
Next's existing `node_modules/next/dist/server/web/next-url.js:15–19` canonicalizes loopback hostnames to `localhost`. Runtime origin and browser URL were therefore configured to `http://localhost:3187`, while the TCP server stayed bound to **127.0.0.1 only**. No origin guard or app code changed. Initial evidence is preserved under `initial-origin-denial/`.

## Canonical authorization and accounting — DO NOT RESET
- Bounded discovery of `/opt/data`, relevant env configuration, and running TTB processes found **no demo spend.sqlite or stale sidecars**, no configured demo ledger, and no running TTB app/paid runner. Historical benchmark databases were identified but neither reused nor modified. Full candidates/exclusions are in `discovery.json`.
- Used the task's explicitly authorized one-time local provision action: **ONE** canonical durable `/opt/data/ttb-demo-private/spend.sqlite` via the existing unmodified provisioning script.
- Private directory **0700**, ledger **0600**, owner UID 10000; the application's native guards passed. The credential existed privately in `/opt/data/.env`; its value was never printed. Access secret is retained in a 0600 file inside the 0700 evidence directory; do not publish that file.
- `/opt/data` is the existing Windows-host-backed local 9p/DrvFS metadata mount (`mount.txt`), not container `/tmp` or an ephemeral checkout. Ledger reopening in separate Node processes, application restart, and final reopening passed. This is not a power-loss or native Windows ACL qualification.
- Initial ceiling **$25**, incurred **$0**, held **$0**. Final ceiling **$25**, incurred **$0**, **$1 unresolved nonrefundable hold**, remaining hold capacity **$24**. No refunds, resets, reconciliation, ledger copies, or duplicate production ledgers.
- Exactly one reservation: `658b1db8-90d3-4960-b520-36a9d4bd50db`; attempt `beb2199b-8e63-4839-ad85-c587d8ed2eb1`; state `unresolved`. Durable work table empty.
- Provider response **reported** cost **$0.00462627**; reported upstream inference cost **$0.004673** (2263 input + 482 output tokens). These are observed, untrusted provider metadata—not independently reconciled billing and not permission to reduce the $1 hold. Ledger incurred=0 does **not** mean free inference.

### Actual guarded catalog preflight
Inside the existing route, catalog GET HTTP 200 preceded the sole completion POST. Model `anthropic/claude-haiku-4.5`, context 200000:
- prompt: $0.000001/token
- completion: $0.000005/token
- cache read: $0.0000001/token
- cache write: $0.00000125/token
- 1h cache write: $0.000002/token
- web_search: $0.01 (not requested; excluded by existing guard)
The existing conservative calculation totals **$0.885** for its context-plus-output bound, below the **$1** reservation. Prices were not assumed from memory or checked with a bypass completion.

## Processes and shutdown
- Initial Hermes process handle `proc_be48b9e3f483`, shell PID 25913, launcher 25917, server 25925.
- Corrected-origin handle `proc_6dc6d34de0bf`, shell PID 26399, launcher 26403, server 26411.
- Both stopped by SIGTERM to their launchers and process handles waited to exit (143). Final checks: all four launcher/server PIDs absent, TCP 127.0.0.1:3187 connection refused, final ledger reopen successful, work slots empty. No acceptance browser/server left running.

## Files created
Only evidence/helpers/build copy under `/opt/data/ttb-live-acceptance/` and the explicitly authorized canonical `/opt/data/ttb-demo-private/` ledger. No canonical source modifications.
Key artifacts: this report; `COMMANDS.md`; `discovery.json`; `source-files-before.json`; `source-sha.txt`; `accepted-web-diff.txt`; `build.log`; `provision.log`; `ledger-before.json`; `ledger-reopen.json`; `ledger-after.json`; `ledger-final-reopen.json`; browser screenshots/results; `transport.jsonl`; `blocker-proof.json`; `verification.json`; server handles/logs/exits. Exact source-copy/discovery, launch, browser acceptance, offline proof, and verification helpers are retained.

## Other issues / limitations
Initial `git archive HEAD web` failed because a partial-clone promisor blob was unavailable and Git could not authenticate its attempted lazy fetch. No credentials were supplied and no source was changed. Recovered by copying tracked working-tree files and recording SHA-256 manifests. An initial broad filesystem scan timed out; a completed bounded `/opt/data` discovery then returned no errors. `ss` was unavailable; final port state was verified using a TCP connection instead.

**Required next step for owner:** narrowly repair and test provider envelope/JSON-output compatibility under the existing fail-closed design, then seek a new bounded live acceptance using this SAME ledger and its existing $1 hold. Do not label this run a successful live comparison, full benchmark, batch/save/reopen proof, or deployment.
