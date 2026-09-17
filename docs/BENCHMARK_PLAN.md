# BENCHMARK_PLAN.md — TTB Label Verification Prototype

This document defines the synthetic test label matrix and the engine
comparison methodology that will be used to select the extraction model
provider, per the "engine chosen by BENCHMARK" decision in `PLAN.md`. This is
a **planning artifact only** — no labels have been generated and no
benchmark has been run yet.

## Purpose

The extraction engine (which vision-capable model/provider performs field
extraction from label images) is deliberately left unselected at the
planning stage. `PLAN.md` commits to a provider-abstracted interface
specifically so that the engine choice can be made empirically, based on
this benchmark, rather than assumed up front. This document is the test
design; running it and recording results is a later build-stage task.

**Comparison-first framing applies to benchmark design too.** Per
`PLAN.md`, the system's core function is comparing each label image against
its own paired applicant-declared application data — never judging a label
"in the abstract." Accordingly, every test case in this matrix is a **paired
fixture**: a synthetic label image **plus** a corresponding synthetic
application record (the declared field values the label is checked
against). The benchmark measures how accurately each candidate engine
extracts label values that `rules/` then compares against the paired
declared record — it is not measuring whether an engine can independently
judge label compliance without a declared reference. Each test case
description below should be read as: extracted-from-image vs.
declared-on-application, per field.

## Test Label Matrix

Synthetic label images will be constructed (not sourced from real
commercial products) to cover both clean/compliant cases and adversarial
cases per commodity. Each test case is a paired fixture: a label image plus
a synthetic application record declaring the expected field values for that
exact label -- reflecting the comparison-first framing above, not a
standalone image judged in isolation. Each row below is a planned test case
category, not yet generated.

### Clean (Compliant) Cases — one per commodity

For these cases, the paired application record's declared fields match what
the label image actually shows (that's what makes them clean -- the
label-vs-declared comparison resolves to match across the board).

| ID | Commodity | Description | Paired Application Record (declared fields) |
|----|-----------|-------------|-----------------------------------------------|
| C-SPIRITS-01 | Spirits | Fully compliant vodka label: correct brand, correct class/type, correctly formatted ABV, correct net contents, correct bottler name/address, correctly formatted government warning (bold caps heading, non-bold body). Domestic — country of origin not-applicable. | Declared brand, class/type (Vodka), ABV, net contents, bottler name/address all set to match the label exactly; declared origin = domestic. |
| C-WINE-01 | Wine | Fully compliant red table wine label: correct varietal/class designation, correct ABV within wine tolerance band, correct net contents, correct producer info, correctly formatted government warning. Domestic. | Declared varietal/class, ABV, net contents, producer info all set to match the label; declared origin = domestic. |
| C-MALT-01 | Malt beverage | Fully compliant ale label: correct class/type (Ale), ABV statement present and correctly formatted, correct net contents, correct brewer info, correctly formatted government warning. Domestic. | Declared class/type (Ale), ABV, net contents, brewer info all set to match the label; declared origin = domestic. |
| C-SPIRITS-IMPORT-01 | Spirits | Fully compliant imported spirits label — includes a correct, present country-of-origin statement (tests that country-of-origin correctly resolves to **match** rather than not-applicable when the product is imported). | Declared origin = imported, with declared country matching the label's stated country of origin exactly; all other declared fields match the label. |

### Adversarial Cases — targeted at specific matching-logic edge cases

For most adversarial cases, the label image is made to diverge from its
paired application record's declared value for the field under test -- the
expected outcome describes how the label-vs-declared comparison should
resolve, not an abstract judgment of the label alone.

