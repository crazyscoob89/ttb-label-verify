# Archived review report

Source: AVA artifact `ttb-review-4bf9f04.txt`. Copied into the repository retrospectively.
This records the verdict at that candidate, not current project approval.
Historical file line references apply to the reviewed SHA.

```text
TTB LABEL VERIFY — AVA PLANNING REVIEW
Verdict: REVISE before treating the plan as implementation-ready.
Repository: https://github.com/crazyscoob89/ttb-label-verify
Reviewed commit: 4bf9f04230a1cfc5b4cf969323b200d479f456d2
Scope: read-only review of README.md, .gitignore and all four planning documents. No source edits, remote writes, paid model calls or deployments.

ALEX'S PLAIN-ENGLISH ANSWER
Yes: Treasury should see an application that works and code another developer can understand. The current repository is a sensible planning start, not spaghetti code. There is no application code yet, so code quality cannot yet receive a PASS. The plan needs a few concrete decisions so the builder does not improvise the important connections later.

VERIFIED
- Repository is private under crazyscoob89; default branch master.
- Six tracked files, all documentation/configuration; five commits in default-branch history. No application, tests, dependency manifest or CI workflow exists yet.
- The five returned commits name Alexander Martinez with alexmartinez@live.com. This records Git attribution, not evidence that a human personally wrote every line.
- Inspected six unique historical blobs for common token/private-key patterns and company branding; no matches. This limited scan is not a comprehensive secret audit.
- HEAD was unchanged when checked after document retrieval.

WHAT IS GOOD
- One application rather than unnecessary separate services.
- Extraction and deterministic rule evaluation are separate concepts.
- Four clear outcomes, including an honest human-review state.
- Provider abstraction, commodity-aware rules, bounded batch processing and upload hardening are identified.
- Benchmark results are not invented; the documents explicitly acknowledge that nothing has been built or benchmarked.

CONSOLIDATED CORRECTIONS FOR ARGUS

1. BLOCKER — Define the actual application-to-label comparison.
Evidence: PLAN.md:8-16, 57-96; ACCEPTANCE_CHECKLIST.md:9-28, 66-73.
The plan mostly describes regulatory compliance, while the intended app compares label text against application information. Neither the input contract nor the user flow establishes where expected application values come from. A label can be plausible under regulations and still belong to the wrong application.
Required amendment:
- Define the expected application fields, commodity/import context and image inputs; show how single and batch items are paired.
- Report expected value, observed value, comparison outcome and reason.
- Separate application-data comparison from additional regulatory/physical checks. A type-size review flag must not obscure whether warning wording matched.
- Do not use a regulatory ABV tolerance as permission to accept different application/label values without an explicit requirement supporting that behavior (PLAN.md:92-96; BENCHMARK_PLAN.md:41).
Proof to plan: a plausible but wrong-application label produces mismatches; batch items cannot be cross-paired.

2. REQUIRED PLAN DETAIL — Make the anti-spaghetti structure concrete and enforceable.
Evidence: PLAN.md:141-146, 169-185; ACCEPTANCE_CHECKLIST.md:30-46.
The checklist promises readable/testable code, but no file ownership, data contracts or executable quality gate is specified yet. This is not proof of bad code; it is an unfinished build blueprint.
Required amendment: add one small module map, not a new framework:
- UI: accepts input and displays results; contains no regulatory rules or provider credentials.
- Server route/orchestrator: validates the request and coordinates work.
- Upload validator: shared byte/type/pixel checks and image sanitization.
- Extractor interface/provider adapter: returns validated observations, not final compliance decisions.
- Comparison/rule functions: deterministic logic, independent of React and provider SDKs.
- Shared schemas: expected data, observations, outcomes and typed errors.
- Tests/fixtures: independent unit rules plus composed request and user-flow tests.
Specify strict TypeScript, formatting/linting, type checking, tests and production-build commands, and a CI check that runs them. Choose actual commands when scaffolding; do not claim they run now. Lock dependencies and document setup. Keep one implementation owner and one consolidated review per frozen phase, not an agent review after every tiny edit.

3. BLOCKER — Prevent a confident-looking but unsupported result.
Evidence: THREAT_MODEL.md:82-94; BENCHMARK_PLAN.md:38-43, 75-84.
A schema and deterministic rules cannot establish that extracted text faithfully matches the image: an injected or mistaken extraction may still pass the rules. Missing-field outcomes are currently left ambiguous, and the benchmark does not actually include the prompt-injection case referenced by the threat model.
Required amendment:
- Define observed text/format evidence, unreadable or absent evidence, and the exact rule for needs-review versus mismatch.
- Keep observed warning text separate from the expected canonical warning; the extractor must not silently correct it.
- Include prompt injection, changed/missing warning words, non-bold heading, bold body, unclear formatting, clearly absent fields and cropped/unreadable fields with fixed expected outcomes.
- Measure extraction accuracy separately from decision accuracy; track false matches and review frequency so returning needs-review for everything cannot look successful.
- Define repeat counts and benchmark pass thresholds before running it.
A formatting judgment inferred by a vision model remains uncertain evidence, even when the downstream comparison is deterministic.

4. BLOCKER BEFORE PUBLIC DEMO — Resolve quota and retention promises for the selected hosting model.
Evidence: PLAN.md:127-139, 143-146, 177-185; THREAT_MODEL.md:104-125, 149-154.
The plan promises server-enforced limits in a stateless Vercel service but identifies no shared enforcement mechanism. A process-local counter alone will not impose a global quota across separate instances. 'No user data outlives the request' also overstates control over browser results, platform logs and external provider retention.
Required amendment:
- Choose platform/provider enforcement or a minimal shared quota mechanism; counters do not require retaining label images. Define a global spend/request ceiling, timeout and bounded retry behavior, including failure when the limiter is unavailable.
- Specify maximum upload size, decoded pixels, batch size and concurrency compatible with the actual deployment limits before launch.
- Narrow retention claims to what the application controls; document browser state, logs and the selected provider's actual data handling.
- Describe Azure/Foundry as a possible deployment option requiring network/provider validation, not an already-proven firewall solution or guaranteed configuration-only swap.
Proof to plan: concurrent requests cannot evade the chosen global limit; rejected requests cause no provider call; provider failures do not trigger unbounded retries.

SMALL NON-BLOCKING CLEANUP
- Ignore .env variants broadly while explicitly allowing a placeholder-only .env.example; current .gitignore does not exclude .env.production or .env.bak.
- Label the plan as awaiting human approval rather than implying that committing a 'frozen' scope supplies approval.
- Verify regulatory citations against authoritative sources before implementing specific compliance assertions. This review did not independently research current law, platform limits, competitor repositories or the original Treasury rubric.
- Include honest AI-assistance disclosure and distinguish it from essay-specific certification requirements.

HANDOFF / STOP CONDITION
ARGUS owns amendments to the existing four documents; AVA does not create a competing plan or edit source. Return one replacement commit and a short plain-English walkthrough for Alex. AVA reviews that amendment diff against the four items above; do not expand into speculative extras. Alex's present request authorizes this review, not application implementation, paid benchmarking, public access or deployment.
```
