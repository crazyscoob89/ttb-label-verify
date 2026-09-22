# Prototype seven-field comparison policy — v1 family, comparison revision 2

## Authority and scope

`web/lib/rules.ts` implements the `prototype-seven-fields-v1` family with explicit `rulesRevision: 2`, a deterministic comparison of one validated application and one supplied extraction-evidence object. **This is source-backed prototype comparison, not exhaustive TTB law certification, image/OCR verification, or a human Pass decision.** No new legal research was conducted. Sources were read locally at Phase 1 base `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a`; archived fixtures/scorers were not edited or imported as runtime code. The original v1 policy below remains the historical baseline; the revision-2 amendments and compatibility contract at the end supersede its ABV/origin behavior for new comparisons.

| Local source | Policy used |
| --- | --- |
| [BUILD-PLAN.md](BUILD-PLAN.md), contracts and Phase 2 Sprint 1 | Exactly seven fields, four field outcomes, separate processing failure; fixed warning; explicit applicability; uncertain formatting review; physical size unverified |
| [PLAN.md](PLAN.md), Commodity Handling / Four-State Outcome Model / Asymmetric Matching / Alcohol Content | Commodity/import context, normalized brand equivalence, fixed warning heading/body formatting, ABV consistency without regulatory tolerances |
| [BENCHMARK_PLAN.md](BENCHMARK_PLAN.md), clean/adversarial matrix | Imported-origin match vs domestic N/A, brand case-equivalence, changed warning wording/title-case/bold-body defects |
| [fixtures/manifest.json](../fixtures/manifest.json), `statutory_warning` | Exact heading/body reference attributed there to 27 CFR 16.21 |
| [reviews/02-plan-amendment.md](reviews/02-plan-amendment.md) | ABV small differences mismatch independently of regulatory tolerance |

The warning source file SHA-256 is `52dc578ab95728dfb986b4e7a32ff3daf860cc14753ea0008f86b51892f0f68a`. A test reads the frozen manifest and requires the runtime reference to equal its heading/body. The application contract has **no editable warning**.

### Explicit engineering assumptions and conservative exclusions

Historical PLAN prose calls brand matching “punctuation-tolerant”; this implementation deliberately **does not remove punctuation**. Only NFC canonical Unicode equivalence, case lowering and layout-whitespace normalization are supported for ordinary text. Accents, numbers and punctuation remain significant. No fuzzy matching, abbreviation expansion, transliteration, NFKC compatibility normalization, country aliases, legal-entity/address normalization or class synonyms. Thus a readable spelling/alias discrepancy can mismatch even if a human could establish equivalence. This is a conservative subset, not silent reuse of the archived scorer's broad punctuation deletion.

Source docs do not define an exhaustive unit grammar or all commodity-specific legal rules. v1's grammars below are explicit implementation assumptions. They do not determine lawful ABV notation, commodity/class classification, standards of fill, mandatory statement placement, container capacity, labeling exceptions or state rules. Those remain outside this sprint. All three supported commodities require the six non-origin comparisons in this prototype; only imported-country applicability changes. Do not present this matrix as an exhaustive applicability analysis under Parts 4/5/7.

## Evidence boundary (shared with Sprint 2)

`web/lib/extraction/schema.ts` exports `observationSchema`, `extractionEvidenceSchema`, `parseExtractionEvidence`, `Observation`, `ExtractionEvidence`, `MAX_OBSERVATION_TEXT` (2000 UTF-16 code units) and `MAX_OBSERVATION_REASON` (500). Every object is strict; no extra fields, stripping, coercion or defaults. Numeric extraction values are not allowed: original printed numbers must be strings. `schemaVersion` is literal number `1`; the existing application schema separately enforces finite ABV numbers.

```text
ExtractionEvidence = {
  schemaVersion: 1,
  brand, classType, abv, netContents, origin: Observation,
  producer: { name: Observation, address: Observation },
  warning: {
    heading: Observation, body: Observation,
    headingBold: boolean | null, bodyBold: boolean | null
  }
}
Observation = {
  status: 'readable' | 'uncertain' | 'unreadable' | 'missing',
  text: string | null,
  reason: string
}
```

All keys are required. `readable` requires nonblank non-null text; `missing` requires null text. `uncertain`/`unreadable` may preserve partial text or null. Reasons must be nonblank, bounded strings. ASCII controls other than TAB/LF/CR are rejected. Formatting uses actual boolean observations, null means unknown; no string/number conversion. Capitalization is derived from heading text, not a provider “allCaps” judgment. Provider `match`, `verdict`, confidence and instruction fields are rejected. Instructions embedded in permitted text/reason slots remain inert untrusted content, not rules or authority. Render every observation/reason as text in future UI; never raw HTML.

