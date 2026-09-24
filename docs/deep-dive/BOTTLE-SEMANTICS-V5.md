# Bottle semantic policy — singleton 5 / photo group 6

This is a bounded repair of the original seven-field application/label comparison,
not a compliance workflow, entity registry, legal certification or UI redesign.
It does not change extraction prompts, provider settings, spend or identity.

## Versions and replay

- `semantic-rules.ts`: `compareApplicationV5`, `RULES_REVISION_V5 = 5`.
  `finalizeComparison` now writes singleton revision 5.
- `group-rules.ts`: `comparePhotoApplication`, `GROUP_RULES_REVISION = 6`.
- `photo-evidence.ts`: current `aggregatePhotoEvidence` / `equivalentPhotoText`.
  `AGGREGATION_VERSION` is `photo-set-aggregation-v2`.
- `rules-v1.ts`, `rules.ts` (2), and `wine-rules.ts` (3) are unchanged.
  `group-rules-v4.ts` and `photo-evidence-v1.ts` preserve the original group
  evaluator and aggregator; the only group-copy change is its frozen import.
- Singleton reads dispatch absent revision to 1, explicit 2/3/5 to their respective
  evaluators. Group reads accept **only** paired 4/aggregation-v1 or
  6/aggregation-v2. Recomputed JSON must equal the stored evidence, provenance and
  comparison. No version guessing, historical recomputation using new policy,
  saved snapshot rewrite or reason-text migration.
- `tests/fixtures/semantic-history.json` was generated on the original policy
  before edits, using the surviving incident scaffold. It contains synthetic
  singleton 1/2/3 and group 4 records, not retrieved production records.
  `capture-semantic-history.ts` now imports the frozen evaluators explicitly.

## Comparison boundaries

### Class/type

For declared distilled spirits, generic `Tequila` accepts the whole observed
`Tequila` designation or `Tequila` followed by one of `Gold`, `Silver`, `Blanco`,
`Reposado`, `Añejo`, `Extra Añejo`, `Joven`. The specific observed value is retained.
This is broad-class compatibility, not legal subtype certification or synonym
merging. Explicit conflicting subtypes and Vodka remain mismatches. A generic
observation cannot verify an explicitly declared subtype. Wine revision-3
compatibility remains in effect. All cross-photo pairs are compared, so a generic
view cannot connect incompatible specific views and conceal their conflict.

### Country

Whole country slots may have only the explicit prefixes `Product of`, `Made in`,
`Hecho en` (case/layout insensitive). Country names are the bounded list in
`semantic-text.ts`; `México` and the explicit US designations have lexical aliases.
No substring, arbitrary prose removal, import/shipping-statement inference or
geographic lookup. Unsupported claims stay review. Spanish and English Mexico
claims can agree while both original strings and photo sources remain retained.

### Producer

Producer names compare whole text under case/layout and Latin accent equivalence;
no suffix deletion, brand-to-producer substitution, importer aliases, or inference
from the application. Differing names require role/entity inspection, not an
invented producer match. The original incident's erroneous `Jose Cuervo` producer
extraction therefore remains review rather than being rewritten to `La Rojeña`.

Address equality permits case, Latin accent, comma layout, and `No. 73` / `No.73`
spacing only. A numbered `No.` street with locality/country can cover a partial
view's **whole comma-delimited components**, including separately retained postal
code and whole country. A partial view alone cannot verify a declared full address.
Aggregation may select an actually supplied full compatible view, never assemble
one from fragments. Explicit number/postal/country disagreement is a mismatch;
other component or role ambiguity stays review. Distinct full-address strings
still conflict across photos; no general postal-address parser is claimed.

### Government warning

Only when the heading is readable, body is missing, and actual heading text begins
with the exact visible `GOVERNMENT WARNING:` plus whitespace and a nonempty suffix,
project that prefix and **the actual suffix** into heading/body. Never populate
from the reference, repair missing words, overwrite a populated body or split an
uncertain heading. Raw `photoEvidence` stays unchanged. Projected heading/body
provenance records `derivations` with the original photo ID, `warning.heading`
source path and `split-visible-warning-prefix` operation. Singleton comparison
reasons likewise disclose the mapping; its raw record evidence is unchanged.

Heading case and colon are exact. Body comparison ignores letter case and layout
whitespace only; words, sequence and punctuation remain required. Missing NOT,
altered punctuation, extra words and a confidently readable truncated body still
mismatch. Uncertain/unreadable body is review, not a fabricated completion.

Boldness is independent of capitals. Heading must be bold, body nonbold under the
existing policy. Unknown typography stays review; the mapping correction cannot
supply body typography. Physical size remains unverified. Group explanations name
photo positions, not UUIDs or purported independently proven label defects.

## Incident result and test scope

The supplied UI incident now matches brand, broad class, volume and origin;
ABV stays review because that *extraction* was unreadable; producer stays review
because the entity mapping is wrong/ambiguous; warning wording projects correctly
but unknown body boldness stays review. Separately inspected `40% ALC/VOL` matches
when actually supplied; comparison never fills it from the application or brand.
No forced all-green result.

Focused tests cover incident repair, independent-inspection-style inputs,
negative controls, raw/projection/provenance tampering, frozen 1/2/3/4 replay,
version-pair rejection, existing wine/rules/review/persistence behavior, and the
migration's exact narrow delta. These are deterministic/offline tests, not a new
provider extraction, production smoke, timing measurement or proof of ~5 seconds.

## Same-project migration and parent integration

**Deployment is Supabase + Vercel on the existing project, NOT an assumed local
SQLite target.** `003_photo_groups.sql` already pins group 4/aggregation-v1.
`004_bottle_semantics.sql` uses `CREATE OR REPLACE` on only the existing private
`photo_asset_bytes` function, admitting old 4/v1 **or** new 6/v2 pairs. Every other
003 asset/digest/size validation is identical; owners/ACLs, quota, ledger,
RPCs, tables and stored history remain untouched. A static test compares the
entire function against 003 with only that substitution. No DB execution is
claimed by that test. Apply with the same migration owner after parent review,
on the same project, before enabling the new writer. No production writes were
performed by this worker.

Parent owns `live-photo-client.ts` and must update its fresh-result revision-4
fence to admit revision 6 (use current constant; keep historical 4 read support).
Parent/extraction owner must update the fresh-version assertions in
`photo-route.test.ts`, `photo-extraction.test.ts`, and
`e2e/durable-photo-groups.spec.ts` from 4 to 6. Those cross-owned files were not
modified here. Integrate extraction changes separately; there is no prompt/schema
or UI work in this patch. Parent retains the broad gate / migration / deploy step.
