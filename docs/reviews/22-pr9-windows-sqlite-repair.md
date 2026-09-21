# PR #9 — Windows SQLite private-ledger repair

## Decision and ownership

- **Reported independent verdict remains REVISE.** Alex relayed ARGUS's native-Windows constructor failure (`Private existing ledger required`) and the two-process dedup assertion failure (expected `[0,2]`) for PR #9 at `7c45c74094c7712d9ca60dd6494f22c2d30edd50`.
- This is an attributed report from the repair assignment, **not** an original reviewer log archive. Full Windows output, actual child exit array and a new reviewer verdict were not supplied to this worker.
- AVA is sole implementation owner; parent owns verification/publication. No commit, push or remote action was performed by this repair worker. Branch remains `ava/prototype-delivery`, based on the SHA above.
- Local repair evidence collected 2026-09-20 using **Node v24.21.0, Linux x64**. **Native Windows execution and acceptance remain pending.** No native Windows transport was proven or used; simulated ACL snapshots are not NTFS proof.

## Root cause and scope

1. `web/lib/sqlite-spend.ts` unconditionally interpreted `stat.mode & 0o077` as a confidentiality test. Windows Node modes do not describe NTFS DACL principals, so even a private Windows file can be rejected. Skipping the check would be insecure.
2. The old spawned test constructed `SqliteSpendStore` **outside** its action `try/catch`, while the parent used `stdio: 'ignore'`. Constructor failure therefore prevented any reservation/claim and hid its diagnostic. The reported assertion is consistent with startup failure, not proof that SQLite's CAS failed. No native child exit array is invented here.
3. The one-time provisioning CLI and route ledger preflight repeated POSIX-only directory mode checks. A store-only fix would still leave Windows provisioning/route use blocked. The route-specific regression reproduced a false 503 after the store repair and before the route correction.
4. Direct store provisioning previously created a ledger without checking its parent; startup only checked the main DB, not existing sidecars. The repair closes this same ledger security boundary rather than managing host ACLs generally.

### Repair

- New `web/lib/ledger-security.ts` provides one private-ledger policy for creation/opening. POSIX retains the no-group/other mode guard and adds current-user ownership, private directory, single-hardlink and path-component checks.
- Windows performs **read-only built-in PowerShell** inspection of local fixed NTFS paths. It reads raw security descriptors, uses exact SIDs, requires current-user ownership and FullControl, and allows only current user, SYSTEM (`S-1-5-18`) and built-in Administrators (`S-1-5-32-544`). Parent DACL protection plus OI/CI FullControl inheritance supplies confidentiality for newly created SQLite files. Existing DB/WAL/SHM/journal are inspected too.
- Null/empty/noncanonical/unreadable ACLs, unknown principals, deny/object/conditional ACEs, unsupported paths/filesystems, reparse ancestors, missing tooling, malformed output and inspection failures fail closed. Paths are data on UTF-8 stdin, never interpolated into PowerShell source. Execution/output are bounded; no profile, elevation, execution-policy override, bypass setting, ACL mutation or fallback exists in production code.
- Provisioning checks the directory and absence of the DB **and stale sidecars before creation**, uses exclusive creation, then rechecks the file before initialization and the sidecars afterward. Startup checks before/after SQLite open and closes the connection on failure. It does not auto-provision, delete, repair or reset an active ledger.
- CLI and route now delegate ledger permission verification to that same mandatory store guard. The route still verifies it before reading the body or reaching provider transport. Only its redundant ledger preflight/import changed; auth, pricing, intake, model and comparison logic are frozen.
- Child tests capture bounded stdout/stderr, report startup failures, pin their working directory and distinguish expected SQL/CAS rejection from unexpected errors. Time bounds include Windows inspection overhead.

### Preserved money invariants

The schema, `BEGIN IMMEDIATE` transactions, $25 ceiling, permanent $1 reservations, unique reservation/attempt/claim identities and max-two work/claimed concurrency are unchanged. Completion does not refund. Crashed claims and slots remain blocked. No reset, reconciliation, reclaim, retry, paid request or alternate production ledger was introduced.

## RED → GREEN evidence

Evidence directory: [`evidence/pr9-sqlite-security/`](evidence/pr9-sqlite-security/README.md).

| Check | Observed result | Evidence |
| --- | --- | --- |
| Original Node24 Linux baseline, `sqlite-spend.test.ts` + `spend.test.ts` | 27 passed; Windows incident not natively reproduced | Worker terminal observation; no saved baseline log |
| Security regressions against original implementation | **30 failed / 31**; safe Windows-style mode rejected, unsafe ACL snapshots ignored, unsafe parent/sidecar cases accepted | [`red.log`](evidence/pr9-sqlite-security/red.log) |
| Route regression after store repair, before route correction | **1 failed**, false 503 instead of 415; remaining cases filtered by `-t`, not a full gate | [`red-route.log`](evidence/pr9-sqlite-security/red-route.log) |
| Final focused ledger/security/spend/route run | **81 passed / 5 files**, exit 0 | [`final-focused.log`](evidence/pr9-sqlite-security/final-focused.log) |
| Final full unit run | **508 passed / 22 files**, exit 0 | [`final-unit.log`](evidence/pr9-sqlite-security/final-unit.log) |
| Final project typecheck | Exit 0 | [`final-typecheck.log`](evidence/pr9-sqlite-security/final-typecheck.log) |
| Git diff whitespace | Exit 0 | Worker `git diff --check` |