`parseExtractionEvidence(unknown)` parses an **already-decoded object** and throws Zod validation errors on invalid input; `extractionEvidenceSchema.safeParse` is available. `compareApplication` uses safe parsing and returns fixed content-free failure reasons (no raw payload or schema-error reflection). Raw JSON strings, even syntactically valid ones, are not decoded by this function. Sprint 2 must enforce response-byte limits before JSON decoding and reuse this schema after decoding. A bounded semantic schema does not bound an incoming network body or prove truthful OCR. Transport failures/timeouts, source-image binding, spend reservations, endpoint/model policy and persistence are future boundaries, not implemented here.

## Comparison and precedence

`compareApplication(applicationInput: unknown, extractionInput: unknown): ComparisonResult` validates with the **unchanged** `web/lib/contracts.ts` `applicationSchema` and the shared evidence schema. Invalid application/extraction returns `{ processing: 'failed', code: 'invalid-application' | 'invalid-extraction', reason }` and **no fields**.

A valid pair returns `processing: 'complete'`, application ID/version, `rulesVersion`, `fields`, and `physicalPrintSize`. `complete` means rules ran, not that fields passed. `FIELD_KEYS` order is `brand`, `classType`, `abv`, `netContents`, `producer`, `origin`, `warning`. Exports also include `RULES_VERSION`, `WARNING_REFERENCE`, `FieldKey`, `FieldStatus`, `FieldResult<K>`, `ComparisonFields`, `ComparisonResult`.

Each field retains `expected` (string), `observed` (its original parsed observation/composite including original extraction reasons), `status`, and deterministic `reasons[]`. Producer expected text separates name/address with a newline; warning expected text separates heading/body likewise. Original application ID/version and declared field spelling are not rewritten; the existing application parser normalizes ABV to a number. Results are detached from caller mutation and do not mutate inputs.

- Missing, unreadable or uncertain observations never become match. Missing applicable origin is review, not N/A. Explicit `missing` evidence is review rather than a legal finding of omission: extraction absence alone is insufficient proof of absence on the image.
- Readable differences in supported representations are mismatch.
- For composites, a known mismatch dominates independent uncertainty; otherwise any uncertain component requires review. All component reasons are retained.
- No global all-labels green response, overall automated Pass, provider judgment forwarding, or certainty inferred from provider reason text.

| Field | v1 rule |
| --- | --- |
| Brand | NFC/case/whitespace equivalence only; preserve accents/punctuation/numbers |
| Class/type | Same conservative text comparison, not classification into a legal standard of identity |
| ABV | Unsigned decimal optionally followed by `%`, and after `%` optional `ABV`, `alc/vol`, or `alcohol by volume` (case-insensitive). Bare decimal is accepted because this slot specifically represents ABV. Exact rational equality to parsed Application ABV; no tolerance, rounding or proof conversion. A readable `101%` differs from declared `40` and mismatches; it is not concealed as uncertainty merely because it exceeds the application's range. Unsupported signs, comma decimals, scientific/hex notation, proof, alternatives and other notations require review. |
| Net contents | One positive unsigned decimal `mL` or `L` (case-insensitive) on each side; exact rational comparison with 1 L = 1000 mL. No binary floating-point conversion. Zero, missing units, fluid ounces (US/imperial ambiguity), cL, other units, ranges, dual-unit strings or unsupported applicant text require review even if identical. No standards-of-fill certification. |
| Producer | Name and address compared separately with ordinary-text equivalence, then combined into one field |
| Origin | Explicit table for `wine`, `distilled-spirits`, `malt-beverage`: imported → compare declared country; domestic → N/A. The application validator rejects missing/contradictory commodity/import/origin context first. No inferred geography or country aliases. |
| Warning | Exact archived heading/body wording, case and punctuation; only layout whitespace may differ. Heading must equal `GOVERNMENT WARNING:`, with headingBold true and bodyBold false. Unknown formatting requires review; known wording/case/format defects mismatch. |

Numeric text grammar is bounded to 32 digits on each side of the decimal point; excess precision requires review, not rounding. BigInt rational intermediates are internal only: outputs remain JSON-serializable. Declared ABV's canonical finite-number decimal is used (scientific notation is expanded internally); any precision already lost by the pre-existing Application number contract cannot be recovered here. Extremely small applicant values whose printed equivalent exceeds the observation grammar's precision require review rather than false equality.

`physicalPrintSize` is **always `unverified`**, with a reason explicitly stating not measured/certified and no exhaustive TTB legal certification. It is supplemental, not an eighth comparison category. A warning wording/format match never certifies physical print size, legibility, placement, actual image fidelity or overall label compliance.

## Revision 2: bounded printed ABV and origin repair

