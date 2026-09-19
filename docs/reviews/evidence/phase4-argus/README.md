# Phase4 ARGUS original evidence

Original supplied ARGUS verdict and all accompanying `argus-*.log` gate/source-audit logs, copied byte-for-byte. No normalization, redaction or fabricated output.

Reviewer execution: native Windows on Jarvis-1, Node v22.22.2; these are not new AVA Windows runs. The [manifest](manifest.json) records exact source paths, encodings, sizes, SHA-256 and reviewed target. UTF-16/BOM and CRLF are retained. Decode for reading/scanning only. Bundle bytes remain external; verified bundle SHA-256 is recorded, not a claim that the bundle was published.

Reviewed target: `f5007074a33e56214d4da865bd05121665cca1e7`; common base: `d799821ab549ce2c7dbb6bce8811e2a9a461b204`.

- [ARGUS-PHASE4-VERDICT.md](ARGUS-PHASE4-VERDICT.md)
- [argus-01-phase4-claims-map.log](argus-01-phase4-claims-map.log)
- [argus-02-unit-full.log](argus-02-unit-full.log)
- [argus-03-typecheck.log](argus-03-typecheck.log)
- [argus-04-focused-foundation.log](argus-04-focused-foundation.log)
- [argus-05-focused-persistence.log](argus-05-focused-persistence.log)
- [argus-06-dbgate-refusal.log](argus-06-dbgate-refusal.log)
- [argus-07-source-audit-auth-adapter.log](argus-07-source-audit-auth-adapter.log)
- [argus-08-source-audit-storage-repo.log](argus-08-source-audit-storage-repo.log)
- [argus-09-source-audit-sql-gate.log](argus-09-source-audit-sql-gate.log)
- [argus-10-build.log](argus-10-build.log)
