# Round 03 — Final Planning Gaps (+ Verify-Failure)

**Date:** 2026-09-17
**Reviewed SHA:** `fd35c2fa5d0cff0504735fbbd4a59c306a34de0f` ("Close review findings: ABV consistency-only verdict, instance-safe spend bounds, storage absolutism, wrong-answer benchmark metrics")
**Reviewer:** ARGUS (independent pass over the Round 02 fix commit)
**Verdict: REVISE (initial gaps) → REVISE again (caught verify-failure on the closure commit) → resolved**

## Claims verified

This round re-checked `fd35c2f` for remaining gaps in the spend-bounding
mechanism, the storage/retention wording, and the benchmark's coverage of
adversarial input classes and measurement rigor. It then, in a second pass,
independently re-verified the *closure commit* (`9002872`) that claimed to
resolve those gaps — and caught a checklist claim that did not match the
actual artifact, requiring a further fix.

## Findings — Round of `fd35c2f`

1. **[Critical] Spend cap verification not required before public
   access.** `THREAT_MODEL.md`'s provider-side account spend cap (the true
   global bound, per Round 02's fix) was documented as a *design intent*
   but nothing required it to be actually verified — by direct inspection
   of the provider's billing console — before public access was enabled. A
   provider whose "cap" is only an alert email (not a true request-stopping
   hard limit) could be mistaken for a real safety control with no gate
   catching the mismatch.
2. **[High] Provider retention undisclosed; temp-file contradiction not
   fully resolved.** The Round 02 fix made the in-app "nothing stored"
   claim absolute in the main text, but did not address the separate,
   larger gap: nothing disclosed that uploaded images are transmitted to
   an *external* vision provider at all, nor that the provider's own
   retention/training-use policy — not this app's no-storage policy —
   governs that external copy. A reader of the storage section alone could
   wrongly conclude no copy of the image exists anywhere once the request
   completes.
3. **[Medium] Benchmark missing prompt-injection, repeat-count, and
   automation-floor criteria.** The engine-comparison table added
   wrong-answer and visually-deceptive fixtures (Round 02) but still had no
   fixture testing prompt injection via label text (label text read by a
   vision model is untrusted input and a known injection vector), no
   requirement to run each fixture more than once (so an engine's result
   could be luck rather than reliability), and no floor requiring an engine
   to actually resolve most clean cases rather than referring everything to
   a human (zero false-match is trivially achievable by referring 100% of
   cases, which is safe but useless).

## Root cause

Round 02 fixed the *content* of each requirement in isolation but did not
ask "how would this actually fail to protect us in deployment/practice" —
a documented cap that's never checked against the real console, a storage
claim that's technically true but incomplete about the external leg of the
data flow, and a benchmark that can be gamed by an engine that just defers
constantly.

## Resolution SHA (initial three gaps)

`9002872fd3775cc60960d5815fde1ffc2ae22f4f` ("Close final planning gaps:
verified spend stop, provider retention disclosure, injection/repeat/
automation-floor benchmark criteria"):
- `THREAT_MODEL.md` — added a required **pre-deployment verification gate**:
  the provider's billing console must be directly inspected to confirm a
  true request-stopping hard cap (not an alert-only threshold) before
  public access, with the provider name, exact console setting, and
  observed behavior documented; if the provider is alert-only, the gate
  fails until either a hard-cap provider is chosen or a server-side global
  kill switch + daily-quota env cap are implemented and tested. Added the
  full Provider Data Retention subsection disclosing that images ARE
  transmitted externally and that the provider's own policy governs that
  copy, requiring the provider's retention/ZDR policy be cited by name
  before go-live.
- `ACCEPTANCE_CHECKLIST.md` — added the corresponding hard-gate checklist
  item for the verified spend stop, and referenced the retention
  disclosure requirement in the README-limitations item.
- `PLAN.md` — clarified the no-persistence claim as application-storage-only
  and cross-referenced the external transmission/retention disclosure.
- `BENCHMARK_PLAN.md` — added the `A-INJECT-PROMPT-01` fixture (adversarial
  instruction text embedded in label content, scored under False-Match Rate
  if it flips a verdict); added the fixed N=3 repeat-count rule with
  per-fixture consistency reporting and median-based latency; added the
  60% Automation Rate floor on the clean fixture subset as Gate 2
  (mandatory, after the Gate 1 False-Match Rate check), so an engine cannot
  pass by referring nearly everything.

## Verify-failure: claim did not match artifact

On independent re-verification of `9002872`, the reviewer checked each
doc's claims directly against the corresponding artifact rather than
trusting the commit message. The closure commit touched 4 docs
(`ACCEPTANCE_CHECKLIST.md`, `BENCHMARK_PLAN.md`, `PLAN.md`,
`THREAT_MODEL.md`) and its own checklist text asserted that `README.md`
"clearly states scope and known limitations ... so reviewers aren't
surprised" — but `README.md` itself was **not modified** in `9002872`, and
at that commit contained no Known Limitations section at all. The
checklist item was left unchecked (`- [ ]`), which was honest about status,
but the surrounding THREAT_MODEL.md prose asserted the README disclosure
was now a completed requirement tied to this closure, creating a
claims-vs-artifact mismatch: a reader following the cross-reference from
THREAT_MODEL.md to README.md would not find the disclosure the text implied
existed.

**Finding [High]:** Closure commit updated 4 docs and referenced a required
README disclosure but did not actually add it — caught only because the
reviewer opened `README.md` directly instead of trusting the diff summary.

**Resolution SHA:** `3702c905fd07d3eeb69f26e4760c9de2d3198d5b` ("Add README
known-limitations disclosure; align checklist claim") — added the actual
"Known Limitations" section to `README.md` (provider data retention
disclosure naming the ZDR requirement and the Azure/Foundry production
path, the permanent type-size needs-review lane, and the precise
application-storage-only no-persistence claim), and updated
`ACCEPTANCE_CHECKLIST.md` to check the item off (`- [x]`) with an explicit
"Verified:" note pointing at the actual README content, plus an explicit
exception carve-out noting this is the one checklist item completed at the
planning stage.

**Lesson recorded:** claims must match artifacts. A commit message or
checklist note asserting a requirement is met is not sufficient — review
must confirm the referenced file/section actually contains what is
claimed, every time, not just that a plausible-sounding change was made
somewhere in the diff.

**Verdict: REVISE → resolved at `9002872`, then a caught verify-failure
→ resolved at `3702c90`.**
