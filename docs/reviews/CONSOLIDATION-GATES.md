# Consolidation offline gate record

Builder: AVA; **independent final integration review pending**. Scope is the
frozen sources in [CONSOLIDATION.md](../deep-dive/CONSOLIDATION.md), not the live severity
run. Tests ran in the independent consolidation clone with credentials omitted
and inherited Linux libseccomp socket/network/IO-uring denial. A socket-denial
positive check passed before execution. No inference or report writer ran.

| Command (from repository root) | Measured outcome |
| --- | --- |
| `python3 -B bench/test_scoring.py` | PASS: 303 assertions |
| `python3 -B bench/test_extraction_safety.py` | PASS: 15 tests |
| `python3 -B bench/test_consolidation.py` | PASS: 5 tests; same regression against frozen stale Foundry root scorer fails with 14 subtest failures |
| `python3 -B bench/test_results_integrity.py` | PASS: 162 unique records / 1,134 field verdicts, hashes, caches, aggregates and entire report match |
| `python3 -B bench/test_integrity_mutations.py` | PASS: 13 tests, including Windows separator checks; isolated root-evidence snapshot, as detailed below |
| `python3 -B bench/test_archived_spend.py` | PASS: 3 tests; root runner refuses before credential load/dispatch |
| `python3 -B bench/test_checkout_portability.py` | PASS: 1 test, Git `core.autocrlf=true` checkout plus Stage-2 integrity gate; not native Windows execution |
| `python3 -B bench/corpora/ttb-foundry-20260918-v1/verify_publication.py` | PASS: 94 image entries, 42 provenance files, 72 portable fixture mappings, 14 README links, manifest/freeze hashes and tracked blob identities |
| `python3 -B bench/run_bench.py --dry-run` | PASS: 432 planned calls across 8 historical registry entries; **zero issued** |

The first mutation run timed out at 300 seconds while each test copied the
newly enlarged `bench` tree. It was not counted as PASS. The unchanged suite was
resumed against byte-identical root `bench` files and `fixtures` in an isolated
snapshot, excluding unrelated archive/corpus subtrees from repeated copying.
All 13 tests passed. No assertions, historical results or expected scores were
changed to make this pass. The full merged checkout portability test passed
separately. Tests within the absolute-path historical Foundry runner archive
were not executed; they are not a portable acceptance command for this PR.

## Integrity and publication checks

- Compare source Git blobs and SHA-256 hashes before/after: all image/raw/result
  artifacts and the entire Foundry archive retain their committed bytes.
  No renderer, re-scoring writer, report generator or live-run reader was used.
- Preserve root scorer/validator/replay and existing `.gitattributes` path/hash
  fixes from the repaired line; nested archive code remains historical.
- Run committed-object secret checks without printing match contents: known
  credential-value detection plus token/private-key/credential-URL and quoted
  key patterns. This is a bounded automated scan, not exhaustive secret
  certification or independent security review.
- Run relative documentation links, committed source refs, changed-path scope,
  remote tree/blob and sample image SHA-256 checks at publication.
- Default `git diff --check` reports inherited **CRLF terminators** in frozen
  Foundry artifacts. Preserve the bytes. With the explicit command
  `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`,
  the merged diff passes; newly authored code/docs pass ordinary whitespace
  checks. No archive was normalized to conceal this inherited diagnostic.

Local detailed logs and before/after inventories are under
`/opt/data/reports/ttb-consolidation-candidate/`: `test_*.log`,
`regression_red.log`, `corpus_publication.log`, `dry_run.log`,
`initial-timeout.txt`, `source-hashes-before.json`, plus final integrity,
secret-scan and remote-verification records. These are builder evidence handles,
not repository-portable links or an independent verdict. Exact final commit/PR
identity is recorded by the PR and publication handoff, avoiding a self-hash.

No application build, native Windows runtime, paid provider validation,
deployment, private-network feasibility or final severity-run publication is
claimed. PR #1 and master remain untouched; review/merge decisions stay open.
