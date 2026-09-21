# PR #9 round 2: literal Windows paths and unelevated negative tests

## Decision / actual reviewer evidence

**REVISE remains the independent verdict.** Reviewed base: `1df409401e76cc964b5f774c4bd160e254532f1f`. AVA implements and publishes; ARGUS independently reruns native Windows and does not edit source. Paid execution remains held.

AVA recovered the actual reviewer worker log from job `2026-09-20T20-57-10-e62581`, not merely the truncated wake summary. A byte-identical copy is [archived here](evidence/pr9-sqlite-security/argus-1df4094-native-review.txt): 9,946 bytes, SHA-256 `9dd00289c67c53a0ae4f5bc4f26c59d0d5618d990a90de4899a515b877c1f920`. This is the reviewer's prose execution report, not raw npm stdout or AVA-native execution.

The reviewer reports **500 passed / 3 failed / 5 skipped (508 tests)**; typecheck/build passed. The original `demo-route.test.ts` and `sqlite-spend.test.ts` defects were fixed. Windows CAS, replay, ceiling and independent unsafe-ACL probes passed. All three remaining failures were in `sqlite-spend-native-security.test.ts`:

1. Valid bracketed directory rejected by the PowerShell 5.1 ACL reader. The reviewer proved the direction: ASCII directory accepted, same descriptor after rename to `ledger [literal]` rejected. Unicode alone worked. This is false rejection, not evidence that an unsafe path was accepted.
2. Two fixture failures while adding unsafe permissions: reading/reapplying the ACL through provider cmdlets demanded `SeSecurityPrivilege`. The fixture setup **errored before the rejection assertions**, producing failed tests, not false-green passing tests. Therefore those assertions supplied no negative-security evidence; the independent probes were separate evidence.

The worker's later automatic verifier timed out and reported no verdict. Its metadata `PASS (inconclusive)` does not supersede the substantive REVISE. Broad wake-event commit/file counts are not changes made by this read-only reviewer; its report says it made no commits and removed its scratch worktree.

## Bounded repair and why

- Production PowerShell uses literal .NET `File.GetAttributes`, `DirectoryInfo`/`FileInfo`, and `GetAccessControl(Access | Owner)` instead of filesystem-provider cmdlets. Brackets remain literal. The reader never requests Audit/SACL, and performs no ACL writes.
- Missing optional sidecars are handled only for file/directory-not-found exceptions. Other errors remain fail-closed. Existing reparse, owner/SID, canonical/protected DACL, FullControl, inheritance, POSIX, hardlink and sidecar policies are unchanged.
- The **test-only** exposure helper reads only `Access`, adds an Everyone ReadAndExecute ACE, writes that DACL with the .NET API, then independently reads back and requires the applicable ACE. It never requests or rewrites Audit/SACL. No administrator mode, privilege grant or execution-policy change is introduced.
- Native negative tests require acceptance of the clean state first, then successful exposure/readback outside `toThrow`, then rejection. A broken inspector or failed fixture mutation cannot count as security success.
- A new native regression provisions in a private ASCII directory, renames it without altering its descriptor to a bracketed directory, uses a bracketed database filename, checks live WAL/SHM, then exposes the database and requires rejection. It has no Windows skip or OS mocks.
- Two source-contract tests prevent reintroduction of provider cmdlets or audit-section dependencies. These are explicitly **not** native PowerShell/NTFS proof.

The spending schema/SQL, reservation/claim semantics, ceilings, auth, routes, model transport and UI are unchanged. The reviewer's non-blocking diagnostic-reason-code suggestion is parked; it does not expand this repair.

## Verification evidence

Environment: Linux, pinned Node v24.21.0. No model credentials were passed to final unit/type/build commands; no inference or live ledger provision occurred.

- RED: both newly added Windows source-contract tests failed against the original implementation before edits. Observed via parent tool output; not presented as native Windows reproduction. The native failures on the old candidate are separately preserved in ARGUS's report above.
- Focused GREEN: **84 tests / 6 files passed**, project typecheck passed.
- Final full suite: **511 tests / 23 files passed**; [unit output](evidence/pr9-sqlite-security/r2-unit.log).
- Final project [typecheck](evidence/pr9-sqlite-security/r2-typecheck.log) and [production build](evidence/pr9-sqlite-security/r2-build.log): exit 0.
- Browser tests were not rerun this round; UI/route/spending code did not change. The prior round's synthetic browser tests do not establish this round's native Windows behavior.
- Exact capture bytes retained. Strict authored-file whitespace validation excludes only archived `*.log` captures; complete diff also checked with blank-terminal-console whitespace disabled, as documented in the evidence README. Native reviewer artifact byte hash is checked separately.

**Not yet proven:** Windows PowerShell 5.1/.NET behavior of the replacement, all native fixture readbacks, bracket-path acceptance and native suite on the replacement commit. Linux GREEN is not Windows acceptance. No deployment/working external URL or live spending approval results from these checks.

## Native re-review handoff

ARGUS: use the exact replacement SHA supplied with the handoff in a clean detached scratch checkout. Normal Windows user, local NTFS, Node24. From `web/`:

```powershell
node --version
npm.cmd test -- tests/sqlite-spend-native-security.test.ts tests/sqlite-spend-windows-script.test.ts tests/sqlite-spend-security.test.ts tests/sqlite-spend.test.ts tests/spend.test.ts tests/demo-route.test.ts
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Keep runtime credentials out of the test environment. Do not grant SeSecurityPrivilege, elevate, alter host/shared ACLs, provision a live ledger, spend, or skip native assertions. Fixture ACL writes are restricted to registered disposable test directories. Require **positive control -> actual exposure readback -> rejected unsafe state**, plus the renamed-bracket native regression. If blocked, preserve the exact failing names and PowerShell/child diagnostics; do not treat startup failure as a successful rejection. Return a single consolidated PASS/REVISE directly to AVA, with the actual result file path.
