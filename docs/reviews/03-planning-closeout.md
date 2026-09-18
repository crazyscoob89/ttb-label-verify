# Archived review report

Source: AVA artifact `ttb-closeout-fd35c2f.txt`. Copied into the repository retrospectively.
This records the verdict at that candidate, not current project approval.
Historical file line references apply to the reviewed SHA.

```text
TTB LABEL VERIFY — BOUNDED CLOSE-OUT REVIEW
Candidate: fd35c2fa5d0cff0504735fbbd4a59c306a34de0f
Base: 605a78223a7c2a4b921c7f97623e81ec7e96d2b8
Verdict: REVISE — no architectural rewrite; finish the remaining original checks.
Evidence: inspected the one-commit diff and current affected sections through GitHub's read-only API. Remote master matched the candidate. No source changes, benchmark calls or deployments.

CLOSED
- ABV matching is now explicitly normalized numeric equality, separate from regulatory tolerance. Accept this design correction.
- Module boundaries remain accepted at planning level.
- Application logging now has an explicit allowlist that excludes label images and extracted/declared values. Accept this logging correction.
- Wrong-value/reworded-warning fixtures and separate false-match, false-mismatch and referral metrics materially improve the benchmark.

THREE REMAINING CLOSE-OUT ITEMS

1. Make the proposed global spending control a verified prerequisite, not an assumed provider feature.
THREAT_MODEL.md:144-167 asserts that an unspecified provider's billing-console cap guarantees total spend. The extraction provider has not been selected. A proposed requirement is fine; an unverified guarantee is not.
Surgical amendment: 'Before public deployment, verify that the selected provider/account offers and enables an enforced hard stop, not merely a budget alert, including any documented enforcement delay or overrun. If this cannot be established, public provider-backed access remains disabled until a shared enforced quota or another proven bound is implemented. A local bounded benchmark needs a separate fixed call/retry/token budget within Alex's authorized spend.'
This does not require buying Redis now, or requiring every candidate to have identical billing features. It prevents silently opening an unlimited public endpoint. A local request timeout alone does not prove that the provider stopped processing or billing.

2. Scope the retention promise honestly.
PLAN.md:227-230 still says no user data outlives the request. THREAT_MODEL.md:257-274 still permits library temp files while describing the policy as absolute memory-only. External provider retention remains unaddressed.
Surgical amendment: state 'The application does not deliberately persist label images, extracted values or application records; approved operational metadata may be logged. Browser results, platform handling and provider retention are separate and must be documented.' Choose buffer-only image processing for the prototype, or plainly disclose verified ephemeral-file behavior; do not simultaneously claim zero disk use and permit temporary files. Synthetic fixtures only until the selected provider's retention is verified. No new data-storage feature is requested.

3. Finish benchmark execution criteria rather than adding more general prose.
BENCHMARK_PLAN.md:124-126 still combines extraction and classification accuracy; :166-174 can select an all-referral candidate if it is the only zero-false-match option. The fixture table has no prompt-injection or non-bold-warning-heading case, and execution rules still lack a repeat count. These are previously requested checks.
Surgical amendment: add the missing fixtures; give absent versus cropped/unreadable fields fixed expected outcomes; report extracted-value accuracy separately from final field outcome; define scoring per evaluated data field, with physical type-size referral reported separately. State a repeat count and minimum useful automatic coverage before running. Zero observed false matches on these fixtures is a finite-test result, not proof of zero real-world error. A candidate that sends everything for human review must not qualify as successful automated verification.
Suggested simple initial protocol, subject to owner adoption: three identical-setting runs per fixture; all clear clean data fields must auto-classify correctly, intentionally unreadable fields must refer, and zero false matches on negative fixtures. Record failures and do not select an engine if no candidate meets the chosen criteria. Keep this finite protocol in the benchmark plan before spending, rather than redefining success after results arrive.

STOP CONDITION / HANDOFF
ARGUS: amend these exact sections and remove contradictory old sentences in the same pass. Do not add features, produce a replacement architecture or start application code. Return one SHA and point to the three amended sections. AVA will check those only. Already accepted ABV/module/logging design is not reopened. Build authorization, paid-run approval, real cap verification and production acceptance remain distinct from this document review.
```
