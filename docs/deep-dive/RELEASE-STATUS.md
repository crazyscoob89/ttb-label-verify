# Prototype release status

## Current candidate

Application **e721936518e36b7c6d65b5649308f21d1b57e784** adds durable save/reopen; independent review pending. [Current findings/evidence](../reviews/27-durable-save-reopen-candidate.md), [operator setup](../SAVED-REVIEWS.md).

- **Accepted batch baseline75fe83d:** ARGUS PASS preserved with initial native timeout failures and targeted successful rerun; browser verification was not independently rerun. [Exact provenance](../reviews/26-live-batch-argus-pass.md).
- **Real local model proof:** single-label match/discrepancy then a two-row batch through guarded UI/routes. Batch observed maximum concurrency2 and both results displayed in5795.398ms. These are small synthetic-label samples, not an accuracy/latency guarantee.
- **Persistence proof:** actual private SQLite, real save/history/evidence endpoints, desktop/mobile browser and service restart; only extraction was mocked. Lost committed-save response recovered by unchanged idempotent retry. Parent independently verified the persisted record/image/receipt and full **565-test/28-file** unit gate.
- One shared demo code, not individual identity. New persistence review and combined real-provider-to-saved-history acceptance remain open.
- **$5 unresolved spending holds; $20 guarded capacity remaining** under the same $25 authorization. No budget reset/ledger duplication/refund. Holds are not reconciled billing.

## Remaining release gates

- [ ] ARGUS review of fa56bcc..e721936 persistence delta.
- [ ] Qualify native persistence runtime where deployed; explicit separate private review-store provisioning.
- [ ] Bounded combined real-provider -> save -> restart -> reopen acceptance on the reviewed final code, using the same canonical spending authorization.
- [ ] Hosting target/cost/exposure approval, HTTPS and exact-origin configuration, durable local-filesystem/locking qualification.
- [ ] Exclusive spend-ledger custody if moving hosts; no second active authorization or rollback/reset.
- [ ] Public evaluator URL, deployed browser acceptance and final source/setup handover.

No eligible existing cloud host was confirmed in the inspected Azure identity inventory; PAYG billing access is present but does not authorize new resource spend. Hosting an OpenRouter client in Azure does not prove restricted-network Foundry compatibility.

## Preserved historical acceptance

[Record24](../reviews/24-pr9-native-windows-pass.md) closes the original unelevated Windows bracket-path/ACL-fixture repair at106aac2; [record25](../reviews/25-live-provider-and-batch-candidate.md) retains the first real provider-format failure and correction; [record26](../reviews/26-live-batch-argus-pass.md) records the later accepted batch delta. None alone accepts the new persistence code or deployment.

## Explicit limits

No public deployment, individual authentication, COLA approval or legal certification. Normalized labels and parsed applications are saved, not raw-original archival custody. Unsaved edits remain page-memory. One immutable review per snapshot; no edit/revocation/erasure UI or global latest-application registry. Shared-code holders share the same history. Append-only SQL is not tamper-proof against the host/database owner. Historical benchmarks remain separate from app acceptance.
