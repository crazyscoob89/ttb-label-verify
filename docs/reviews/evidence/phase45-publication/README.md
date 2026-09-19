# AVA combined-publication verification

Linux / Node v24.21.0; credential-free allowlisted process environment, copied frozen Phase 5 dependencies. Composition gates, not ARGUS reviewer execution and not live acceptance. No browser rerun; independent original browser results remain in the separate Phase 5 archive. The first background runner failed before execution because `python` was not on its shell PATH; rerun with `/usr/bin/python3` completed all gates. No gate failure was hidden. `test:db` exit 1 is the expected no-config denial.

- [composition-proof.json](composition-proof.json)
- [combined-gates.json](combined-gates.json)
- [combined-unit.log](combined-unit.log)
- [combined-typecheck.log](combined-typecheck.log)
- [combined-build.log](combined-build.log)
- [combined-db-refusal.log](combined-db-refusal.log)

[Byte manifest](manifest.json). These AVA `.log` copies normalize trailing whitespace, CRLF and blank EOF lines solely for Git whitespace checks; they are **not byte-identical raw archives**. The manifest records original and published hashes. Original AVA logs remain at `/opt/data/ttb-phase45-publication-evidence/`. The separate ARGUS logs/reports are untouched verbatim originals.
