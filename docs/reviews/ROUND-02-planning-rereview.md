# Round 02 — Planning Re-review

**Date:** 2026-09-17
**Reviewed SHA:** `605a78223a7c2a4b921c7f97623e81ec7e96d2b8` ("Revise BENCHMARK_PLAN.md per review: comparison-first paired fixtures and batch mapping test cases")
**Reviewer:** ARGUS (independent re-check of the Round 01 fix commits)
**Verdict: REVISE**

## Claims verified

This round re-reviewed the resolution of Round 01 across all four affected
docs (`PLAN.md`, `ACCEPTANCE_CHECKLIST.md`, `THREAT_MODEL.md`,
`BENCHMARK_PLAN.md`, culminating at `605a782`). The comparison-first
framing, module boundaries, and Uncertainty Invariant were confirmed fully
closed. However, re-reading the ABV matching strategy, the spend-bounding
mechanism, the storage claim, and the benchmark's engine-comparison metrics
surfaced three items where the Round 01 fix was only **partially**
correct — each looked resolved at a glance but broke down on closer
reading against the actual regulatory/deployment/measurement reality.

## Findings

1. **[High] ABV regulatory tolerance mixed into match verdict.** The Round
   01 fix for `PLAN.md`'s "Other fields" matching strategy described ABV
   as having "regulatory tolerance bands" as part of its matching strategy,
   without separating that from the actual label-vs-application comparison
   the tool performs. As written, a reader could conclude the system
   evaluates TTB regulatory ABV tolerance (a determination outside this
   tool's scope) rather than a plain consistency check, risking an
   implementation that silently passes a numerically-inconsistent ABV on
   the theory that it's "within tolerance."
2. **[High] Spend limit not instance-safe; storage wording contradicted
   itself.** `THREAT_MODEL.md`'s concrete spend-bounding mechanism
   (concurrency cap, per-IP rate limit, daily cap) was specified as
   per-instance in-memory state, which does not bound *global* spend on a
   multi-instance serverless deployment (e.g., Vercel) — each instance
   would independently allow up to the cap, multiplying actual worst-case
   spend by the instance count. Separately, the "nothing stored" claim in
   the same doc was undercut by a soft exception for temp files that was
   not precisely scoped, creating an internal contradiction between
   "stateless, in-memory only" and an unspecified on-disk fallback.
3. **[Medium] Benchmark missing wrong-answer metrics.** `BENCHMARK_PLAN.md`
   (post-605a782) added comparison-first paired fixtures and batch-mapping
   test cases, but the engine-comparison table still had no metric for how
   often an engine confidently reports the *wrong* value that happens to
   still be well-formed (a false match/false mismatch), and had no
   adversarial fixtures constructed specifically to be clean, legible, but
   factually wrong — only illegibility/formatting edge cases were covered.

## Root cause

Round 01's fixes correctly added the missing *structural* requirements
(pairing, boundaries, uncertainty) but did not fully stress-test the
*content* of the new requirements against real constraints: multi-instance
deployment behavior for spend bounding, the regulatory-vs-consistency
distinction for ABV, and the class of benchmark failure (wrong-but-clean
answers) that a false-match safety metric actually needs to catch.

## Resolution SHA

`fd35c2fa5d0cff0504735fbbd4a59c306a34de0f` ("Close review findings: ABV
consistency-only verdict, instance-safe spend bounds, storage absolutism,
wrong-answer benchmark metrics"):
- `PLAN.md` — added the "Alcohol Content: Consistency-Only Verdict"
  section, splitting ABV into (1) a pure label-vs-application numeric
  consistency check (the only thing producing a verdict) and (2) TTB
  regulatory tolerance, now explicitly out of scope and, if referenced at
  all, worded as "regulatory tolerance evaluation is a TTB determination,
  not performed by this tool."
- `THREAT_MODEL.md` — rewrote the spend-bounding section to acknowledge
  per-instance limiting cannot bound global spend under multi-instance
  concurrency; specified honest prototype-scope controls (per-request
  size/count/timeout limits enforced per instance, a provider-side account
  spend cap as the true global bound, optional platform concurrency
  limits) and stated plainly that distributed rate limiting via a shared
  store is a production upgrade, not implemented here. Made the "nothing
  stored" claim absolute in the main text with a precisely scoped
  transient-OS-buffer caveat (deleted before response completes) instead
  of a soft exception.
- `BENCHMARK_PLAN.md` — added adversarial wrong-answer fixtures (clean,
  legible, factually wrong brand/ABV/net-contents values) and visually
  deceptive fixtures; added False-Match Rate, False-Mismatch Rate, and
  Referral Rate columns to the engine comparison table, with False-Match
  Rate stated explicitly as the disqualifying selection metric.

All three findings were verified closed by reading the `fd35c2f` diff
against the specific gap identified in each finding above.

**Verdict: REVISE (three partial closures) → resolved at `fd35c2f`.**
