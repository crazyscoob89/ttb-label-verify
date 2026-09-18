# Review Process

This folder is the formal review trail for this project's builder/reviewer
workflow. It documents independent verification performed on every
substantive job, in staff-report form, separate from the working docs and
commit messages that record the changes themselves.

## Role separation

- **Builder** implements a job (planning docs, code, benchmark, or a
  revision requested by a prior review) and commits it.
- **Reviewer** is a separate, independent pass over the builder's frozen
  commit. The reviewer re-derives or re-checks the builder's claims against
  the actual committed artifacts — it does not take the builder's summary
  on faith. Findings are written down before any fix is written, and the
  fix is verified against the same artifacts in a follow-up pass.
- Builder and reviewer roles are procedurally separated even when the same
  underlying identity performs both across different sessions: the review
  step exists specifically to catch mistakes, gaps, and unverified claims
  that the builder's own summary would not surface.

## What happens on every job

1. **Independent verification, every time.** Every review re-runs or
   re-reads the actual evidence (git diffs, test output, generated
   reports, computed numbers) rather than trusting prose claims. Where a
   deliverable claims a number (test count, spend figure, pass rate), the
   reviewer reproduces or spot-checks it against the artifact that produced
   it.
2. **Consolidated verdicts.** Each round ends in exactly one of two
   verdicts:
   - **PASS** — no blocking findings; the reviewed commit is accepted as-is.
   - **REVISE** — one or more findings block acceptance; the builder must
     address them in a follow-up commit, which is then itself checked
     (either as a new round or as a verified-resolution note appended to
     the original round).
3. **Findings are severity-ranked**, not just listed, so the builder knows
   what must be fixed before the next round versus what is lower priority.
4. **Resolution is traced to a commit SHA**, not just asserted. A finding
   is not closed until the specific commit that closes it is identified
   and, where practical, the fix itself is spot-checked.

## Report format

Every round report in this folder follows the same structure:

- **Reviewed SHA** — the exact commit under review (full SHA).
- **Reviewer** — who/what performed the independent check.
- **Claims verified** — what the builder asserted, and what the reviewer
  actually confirmed against the artifacts (not just re-stated).
- **Findings** — numbered, each with an explicit **severity** (e.g.
  Critical / High / Medium / Low) and a one- or two-line description of the
  actual problem.
- **Root cause** — why the finding happened, when it isn't self-evident
  (this matters most when a fix could have gone in the wrong direction —
  see Round 04's checkout-portability root-cause note).
- **Resolution SHA** — the commit that closes each finding (or the round
  as a whole), plus what changed.
- **Verdict** — PASS or REVISE for the round, stated once at the top and
  once at the bottom for quick scanning.

## Index

| Round | Subject | Reviewed SHA | Resolution SHA | Verdict |
|---|---|---|---|---|
| [01](ROUND-01-planning-review.md) | Initial planning docs | `4bf9f04` | `605a782` | REVISE → resolved |
| [02](ROUND-02-planning-rereview.md) | Planning re-review | `605a782` | `fd35c2f` | REVISE (partial closures) → resolved |
| [03](ROUND-03-final-planning-gaps.md) | Final planning gaps + verify-failure | `fd35c2f` | `9002872`, then `3702c90` | REVISE → resolved (with a caught disclosure gap) |
| [04](ROUND-04-stage2-benchmark-review.md) | Stage 2 benchmark deliverable | `2ca813e` | `eec5da7`, then `e162de5` | REVISE → resolved; native-Windows re-verification in progress |

This index and the reports below are historical records of what was found
and fixed. They are not amended after the fact except to append a verified
follow-up verdict (see Round 04).
