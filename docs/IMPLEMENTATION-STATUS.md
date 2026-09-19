# Implementation status and authorization

## Current authority

Alex's latest direct instruction: “is this documented in our github? If so go ahead and build it out if not document put in github properly and organized and then build and implement”. This authorizes the agreed phased application implementation, not merely another plan. It supersedes earlier documentation-only headers for the approved work; those paragraphs remain historical records of the proposal stage.

PR #3 was verified published at `a9c4b4c68b9aff422ab7d17acc482b608fd59ab7` and is now merged into `master` as `656d4d1cb41492ff6cc1b5862373a08032e33f1b`. The merge tree matches the published documentation candidate. The current coordination reports the specification reviewed; the full original separate ARGUS spec-review transcript has not been imported into this repository, and no additional browser/database review is inferred from that report.

**Approved implementation scope (D1–D4):** two-tab app; individual reviewer sign-in; version-bound private evidence and persistent review history; proposed Next.js/Supabase architecture and 30-day synthetic-evaluation retention; six-phase plan with manual second-review status and optional polish/advanced routing deferred. Scope acceptance is not evidence the functionality exists.

**Still blocked (D5–D6):** new paid model calls or hosting spend, cloud-service provisioning, production migrations, and public/production deployment. Actual budget ceiling, hosts/regions/network acceptance, backup and provider-retention settings still require approval/verification. Existing provider credentials are not permission to use them. Local dependency installation, offline/unit/browser testing and application source work may proceed. An external dependency does not cancel unrelated authorized local work.

**Ownership:** AVA implements, commits and publishes one build branch; ARGUS performs one consolidated read-only review per frozen phase. Alex controls release scope and external-action gates. No competing writers, no repeated human approval requests for routine approved code slices.

## Progress

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Test/build harness; safe label/application intake | In progress |
| 2 | Comparison rules; provider/spend interfaces | Authorized, pending Phase 1 review |
| 3 | Single-label workflow and explicit outcomes | Authorized, pending dependencies |
| 4 | Managed identity, actual database/storage, persistent history | Code authorized; external provisioning/integration gated |
| 5 | Batch pairing, quick switching and recovery | Authorized, pending dependencies |
| 6 | Live acceptance and deployment | Local release work authorized; paid/live actions gated |

Start branch: `ava/app-phase-1`. Starting implementation base: `656d4d1cb41492ff6cc1b5862373a08032e33f1b`.

See [BUILD-PLAN.md](BUILD-PLAN.md) for task contracts and [GOVERNANCE-AND-AUDIT-DESIGN.md](GOVERNANCE-AND-AUDIT-DESIGN.md) for identity/data semantics. Frozen `docs/ui/v3/`, `bench/` and `fixtures/` remain unchanged. Completion records must separate local code/tests, independent review, database/provider acceptance and live deployment.
