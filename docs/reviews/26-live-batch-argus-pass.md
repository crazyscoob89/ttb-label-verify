# PR9 live batch — supplied ARGUS PASS

## Status and provenance

**ARGUS supplied PASS** for application candidate
`75fe83d30441b3917869fb6a1164506337b9940c`, reviewed on **2026-09-20**.
The published evidence commit is `fa56bcc7d5b50bb63b4bc559c91682e237f355ab`.
This is AVA's documentation of the supplied reviewer outcome, **not a new
independent review or a fresh execution of any application gate**.

The [unaltered ARGUS verdict](evidence/pr9-argus-batch-pass/verdict.md) is the
primary reviewer statement. Its source was
`/host-home/Projects/argus-pr9-live-batch-review/docs/reviews/verdict.md`;
selected native receipts came from that review workspace's top level, **not**
from its historical `repo/` clone. Source files were read only. No benchmark
corpus, clone, credential files, ledger files, or generated application build
tree was copied.

ARGUS reports that the published commit is a **docs-only superset** of the
candidate: more than `web/DEMO-OPERATIONS.md` changed, but no application/source
code changed. The prior Windows PASS at `106aac2` is closed historical context,
not approval for this candidate.

## Precisely what passed, and what did not

ARGUS's reported environment was Windows_NT 10.0.26200 x64, Windows PowerShell,
**Node v22.22.2**, npm 10.9.7, and git 2.54.0. Commands below are preserved as
reported in the verdict, not reconstructed from the output or rewritten to
match another bundler.

| Gate | Historical command / evidence | Recorded result |
|---|---|---|
| Initial Windows full suite | `npx vitest run --maxWorkers=1`; [full native output](evidence/pr9-argus-batch-pass/test-run-full.txt) | **553 passed, 5 skipped, 4 failed by 5000ms timeout**, 562 total; 25 files passed, 1 failed; 147.83s. Not a green full Windows suite. |
| Targeted Windows rerun | `npx vitest run tests/live-batch-route.test.ts --maxWorkers=1 --testTimeout=30000`; [native output](evidence/pr9-argus-batch-pass/test-livebatch-30s.txt) | **5 passed / 1 file**, 28.91s, with a **30-second per-test timeout**. This is not a rerun of all 562 tests. |
| Windows typecheck | `npx tsc --noEmit`; [native output](evidence/pr9-argus-batch-pass/typecheck.txt) | ARGUS reports **exit 0 / PASS**. The original receipt is an existing **zero-byte file**, preserved as such; the file alone does not establish an exit code. |
| Windows build | `npx next build`; [native output](evidence/pr9-argus-batch-pass/build.txt) | **Next.js 16.3.5 (Turbopack)**, successful compilation and 5/5 static pages. ARGUS reports **exit 0 / PASS**; the output file has no standalone exit-code marker. |
| Separate AVA Linux parent suite | [Previously committed `parent-unit.txt`](evidence/pr9-live-batch/parent-unit.txt) at `fa56bcc7d5b50bb63b4bc559c91682e237f355ab` | **562 passed / 26 files**, 56.12s; AVA's reported Node version is **v24.21.0**. This is separate evidence, not Windows execution. |
| Separate AVA build | Historical `npm run build -- --webpack`; [previously committed `batch-build.txt`](evidence/pr9-live-batch/batch-build.txt) at the same published commit | The actual committed receipt prints **`next build --webpack`**, **Next.js 16.3.5 (webpack)**, successful compilation and 5/5 static pages. **Webpack passed too.** |

All four initial failures are in `tests/live-batch-route.test.ts`; the full
receipt also retains a Windows `EBUSY` temporary SQLite cleanup error after a
timeout. The five skips are native POSIX cases. ARGUS attributes the failures
to environmental timing, not candidate logic, and recommends a non-blocking
timeout-budget adjustment. The targeted rerun durations are 3971, 6639, 4686,
7606, and 5460ms. We preserve that diagnosis as **ARGUS's assessment**, without
claiming a new root-cause experiment or a full 562-test Windows-green run.

### Bundler correction without altering history