- ABV additionally accepts a percentage followed by `BY VOL` or `BY VOL.` (case-insensitive, layout whitespace between words). The expression is anchored to the whole observation. `13.5% BY VOL.` versus declared `12.5` is **mismatch**, not unsupported notation; `12.500% BY VOL` versus `12.5` is match. Extra statements, alternatives, proof, signs, duplicate punctuation, unsupported suffixes and excess precision still require review. No tolerance, rounding, proof conversion or implied legality was added.
- Origin accepts one leading `PRODUCT OF ` after NFC/case/layout-whitespace normalization. The remainder is compared as a complete country-slot value, never a substring. Raw observed text/reasons and declared country are retained. `PRODUCT OF NEW ZEALAND` versus `New Zealand` matches for an import, while `PRODUCT OF AUSTRALIA` mismatches. No arbitrary `made in`/`bottled in`/address stripping or foreign-country aliases were introduced.
- Origin's lexical bound allows letters/combining marks with space, period, apostrophe or hyphen separators and an optional final period. An empty/repeated prefix, `or` alternative, slash, question mark, digits or other unsupported notation requires review. This grammar alone does **not** establish that a value names a country. Imported comparisons retain the declared/observed whole-value text comparison without erasing punctuation; domestic contradictions additionally require the recognition bound below.
- Domestic context still requires **no foreign-origin statement**: missing origin evidence is N/A. Readable US evidence (the intake contract's explicit United States / United States of America / US / USA designations, with optional periods, optionally prefixed `PRODUCT OF`) is N/A. A readable foreign country recognized by the fixed local allowlist is a **mismatch against the domestic declaration**, with a reason to verify application/import context—not a finding that a domestic label must carry a foreign-country statement. The deliberately non-exhaustive allowlist is: Australia, Canada, France, Germany, Italy, Japan, Mexico, New Zealand, Portugal, South Africa, Spain, United Kingdom. Recognition uses the complete normalized name after the single optional `PRODUCT OF` prefix; no aliases, extra punctuation, substring matches, network lookups or geography inference. All other non-US values require review, including unknown/unlisted country names, `MADE IN USA`, `BOTTLED IN CALIFORNIA`, `PRODUCT OF CALIFORNIA`, and extra prose around a recognized country. Uncertain/unreadable evidence also requires review rather than being hidden behind N/A. The same behavior applies to wine, distilled spirits and malt beverages.

## Saved snapshots and review compatibility (no migration)

The deployed extraction/spend schemas and SQL admission guards pin `rulesVersion` to `prototype-seven-fields-v1`. Renaming that family alone would break paid admission without a migration. Consequently **comparison policy identity is the pair `(rulesVersion, rulesRevision)`**; new comparisons add numeric `rulesRevision: 2` inside their existing JSON snapshot. Extraction metadata and spend bindings keep the unchanged family/schema/prompt contract. No SQL, ledger, stored row, provider request or migration is changed by this repair.

`checkedRecord` explicitly dispatches validation:

1. Exact known family with **no revision property** → frozen original evaluator `web/lib/rules-v1.ts` from `7dec00ab4be78300279e431e2cce9ccb2f4a4adf`.
2. Exact known family with numeric revision **2** → repaired evaluator in `rules.ts`.
3. Unknown family/revision, malformed comparison, or any difference in the complete recomputed JSON (including statuses, reasons, observations, identity, physical-size finding and property order) → reject. There is no try-old-then-new fallback or acceptance of caller-supplied field results. Explicit revision 1 is not an original snapshot shape and is rejected by exact equality.

Original snapshots **retain their original findings, including the original defects**. Validation does not upgrade them, rewrite an old N/A/mismatch/needs-review, discard an old review, or reinterpret a historical Pass as current-policy approval. The unchanged review policy evaluates only the pinned, validated record; idempotent saves, hosted detail validation and custody validation continue to recognize the original review and binding. A fresh comparison always uses revision 2; its full-record binding differs, so an old human confirmation/approval cannot be reused. A newly confirmed Pass on the fresh domestic-contradiction snapshot remains blocked by its mismatch unless the existing explicit, supported human-resolution policy is satisfied.

This is deterministic consistency validation, **not a cryptographic signature or proof of OCR truth**. Authoritative snapshot selection, immutable persistence and image binding remain the existing store/route responsibilities. Reopening a historical review is not a new current-policy certification. Historical review validation deliberately continues under its original rules; this repair does not retroactively revoke saved approvals or silently refresh evidence.

Regression fixtures in `web/tests/fixtures/rules-v1-records.json` were captured from the unmodified base evaluator before repair, not generated with the repaired comparator. Coverage includes original printed-ABV review, imported-prefix discrepancy and domestic-origin Pass; modified statuses/reasons/revisions are refused. Tests exercise actual private SQLite reopen/idempotent replay with unchanged database bytes, mocked hosted detail, custody validation, new comparison bindings, both numeric outcomes, supported commodities and ambiguous/readability controls. Hosted tests use injected synthetic transport only—no live provider/database calls or spend.
