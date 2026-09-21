# PR #9 bounded Windows timeout and test-report correction

## Decision and scope

Alex approved AVA's recommendation: correct the Windows file-specific test timeout, qualify the test counts by platform, and obtain one fresh native full-suite verification. AVA owns implementation/publication; ARGUS owns independent native verification. This is not approval for retention machinery, new tenant architecture, deployment, merge, paid inference or live review-store/spend-ledger access.

Baseline reviewed: **474c8879aea48582e79e738fc061ded287b7e858**, containing **e721936518e36b7c6d65b5649308f21d1b57e784**. Original reviewer job: `2026-09-21T02-11-59-c19916`.

## Original independent evidence, preserved

[Original ARGUS verdict](evidence/pr9-persistence-native-original/argus-verdict.md) remains byte-identical, including its findings and conditional PASS. The [manifest](evidence/pr9-persistence-native-original/manifest.json) binds the verdict and five original logs to their source paths, encodings, byte sizes and SHA-256 hashes. UTF-16 native logs are deliberately not normalized. AVA read these artifacts; that is not an AVA native rerun.

| Historical gate | Platform/runtime | Actual result |
|---|---|---|
| Full suite at 474c887 | Linux / Node24.21.0, AVA | 565 passed / 28 files |
| Full suite at 474c887 | Windows / Node22.22.2, ARGUS | 555 passed / 5 failed / 5 skipped, 28 files |
| Isolated live-batch file, default 5s | Windows / Node22.22.2, ARGUS | 1 passed / 4 failed |
| Isolated live-batch file, CLI 120s | Windows / Node22.22.2, ARGUS | 5 passed; not a full-suite rerun |
| Native spend ACL suite | Windows, ARGUS verdict | 11 passed |
| Typecheck / default Turbopack build | Windows, ARGUS | Exit 0 / exit 0 per original verdict |

**Correction to the chat summary:** the original report and log used `--testTimeout=120000` for the successful isolated run, not 60 seconds. The reviewer recommended 60 seconds for the file. That recommendation is implemented here but is not labelled natively verified in advance.

## Root cause and minimal repair

`live-batch-route.test.ts` exercises actual private-ledger checks. On Windows those checks spawn PowerShell for read-only ACL/owner inspection, so the default 5-second Vitest budget interrupts otherwise-correct tests; interrupted cleanup also reports EBUSY. The native isolated timeout-only rerun establishes the mechanism.

Only this test file changes:

```ts
// Real Windows PowerShell ACL checks can exceed Vitest's default test timeout.
if (process.platform === 'win32') vi.setConfig({ testTimeout: 60_000 });
```

Installed Vitest's file-local API is used. Linux retains its existing default. No assertion, production deadline, global Vitest config, ledger check, ACL policy or application code changes. The alternative of a global longer timeout was rejected to avoid hiding unrelated slow tests.

H-1 is corrected in the candidate verification table and review register: 565 passing is explicitly **Linux / Node24** evidence. Historical reviewer failures and skips are retained, not rewritten as a green run.

## Verification of this correction

- Builder focused Linux before and after: 5/5 pass; explicit typecheck exit 0.
- Parent full Linux / Node24.21.0: **565 passed / 28 files**, exit 0.
- Parent typecheck: exit 0.
- Parent explicit Webpack build: exit 0 (`CIRCLE_NODE_TOTAL=2`, credential-free child environment).
- Native Windows full suite of the corrected candidate: **PENDING**. It must run without a global `--testTimeout` override, so the committed file-specific fix is exercised.
- No new browser or real-provider acceptance is claimed; application code is unchanged.

Current parent logs are selected in [correction evidence](evidence/pr9-timeout-correction/). Native verification must preserve exact SHA, Node/npm versions, command, output, counts, skips and exits; a successful five-test rerun alone cannot close the full-suite gate.

## Remaining findings, no scope expansion

- **M-1, capacity/retention:** parked for a separate bounded task. The current store retains all snapshots, including unsaved ones; at 200 snapshots or 128 MiB, new snapshots fail with `review-capacity`, and completed comparisons return `snapshot-unavailable` without a saveable server ID or automatic paid retry. Existing saved history remains. There is no prune/TTL path; a restart does not clear capacity, and append-only deletion triggers are not to be disabled as an operator workaround. A separately provisioned store is not automated retention. Do not promise indefinite save capacity.
- **M-2, Windows review-store negative permission coverage:** tracked as an open test gap. The real native spend-ledger ACL checks pass; that does not establish a dedicated `reviews.sqlite` unsafe-ACL negative test. No production permission guard is relaxed and no broader coverage claim is made.
- **M-3, shared identity:** disclosed single-code demo scope remains. All code holders can see all saved reviews and evidence; this is not tenant isolation or individually authenticated review.
- **L-1, reported mojibake:** not reproduced in the reviewed source bytes. AVA read all three Git blobs at 474c887 and compared them with the working files: each is strict-valid UTF-8, contains the correct em-dash bytes `E2 80 94`, and contains no U+00E2 mojibake prefix. The original reviewer claim is preserved, but a browser rendering defect is not established by a console decoding artifact. No contract/string rewrite was made; no fresh browser render is claimed.
- **L-2/L-3/L-4:** method-alias comment, supported Node-version distinction and experimental SQLite warning remain disclosed nonblocking follow-ups. The original Windows run was supported Node22, not Node24.

## Native operator handoff

This AVA container has read-only host mounts and no native Windows executable launcher. The previous native review's worker is complete, not an active rerun. ARGUS can use the existing native operator lane to review only the correction diff and run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run build` in a clean exact-SHA scratch checkout. No global timeout override, no source edits, no paid calls, no live stores, no elevation or unrelated ACL changes; disposable test fixtures only. Save report/logs outside checkout and return one PASS/REVISE. Publication is not native acceptance, merge or deployment.
