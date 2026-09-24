# Phase 2 consolidated builder closure and review handoff

## Management summary

**Candidate implemented; independent ARGUS review pending.** AVA agrees with and preserved the supplied Phase 1 PASS. Phase 2 adds conservative comparison rules plus an inert-by-default provider/spend boundary. No user-facing inference, actual database money enforcement, paid API calls, provisioning or deployment occurred. This is a source-review candidate, not a release or reliability certification.

Implementation SHA: `4643831e882da465dccb0934c11509c6051a423a`. Phase 2 baseline: `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a`. The final documentation-only publication commit must preserve the implementation tree. Branch `ava/app-phase-2` is deliberately stacked on `ava/app-phase-1`; neither phase is merged by this handoff.

## Delivered and why

- [Seven-field rules](../deep-dive/RULES-POLICY.md): explicit observations and reasons, conservative normalization, exact decimal comparison, applicable imported origin and source-pinned warning wording/formatting. Malformed input is a processing failure; uncertain observations are not matches. Physical print size remains unverified.
- [Provider boundary](../deep-dive/PROVIDER-BOUNDARY.md): image-only no-tools extraction, fixed endpoint/model, no fallback/retry, strict schema, bounded response/20-second timeout, image hash and request/version provenance. The adapter is unwired and requires explicit trusted server authorization.
- Shared atomic spend-store contract with integer money and one-time claim. Success, failure and timeout retain unresolved liability. Test-only memory store is not production-global enforcement; actual DB concurrency and cost/pricing acceptance remain future gates.
- [Actual ARGUS Phase 1 report](11-phase1-argus-pass.md) is preserved with source hash, exact reviewed SHA and the distinction between source/log review and independent test execution.

## Repairs and evidence provenance

1. Sprint 1 added 117 rule tests. Parent independently reran them plus typecheck successfully at `0aeb7a4`.
2. Sprint 2 implemented offline provider/spend tests. Initial RED failures, strict-envelope repair and an original build ENOMEM are retained in [Sprint 2 evidence](13-phase2-provider-spend.md).
3. Parent caught an unintended 30-second deadline against the plan's 20-second contract. Commit `3bb58cd` added an explicit failing-then-passing regression and restored 20 seconds, without changing liability semantics.
4. Parent ran 262 tests and typecheck successfully at `3bb58cd`; Next's separate production-build checker then reported nine implicit-any diagnostics in parameterized extraction-test callbacks. Commit `4643831` explicitly typed eight callbacks without changing emitted JavaScript, assertions, strictness or runtime source. The diagnostic was intermittent: the worker's subsequent direct checker probes passed before repair, so cache corruption is not established.
5. On that repaired source the implementation worker ran **262/262 unit tests, typecheck and production build successfully** using Node 24.21.0, npm 11.19.0 and `taskset -c 0` for build. Parent inspected the actual successful log and exit receipts; this is attributed worker execution, not a parent claim of repeating the same successful build.

## Additional parent verification limitations (not hidden)

- An initial parent launcher inherited Node 20 and was explicitly stopped/superseded; it is not the accepted Node 24 gate.
- A parent rerun on `4643831` encountered `ENOMEM: not enough memory, read` while importing extraction tests on `/opt/data` (observed v9fs mount). Five suites/216 tests passed; that run as a whole **failed**. Available memory was roughly 8 GiB in the diagnostic snapshot; the exact filesystem/kernel cause is not proven.
- Parent exported committed `web/` into native `/tmp` and copied dependencies. This run executed 262 tests: **261 passed, one failed solely because the verification export omitted root `fixtures/manifest.json`**, which a source-provenance test reads. That incomplete export is not a clean-clone acceptance PASS and is not a source repair request.
- The follow-up command to include the fixture and complete native gates was blocked by the tool with `Command timed out. Do NOT retry this command.` It was **not retried**. No successful completion is inferred. The final source remains the worker-verified candidate above.
- No Phase 2 browser rerun completed. Existing Phase 1 browser results are historical, not newly reproduced. UI code remains unchanged in Phase 2; provider/UI integration belongs to Phase 3.

Selected raw logs, with original hashes and display-only ANSI/newline normalization, are in [parent evidence](evidence/phase2-parent-gates.log). The original files remain under `/opt/data/ttb-phase2-evidence/`.

## Review request and remaining gates

ARGUS: one consolidated read-only review of `2b59abc..published-candidate`, covering both sprints and the bounded repairs. Return PASS or one critical/high repair tranche; no parallel implementation, paid calls or provisioning. AVA retains build ownership. State whether you inspected source/logs or actually reran tests.

Reproduction from a **complete repository checkout**, not a web-only export:

```text
Node 24.21.0; npm 11.19.0
npm --prefix web ci
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build
```

The Linux-only `taskset -c 0` workaround is not a product script or Windows requirement. Preserve failed gates and platform attribution. Source-based review plus worker gates must not be relabelled as independent clean-checkout verification. Real provider response compatibility, image-grounded reliability, end-to-end timing, hosted database atomicity, budget adequacy and deployment remain explicitly unproven/gated.
