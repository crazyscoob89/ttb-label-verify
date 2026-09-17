# ACCEPTANCE_CHECKLIST.md — TTB Label Verification Prototype

This checklist maps prototype deliverables to the six Treasury evaluation
criteria, plus a final delivery gate. It is a planning artifact — items are
checked off as the build progresses, not pre-filled.

## 1. Correctness / Completeness

- [ ] All 7 mandatory field categories are evaluated for every submitted
      label (brand name, class/type, alcohol content, net contents,
      bottler/producer name+address, country of origin, government health
      warning).
- [ ] Every field resolves to exactly one of the four defined outcomes
      (match / mismatch / not-applicable / needs-review) — no field is ever
      silently omitted from the result.
- [ ] Commodity-aware rule dispatch is correct: spirits, wine, and malt
      beverage labels are each evaluated against their own applicable rule
      set (see `PLAN.md`), not one universal rule set.
- [ ] Country of origin correctly resolves to not-applicable for domestic
      product labels and is actually evaluated for labels indicating an
      imported product.
- [ ] Government health warning check enforces exact statutory wording per
      27 CFR 16.21, including the all-caps bold `GOVERNMENT WARNING:`
      heading check and the non-bold-remainder check, per `PLAN.md`.
- [ ] Type-size compliance is consistently routed to needs-review for every
      label (documented architectural limitation, not an inconsistent gap).
- [ ] Batch mode produces a correct, complete result for every file
      submitted in the batch — no silent drops on partial failures.

## 2. Code Quality

- [ ] Provider-abstracted extraction interface is a real abstraction
      boundary (swap-able backend), not a leaky wrapper around one vendor
      SDK.
- [ ] Rule evaluation logic is organized per-commodity and per-field in a
      way that is readable and testable, not one large branching function.
- [ ] Server-side validation (file type, size, rate limits) is implemented
      as middleware/shared logic, not duplicated ad hoc per route.
- [ ] No secrets, API keys, or `.env` values are committed to the
      repository at any point in history.
- [ ] Reasonable TypeScript typing / schema validation on extraction model
      inputs and outputs (schema-constrained, not raw untyped JSON
      shuttling).
- [ ] Code is organized so a reviewer can find "where does rule X live" and
      "where does field Y's matching strategy live" without excessive
      spelunking.

## 3. Appropriate Technical Choices

- [ ] Single Next.js service on Vercel is justified and appropriate for the
      scope (no unnecessary microservices, no unnecessary separate backend).
- [ ] Extraction engine choice is backed by actual benchmark data (see
      `BENCHMARK_PLAN.md`), not an unexamined default.
- [ ] Stateless in-memory processing is an appropriate choice given no
      persistence requirement was specified — and is documented as a
      deliberate choice, not an oversight.
- [ ] Batch concurrency design (bounded client queue + server-enforced
      quotas) is proportionate to the actual scale expected of a prototype,
      not over- or under-engineered.
- [ ] Azure/Microsoft Foundry firewall-compatibility path is documented as
      a real, considered answer to a plausible government/enterprise
      deployment constraint, not a throwaway mention.

## 4. UX and Error Handling

- [ ] A non-technical Treasury reviewer can upload a label image and get a
      clear, understandable result without needing to read source code.
- [ ] `needs-review` results are visually and textually distinct from
      `mismatch` — the UI does not conflate "the system is unsure" with
      "the system found a violation."
- [ ] Type-size needs-review is explicitly explained in the UI (e.g., "type
      size cannot be verified from a photograph") rather than presented as
      an unexplained gap.
- [ ] Upload errors (wrong file type, oversized file, corrupt image) produce
      clear, actionable error messages — not raw stack traces or silent
      failures.
- [ ] Batch mode gives per-file progress/status, so a user submitting
      multiple labels can tell which ones succeeded, failed, or are still
      processing.
- [ ] Rate-limit/quota rejections are communicated clearly, not as a generic
      500 error.

## 5. Attention to Requirements

- [ ] All 7 field categories from the prompt are present — none dropped,
      none silently merged.
- [ ] The four-state outcome model is used consistently and is not
      collapsed into a simpler pass/fail binary anywhere in the UI or API.
- [ ] The asymmetric matching strategy (loose for brand, exact for the
      health warning) is actually implemented as asymmetric — not
      uniformly strict or uniformly loose out of convenience.
- [ ] The ~5s single-label performance target is measured and reported
      honestly in the benchmark results, including cases where it is not
      met, rather than asserted without evidence.
- [ ] OWASP upload hardening items are all present: extension allow-list,
      magic-byte verification, server-side byte/pixel limits, re-encode +
      EXIF stripping, `nosniff` header, rate limiting.
- [ ] Extraction model is schema-constrained and given no tool access,
      specifically to mitigate prompt injection via label text (see
      `THREAT_MODEL.md`).

## 6. Creative Problem-Solving

- [ ] The type-size-as-permanent-needs-review decision is presented as a
      deliberate, honest architectural stance (a "creative" resolution to
      an unsolvable sub-problem) rather than glossed over.
- [ ] The provider-abstraction + benchmark-driven engine selection approach
      demonstrates a considered, non-arbitrary way of choosing the
      extraction backend.
- [ ] The Azure/Microsoft Foundry documented path shows forward thinking
      about a real deployment constraint Treasury/government contexts are
      likely to have, beyond what was strictly asked.
- [ ] The asymmetric matching design (normalized equivalence vs. exact
      statutory wording) reflects genuine engagement with what the
      regulation actually requires per field, rather than a one-size-fits-
      all shortcut.

## Delivery Gate (Must Pass Before Calling This "Done")

- [ ] **Treasury can open the deployed URL and test it directly** — no
      local setup, no credentials beyond what's provided, works in a
      standard browser.
- [ ] **Another developer can clone the repo and run it locally from the
      README alone** — install steps, environment variable requirements
      (names only, not values), and run/build commands are all present and
      accurate.
- [ ] No secrets committed anywhere in git history (not just the current
      working tree).
- [ ] `README.md` clearly states scope and known limitations (e.g.,
      type-size unverifiability) so reviewers aren't surprised.
- [ ] Repository is private and accessible under the correct account/owner.

## Status

This checklist is currently a **planning artifact only**. No app code has
been written yet; all checkboxes above are unchecked pending implementation
in a later stage.