The original verdict's bundler discussion implies that AVA's Webpack command
does not match the project and recommends aligning the wording to Turbopack.
That implication is too broad: the **actual committed AVA build receipt** proves
an explicit Webpack build succeeded. ARGUS's Turbopack command and AVA's explicit
Webpack command are two distinct successful historical runs. Neither the
original verdict nor either historical command/log has been edited. The
[manifest](evidence/pr9-argus-batch-pass/manifest.json) pins the previously
committed AVA receipts by commit, Git blob ID, byte size, and SHA-256; they are
referenced in place rather than duplicated into the ARGUS archive.

## Review scope and limits

ARGUS reports no critical/high candidate logic defects and no blockers. The
supplied review covers duplicate/restarted intent denial, conflicting
application/image binding, stale preparation/results, server concurrency and
spend limits, malformed provider responses, human mismatch policy, hidden-tab
control isolation, and the distinction between preparation/access credentials
and independent spend authority. In particular, preparation binding plus the
shared access secret is **not** spend authorization, and the ABV 45-versus-40
mismatch must not silently pass.

- ARGUS **did not independently rerun** the four simulated-live browser checks
  or the 36 offline desktop/mobile browser checks; it relied on published AVA
  evidence. This archival task did not run browser checks either.
- The provider-555 and batch-focused-318 gates were not independently rerun in
  isolation by ARGUS. Do not relabel those AVA gate receipts as ARGUS runs.
- ARGUS reports no paid provider calls, unset production environment variables,
  and disposable isolated test ledgers only. This archival task made no paid,
  ARGUS/MCP, or cloud calls and did not access the canonical private ledger.
- **PASS does not merge or deploy PR9, authorize paid use, certify production
  readiness, or certify durable saved-review history.** SQLite spend/dedup
  behavior and offline persistence contracts are not proof of a deployed
  saved-history workflow or a validated saved-review receipt.
- Restart/status chatter accompanying delivery remains **irrelevant operational
  notices, not application failures or additional gate outcomes**. No transcript
  was reconstructed or archived. Actual timeout/cleanup diagnostics in the
  test logs remain intact; handler-restart tests are distinct application tests,
  not delivery chatter.

## Archive and availability

The archive is [evidence/pr9-argus-batch-pass/](evidence/pr9-argus-batch-pass/):

- `verdict.md`: complete original reviewer report.
- `test-run-full.txt`: complete initial full-suite receipt, including failures,
  skips, cleanup diagnostic, and final totals.
- `test-livebatch-30s.txt`: complete available targeted rerun receipt.
- `typecheck.txt` and `build.txt`: available original type/build receipts. No
  separate machine-readable process exit-status receipt was available in the
  inspected review report directory or workspace top level; exit-0 claims are
  attributed to ARGUS's report/setup notes, not manufactured log content.
- `out-test.txt`: additional **partial preliminary capture** without final suite
  totals or a complete command line. It shows three failed route cases and
  native SQLite/PowerShell warnings; it is neither the complete initial suite
  receipt nor the successful 30-second rerun, and is not counted as another gate.
- `NOTES-setup.md`: original setup/final-result notes, including resolved Windows
  checkout trouble and historical bundler wording. These operational notes do
  not override the final verdict or the explicit bundler correction above.
- `manifest.json`: source/archive SHA-256 and byte-size pairs, original encoding
  and newline metadata, receipt limitations, and pinned AVA references.
- `SHA256SUMS`: archive checksums, including the manifest and scoped attributes.
- `.gitattributes`: scoped protection against newline/encoding/filter changes
  to the seven originals; no repository-wide attributes changed.

Original bytes, BOMs, CRLFs, empty output, and existing console mojibake are
preserved, not cleaned up. In particular `out-test.txt` retains its UTF-16LE BOM.
Decode a copy for reading; do not normalize archived originals. Publication
screening of the selected reports/logs found no credential-pattern findings in
the initial targeted scan; synthetic fixture secrets/URLs in test diagnostics
are test data, not production credentials. No credential files were opened for
comparison; this screening is not a comprehensive secret-free certification.

Verification from the repository root:

```sh
(cd docs/reviews/evidence/pr9-argus-batch-pass && sha256sum -c SHA256SUMS)
```

This records the supplied PASS with its Windows timeout qualification,
separate Linux result, browser limitations, and both actual build histories.
No application source or release/register/index files are changed by this task;
no staging, commit, push, merge, or deployment is performed.
