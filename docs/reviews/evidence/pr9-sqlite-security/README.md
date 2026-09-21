# PR #9 SQLite repair evidence

## Round 2 additions

- `argus-1df4094-native-review.txt`: exact recovered reviewer worker-log bytes,
  not raw npm output and not AVA-native execution. The substantive verdict is
  REVISE; a later automatic-verifier timeout did not accept the candidate.
- `r2-unit.log`: AVA Linux Node24, 511 tests / 23 files passed.
- `r2-typecheck.log`, `r2-build.log`: AVA Linux project gates, exit 0.
- [Round 23](../../23-pr9-literal-path-and-fixture-repair.md) documents provenance,
  byte hash, repair, RED/GREEN distinction and pending native Windows gate.

## Round 1 captures

These are AVA repair-worker **Linux x64 / Node v24.21.0** stdout/stderr captures,
not ARGUS logs and not native Windows proof. See
[review record 22](../../22-pr9-windows-sqlite-repair.md) for scope and attribution.

- `red.log`: pre-repair security tests, exit 1, 30 failed of 31.
- `red-route.log`: later route ledger-preflight regression, exit 1, one failed;
  other cases filtered by the name selection, not a complete run.
- `green-focused.log`, `green-unit.log`, `green-typecheck.log`: intermediate
  store/security repair before final route correction; not final acceptance.
- `final-focused.log`: final 81 tests / five files passed, exit 0.
- `final-unit.log`: final 508 tests / 22 files passed, exit 0.
- `final-typecheck.log`: final project typecheck, exit 0.

Final code tests preceded documentation-only closeout. Captures retain console
ANSI sequences and exact bytes; the adjacent `.gitattributes` disables log text
conversion. The narrowly scoped `.gitignore` exception includes these evidence
logs despite the repository-wide `*.log` rule. No original reviewer output was
supplied for this incident. Reported **REVISE** is preserved, not replaced by the
builder's Linux GREEN.

Parent staging verification found trailing console whitespace and terminal blank
lines in these original worker captures. Those bytes are preserved. Authored
source/docs pass strict `git diff --cached --check` with only this evidence
folder's `*.log` files excluded; the complete staged diff also passes with
`core.whitespace=-blank-at-eol,-blank-at-eof,space-before-tab,cr-at-eol`. No source whitespace exemption or
repository-wide ignore change was made.