Earlier `green-*` logs are retained as **intermediate** checks, superseded by the final logs after the route regression. Tool automatic single-file lint emitted inappropriate default-target/module-resolution errors (and later an unavailable `npx` linter); the explicit project `npm run typecheck` is the authoritative TypeScript gate and passed.

### Coverage distinction

- `sqlite-spend.test.ts`: **unmocked** real SQLite and independent Node subprocesses on every platform, including Windows. CAS single winners, unique attempt ID, restart, retained holds, exhausted cap in a fresh process, durable max-two slots/claims, and startup diagnostics. No Windows skip.
- `sqlite-spend-native-security.test.ts`: ten **unmocked** OS security cases, no Windows skip. Safe provisioning/CLI, exposed parent/main DB/WAL/SHM/journal, actual WAL+SHM privacy, directory symlink/junction rejection, hardlink rejection and Unicode/spaced/literal path handling. On this host these establish Linux behavior only. On Windows they invoke real PowerShell and modify ACLs **only in registered disposable fixture directories**, never the actual demo directory or system ancestry.
- `sqlite-spend-security.test.ts`: explicitly labelled Windows **mocked inspection contract** cases, plus separately labelled original POSIX regressions and stale-sidecar check. Five POSIX-only mode cases are conditional; they are additional to the unskipped native security suite, not replacements for Windows CAS/hardcap assertions. Foreign ownership, broad/unknown SIDs, inheritance faults, malformed/failed inspection and unsupported ACL forms have negative controls. Mocked ACL acceptance does not prove the PowerShell/.NET/NTFS boundary.
- Existing route and browser tests use the disposable private-directory helper; their provider transport remains synthetic. Browser tests were not run in this repair worker.

## Reproduction and next owner

From `web/`, use Node 24 with locked existing dependencies. Local runtime used:

```sh
export PATH=/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin:$PATH
npm test -- tests/sqlite-spend-native-security.test.ts tests/sqlite-spend-security.test.ts tests/sqlite-spend.test.ts tests/spend.test.ts tests/demo-route.test.ts
npm test
npm run typecheck
```

**Next: parent verifies/freezes/publishes; ARGUS performs a native Windows rerun on that frozen candidate, unelevated, local NTFS, Node 24.** From its `web` directory:

```powershell
node --version
npm.cmd test -- tests/sqlite-spend-native-security.test.ts tests/sqlite-spend-security.test.ts tests/sqlite-spend.test.ts tests/spend.test.ts tests/demo-route.test.ts
npm.cmd test
npm.cmd run typecheck
```

Require passing real process/CAS/restart/cap and native security cases; retain child/PowerShell errors if blocked. Do not adjust system/shared ACLs, use the live demo ledger as a fixture, weaken the guard, skip the Windows assertions, or call models to obtain PASS. These commands use disposable test ledgers, not the authorized real spending ledger.

## Limitations / release boundary

- **REVISE remains open pending native Windows proof and independent review.** PowerShell syntax/runtime behavior, actual NTFS inheritance, Windows locking/concurrency, native CLI and native route behavior have not been executed by this worker.
- No production build, browser run, deployment, hosted service, real credential lookup, paid inference, live volume provision or ACL changes outside fixtures were performed.
- This is a conservative policy, not a complete effective-access/enterprise ACL engine. Legitimate but complex ACL layouts can be rejected. There is no silent compatibility fallback.
- Checks are point-in-time. Same-user malicious processes, administrators/root, untrusted/mutable ancestry or deliberate operator rollback/replacement of the ledger remain outside this local demo threat model. Keep the account, runtime and configured private persistent path trusted/stable; never restore/re-provision to reclaim spend.

## Parent verification before publication

AVA re-read the production guard, fixtures and report, then independently ran the full suite on Linux with Node v24.21.0: **508 tests / 22 files passed**, project typecheck passed, and production build passed. The unchanged transactional SQL and fixed money limits were inspected in the repair diff.

AVA also ran the affected synthetic-provider browser test in desktop and mobile modes against an explicitly started credential-free loopback server: **2 passed**. The first browser invocation failed before either test body because Playwright's default Chromium build 1243 was unavailable. The rerun used the existing explicit Chromium headless-shell build 1234 through the repository's supported executable-path setting. This is synthetic transport through the real handler, not live provider/deployed ingress proof. The temporary server was stopped after verification.

Native Windows proof and ARGUS's independent verdict remain outstanding. These local results do not supersede the reported REVISE and do not authorize paid execution.

## Changed files

Production ledger boundary: `web/lib/ledger-security.ts` (new), `web/lib/sqlite-spend.ts`, `web/scripts/provision-demo.ts`, and only the ledger preflight in `web/lib/demo-route.ts`.

Tests: `web/tests/sqlite-spend.test.ts`, new `web/tests/sqlite-spend-security.test.ts`, new `web/tests/sqlite-spend-native-security.test.ts`, new `web/tests/fixtures/private-ledger.ts`, and fixture setup only in `web/tests/demo-route.test.ts` and `web/tests/e2e/live-demo.spec.ts` (plus route-test timeout).

Docs/evidence: `web/DEMO-OPERATIONS.md`, this record, `docs/reviews/README.md`, and `docs/reviews/evidence/pr9-sqlite-security/` (logs, evidence README, narrow log inclusion/byte-preservation rules).