| ID | Category tested | Description | Paired Application Record (declared field under test) |
|----|------------------|-------------|-----------------------------------------------------------|
| A-WARN-TITLECASE-01 | Government warning — exact wording | Warning heading rendered as Government Warning: (title case) instead of required all-caps GOVERNMENT WARNING:. Expected: **mismatch** (tests that the exact-wording/exact-casing check actually rejects near-miss casing, not just wildly wrong text). | N/A for this field — the government warning's required wording is fixed by regulation (27 CFR 16.21), not applicant-declared; the comparison is label-vs-statutory-text, per `PLAN.md`. |
| A-WARN-BOLDBODY-01 | Government warning — bold/non-bold structure | Warning heading correctly bolded and capitalized, but the body text (the statutory statement following the heading) is also rendered in bold. Expected: **mismatch** (tests the non-bold-remainder check specifically, per 27 CFR 16.21 and `PLAN.md`). | N/A for this field — same statutory-text basis as above. |
| A-BRAND-CASE-01 | Brand name — normalized equivalence | Brand name on the label differs from the paired application record's declared brand only in letter case (e.g., Old Harbor label text vs. declared OLD HARBOR on the application). Expected: **match** (tests that normalized equivalence correctly treats case differences vs. the declared value as non-significant, unlike the warning check). | Declared brand = OLD HARBOR (or equivalent case variant), intentionally differing only in case from the label's rendering. |
| A-ABV-WRONG-01 | Alcohol content | Label's stated ABV numerically differs from the paired application record's declared ABV by an amount exceeding the applicable commodity's tolerance band. Expected: **mismatch**. | Declared ABV set to a specific value; label rendered with a numerically different ABV outside tolerance. |
| A-FIELD-MISSING-01 | Completeness | One or more required fields (e.g., bottler address, net contents) is simply absent from the label image entirely, despite being declared on the paired application record. Expected: the missing field(s) resolve to **needs-review** (extraction could not confidently read a value to compare — see Uncertainty Invariant in `PLAN.md`), or **mismatch** only if the field's absence is itself an affirmative regulatory violation independent of the declared value (exact expected outcome defined per field during implementation) — never silently dropped from the result set. | Declared value present and specific for the missing field(s), so the test actually exercises declared-but-not-shown, not declared-and-not-shown-because-not-applicable. |
| A-ANGLE-GLARE-01 | Image quality / extraction robustness | Label photographed at a steep angle and/or with significant glare obscuring part of the text, despite the paired application record declaring specific values for the affected fields. Expected: tests whether extraction degrades gracefully into **needs-review** for affected fields (per the Uncertainty Invariant — low-confidence extraction never produces a default match against the declared value) rather than confidently emitting a wrong value or a false match. | Declared values present for the obscured fields, matching what the label would show if legible — the test specifically checks that illegibility routes to needs-review rather than a lucky/unlucky guess being compared. |
| A-MAP-MISSING-RECORD-01 | Batch mapping — image-to-application-record | In batch mode, an uploaded image has no corresponding entry in the CSV manifest (or does not match the filename convention, per `PLAN.md`'s batch mapping mechanism). Expected: the system rejects this item with a clear, explicit per-item mapping error — it must never fall through to being extracted and evaluated with no declared reference, and must never be silently skipped. | None — this case specifically tests the absence of a paired application record for a submitted image. |
| A-MAP-MISSING-IMAGE-01 | Batch mapping — image-to-application-record | In batch mode, a CSV manifest row declares an application record for a filename that has no corresponding uploaded image. Expected: the system rejects this manifest row with a clear, explicit per-item error, distinguishable from other failure types, rather than silently ignoring the orphaned row. | A manifest row with declared fields but no matching image file in the batch upload. |

### Notes on Matrix Construction (For Build Stage)

- Adversarial cases are designed to test **matching logic correctness**, not
  just extraction accuracy — several cases (A-WARN-TITLECASE-01,
  A-WARN-BOLDBODY-01, A-BRAND-CASE-01) specifically probe whether the
  asymmetric matching strategy from `PLAN.md` is actually implemented as
  asymmetric.
- The matrix should be expanded during the build stage to include at least
  one adversarial case per field category (this skeleton does not yet cover
  every field with a dedicated adversarial case — e.g., net contents
  mismatch, class/type misdeclaration — those should be added before
  benchmark execution).
- The A-MAP-* cases test the batch image-to-application-record mapping
  mechanism itself (per `PLAN.md`), not extraction or rule-comparison
  accuracy — these are `intake/`-layer tests and should be run against
  whichever mapping mechanism (filename convention or CSV manifest) is
  selected during the build stage, independent of which extraction engine
  is ultimately chosen.
- Synthetic labels can be generated programmatically or via image editing;
  they must not use any real brand's actual protected trade dress in a way
  that would be misleading — genericized/fictional brand names should be
  used for test fixtures.

## Engine Comparison Table (Template)

To be filled in during the actual benchmark run. Each candidate
vision-capable extraction engine is evaluated against the full test matrix
above.

| Engine / Model | Provider | Test cases run | Field-level accuracy | Warning-check accuracy (adversarial) | Avg. latency (single label) | p95 latency | Est. cost per extraction | Notes |
|----------------|----------|-----------------|------------------------|----------------------------------------|-------------------------------|--------------|-----------------------------|-------|
| _(candidate 1)_ | | | | | | | | |
| _(candidate 2)_ | | | | | | | | |
| _(candidate 3)_ | | | | | | | | |

**Column definitions:**
- **Field-level accuracy** — percentage of the 7 fields correctly extracted
  and correctly classified (match/mismatch/not-applicable/needs-review)
  across all clean-case tests.
- **Warning-check accuracy (adversarial)** — specifically, percentage of
  A-WARN-* adversarial cases correctly resolved to mismatch (this is
  called out separately because it's the strictest, most regulation-critical
  check in the system per `PLAN.md`).
- **Avg. / p95 latency** — measured honestly end-to-end (upload → extraction
  → rule evaluation → result), per the ~5s design target in `PLAN.md` — not
  provider-API-call time alone.
- **Est. cost per extraction** — approximate per-image cost at the
  provider's published pricing, to inform the provider-spend-bounding
  discussion in `THREAT_MODEL.md`.

## Candidate Engines to Evaluate (Non-Binding List)

This is a starting list for the build stage to evaluate against the matrix
above; the actual selection is determined by benchmark results, not by this
list's ordering:

- A general-purpose frontier vision-capable LLM (e.g., via OpenAI, Anthropic,
  or similar API) as a baseline.
- Azure / Microsoft Foundry-hosted vision model — evaluated specifically
  because `PLAN.md` documents this as the answer for firewall-constrained
  enterprise/government deployment; benchmarked here so that choice is
  backed by real data, not just architectural convenience.
- Any additional candidate the build stage identifies as worth testing
  (to be added to the table above with justification).

## Benchmark Execution Rules (For Build Stage)

- Each engine runs against the **same** test matrix under the **same**
  conditions for a fair comparison.
- Latency is measured end-to-end in the actual deployed/deployable
  environment shape (not a local dev shortcut), to keep the ~5s target
  honest.
- Results (both successes and failures) are recorded in the comparison
  table above — a candidate performing worse than expected on adversarial
  cases is a legitimate, reportable finding, not something to omit.

## Status

This document is a **planning-stage skeleton**. No synthetic labels have
been generated and no benchmark has been executed. Execution is explicitly
out of scope for this stage per the build goal (DO NOT build app code,
generate labels, or run benchmarks).
