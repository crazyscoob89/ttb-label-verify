# Governance and audit design

> **Execution update:** Alex has authorized phased implementation. [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) supersedes the historical documentation-only gates below for local source work. Paid calls, cloud provisioning and deployment remain gated; design text is not evidence of implemented controls.

**Status: design candidate for review; not implemented or approved for deployment.**
Alex authorized this specification, the build plan and publication of frozen v3 assets only. AVA owns implementation; ARGUS reviews read-only; Alex approves scope before an application build. The September 24 evaluation-share target is owner-provided, not a guarantee of delivery or acceptance.

## 1. Requirements versus deliberate additions

The [original assignment](https://github.com/treasurytakehome-rgb/instructions/blob/62bd63cd2f6b5af088b1d3c3b039c48cfcb012ef/README.md) asks for label/application comparison, exact warning checks, simple UI, batch handling, roughly five-second results and a deployed standalone prototype. It does **not** explicitly require sign-in, persistent approval history or an audit schema; it explicitly excludes direct COLA integration. Identity/history are proposed additions to make decisions attributable, not claims about the original requirements.

**Scope amendment:** [PLAN.md](PLAN.md), [THREAT_MODEL.md](THREAT_MODEL.md) and the legacy checklist describe request-only processing with no accounts or content persistence. This design proposes replacing those exclusions for an authenticated, synthetic-only evaluation environment. Until Alex approves that amendment, no retained-content implementation is authorized. Upload decoding remains buffer-only; deliberate sanitized evidence storage is the disclosed exception. Benchmark archives are unchanged.

Priority: correct comparison, readable evidence and fail-closed errors first; identity/history next; visual polish and advanced routing last. An incomplete feature is removed from the demo path, never presented as working. [v3](../ui/v3/README.md) is the frozen visual reference, not production functionality.

## 2. Users and authority

**Proposed stack:** retain one Next.js/TypeScript service; use managed Supabase Auth, Postgres and private object storage for the evaluation, subject to Alex's scope/data-destination approval and actual service feasibility. No tenant, credentials or deployment is created by this document. Azure-hosted alternatives remain a separate tested portability path, not an assumed drop-in replacement.

Each reviewer has an individual invite-only account; no shared reviewer identity, self-asserted name or public registration. Server code verifies the session and active workspace membership on **every** data operation and obtains immutable user ID from the verified identity, never from request JSON. Human-readable name is a historical display snapshot, not the identity key. Use managed authentication rather than custom password storage; secure cookie/session handling, logout, expiry, CSRF/origin checks and rate limits are acceptance gates.

Minimal roles: **reviewer** can create/read their permitted workspace records and append decisions; **administrator** provisions/revokes access and runs retention operations, not rewrite decisions. One demo workspace is sufficient; access must still deny outsiders and revoked users at API, database and object layers. Evaluators receive individual access privately; no credentials in Git. SSO, org administration UI and complex role hierarchies are deferred.

## 3. Evidence binding and append-only decisions

| Record | Minimum server-owned fields |
| --- | --- |
| Application version | `application_id`, immutable `version_id`, commodity/import context, declared values, canonical snapshot digest, creator, UTC timestamp |
| Evidence version | `evidence_id`, application version, source-byte SHA-256, sanitized-image SHA-256, private object key, MIME/dimensions, expiry |
| Comparison | `comparison_id`, both version IDs, seven extracted values/verdicts/reasons, relevant text/format evidence, provider/model, prompt/rule/schema versions, status and timing |
| Review event | `event_id`, review-chain ID, prior event ID, evidence/application/comparison IDs and digests, authenticated actor ID + display snapshot, server UTC timestamp, outcome, notes, per-field human resolutions, idempotency key |

The reviewer sees the exact sanitized image whose hash is bound to the decision. Raw upload bytes are hashed before normalization and discarded; the source hash is not a retained original or recovery mechanism. Immutable application/extraction snapshots and rules/model versions explain what was decided then, not what today's code would compute. Notes and provider output are untrusted content; validate and render as text.

Server transaction checks current versions, access, eligibility and confirmation, then appends the event. The application role cannot update/delete review events; a constrained database function enforces appends, uniqueness and chain order. Concurrent stale submissions return a conflict instead of overwriting; idempotent retry returns the same receipt. Objects use new version keys, never overwrite an approved image. A hash detects a byte difference; **hashes and database permissions alone do not make this tamper-proof against a privileged administrator**. Database security and retention privileges require separate verification.

## 4. Review chain and meaning of Pass

`paired evidence → comparison → human decision → durable receipt/history`

- **Pass — human verified:** a scoped internal review outcome, never TTB/COLA approval. All applicable checks must match or have an explicit supported human resolution. Confirmed mismatch blocks Pass; missing, unreadable or failed output never becomes a match. Physical print-size compliance remains explicitly outside image-only automation, with its limitation visible on the receipt.
- **Request correction / request new image:** save the reason. Replacement data creates new application/evidence versions and a new comparison. Old review events remain readable and are marked superseded through new events, not edited in place.
- **Needs second reviewer:** save an unresolved status and reason. Automatic assignment, notifications and multi-step reviewer chains may remain spec-only; never claim a person was notified when only a status was recorded.
- A queued/failed attempt is not a completed review. History distinguishes comparison findings from human disposition. Show “Saved internally — not submitted to TTB” **only after database commit**; a failed save leaves the draft unsubmitted and safely retryable.

History lists outcome, who/when, versions and superseding relationship; “View reviewed version” retrieves the authorized snapshot. Review history must survive refresh/restart and remain distinct from the ephemeral mock receipt.

## 5. Data destinations and retention

`Browser → authenticated Next.js API → buffer validation/EXIF stripping → permitted vision endpoint → deterministic rules → Postgres/private storage → authorized history view`

Only sanitized label content and the minimum necessary comparison context go to the chosen inference route, not reviewer credentials/identity or audit notes. Initial engine direction is Haiku via OpenRouter; the route includes an upstream model provider. Provider changes/fallbacks require explicit allowlisting, disclosure and route verification; do not silently send data elsewhere. A Foundry catalog entry or account does not prove availability or firewall compatibility. Provider keys/service credentials stay server-side; private evidence uses short-lived authorized URLs and no public object listing. No COLA submission, email routing or other external business-system push is in scope.

**Proposed evaluation retention:** retain synthetic evidence, application snapshots and associated decision history for 30 days from ingestion, then purge them together via a separately privileged, logged retention operation. Append-only means immutable during that retention window, not “retain forever.” A purge leaves no misleading reconstructable-history claim; show “expired evidence” where a still-live list refers to purged content. Record aggregate purge success without retaining deleted content/identity indefinitely. Backups, platform logs and identity-account lifecycle require explicit vendor settings and deletion verification; no universal 30-day-erasure promise until those boundaries are proven. Operational logs contain request IDs/status/timing, not images, application values, tokens or notes. Non-synthetic use stays blocked until destination, retention/training terms and permissions are accepted. Actual hosts, regions and backup schedules are pre-deployment decisions, not asserted here.

## 6. Approval and acceptance

Alex must approve: managed-service destinations, deliberate persistence versus the old no-retention design, individual evaluator access, proposed retention and build scope. A separate deployment/spend approval is required; historical benchmark budget is not a new hosting or inference allowance.

The build must demonstrate: forged identity rejection, cross-workspace/revoked-session denial, expired object access denial, append-only permissions, stale-version rejection, duplicate-submit safety, durable history after restart, original-version rendering after correction, failed-save recovery, retention cleanup, no content in logs, safe extraction failures and explicit warning uncertainty. [BUILD-PLAN.md](BUILD-PLAN.md) assigns these gates. Governance does not excuse a broken comparison engine or missed end-to-end acceptance.
