# Bottle-photo extraction clarity repair

## Compatibility and reproducibility

The group prompt in `web/lib/extraction/openrouter.ts` has a **template clarity
revision `bottle-photo-clarity-r1`**. This is intentionally not a wire migration:
`GROUP_PROMPT_VERSION` remains `photo-set-observations-v2`, outer schemaVersion
remains 2, per-photo evidence remains schemaVersion 1, and all seven fields,
observation statuses and nullable warning-format booleans are unchanged. The
single-image v1 prompt is untouched. No SQL, record, comparison-policy or intake
changes are included.

**Historical v2 records do not imply byte-identical prompts.** The previous
prompt is recoverable at base commit
`49e8d131a77633a84291ab60409d40c5095b6871`. With the existing dependency set,
the captured UTF-8 system-prompt SHA-256 values are:

- Before: `17278afb8f1dd95cd75a3ef75f18a07e590ddec272a0c77ded796559cd9336ef`
- This revision: `e795f8299ca1f5f1bc4a3defcc65398beabfb75ce74a29feb339467feaad5f8d`

Use the source commit plus captured prompt/dependencies for exact reproduction;
never relabel old observations as produced by this revision. If persistent
per-record template identity is required, the parent integration can add an
explicit optional `promptTemplateRevision` or `promptSha256`, with coordinated
strict validators/storage support. That integration is **not implemented here**;
no new metadata is silently sent through existing strict schemas.

## Instructions changed (not observations repaired)

- Search every image, including neck/edges/bottom metallic strips, for small ABV
  print. Preserve its visible number, percent sign and units, not expected values.
- Split the printed warning prefix and remaining body regardless of case/layout;
  uppercase does not establish boldness. Preserve unknown formatting as null.
- Use visible producer/distillery role evidence, not brand or a street name;
  separate the producer name from its address. Quote separate importer/bottler
  text in existing producer reasons rather than substitute entities. An address
  fragment remains uncertain and is not a conflicting *complete* address by fiat.
- Preserve raw language, case, punctuation, diacritics, units, class qualifiers,
  missing text and photo-local provenance. No inferred words, canonical warning,
  application values, translation, cross-photo copying or automatic text repair.
- Ask for concise observational reasons, never shortened readable transcriptions.

The schema has only one producer name/address pair, **not a structured multi-entity
registry**. Separate importer/bottler quotes can be retained in bounded reasons;
role uncertainty still needs review. This repair does not establish legal entity
aliases, decide comparison outcomes, or force green findings. Invalid schemas,
coverage, bytes, hashes, completion envelopes and spend states still fail closed;
all photos remain in one guarded request with no retries/fallbacks. A schema-valid
but misread/misassigned observation is not silently rewritten by the adapter.

## Offline verification and latency limits

`web/tests/photo-extraction-prompt.test.ts` checks actual captured wire instructions,
exact ordered tagged image bytes, no application/reference-answer leakage, unchanged
schema/options/spend binding, and raw parsed fake responses (including warning split,
all three bodyBold states, accents/entity roles, altered wording, missing single-view
fields and a deliberately wrong warning mapping). These are transport regressions,
**not evidence that a model now reads the real photos correctly**. Six prompt tests
failed before the repair; the focused extraction/contract/limit/spend suites and
project typecheck pass afterward.

Local captures/profile: `/opt/data/ttb-bottle-profile-{before,after}.json`, plus each
`.payload.json` and `.prompt.txt`; script `/opt/data/ttb-bottle-profile.ts`. The exact
front/back source hashes were checked against the independent ground truth. Seven
warm iterations, no network/provider calls, synthetic responses, Node 24.21.0/WSL:

| Metric | Before | After |
| --- | ---: | ---: |
| System prompt bytes | 4,630 | 6,668 |
| Whole request body bytes | 464,212 | 466,256 |
| Full local preparation median | 43.353 ms | 49.399 ms |
| Mocked adapter total median | 4.139 ms | 4.621 ms |
| Serial two-image sanitize median | 40.716 ms | 45.932 ms |
| At-most-two concurrent sanitize median | 23.103 ms | 28.653 ms |

These separate runs do **not** demonstrate a performance improvement/regression
caused by prompt changes. The added instructions cost 2,038 prompt bytes; actual
model token usage and latency are unmeasured. Output cap remains 6,000 tokens.
Parallel normalization produced byte-identical results and saved 17.279 ms between
after-run medians; recommend at most two concurrent decodes only after preserving
all-photo preflight, aggregate limits, order, cancellation and memory bounds in a
separate intake-owner change. Intake here remains serial and unchanged.

The supplied UI paste reports 1,033 ms upload, 740 ms preparation and 11,674 ms joint
comparison/snapshot, with 13,449 ms elapsed. The joint stage is **not provider-only**.
Local mocks omit network, provider generation, persistent spend and snapshot IO;
do not sum overlapping microbenchmarks or claim a five-second live result. Live
recognition and end-to-end latency remain pending parent-approved, budget-guarded
validation after combined gates (at most two calls if separately authorized).
