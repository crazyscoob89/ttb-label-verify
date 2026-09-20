# Guarded prototype integration: review request

Base: 6f253361f7a3aa3e939f9fd813ba2f9fd8067da5. Implementation owner: AVA. Independent reviewer: ARGUS, pending verdict. Target is the commit containing this record; no independent PASS is claimed.

## Why this change

The reviewed foundation contained a UI, rules and provider adapter, but the published HTTP route always returned 403. Repeated Windows service-stack acceptance attempts could not deliver arbitrary label scanning. This candidate connects the existing components instead of substituting fixture observations, and uses a persistent transactional ledger without activating the wider governance database.

## Changed behavior

- Bounded multipart intake; code and exact-origin checks before consuming the body; decoder/signature validation.
- Existing provider/rules composition, bound extraction provenance, honest errors and uncertainty, elapsed result timing.
- Node24 SQLite fixed total ceiling of $25; single-winner reserve/claim, permanent holds and IDs, no failure refunds or automatic ledger recreation.
- Runtime model pricing check, fixed tool-free Haiku request and provider ordinary-token price caps. Parent observed cache tariffs that the worker initially rejected; conservative additive input/cache price accounting now fits a $1 reservation. Unknown paid fee categories still refuse dispatch. No paid call performed.
- Clear README and docs/deep-dive navigation, without deleting or rewriting benchmark evidence.

## Verification and failures

Parent reran `npm run typecheck`, complete `npm test` (464 passed / 20 files), and `npm run build` under Node24.21.0: all exit zero. The initially missing fixtures/manifest.json was a sparse-checkout omission, corrected by checking out the original repository fixtures, not changing the test. The observed-catalog regression failed before its parent repair and passed afterward. Tool single-file TypeScript lint ignores project configuration; authoritative project typecheck/build passed.

Worker reported browser single-upload verification through the actual guarded handler and synthetic model transport; this does not prove deployed Next ingress, real extraction, or final runtime pricing. Parent files: `/opt/data/ttb-prototype-full-tests.log`, `/opt/data/ttb-prototype-typecheck.log`, `/opt/data/ttb-prototype-build.log`, `/opt/data/ttb-prototype-price-RED.log`; worker original report `/opt/data/ttb-prototype-delivery-web-handoff.txt`. These local logs are not GitHub attachments.

## Review focus / open dependencies

Return one critical/high-only consolidated verdict. Check atomic ceiling semantics, path/durability assumptions, auth before body reads, source provenance, provider-bound pricing, concurrent and timed-out request lifecycle (outer comparison timeout vs outstanding provider/store operations), and actual UI consumer behavior. Keep offline sample assertions intact. No paid dispatch, deployments or source edits by reviewer.

Deployment host and persistent volume are unverified. Live batch is not connected. Final acceptance must use real deployed upload requests, not a mock transport or this source report. No root README live URL should be populated before that verification.
