# PR #9 native Windows acceptance: ARGUS PASS

## Locked verdict and attribution

**ARGUS PASS on `106aac25a37e05840aa38e41ccc9f8db4c6009e6`.** This supersedes the two Windows REVISE rounds for the guarded single-label candidate, not the historical findings themselves. AVA inspected the actual supplied report and raw logs; AVA did not independently execute Windows.

- [Original verdict](evidence/pr9-r2-argus/PR9-R2-NATIVE-WINDOWS-VERDICT.md)
- [Byte-preserved archive and provenance](evidence/pr9-r2-argus/README.md)
- [Exact size/encoding/SHA-256 manifest](evidence/pr9-r2-argus/manifest.json)
- Historical repairs: [22](22-pr9-windows-sqlite-repair.md), [23](23-pr9-literal-path-and-fixture-repair.md)

The chat relay contained malformed `undefined`/SHA substitutions. The actual report and logs establish **506 passed, 5 POSIX-only skipped, 0 failed; 23 test files passed, 511 cases total**. No Windows security test was skipped. Typecheck and production build passed. An over-cap burst of **30** admitted **0**. The three additional negative probe targets (parent directory, DB file, WAL) all completed clean acceptance, successful unelevated exposure, on-disk ACE readback and rejection with **0 failures**.

## Environment and proof boundaries

The native reviewer used **Node v22.22.2**, npm 10.9.7, Windows PowerShell5.1, local NTFS, non-administrator execution. This is not a native Node24 run, despite that version being requested in the handoff; Node22.22.2 is within the repository's declared engine range. AVA's Linux qualification used Node24.21.0. Record the actual matrix instead of relabelling either run.

Reviewer tests/probes confirm:

- Safe bracketed directories/files accepted; unsafe bracketed ACLs and inherited defaults rejected.
- DACL-only fixture edits work without SeSecurityPrivilege; readback proves unsafe states before rejection.
- Replay/claim/ceiling rules hold on Windows and the existing multiprocess tests pass.
- Default-deny route remains intact. Secret scan reported clean and no paid model calls reported.

The additional 30-request burst probe is Promise concurrency within its probe process, not a new 30-process test; multiprocess evidence comes from the committed test suite. The reviewer report discloses an initial invalid-binding probe failure, later corrected. The supplied `probe-cas.log` contains the corrected successful results, not that initial failed output; the disclosure is preserved without inventing a missing raw log.

The reviewer retained a real API key in its ambient environment despite the handoff requesting credential-free children. No key value appears in the supplied archive. No-paid-call status is the reviewer's report supported by synthetic/injected test paths, not an independently captured network trace. Future gates should remove real model credentials from child environments.

## Publication scope

This closeout is **documentation/evidence only**. The entire `web/` tree remains byte-identical to the accepted SHA. Original report/probes/logs are retained byte-for-byte (including UTF-16 BOMs, CRLF and console mojibake); decode only for inspection. No application code, test assertions, provider pricing, spending ledger or credentials are changed. Archived probes contain original host paths and are historical evidence, not portable scripts to execute blindly.

ARGUS remains read-only; AVA records and publishes the supplied review. Reviewer approval does not itself authorize merge, hosting charges, deployment, live ledger activation or paid execution. PR #9 remains the publication vehicle; this record is not a claim it merged.

## Remaining product work

This closes the Windows guard/test blockers. It does **not** prove real-model extraction, deployed upload-to-result latency, live batch, saved history or an accessible application URL. The non-blocking internal diagnostic reason-code suggestion stays parked. Next operational dependency is the approved hosting/runtime target with a single durable private ledger, followed by bounded real-model/end-to-end acceptance under the existing financial authorization and release controls; no such execution occurred in this closeout.
