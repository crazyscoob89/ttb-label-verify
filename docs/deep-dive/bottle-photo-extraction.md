# Bottle-photo extraction clarity repair

## Current private execution revision: isolated-photo-v1

Each normalized photo now gets a **separate Haiku 4.5 inference context** with one
tag, one byte-identical image, and the concise compact transcription prompt. No
other photo IDs/images, application values, prior outputs, crops or reference
answers enter that context. The `photo-views.ts` utility below is historical and
is **not used by the adapter**. Output is capped at 2,200 tokens per photo.

Each response must validate against exactly its requested photo ID. Validated
entries are merged in manifest order into the unchanged schemaVersion 2 evidence.
No partial group, cross-photo repair, retry or fallback is returned. Original and
normalized descriptors/hashes, record schemas, comparison policy, saved reviews
and the single-image v1 adapter remain unchanged. Prompt version v2 is a schema
compatibility identifier, not a claim of identical historical inference behavior.

### Financial and replay contract

- **One existing $1 reservation per photo/POST**, not one $1 group hold. A group
  can incur at most four reservations / $4 of unresolved liability. Actual charges
  may be lower; this does not settle or release any hold. No ledger reset/migration.
- Slot zero uses the unchanged parent attempt/reservation IDs. It must reserve,
  then claim before any child can reserve. Its claimed operation runs slot zero
  inference alongside slot one, and awaits all waves and whole-group validation
  before returning success. Parent completion is last; failures still mark holds
  unresolved without refund. This is the permanent group replay fence, including
  legacy group tombstones, not an extra inference or extra group reservation.
- Slots 1..3 use deterministic UUIDv5 child IDs from
  `isolatedPhotoAttemptIds(parent, slot)`. Each attempt ID depends only on its
  parent attempt ID and slot; each reservation ID only on its corresponding
  parent reservation ID and slot. Photo data/order or changing just one parent
  identity cannot bypass the other permanent fence. Each POST has a distinct
  request ID; metadata retains the parent/slot-zero request ID for compatibility.
- Every binding retains schema 2, prompt version v2 and the entire photo-set hash.
  Child slot plus this immutable manifest identifies the photo. Reconstruction of
  child ledger identities requires the parent IDs and manifest slot, not new DB
  fields. Slot zero is itself a photo reservation, **not an extra group hold**.
- All photos, including the first two, run in ordered waves of at most two concurrent requests per group.
  Singleton and group requests pin `provider.only: ['Anthropic']`, with no fallback.
  A failed wave is fully awaited and no next wave starts. Earlier and in-flight
  holds remain unresolved even if the group fails. Insufficient shared balance can
  therefore fail a group after earlier photos were paid; never auto-retry it.
- The demo route supplies the existing managed store and $1 **per-photo** amount.
  Its pricing guard executes inside each photo's own reservation/claim, fetching
  the catalog before each POST, retaining all fee/context checks and provider
  price caps. It bounds that POST with the existing 3,000-token ceiling (actual
  request 2,200), not a multi-call estimate under one hold. Direct adapter callers
  must likewise supply price-checked transport and sufficient per-request holds;
  smaller injected amounts are intended for offline tests, not live authorization.
  The adapter rejects per-photo holds above $1.

Offline isolation, concurrency, deterministic merge, spend/replay, pricing,
compact-wire, prompt and route/client regressions are verified separately from
model accuracy. No paid provider call is part of this change. The unchanged 50s
route deadline can still fail a slow group (up to three waves for four photos;
20s per request); no real-photo accuracy or latency claim is made.

## Historical private wire/detail revision: compact-photo-v1

The prior group adapter used `web/lib/extraction/compact-wire.ts` and
`photo-views.ts`. Public v2 evidence, spend bindings, comparison revisions,
saved-history evaluators and singleton extraction remain unchanged. The section
below records the earlier `bottle-photo-clarity-r1` implementation and measurements;
its prompt hash, full-schema wire and fixed output cap are **historical**, not
claims about this revision.

- Compact strings/null expand to readable/missing observations with explicitly
  generic `Compact wire:` reasons. Explicit observation objects preserve statuses,
  fragments and explanations. Producer names require explicit role explanations
  or null, never a bare string. Expanded and legacy responses both pass the same
  strict public schema, formatting and exact-photo coverage validation.
- Deterministic central 3:2 detail views supplement eligible tall/wide photos.
  Full normalized bytes remain present. Crops are PNG, extract-only, with the same
  photo ID, source hash and exact rectangle; they are not additional evidence
  identities and never replace stored originals/normalized images. No OCR answers,
  application values, reference wording or bottle-specific regions are injected.
- Work is capped at two concurrent decodes, 20M input pixels per decode, 1.5M crop
  pixels and 2 MiB encoded bytes per crop. Optional crops are omitted when the
  existing 28 MiB request budget cannot accommodate them (64 KiB overhead reserve).
  Cancellation is checked around preparation; the final body is independently
  byte-bounded before spend reservation.
- Requested output cap is `min(6000, 700 + 1000 * photoCount)`. The paid transport
  validates a positive safe integer **at or below** its configured ceiling; its
  pricing calculation still reserves the full 6,000-token ceiling for groups.
  Catalog/context/cache-fee checks, provider price caps, unresolved holds and the
  no-retry/duplicate-dispatch fence remain unchanged.

Offline compact-wire, geometry/pixel equality, request-budget, pricing and actual
route/client tests are not model-accuracy or latency acceptance. Lower caps can
truncate dense observations (strictly rejected), and extra views add vision input
cost. Real-photo recognition and end-to-end performance need separately authorized
parent acceptance; no paid provider calls are part of this source review.

## Historical clarity-r1: compatibility and reproducibility

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
