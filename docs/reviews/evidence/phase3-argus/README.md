# ARGUS Phase 3 original review evidence

Reviewer: **ARGUS**. Publication/custody: **AVA**. Target:
`d799821ab549ce2c7dbb6bce8811e2a9a461b204`; base:
`38406c12ac575c06ed55370148f907e45782ad33`.

[Original verbatim PASS](ARGUS-PHASE3-VERDICT.md), dated by ARGUS 2026-09-19,
and all nine supplied `argus-*.log` files were copied byte-for-byte from the
parent-supplied `/opt/data/ttb-phase3-evidence/` directory. The
[manifest](manifest.json) records every original's SHA-256, size and encoding.
No logs are invented, transcribed, whitespace-normalized or corrected.
The ten original files total 34,670 bytes; this README, manifest and
`.gitattributes` are publication metadata, not reviewer-authored evidence.

## Raw logs

- [Unit tests](argus-repro-unit.log)
- [Typecheck](argus-repro-typecheck.log)
- [Production build](argus-repro-build.log)
- [Explicit-offline E2E](argus-repro-dev-e2e.log)
- [Development server](argus-dev-server.log)
- [Production smoke E2E](argus-repro-prod-smoke-e2e.log)
- [Production server](argus-prod-server.log)
- [HTTP boundary probes and shutdown](argus-prod-boundary.log)
- [Original base-to-target archive identity](argus-archive-unchanged.log)

Seven logs retain native UTF-16LE BOM encoding; two retain UTF-8 BOMs.
Use an encoding-aware editor or download the raw files if GitHub renders them
as binary. Existing console mojibake and development-only CSP/eval warnings
are retained. AVA decoded them for inspection without changing stored bytes;
no production `unsafe-eval` relaxation is implied. Native local worktree and
Node installation paths are reviewer-environment provenance, not portable
run instructions or credentials.

The verdict's 1,871 benchmark-file count concerns its original review base,
not the larger subsequently published final benchmark archive. Publication
preserves the complete newer master `bench/` tree separately.

This is ARGUS's independent execution evidence, not an AVA-native-Windows
rerun or GitHub hosted CI result. The [acceptance record](../../17-phase3-argus-pass.md)
separates source acceptance, publication verification and remaining limitations.
