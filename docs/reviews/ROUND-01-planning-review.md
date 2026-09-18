# Round 01 — Initial Planning Review

**Date:** 2026-09-17
**Reviewed SHA:** `4bf9f04230a1cfc5b4cf969323b200d479f456d2` ("docs: add BENCHMARK_PLAN.md with synthetic test matrix and engine comparison template")
**Reviewer:** ARGUS (independent pass over the frozen planning-doc commit)
**Verdict: REVISE**

## Claims verified

At `4bf9f04` the repo contained four frozen planning docs: `README.md`,
`docs/PLAN.md`, `docs/ACCEPTANCE_CHECKLIST.md`, and `docs/THREAT_MODEL.md`,
plus the newly added `docs/BENCHMARK_PLAN.md`. The reviewer read all five
documents in full against the stated goal (a TTB label-verification
prototype comparing a submitted label to TTB's mandatory labeling
requirements) and checked for internal consistency, unstated assumptions,
and gaps between what the checklist claims is required and what the plan
and threat model actually specify a build would do.

## Findings

1. **[High] Comparison-first pairing not explicit.** `PLAN.md`'s goal
   statement was framed as judging whether a label "complies" in the
   abstract, without stating that every real evaluation requires a paired
   applicant-declared application record. Batch mode had no defined
   mechanism for mapping an uploaded image to its declared data — a batch
   of images could be evaluated with no way to know which declared record
   each one belongs to.
2. **[High] Module boundaries undefined.** `PLAN.md` described a single
   Next.js service with no internal module separation. Nothing prevented
   extraction logic, rule logic, and UI logic from being intermixed, and
   nothing specified that `rules/` should be testable without AI/network
   calls.
3. **[High] Uncertainty could default to pass.** No document stated what
   happens when extraction is low-confidence, missing, or fails. Without an
   explicit invariant, an implementation could plausibly treat an
   unreadable or failed field as a silent pass.
4. **[Medium] Safeguards not concrete.** `THREAT_MODEL.md`'s spend-abuse
   mitigation section listed rate limiting and bounded queues in prose but
   specified no concrete mechanism (no named controls, no enforcement
   layer, no image lifecycle/logging policy for uploaded label images).

## Root cause

Planning docs were written goal-first (what the prototype should evaluate)
without a corresponding "how is this actually going to be built and
verified" pass — the comparison model, module boundaries, uncertainty
handling, and spend/logging safeguards were all left as narrative
description rather than binding, testable requirements.

## Resolution SHA

`605a78223a7c2a4b921c7f97623e81ec7e96d2b8` and the three commits leading
into it:
- `c34dd6a` — `PLAN.md`: added explicit comparison-first goal framing,
  filename-convention/CSV-manifest batch mapping mechanisms, `ui/` /
  `intake/` / `extraction/` / `rules/` module boundaries with boundary
  tests, and the Uncertainty Invariant ("uncertainty never passes").
- `9326bc5` — `ACCEPTANCE_CHECKLIST.md`: added checklist items enforcing
  comparison-first evaluation, batch mapping correctness, module boundary
  verifiability, and the Uncertainty Invariant.
- `95f530a` — `THREAT_MODEL.md`: replaced prose mitigations with four
  concrete, stacked spend-bounding controls (concurrency cap, per-IP rate
  limit, daily request cap, pre-provider-call size limit) and added an
  explicit image lifecycle/logging policy (in-memory only, discarded after
  response, never logged).
- `605a782` — `BENCHMARK_PLAN.md`: revised to comparison-first paired
  fixtures and added batch-mapping test cases.

All four findings were verified closed by reading the diffs above against
the original finding text; no finding was left partially addressed.

**Verdict: REVISE → resolved at `605a782`.**
