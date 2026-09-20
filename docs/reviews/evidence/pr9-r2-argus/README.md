# ARGUS native Windows PR #9 round-2 evidence

Original files copied byte-for-byte from `C:/Users/alexm/.hermes/pr9-r2-verification`.
The manifest records every supplied file's size, SHA-256 and inspection encoding.
All logs have a UTF-16 BOM; do not normalize or re-encode them for publication.
Console encoding artefacts and repeated probe summaries are preserved.

AVA inspected this evidence; the native execution is ARGUS-reported, not AVA-run.
[Closeout record 24](../../24-pr9-native-windows-pass.md) identifies actual runtime,
accepted SHA, repaired findings and remaining product/deployment limitations.
The archived report discloses an initial invalid-binding probe error; its raw
failed output is not in the supplied CAS log. Do not invent it or rewrite history.

Probe source retains original host paths and is evidence, not a ready-to-run
portable test suite. No need to rerun probes to publish this documentation.

Default whitespace diagnostics may flag original CRLF/report/probe formatting.
Preserve source bytes: check authored docs/manifest strictly, verify all archived
bytes by manifest, and check the full diff with
`core.whitespace=-blank-at-eol,-blank-at-eof,space-before-tab,cr-at-eol`.
