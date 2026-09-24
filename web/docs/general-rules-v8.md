# General group semantics revision 8

Fresh GPT-4.1 photo comparisons select rules **8** with **photo-set-aggregation-v3**. Stored 4/v1, 6/v2 and GPT 7/v2 records retain their own comparator, aggregation and **historical intake admission**. Other existing provider paths remain on 6/v2. No historical record is reclassified or rewritten.

## Policy bounds
- Brand comparison folds Latin diacritics, case and layout only; preserves punctuation, words and numbers. This is lexical equivalence, not an entity registry.
- Net contents compares positive decimal mL/L/LTR/liter(s)/litre(s) by exact rational metric arithmetic. No rounding, negative values, nonmetric conversions, multiple amounts or standards-of-fill certification.
- Generic Rum is compatible with explicit supported English/Spanish rum designations. Generic evidence does not prove a declared subtype. Pairwise aggregation forbids a generic Rum view from bridging Gold Rum/White Rum conflict. GOLD alone is **not** rum and is never expanded into missing extraction text.
- Puerto Rico is supported domestic U.S. territory context, not a foreign country or a lexical alias of United States. Whole `Made in Puerto Rico` and `Rum of Puerto Rico` claims agree. A generic US claim alone does not verify specifically declared Puerto Rico. Explicit foreign claims remain mismatches; historical establishments, recipes and shipping prose do not become origin evidence.
- Intake preserves the declared country/territory string. New imported Puerto Rico declarations are rejected, while the exact prior imported synthetic diagnostic is readable under its historical contract.
- Raw per-photo observations, reasons, source IDs and distinct spelling/unit variants remain retained. No print-size approval is inferred.

## Frozen real response fixtures
These are exact saved **application comparison HTTP responses**, not raw model/provider envelopes, and not new image extractions. Copies retain their original bytes and diagnostic declarations.

| Fixture | Original local evidence | SHA-256 |
|---|---|---|
| `tests/fixtures/bacardi-live-v7.json` | `/opt/data/ttb-bacardi-acceptance/comparison-response.json` | `fe998ae968e10aaccb7f234d8d4de3cc4c8c32fe78e1dddb1f4b279127465469` |
| `tests/fixtures/jose-live-v7.json` | `/opt/data/ttb-gpt41-final-live-evidence/comparison-response.json` | `e893a376b6019ea530950be48fca17ab852bc3babaae6f37d116fd1beaa10ffb` |

The fresh Bacardi replay uses an explicitly corrected **synthetic domestic PR declaration**, not a fabricated authentic application. Its original GOLD-only observations still fail class comparison. Ground-truth-like class/origin test additions are explicitly synthetic observations, separate from the frozen production response. Exact Jose frozen replay and fresh processing retain its seven matching statuses.

## Admission and verification
Apply `db/migrations/009_general_group_semantics.sql` to the existing 008 schema **before** releasing new GPT finalization. It replaces only the existing private photo-asset validation function and adds only the exact typed GPT/8/v3 tuple in both admission gates. It does not alter spend/provider admission, ledger amounts, rows, ACLs or asset checks. Application-side replay recomputes all findings/provenance; SQL is not a second semantic comparison engine.

Focused tests:
```
npm test -- tests/general-rules-v8.test.ts tests/general-rules-migration.test.ts tests/gpt41-refined-replay.test.ts tests/gpt41-runtime.test.ts --maxWorkers=1 --testTimeout=30000
```

Real PostgreSQL test is separately opt-in, creates/drops only its random database/owner, and requires an owned disposable socket under `/opt/data/ttb-general-rules-pg/`. It proves 008 refusal then 009 acceptance, unchanged rows/ledger/catalog/ACLs, typed-version denials, old exact record readback and new PR snapshot/save. No managed DB access is part of this test. Browser intake test blocks every POST and uses a locally served production build.

Parent integration still owns independent review, managed migration, deployment and any paid acceptance scan. Parallel extraction work must recover actual class words; comparator success alone cannot close that omission.
