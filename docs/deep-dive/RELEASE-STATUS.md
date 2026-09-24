# Prototype release status

## Current candidate

Application **e973548b5d0a9eaabbec58f4477a27b8697ad278** is the current reviewed source candidate on branch `ava/release-docs-cleanup`.

Independent verification status: **ARGUS PASS** on the candidate SHA with typecheck/build clean, batch e2e desktop/mobile **22/22**, and live-batch route unit **5/5**. AVA also reproduced the blocked batch gate after aligning the stale synthetic e2e harness to the approved v3 flow.

Front door and operations:

- **Live demo URL:** <https://ttb-label-verify-lilac.vercel.app/review>
- **Public overview:** [`../../README.md`](../../README.md)
- **Approach and trade-offs:** [`APPROACH.md`](APPROACH.md)
- **Hosted operations:** [`../../web/HOSTED-OPERATIONS.md`](../../web/HOSTED-OPERATIONS.md)
- **Approved v3 interface:** [`../ui/v3/README.md`](../ui/v3/README.md)

## Remaining before final Treasury submission

- [ ] Alex approval to merge `ava/release-docs-cleanup` into `master`.
- [ ] Merge the exact approved candidate, then verify the default branch SHA/tree.
- [ ] Alex approval for production deployment/promotion if the live URL must move to the merged SHA.
- [ ] Verify the live URL after deployment and confirm README, approach doc and app URL all correspond to the same final commit.
- [ ] Decide repository cleanup separately: keep `crazyscoob89/ttb-label-verify` as canonical; delete or archive any stale duplicate only with explicit approval.

## Explicit limits

This prototype is not a TTB approval engine, COLA approval, legal certification, individual-authentication system or tamper-proof archive. It assists label-review triage by comparing visible label evidence against an application record, preserving saved review history and surfacing discrepancies for human decision.

Physical print/type size cannot be certified from ordinary photos alone. Normalized labels, extracted findings, images and review decisions are saved for demo/review continuity; this is not official regulatory custody.

## Preserved historical evidence

Detailed historical plans, review records, provider experiments and earlier acceptance notes remain under [`../reviews/`](../reviews/) and this `docs/deep-dive/` folder. Older records intentionally preserve their original reviewed SHA and limitations; the current release candidate above supersedes their readiness status.
