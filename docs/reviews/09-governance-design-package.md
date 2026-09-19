# Review 09 — v3 freeze, governance specification and build plan

## Management status

**Current package: pending ARGUS review and Alex's application-scope approval.**
AVA owns this documentation/publication branch. ARGUS is read-only reviewer. Alex authorized only the governance specification, phased build plan and frozen v3 assets in Git. No application scaffold, live identity/storage setup, migration, deployment, provider calls or benchmark edits are authorized by that instruction.

Base: `a83e35c0e6ed283f508b30ae4bfe292658038fa9` on `master`.
Branch: `ava/governance-plan-v3`. Exact candidate SHA is supplied in the external review handoff/PR; this record does not use a self-referential placeholder SHA as evidence.

## Source and rationale

The controlling assignment is linked in [governance design](../GOVERNANCE-AND-AUDIT-DESIGN.md). It does not explicitly require identity/history. Those are proposed scope additions arising from Alex's questions: who performed a review, whether approval survives reload, and where records go. The existing mock receipt is temporary and must not be presented as historical approval.

The repository's earlier `PLAN.md`, threat model and checklist prohibit content persistence and omit users. The new design explicitly proposes an amendment rather than falsely claiming this was always approved. Existing matching, upload, no-tools extraction and global-spend safeguards remain relevant; old no-retention language is marked historical. Before implementation Alex must accept the data destinations/retention/access trade-off. A documentation PASS cannot activate storage.

## Preserved review trail (human-relayed counterpart reports)

These entries summarize ARGUS text supplied by Alex in the current project conversation; they are not invented raw logs or AVA's independent rerun of ARGUS's work.

| Round | Reported inspection and verdict | Findings / resolution |
| --- | --- | --- |
| Initial A/B/C | ARGUS inspected THREE-OPTIONS and full-size B PNGs, not HTML/source. B > A > C; PASS with minor revisions. | Mid-word wrapping, disconnected confirmation/action, weak status contrast and ambiguous origin. Resolved in v2 per subsequent report. |
| v2 | ARGUS inspected Single, Batch and selected-batch PNGs plus changes doc/test results; did not interact with HTML. PASS, no blocking UX findings. | All four corrections and two-tab/full-width batch flow verified. Non-blocking items: submit helper, status clipping/alignment, jargon, native file input styling. |
| v3 | Alex supplied ARGUS's consensus offer stating “v3 design = FINAL. PASS from review, Alex likes it.” Full separate v3 review transcript and modality were not supplied in this handoff. | Alex's requested visible color-coded outcomes and quick batch switch are in frozen v3. AVA's original 54-check results and rendered evidence are preserved, not promoted to an ARGUS browser run. |
| Governance discussion | Earlier ARGUS document-only position was superseded by his later agreement to spec first, bounded implementation after Alex approval. | AVA corrected “identity/history survive at all costs”: correctness, readable evidence and safe errors come first. ARGUS explicitly accepted that correction. |

The final agreed sequence is spec/plan → ARGUS consolidated review → Alex scope approval → phased build with frozen handoffs → deploy testing/freeze. The prior offer to do more cosmetic mock rounds was superseded by freezing v3. September 24 is a stated evaluation-share target, not grounds to hide failed gates.

## What is in this candidate

1. [Governance specification](../GOVERNANCE-AND-AUDIT-DESIGN.md): authenticated actor, evidence-version binding, append-only events, correction/escalation semantics, private data flow and proposed retention/non-goals.
2. [Build plan](../BUILD-PLAN.md): six phases with two bounded sprints each, exact proposed paths, test-harness ownership, acceptance gates, approval decisions and cut order. No future npm command is represented as executable today.
3. [Frozen v3](../ui/v3/README.md): original HTML/screenshots/script/results with hash manifest. No new mock design or source change.
4. README/register links and explicit legacy-scope amendment notices; `.gitattributes` preserves hash-pinned imported assets across checkout platforms.

## Validation and remaining risks

Publication gates: approved path allowlist; no changes under `bench/` or `fixtures/`; identical frozen source bytes; local Markdown-link validation; exact HTML/script syntax; diff whitespace; scoped secret scan; remote branch SHA read-back. These are documentation/publication checks, not live auth, database, OCR, app latency or deployment acceptance. Gate results and exact candidate accompany the handoff rather than fabricating a new independent PASS here.

Builder pre-publication validation passed: 15 frozen imported artifacts byte-matched the original v3 files and manifest; 64 relative Markdown links resolved; six phases / twelve unique sprint IDs reconciled; HTML inline-script and archived test-script syntax passed; approved path scope, whitespace and value-free secret-pattern/known-credential scans passed. `bench/` and `fixtures/` were unchanged. These figures describe this documentation candidate, not additional browser or model tests.

Open: ARGUS review of this candidate; Alex approval of D1–D4; actual vendors/regions/configuration, budget and deployment authority; actual runtime comparison reliability, approximately five-second end-to-end performance and restricted-network/Foundry feasibility. Historical finite benchmark findings do not remove those gates.

## Requested independent review

Read the governance spec and build plan as one package against the original assignment and frozen v3. Return one consolidated PASS/REVISE for executable-scope or material safety gaps, including conflicting retention assumptions, weak identity/evidence binding, unsafe cut order, orphaned test commands or misleading implementation claims. Verify source modality honestly. Do not edit, provision, rerun paid benchmarks or build a competing implementation. Alex decides implementation scope after that verdict.
