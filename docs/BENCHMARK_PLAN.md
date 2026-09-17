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

## Test Label Matrix

Synthetic label images will be constructed (not sourced from real
commercial products) to cover both clean/compliant cases and adversarial
cases per commodity. Each row below is a planned test case category, not yet
generated.

### Clean (Compliant) Cases — one per commodity

| ID | Commodity | Description |
|----|-----------|-------------|
| C-SPIRITS-01 | Spirits | Fully compliant vodka label: correct brand, correct class/type, correctly formatted ABV, correct net contents, correct bottler name/address, correctly formatted government warning (bold caps heading, non-bold body). Domestic — country of origin not-applicable. |
| C-WINE-01 | Wine | Fully compliant red table wine label: correct varietal/class designation, correct ABV within wine tolerance band, correct net contents, correct producer info, correctly formatted government warning. Domestic. |
| C-MALT-01 | Malt beverage | Fully compliant ale label: correct class/type ("Ale"), ABV statement present and correctly formatted, correct net contents, correct brewer info, correctly formatted government warning. Domestic. |
| C-SPIRITS-IMPORT-01 | Spirits | Fully compliant imported spirits label — includes a correct, present country-of-origin statement (tests that country-of-origin correctly resolves to **match** rather than not-applicable when the product is imported). |

### Adversarial Cases — targeted at specific matching-logic edge cases

| ID | Category tested | Description |
|----|------------------|-------------|
| A-WARN-TITLECASE-01 | Government warning — exact wording | Warning heading rendered as "Government Warning:" (title case) instead of required all-caps "GOVERNMENT WARNING:". Expected: **mismatch** (tests that the exact-wording/exact-casing check actually rejects near-miss casing, not just wildly wrong text). |
| A-WARN-BOLDBODY-01 | Government warning — bold/non-bold structure | Warning heading correctly bolded and capitalized, but the body text (the statutory statement following the heading) is also rendered in bold. Expected: **mismatch** (tests the non-bold-remainder check specifically, per 27 CFR 16.21 and `PLAN.md`). |
| A-BRAND-CASE-01 | Brand name — normalized equivalence | Brand name on the label differs from the reference/expected brand only in letter case (e.g., "Old Harbor" label text vs. "OLD HARBOR" expected reference, or vice versa). Expected: **match** (tests that normalized equivalence correctly treats case differences as non-significant, unlike the warning check). |
| A-ABV-WRONG-01 | Alcohol content | Label's stated ABV numerically differs from the actual/reference ABV by an amount exceeding the applicable commodity's tolerance band. Expected: **mismatch**. |
| A-FIELD-MISSING-01 | Completeness | One or more required fields (e.g., bottler address, net contents) is simply absent from the label image entirely. Expected: the missing field(s) resolve to **mismatch** or **needs-review** as appropriate (exact expected outcome to be defined per field during implementation) — never silently dropped from the result set. |
| A-ANGLE-GLARE-01 | Image quality / extraction robustness | Label photographed at a steep angle and/or with significant glare obscuring part of the text. Expected: tests whether extraction degrades gracefully into **needs-review** for affected fields rather than confidently emitting a wrong value. |

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
