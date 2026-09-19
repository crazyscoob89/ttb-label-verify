# Phase 3 — attributed ARGUS PASS and source-publication closeout

## Report to Alex

**Accepted:** Phase 3 single-label fixture workflow and explicit human outcomes.
**Independent reviewer:** ARGUS. **Implementation/publication owner:** AVA.
**Verdict:** PASS, no critical/high blockers, dated 2026-09-19 by ARGUS.

- Reviewed frozen target: `d799821ab549ce2c7dbb6bce8811e2a9a461b204`.
- Reviewed base: `38406c12ac575c06ed55370148f907e45782ad33`.
- Implementation commits: `a39e17da5c2903aa2e1ae9f3d5e671384f6e2c7a` and
  `6ca12cf761fc512031de03b0ef0ae388d085e364`; `d799821` adds the builder handoff.
- [Verbatim reviewer verdict](evidence/phase3-argus/ARGUS-PHASE3-VERDICT.md).
- [Original logs and byte/encoding manifest](evidence/phase3-argus/README.md).
- [Original builder handoff and RED/GREEN history](16-phase3-single-review.md)
  is preserved unchanged. Its pending-review and Windows-reproduction wording
  is historical and superseded here; its runtime limitations still apply.

AVA read the complete supplied verdict and inspected the supplied logs. The
following execution is **attributed to ARGUS**, not claimed as a new AVA run.
ARGUS used an isolated Windows-native detached worktree at the exact target,
Node 22.22.2, npm 10.9.7 and Playwright Chromium 1243, distinct from the builder's
Linux/Node 24 runs. He verified the candidate bundle/source package, reported
a clean worktree and performed no remote writes or paid/deployment work.

## Required acceptance evidence

| Gate | ARGUS result |
| --- | --- |
| Unit suite | 293/293, 9 files, zero skip/todo, exit 0 |
| Typecheck | Exit 0, no diagnostics |
| Production build | Exit 0, 5/5 generated pages, dynamic `/api/comparisons` |
| Explicit-offline development E2E | 18/18 desktop/mobile, exit 0 |
| Local production-build smoke E2E | 4/4 desktop/mobile, exit 0; not a deployed-site test |
| Forged authorization/client flags and malformed binary POST | Both rejected with content-free HTTP 403 before body parsing |
| Production fixture opt-in attack | Demonstration refused even with `TTB_OFFLINE_DEMO=1`; catalog endpoint 404 |
| Original archive and prior-phase source integrity | Base-to-target identity, no benchmark/fixture/v3/dependency drift |
| Semantic boundary/false-completion review | PASS; no critical/high issues or false acceptance claim |

The original report explains source checks for default-deny access, server-side
fixture gating, exact-image binding, narrow CSP and UNSAVED memory-only decisions.
The raw development log retains expected eval-disabled warnings; they were not
converted into a production-policy relaxation or hidden from the record.
No missing failures or screenshots are fabricated. Historical builder RED
findings and the preview-CSP correction remain in the original handoff.

## Isolated publication and preservation contract

This is the already-approved phased source/review closeout, not a new deployment
or paid-execution authorization. AVA is the only remote writer for this lane.
No Phase 4/5 source, commits or acceptance are included.

The publication clone is independent of all existing implementation worktrees.
Branch `ava/phase3-reviewed-publication` begins at the actual reviewed target;
merge commit `76cfd73f0a42e1ec6f23e652b6b69ba2001116b4` integrates current master
`909c1933a71c5912cd3495ad35a4a50d27159de4` without conflicts. This preserves both
ancestries rather than squashing/recreating the reviewed source. A separate
documentation-only commit records this verdict, supplied originals and status.

Publication requires these exact object identities before push and after merge:

| Surface | Required Git object |
| --- | --- |
| `web/` — identical to reviewed target | `8d1252c0d9b9ca2087fbe728a1ecc972ec151982` |
| `bench/` — identical to latest master | `ae7eb64547a5609203f34e899a438bcd74a2799d` |
| `fixtures/` — identical to latest master | `e4a1dee3f045fc122b370741293ce901dc980346` |
| `docs/ui/v3/` — identical to latest master | `4508c1369c5343a7772433dea84f509ca9107423` |
| Root README — benchmark front-door unchanged | `207b9bec5e43638e3943ee21fee523217df1d71a` |
| `BENCHMARK-RESULTS.md` — report unchanged | `c39800a75b505ae5851104622e2708acdd5f3f9d` |

The latest [benchmark results](../../BENCHMARK-RESULTS.md),
[versioned final archive](../../bench/final-evaluation-20260918/README.md) and
[benchmark publication record](16-final-benchmark-publication.md) remain intact.
The older 1,871 benchmark count in ARGUS's original verdict refers to his review
base, not the enlarged current-master archive; it is not rewritten.

A documentation-only publication gate checks exact staged/committed blobs,
source-to-archive hashes, scope/ancestry, relative links and narrow secret/path
patterns. Large accepted browser suites are not duplicated for unchanged code.
Applicable GitHub checks, current base, mergeability and exact PR head must be
read back before a SHA-pinned normal merge. No checks or protection are bypassed,
no fake hosted status is posted, and no branches are deleted. The PR/live master
ref, not this pre-promotion document, are the authority for merge completion.
External publication evidence is retained at
`/opt/data/ttb-phase3-publication-evidence/`.

## Standing limitations and next owner

This closes **Phase 3 source acceptance only**. The HTTP comparison route still
denies all real requests; useful fixture comparisons are development-only.
Arbitrary-upload live inference, authentication, storage, durable history,
reviewer identity, physical-size compliance and batch are not delivered by this
phase. Submit review remains an UNSAVED in-memory draft. Windows reproduction
is now closed for this frozen Phase 3, not automatically for any later code.

AVA owns subsequent approved phase work; ARGUS reviews each frozen handoff.
Any Phase 4/5 work elsewhere is outside this publication and receives no PASS
by implication. Cloud provisioning, migrations, paid/model calls, live acceptance
and deployment remain separately gated. This PASS is not deployment approval.
