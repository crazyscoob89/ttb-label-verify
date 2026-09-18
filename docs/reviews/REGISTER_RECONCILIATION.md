# One repository, one active review register

## Repository identity

Authenticated GitHub repository metadata returned repository ID **1374824177**,
full name **crazyscoob89/ttb-label-verify**, default branch **master**.
`62978a1` and AVA's `e86b8ba` are present in this same repository's fetched history.
The reported `crazyalex89/ttb-label-verify` API path returned HTTP 404 under the
same credential; that does not prove no inaccessible repository exists, but the
actual fetched master commit is in `crazyscoob89/ttb-label-verify`. No second
repository was created or used by this repair.

## Reconciliation

Master's documentation commit `62978a1516f278c3250c6ab52c1a13bc9d10b968` is merged **into the AVA review branch**,
not the other way around. Master is not changed or deployed by this handoff.
The active entry point is [README.md](README.md). The duplicate `ROUND-*`
working-tree reports are retired after consolidating their unique disclosure
finding here. Their exact source documents remain accessible at the immutable
commit below and in merged Git history; no historical commit is rewritten.

| Retired source at `62978a1` | Active record |
| --- | --- |
| `README.md` | [Current register](README.md), including ownership and reporting format |
| `ROUND-01-planning-review.md` | [01-planning.md](01-planning.md) |
| `ROUND-02-planning-rereview.md` | [02-plan-amendment.md](02-plan-amendment.md) |
| `ROUND-03-final-planning-gaps.md` | [03-planning-closeout.md](03-planning-closeout.md) and disclosure follow-up below |
| `ROUND-04-stage2-benchmark-review.md` | [04-stage2-audit.md](04-stage2-audit.md), [05-repair-review.md](05-repair-review.md), [06-portability-validation.md](06-portability-validation.md), [07-windows-path-repair.md](07-windows-path-repair.md) |

[Immutable original source folder](https://github.com/crazyscoob89/ttb-label-verify/tree/62978a1516f278c3250c6ab52c1a13bc9d10b968/docs/reviews).

## Provenance corrections

The original AVA planning and Stage 2 audit artifacts identify AVA as reviewer
of the ARGUS-built candidates; the retrospective `62978a1` reports instead
label these ARGUS reviews. The source artifacts control that attribution.
ARGUS independently reviewed AVA's later repair tranche. Original AVA severity
labels are retained rather than silently upgrading High to Critical based on a
retrospective summary. Likewise, the original 98 integrity checks did not
independently rederive every result: their false-green mutation defect is an
explicit finding, not evidence of adequate integrity protection.

A resolution commit identifies an implemented correction, not automatically an
independent PASS. The `62978a1` index's broad 'resolved' phrasing is superseded by
the active register's evidence-qualified states. Unimplemented spending/privacy
controls and the Windows path-separator review remain open until actually proven.
The subsequent Windows REVISE supersedes round 06's historical pending status;
its earlier Linux checkout results are preserved, not erased.

## Additional planning disclosure finding recovered from ARGUS's record

ARGUS's retrospective round 03 records a verification failure on `9002872`:
the planning documents referred to README limitations that were not yet in the
README. The record assigns High severity and identifies `3702c90` as correction.
The original verification-job report is not available here, so this is labelled
**ARGUS-reported**, not retroactively claimed as AVA's original review.

AVA checked the actual Git history during reconciliation: `9002872` changed four
planning documents but not README; `3702c90` added the README Known Limitations
section and checked the corresponding acceptance item. That corroborates the
file-level change, not every interpretation in the retrospective narrative.
Later audit findings still required correcting absolute retention and global
spend-fallback wording; this disclosure amendment was not full planning closure.

## Boundary

One implementation owner: AVA. One independent reviewer: ARGUS. This branch
contains the reconciled candidate; the default branch still requires separately
authorised promotion after review. No public-use, paid-run, or app-build approval
is inferred from publishing a review record.
