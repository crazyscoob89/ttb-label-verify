# Implementation status and authorization

## Current authority

Alex's current local continuation approval is **“go as long as you are in agreement”**. AVA agrees with the supplied ARGUS Phase 1 PASS and is recording it before continuing Phase 2 on `ava/app-phase-2`, based on `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a`. This step permits local implementation/tests/commits only: no remote writes, live/paid calls, provisioning, migrations or deployment. AVA remains builder; ARGUS is read-only reviewer after the entire Phase 2. [Original review and limitations](reviews/11-phase1-argus-pass.md): source/diff/log review, matching Windows clone; tests/build were not independently rerun.

Earlier implementation authorization: “is this documented in our github? If so go ahead and build it out if not document put in github properly and organized and then build and implement”. This authorizes the agreed phased application implementation, not merely another plan. It supersedes earlier documentation-only headers for the approved work; those paragraphs remain historical records of the proposal stage.

PR #3 was verified published at `a9c4b4c68b9aff422ab7d17acc482b608fd59ab7` and is now merged into `master` as `656d4d1cb41492ff6cc1b5862373a08032e33f1b`. The merge tree matches the published documentation candidate. The current coordination reports the specification reviewed; the full original separate ARGUS spec-review transcript has not been imported into this repository, and no additional browser/database review is inferred from that report.

**Approved implementation scope (D1–D4):** two-tab app; individual reviewer sign-in; version-bound private evidence and persistent review history; proposed Next.js/Supabase architecture and 30-day synthetic-evaluation retention; six-phase plan with manual second-review status and optional polish/advanced routing deferred. Scope acceptance is not evidence the functionality exists.

**Still blocked (D5–D6):** new paid model calls or hosting spend, cloud-service provisioning, production migrations, and public/production deployment. Actual budget ceiling, hosts/regions/network acceptance, backup and provider-retention settings still require approval/verification. Existing provider credentials are not permission to use them. Local dependency installation, offline/unit/browser testing and application source work may proceed. An external dependency does not cancel unrelated authorized local work.

**Ownership:** AVA implements, commits and publishes one build branch; ARGUS performs one consolidated read-only review per frozen phase. Alex controls release scope and external-action gates. No competing writers, no repeated human approval requests for routine approved code slices.

## Progress

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Test/build harness; safe label/application intake | ARGUS PASS at `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a`; AVA agrees; no revisions |
| 2 | Comparison rules; provider/spend interfaces | In progress locally; independent review after full Phase 2 |
| 3 | Single-label workflow and explicit outcomes | Authorized, pending dependencies |
| 4 | Managed identity, actual database/storage, persistent history | Code authorized; external provisioning/integration gated |
| 5 | Batch pairing, quick switching and recovery | Authorized, pending dependencies |
| 6 | Live acceptance and deployment | Local release work authorized; paid/live actions gated |

Start branch: `ava/app-phase-1`. Documentation merge base: `656d4d1cb41492ff6cc1b5862373a08032e33f1b`; actual implementation start after the authorization record: `07fdca636495c9d01db4d7a0aa378d51fa9fee43`.

Phase 1 candidate: Sprint 1 local shell/harness committed at `308cab4a078c8e0069c063551d71f977294dbd11`; Sprint 2 adds strict application/manifest contracts, buffer-only image sanitation and manual application entry. Browser validation is limited to fields/file declarations; Node image decoding is exercised locally, not connected to HTTP. No extra API route was added. [Phase handoff and gate evidence](reviews/10-phase1-foundation.md) and [local run instructions](../web/README.md) distinguish code/test evidence from independent review. No external services, paid calls, migrations, publishing or deployment were performed by the implementation worker.

Phase 2 Sprint 1 is implemented locally: strict extraction evidence schema and deterministic seven-field rules, with 117 focused rules tests and 191 total unit tests passing plus typecheck under Node 24. [Sprint handoff and exact evidence](reviews/12-phase2-sprint1-rules.md), [comparison policy/API](RULES-POLICY.md). This is not full Phase 2 completion: Sprint 2 provider/spend contracts remain unimplemented; no new UI, auth, history or HTTP comparison service was added. Independent ARGUS review follows the whole phase, not this sprint.

See [BUILD-PLAN.md](BUILD-PLAN.md) for task contracts and [GOVERNANCE-AND-AUDIT-DESIGN.md](GOVERNANCE-AND-AUDIT-DESIGN.md) for identity/data semantics. Frozen `docs/ui/v3/`, `bench/` and `fixtures/` remain unchanged. Completion records must separate local code/tests, independent review, database/provider acceptance and live deployment.
