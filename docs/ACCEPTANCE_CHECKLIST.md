# ACCEPTANCE_CHECKLIST.md — TTB Label Verification Prototype

This checklist maps prototype deliverables to the six Treasury evaluation
criteria, plus a final delivery gate. Stage 2 supplies a benchmark harness,
offline scorer/tests, and saved synthetic engine evidence, not the planned
application. Items require scoped evidence before being checked; benchmark
or documentation completion does not certify deployment controls.

## 1. Correctness / Completeness

- [ ] **Every evaluation is a comparison, not an abstract judgment:** each
      result is produced by comparing the extracted label value for a field
      against the applicant-declared value for that same field on that
      label's own application record — never a freestanding assessment of
      whether a label "looks compliant" without a paired application
      record. (See comparison-first framing in `PLAN.md`.)
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
      label (documented architectural limitation, not an inconsistent gap),
      separately from seven-field scoring and its automation denominator.
- [ ] Batch mode produces a correct, complete result for every file
      submitted in the batch — no silent drops on partial failures.
- [ ] **Batch image-to-application-record mapping works as specified:**
      the chosen mapping mechanism (filename convention or CSV manifest,
      per `PLAN.md`) correctly pairs every image with its declared
      application data before any comparison happens; unmapped images or
      manifest rows produce explicit per-item errors, never a silent
      mismatch or a comparison against the wrong record.
- [ ] **Uncertainty Invariant is enforced everywhere ("uncertainty never
      passes"):** no field ever resolves to `match` unless extraction
      produced a confident reading AND the deterministic rule affirmed it
      against the declared value. Blurry/illegible text, missing
      information, extraction failure (provider error/timeout), and
      malformed/schema-violating model output all route to `needs-review`.
      `mismatch` requires a confident contradictory reading, not an
      absent/unreadable runtime value — never a default `match`.
      Malformed/schema-violating model
      output is specifically logged (metadata only, no image bytes) when it
      occurs. (See Uncertainty Invariant in `PLAN.md`.)
- [ ] **Ground truth and safe decisions are distinct:** source fixture
      semantic truths and captured outputs are preserved; any derived
      expected-safe-decision mapping for absent/unreadable fields is explicit.
      Extraction-value accuracy is reported separately from outcome accuracy,
      with each numerator, denominator, and comparison target identified.
- [ ] **Engine evidence is scoped:** N=3 repeats per fixture/engine, zero
      observed false matches, and ≥60% clean seven-field automation are
      required. Finite zero-FM evidence is not general safety proof. The
      existing 18-fixture run does not test a non-bold warning heading or
      genuinely unreadable/cropped engine inputs; offline rule regressions
      do not close those perception/uncertainty coverage gaps.

## 2. Code Quality

- [ ] **Module boundaries are real, not aspirational:** `ui/`, `intake/`,
      `extraction/`, and `rules/` (per the Architecture / Module Boundaries
      section of `PLAN.md`) are actually separated — `ui/` contains no
      extraction or rule logic; `rules/` contains no network/AI calls;
      `extraction/` is only reachable through its provider interface; a
      reviewer can verify the boundary by inspection (imports don't cross
      the wrong way) and by the test boundaries below.
- [ ] **`rules/` has automated tests with zero AI/network dependency** —
      unit tests feed synthetic (extracted value, declared value) pairs
      directly into the comparison logic and assert the correct four-state
      outcome, with no model calls and no network access in the test path.
- [ ] **`intake/` has automated tests using malicious/oversized/wrong-type
      fixtures** — upload hardening and manifest-mapping validation are
      exercised against adversarial inputs (oversized files, spoofed
      extensions, bad magic bytes, decompression-bomb-style dimensions,
      mismatched manifest rows) and each is asserted to be rejected
      cleanly.
- [ ] One file per field check within `rules/` (e.g., brand name, ABV,
      government warning each have their own file) — not one large
      branching function.
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
      deliberate choice, not an oversight. Buffer-only operation must be
      verified against the actual application libraries/configuration.
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
      end-to-end in the deployed application, including cases where it is
      not met. Current benchmark latency is engine-call only and cannot
      satisfy this pending deployed end-to-end gate.
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
- [x] `README.md` clearly states scope and known limitations (e.g.,
      type-size unverifiability, and the external provider data retention
      limitation per `THREAT_MODEL.md`) so reviewers aren't surprised. —
      **Documentation only:** README distinguishes required buffer-only
      processing from verified implementation and discloses open spending,
      external retention, engine-coverage, and end-to-end timing gates.
- [ ] Repository is private and accessible under the correct account/owner.
- [ ] **HARD GATE — verified global spending bound (NOT MET):** public
      provider-backed access stays disabled until an enforced account/key
      global cap, tested shared atomic quota, or other proven global bound
      is verified. Record scope, ceiling/period, mechanism, and observed
      rejection behavior; account for concurrent instances, resets, retries,
      in-flight work, billing lag, and bounded per-request cost per
      `THREAT_MODEL.md` §4. Alert-only budgets, console inspection alone,
      and a manual env kill switch plus per-instance daily quota do not
      pass. Per-instance controls/manual shutdown remain defense in depth.
      A timeout is not evidence of cancellation or zero billing.
- [ ] **HARD GATE — buffer-only application processing (UNVERIFIED):** test
      the actual parser, image libraries, framework, and provider SDK for
      no content disk/temp-file writes, including failures. If this cannot
      be achieved, stop pending an explicitly disclosed/approved alternative;
      do not claim verified memory-only behavior. Synthetic offline fixtures
      and results intentionally on disk are excluded from this policy.
- [ ] **HARD GATE — retention boundaries (UNVERIFIED):** document/test browser
      lifecycle and hosting-platform retention/configuration, and cite the
      actual provider retention/training terms and selected privacy settings.
      OpenRouter and upstream/fallback providers require separate coverage.
      Azure alone does not close this gate. Use stays synthetic-only until
      verified; this document supplies no assertion of current provider terms.

## Status

Stage 2 benchmark implementation/evidence exists; the application and its
deployment gates are not accepted. The sole checked item is README
documentation, not verified security/retention behavior. Public
provider-backed access must remain disabled pending the global spending
gate, and non-synthetic use remains blocked pending retention verification.
