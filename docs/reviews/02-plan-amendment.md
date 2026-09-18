# Archived review report

Source: AVA artifact `ttb-rereview-605a782.txt`. Copied into the repository retrospectively.
This records the verdict at that candidate, not current project approval.
Historical file line references apply to the reviewed SHA.

```text
TTB LABEL VERIFY — AVA AMENDMENT RE-REVIEW
Verdict: REVISE — progress verified; three prior findings remain partly open.
Base: 4bf9f04230a1cfc5b4cf969323b200d479f456d2
Candidate: 605a78223a7c2a4b921c7f97623e81ec7e96d2b8
Repository: https://github.com/crazyscoob89/ttb-label-verify
Scope: the four-document amendment diff and affected surrounding sections. Candidate still matched remote master when checked. No repo edits, tests, paid benchmarks or deployments were performed.

CLOSED / ACCEPTED AT PLANNING LEVEL
- The module split into ui/intake/extraction/rules is a reasonable anti-spaghetti foundation; deterministic rule tests and hostile-upload tests are explicit.
- Each label now requires its own application record; unmapped batch items must fail explicitly.
- The uncertainty-never-defaults-to-match policy is now explicit, including provider and schema failures.
These are documented design intentions, not implemented/tested controls. No application code exists to certify yet.

REMAINING FIXES — SAME REVIEW SCOPE, NOT A NEW REWRITE

1. Comparison correctness: remove regulatory tolerance from application matching.
Evidence: PLAN.md:109-113 and BENCHMARK_PLAN.md:66 still connect application/label ABV discrepancies to commodity tolerance bands. The new comparison-first framing does not resolve this.
Required: compare normalized application ABV with normalized printed ABV independently of any actual-versus-declared alcohol tolerance. Unless the assignment explicitly permits a difference, unequal numeric values are mismatch when confidently read. Add a small-difference case, not just an outside-tolerance case. Keep supplemental regulatory/physical checks separate from application comparison, with expected/observed/reason represented in the output contract. The fixed statutory warning is an explicit exception to applicant-declared reference data; align the checklist's universal wording with that exception.
Closure evidence: one precise rule and fixture expectation, plus the separate result lanes stated consistently in PLAN and checklist.

2. Safety/retention: name the cross-instance control and reconcile contradictory promises.
Evidence: THREAT_MODEL.md:114-133 specifies a semaphore and daily cap but never identifies shared atomic enforcement across independent Vercel instances. A per-instance semaphore does not enforce a deployment-wide quota.
Required: choose a shared atomic quota/lease mechanism or a platform/provider control with the required semantics. Minimal counters may persist without persisting label content. Specify reservation before billed calls, fail-closed behavior on limiter failure and bounded timeouts/retries; add a multi-instance limit test to the acceptance checklist. Numeric deployment defaults may be finalized before public launch, but the enforcement design cannot remain unstated.
Evidence: PLAN.md:176-180 promises no user data outlives the request, while THREAT_MODEL.md:205-213 allows temporary disk writes under a never-to-disk heading, and :229-232 permits logging extracted field values. External extraction-provider retention remains unspecified.
Required: retain the proposed buffer-only app processing and metadata-only logging by removing those exceptions; state the app's no-persistence promise separately from browser, hosting and provider retention. Provider retention must be verified before non-synthetic data is used; do not claim immediate deletion outside app control. Treat Azure compatibility as an option awaiting validation, not an already-proven firewall solution.
Closure evidence: one consistent policy and one implementable quota design, not additional generic security prose.

3. Benchmark: turn the uncertainty policy into a test with a defined scoring rule.
Evidence: BENCHMARK_PLAN.md:63-70 lacks prompt-injection, changed/missing warning words and non-bold-heading cases. Missing-field outcome remains partly deferred. :108-110 still combines extraction and decision accuracy on clean cases; repeat counts and selection thresholds remain absent. PLAN.md:242 calls a reading confident without defining how that is established.
Required: add the previously requested negative fixtures and fixed expected outcomes; separate truly absent from unreadable/cropped fields. Preserve verbatim observed warning text rather than correcting it to the expected text. Model-reported confidence alone is not proof of faithful extraction. Record extraction accuracy, decision accuracy, false matches and review rate separately, with a stated repeat count and selection criteria before the comparison run. A provider that returns needs-review for everything must not look like a successful automated verifier.
Closure evidence: a compact fixture/scoring table. No paid run is needed to amend it.

PARKED AS IMPLEMENTATION/DELIVERY CHECKLIST ITEMS, NOT NEW PLAN BLOCKERS
- Concrete shared TypeScript schemas and typed errors.
- Formatting/linting, strict type checking, tests and production build in CI once a scaffold exists.
- Clean-clone setup verification, dependency locking and safe .env.example/.gitignore patterns.
- Numeric upload, concurrency and batch limits compatible with chosen deployment.
- Source verification of regulatory assertions before encoding them.

BOUNDED HANDOFF
ARGUS owns surgical edits to the same documents; AVA remains read-only reviewer. Return one replacement SHA that closes the three items above, without adding features or redesigning the app. Re-review only these corrections and adjacent consistency. This review does not authorize app code, paid benchmarking or deployment, and does not establish a benchmark budget estimate.

PLAIN ENGLISH FOR ALEX
The plan is better organised. Before we call it ready, we need to ensure it compares the right numbers, its cost/privacy promises are technically achievable, and its tests can catch a confident but wrong AI answer. This is finishing the original inspection, not adding a new project.
```
