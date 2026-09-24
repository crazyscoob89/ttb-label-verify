# Private compact Azure annotation

This is a generation/expansion change, **not a public evidence or persistence migration**. `azure-mistral-ocr.ts` sends the JSON schema exported from `azure-compact-wire.ts`. The request still uses native single-image OCR, exact original normalized bytes and the existing annotation format name. No crop, resizing, extra image, second pass, application values, reference warning or other-photo context was added.

## Wire and deterministic expansion

```text
{
  wireVersion: 1,
  brand: O, classType: O, abv: O, netContents: O,
  producer: {name: O, address: O, role: [R, excerptOrNull]},
  origin: O,
  warning: {heading: O, body: O, headingBold: B, bodyBold: B}
}
O = exact nonblank string | null | ["uncertain" | "unreadable", exact fragment | null]
R = "manufacturing" | "bottling" | "importing" | "distribution" | "unknown"
B = true | false | null
```

Every key is required; extra keys, unsupported statuses/versions, oversized text, control characters and malformed tuples fail closed. Observations retain the existing 2,000-character ceiling. The role excerpt is at most 240 characters. Full generated `status/text/reason` objects are no longer requested for each field. Strings become readable observations, null becomes missing, and tuples retain their stated uncertainty. Host-generated reasons explicitly say what the **annotation reports**, not that the host independently inspected the image. No source text is trimmed, corrected or normalized.

Producer selection instructions prioritize a named manufacturing producer/distillery over a brand, importer, bottler, distributor or trademark owner. Explicit narrative identification of a distillery counts as role evidence. These roles are not synonyms. The selected entity's name and its own address are separate observations; a street resembling a brand remains street text. Ambiguous entity/address boundaries or associations must be uncertain. Only non-manufacturing entities visible: retain the candidate and actual role, but as uncertain for this manufacturing field.

The role tuple requires a short exact observed excerpt containing the selected entity name and role-bearing words. Host expansion allows readable manufacturer name/address only when role is `manufacturing`, name is readable, and a non-null excerpt contains that exact name plus additional text. Otherwise readable candidates become uncertain, preserving their raw strings. Missing/unreadable/uncertain observations are not upgraded. This is an attribution guard, **not independent semantic or visual verification**: a fabricated/misclassified excerpt can still fool it; a differently spaced excerpt conservatively becomes uncertain. No language-specific role regex or bottle-specific answer substitution is used.

Warning heading/body remain separate and complete. No body/heading is ever supplied from a template; unknown bold stays null. The parser does not mine OCR markdown for replacement answers. This also means a confident wrong number is **not fixed** by code. An observed `75` will not become an expected `73`.

## Compatibility

- Public per-photo evidence schema `1`, photo-set evidence/record schema `2` unchanged.
- Source/model/prompt/rules tuples and migration `005` unchanged; private `wireVersion` is not persisted as a new review version.
- Previously captured full-v1 annotations pass the original strict parser and remain unchanged, including historical mistakes and reasons. The new role guard applies to compact output only. No retroactive reinterpretation of saved reviews.
- Obsolete flat/confidence annotations, fenced/prose output and extra keys remain rejected. There is no retry, fallback or salvage.
- Transport bounds, exact usage/model validation, raw-response audit, reservations and scheduling are not changed by this slice.

## Output-size and latency scope

The schema asks for **at most 500 annotation tokens when the visible text permits**, but explicitly prohibits truncating visible text to achieve that target. There is no invented native OCR `max_tokens` parameter and no hard truncation. Token count was not measured locally. Full OCR envelopes still include page markdown; that output and provider/network/ledger time are not eliminated by compact annotations. Five seconds is desirable, **not a tested result or guarantee**.

An offline synthetic encoding of the two captured full-v1 annotations, retaining every field's observed text and adding `role:["unknown",null]`, has these minified UTF-8 sizes:

| Captured photo | Full-v1 annotation | Synthetic compact | Reduction |
|---|---:|---:|---:|
| Front | 1,112 bytes | 279 bytes | 74.9% |
| Back | 1,512 bytes | 599 bytes | 60.4% |

These are serialization comparisons, **not new model responses, token counts, latency results or accuracy evidence**. A real role quote adds bytes. Prior raw captures had network full-body times approximately 5,961 ms and 8,194 ms; adapter times include runner-side waiting and must not be confused with network inference time. Parent's authorized real benchmark is still needed to establish endpoint support for this schema's tuple `prefixItems`, role selection, address accuracy, complete warning transcription and timing.

## Offline verification and captures

Run from `web/`:

```sh
npm run test -- tests/azure-compact-wire.test.ts tests/azure-ocr.test.ts
npm run typecheck
```

The compact tests cover role priority instructions, non-manufacturer/missing/unattributed-role downgrades, name/address separation, raw punctuation/number preservation, missing and fragmentary warnings, nullable bold, strict validation, output size and original-image-only mocked dispatch. Existing provider tests cover persistence/reopening, history identities, usage/audit/transport and reservation behavior. No external request is made.

Captured regression fixtures are exact copies, not edited success mocks:

| Fixture | Source | SHA256 |
|---|---|---|
| `web/tests/fixtures/azure-ocr-full-v1-front.json` | `/opt/data/ttb-azure-real-acceptance/photo-0-raw-response.bin` | `ae3b7c40c81c782acd4f05fdc77a5e36099f25f8b15e74aaff13552df794bbce` |
| `web/tests/fixtures/azure-ocr-full-v1-back.json` | `/opt/data/ttb-azure-real-acceptance/photo-1-raw-response.bin` | `c56f72a0a5073bbfcc3f2b03aacf3a67f9d249dd938fa20534c10238168b0240` |

Their historical wrong producer/address output is deliberately retained for replay tests. The older `azure-ocr-archived-envelope.json` remains unchanged and its obsolete flat annotation is still rejected.
