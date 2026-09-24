# PLAN.md — TTB Label Verification Prototype

> **Current planning amendment (documentation only):** [GOVERNANCE-AND-AUDIT-DESIGN.md](GOVERNANCE-AND-AUDIT-DESIGN.md) and [BUILD-PLAN.md](BUILD-PLAN.md) propose individual identity and persistent, version-bound review history. The no-account/no-retention architecture below is preserved as the earlier baseline, not the proposed target. Alex has authorized the new design package only; implementation, persistence activation and deployment remain held pending scope approval. Existing upload, inference and spending safeguards still apply.

## Frozen Scope

This document defines the frozen scope for the prototype. Changes to scope after
this point should be recorded as amendments below, not silent edits.

**Current stage:** Stage 2 has implemented the synthetic fixtures, benchmark
harness, and offline scorer/tests. The Next.js application and deployment
controls below remain planned, not verified implementation. Historical
planning-stage exclusions do not imply that no benchmark code exists.

**Goal:** A standalone prototype whose core function is **comparing each
submitted label image against that label's own applicant-declared
application data** — a per-label pairing of (label image, application
record) — for the seven mandatory field categories enforced by TTB (Alcohol
and Tobacco Tax and Trade Bureau) under 27 CFR Parts 4, 5, 7, and 16,
including the government health warning statement requirement (27 CFR
16.21).

**This is explicitly NOT** a system that judges whether a label "looks
legally acceptable" in the abstract, in isolation, or against some general
notion of compliance. There is no such thing as evaluating a label without
an application record — every evaluation is a comparison: what does the
label actually show, versus what did the applicant declare for that exact
field on that exact application. A field only resolves to **match** when
the extracted label value is consistent with the corresponding
applicant-declared value (subject to the field's matching strategy — see
Asymmetric Matching Strategy below); mismatches are declared-vs-shown
discrepancies, not abstract legal judgments. (The one partial exception is
the government health warning statement, whose required wording is fixed by
regulation rather than declared per-application — see below — but even that
check is still scoped to a specific label being evaluated, not a freestanding
assessment.)

Out of scope: this is not a full COLA (Certificate of Label Approval)
automation tool, does not integrate with TTB systems, and does not persist
uploaded images or extraction results beyond the request lifecycle.

## 7 Field Categories

Every label is evaluated against these seven mandatory field categories.
Applicability of some fields is commodity- and context-dependent (see below).

1. **Brand name** — the name under which the product is marketed.
2. **Class/type designation** — the statutorily/regulatorily defined class or
   type (e.g., "Vodka", "Straight Bourbon Whiskey", "Red Table Wine", "India
   Pale Ale").
3. **Alcohol content (ABV) — consistency check** — does the ABV value
   stated on the label match the ABV value declared on the application.
   This is a straight label-vs-application consistency comparison; see
   "Alcohol Content: Consistency-Only Verdict" below for the exact scope
   of this check and what is explicitly excluded from it.
4. **Net contents** — the declared volume of the container.
5. **Bottler/producer name and address** — the responsible entity's name and
   principal place of business (city and state at minimum).
6. **Country of origin** — required for imported products only; not
   applicable to domestic labels.
7. **Government health warning statement** — the mandatory Surgeon General
   warning statement required on virtually all containers of alcohol
   beverages under 27 CFR 16.21.

## Commodity-Aware Rules

Requirements differ across the three commodity classes the prototype supports:

- **Spirits (distilled spirits)** — class/type rules are the strictest and
  most granular (whiskey sub-types, vodka, gin, rum, etc.); standards of
  fill governed by 27 CFR Part 5. (ABV itself is checked as a plain
  label-vs-application consistency comparison — see "Alcohol Content:
  Consistency-Only Verdict" below; commodity-specific regulatory ABV
  tolerance rules under Part 5 are not evaluated by this prototype.)
- **Wine** — class/type includes varietal, semi-generic, and generic
  designations; governed by 27 CFR Part 4. (ABV consistency check per
  "Alcohol Content: Consistency-Only Verdict" below; Part 4's regulatory
  ABV tolerance bands are not evaluated by this prototype.)
- **Malt beverages** — class/type is typically "beer", "ale", "malt liquor",
  etc.; less federally standardized and varies by state; governed by 27 CFR
  Part 7. (ABV consistency check per "Alcohol Content: Consistency-Only
  Verdict" below; state-level ABV statement variations are not evaluated by
  this prototype.)

The rule engine must dispatch validation logic per-commodity rather than
applying one universal rule set — e.g., country of origin is only evaluated
when the commodity/context indicates an imported product; ABV formatting
rules differ per commodity.

## Four-State Outcome Model

Every field, for every label, resolves to exactly one of four outcomes:

- **match** — extracted value satisfies the applicable rule.
- **mismatch** — extracted value violates the applicable rule (e.g., wrong
  wording, incorrect formatting, non-compliant class/type).
- **not-applicable** — the field does not apply to this label's context
  (e.g., country of origin on a domestic product).
- **needs-review** — the system cannot make a confident automated
  determination (including fields that are inherently unverifiable from a
  photo — see Type-Size below) and a human must review.

No field is ever silently skipped; every field always resolves to one of
these four states so the output is always fully accounted for.

## Asymmetric Matching Strategy

Matching strategy is NOT uniform across fields — it is deliberately
asymmetric based on what the regulation actually requires:

- **Brand name** — uses **normalized equivalence** matching (case-insensitive,
  whitespace-normalized, punctuation-tolerant). The regulation cares about the
  brand identity, not exact typographic reproduction.
- **Government health warning statement** — uses **exact statutory wording**
  matching per 27 CFR 16.21. This is the strictest check in the system:
  - The heading `GOVERNMENT WARNING:` must appear in capital letters and in
    **bold type** exactly as prescribed.
  - The remainder of the statement text must be checked for **non-bold**
    formatting (the regulation requires the heading to stand out from the
    body — bolding the body text is itself a compliance failure, not just a
    wording failure).
  - Any deviation in wording, capitalization of the heading, or bold/non-bold
    formatting is a mismatch — this field does not get the benefit of fuzzy
    matching.
- **Alcohol content (ABV)** — uses **numeric consistency** matching: the
  label-stated ABV is compared directly against the application-declared
  ABV, normalized only for equivalent formatting (e.g., "40%" and "40.0%"
  are the same value — this is unit/format normalization, not a regulatory
  tolerance band). The verdict is a pure label-vs-application consistency
  check, full stop — see "Alcohol Content: Consistency-Only Verdict" below.
  TTB regulatory tolerance (whether a stated ABV that differs numerically
  would still be an allowed variance under 27 CFR) is explicitly NOT
  evaluated as part of this or any match/mismatch decision; it is
  documented as an out-of-scope limitation, not folded into the verdict.
- **Other fields** (class/type, net contents, bottler/producer, country of
  origin) — matching strategy documented per-field in the implementation as
  each has its own regulatory tolerance (e.g., net contents has
  standards-of-fill constraints).

## Alcohol Content: Consistency-Only Verdict

Alcohol content is deliberately scoped as **two separate,
independently-reported questions**, per review — they must never be
conflated into one fuzzy "ABV compliance" judgment:

1. **Consistency (the only thing that produces a verdict).** Does the ABV
   printed on the label match the ABV declared on the paired application
   record? This resolves to the standard four-state outcome
   (match/mismatch/needs-review; not-applicable does not apply to this
   field) using the numeric-consistency matching strategy described above.
   This is the entirety of what the ABV field's verdict measures.
2. **Regulatory tolerance (out of scope for the verdict, documented
   limitation only).** TTB regulations separately govern how much an
   actual/finished product's ABV may vary from its labeled/declared ABV
   before it becomes a compliance issue (tolerance bands that differ by
   commodity per 27 CFR Parts 4, 5, and 7). This prototype does **not**
   evaluate that question and does **not** fold it into the match/mismatch
   decision in any way — there is no tolerance-band logic anywhere in the
   consistency check. If regulatory tolerance is referenced anywhere in
   this system (UI copy, documentation, reports), it must be presented
   strictly as a documented limitation, worded to this effect:
   **"regulatory tolerance evaluation is a TTB determination, not
   performed by this tool."** It must never be presented as something the
   system checks, partially checks, or accounts for in its verdict.

This separation exists so that a label with an ABV that is numerically
inconsistent with its application is never allowed to resolve to `match`
on the theory that it might fall within some regulatory tolerance band —
the verdict is purely: does the label agree with the application, yes or
no (or needs-review if unreadable).

## Type-Size: Permanent Needs-Review Lane

TTB regulations impose minimum type-size requirements for certain label text
(e.g., the health warning statement's minimum type size scales with container
size). **Type size cannot be reliably or physically measured from a photo** —
photo resolution, camera distance/angle, and lack of a size reference make
this fundamentally unverifiable by the system.

Design decision: type-size compliance is **permanently routed to
needs-review** for every label, every time. This is not a temporary
limitation to be "solved" later — it is an honest architectural boundary
between what a vision-based system can and cannot verify. The UI/report must
make this explicit to the user rather than silently omitting it or falsely
reporting a pass.

This physical type-size referral is separate from the seven field verdicts
and excluded from benchmark field-accuracy, referral, and automation
denominators. It must still be visible on every eventual user-facing result.

## Performance Target

- **Single-label design target: ~5 seconds** end-to-end (upload → extraction
  → rule evaluation → result), measured honestly (real end-to-end latency
  under realistic network/model conditions, not a best-case cherry-picked
  number). This is a target to design toward, not a guaranteed SLA — actual
  measured latency will be reported per the BENCHMARK_PLAN, not asserted
  without data. Current Stage 2 latency measures the engine call only;
  deployed end-to-end performance against this target remains pending.

## Batch Processing Model

- Batch mode is implemented as **per-file requests**, not a single monolithic
  batch API call — each label image is processed as its own independent
  request/response cycle. Each request pairs exactly one label image with
  exactly one applicant-declared application record, per the
  comparison-first framing above — batch mode is a set of independent
  (image, application record) comparisons, not a set of images evaluated in
  isolation.
- **Image-to-application-record mapping mechanism (required, explicit):**
  the batch UI/API must define, up front, exactly how each uploaded image is
  paired with its declared application data. Two supported mechanisms:
  - **Filename convention** — each image filename must encode (or be
    pre-mapped to) an application/record identifier that the system can look
    up (e.g., `<application-id>.jpg`); files that do not match the
    convention are rejected with a clear per-file error rather than silently
    skipped or matched to the wrong record.
  - **CSV manifest mapping** — the batch submission includes a manifest
    (CSV) that explicitly maps each image filename to its declared field
    values (or to an application-record identifier the system resolves the
    declared fields from); the manifest is validated (every image has a
    corresponding manifest row, every manifest row's declared fields are
    present) before any extraction/comparison work begins, and mismatches
    (image with no manifest row, manifest row with no matching image) are
    surfaced as explicit per-item errors, never silently dropped.
  - Exactly one of these mechanisms must be selected and implemented for the
    prototype (choice deferred to build stage), but batch mode may not ship
    without an explicit, validated mapping mechanism — an image can never be
    evaluated without its paired application record.
- Concurrency is controlled via a **bounded browser-side queue** (client
  limits how many requests are in flight at once) combined with
  **server-enforced quotas** (rate limiting / concurrency caps enforced
  server-side, not trusted to the client). This protects both UX (avoids
  overwhelming the browser) and the backend/provider spend (avoids a
  malicious or careless client firing unbounded concurrent requests).
- Per-instance limits and a manual kill switch are defense in depth, not
  a global spending cap. **Public provider-backed access remains disabled**
  until a verified enforced account/key global cap, tested shared atomic
  quota, or other proven global bound satisfies `THREAT_MODEL.md` §4.
  This deployment gate is not met. A provider timeout does not prove
  cancellation or zero billing.

## Data Handling

- **Required buffer-only application processing (unverified).** Uploaded
  images, extracted values/results, and applicant data must remain in
  request-scoped memory, with no content disk/temp-file, database, blob,
  cache, or log retention. Test the selected parser, re-encoder, framework,
  and provider SDK for buffer-only operation, including failures. Library
  temp files are not an exception: if this cannot be achieved, stop the
  deployment gate pending an explicit disclosed and approved alternative.
  Do not assert verified implementation from this design requirement.
  Only the operational/verdict metadata allowlist in `THREAT_MODEL.md` §6
  may be logged, not full results or input/extracted values.
- **Synthetic offline benchmark artifacts are intentionally persisted.**
  Fixtures, raw outputs, and derived results on disk support reproducible
  evaluation and are excluded from the application upload-processing
  policy; they contain synthetic data, not real applicant submissions.
- **Browser, platform, and external-provider retention are separate.**
  The application policy cannot establish browser/cache behavior, hosting
  request/log retention, or retention/training use of externally transmitted
  image bytes. For OpenRouter routes, verify both OpenRouter and the
  actual upstream provider(s), including fallback routing. Actual terms,
  links, and configuration must be documented per `THREAT_MODEL.md` §6;
  this remains unverified and use stays **synthetic-only until verified**.

## Architecture

- **Single Next.js service deployed on Vercel.** No separate backend service;
  API routes within the Next.js app handle upload, extraction orchestration,
  and rule evaluation. This keeps the prototype simple to run, deploy, and
  review (single repo, single deploy target, single README to onboard from).

### Module Boundaries (Enforced)

Within the single Next.js service, the codebase is organized into separated
modules with enforced boundaries — each module has one job, and other
modules may only interact with it through its defined interface:

- **`ui/`** — presentation only. Renders results, forms, upload UI, and
  batch progress. Contains no extraction logic, no rule logic, and no
  direct provider/model calls. Consumes results already computed by
  `rules/` via API routes; does not compute compliance itself.
- **`intake/`** — upload validation and security checks. Owns the OWASP
  upload hardening measures (extension allow-list, magic-byte verification,
  server-side byte/pixel limits, re-encode + EXIF strip, rate limiting) and
  the batch image-to-application-record mapping validation (filename
  convention / CSV manifest parsing and validation, per the Batch Processing
  Model above). Nothing downstream (`extraction/`, `rules/`) is ever handed
  an image or manifest entry that has not passed through `intake/` first.
- **`extraction/`** — AI vision reading of label fields, accessed only
  through a **provider interface** (the abstraction described in
  "Extraction Architecture" below). No other module calls a vision
  provider's SDK directly — all such calls are routed through this module's
  interface, so the provider is swappable without touching `rules/` or
  `ui/`. `extraction/` returns schema-constrained field values (with
  confidence/failure signaling — see Uncertainty invariant below); it does
  not make compliance determinations itself.
- **`rules/`** — deterministic comparison logic: given an extracted field
  value and the applicant-declared value for that field (per the
  comparison-first framing above), decide match / mismatch / not-applicable
  / needs-review. **One file per field check** (e.g., a file for brand name
  comparison, a separate file for the government warning check, a separate
  file for ABV, etc.) so each field's matching strategy (see Asymmetric
  Matching Strategy) is independently readable, testable, and reviewable.
  `rules/` never calls a network or AI provider — it is pure, deterministic
  code operating on already-extracted values and already-declared values.

**Boundary enforcement via tests:** automated tests protect each module
boundary directly:
- `rules/` is tested with **zero AI/network dependency** — unit tests feed
  it synthetic (extracted value, declared value) pairs directly and assert
  the correct four-state outcome, with no model calls, no network access,
  and no image processing in the test path. This is what makes the
  comparison logic reviewable and trustworthy independent of any particular
  extraction engine's behavior.
- `intake/` is tested with **malicious, oversized, and wrong-type
  fixtures** — unit/integration tests exercise the upload hardening and
  manifest-mapping validation against adversarial inputs (oversized files,
  spoofed extensions, malformed magic bytes, decompression-bomb-style
  dimensions, manifests with missing/mismatched rows) and assert each is
  rejected with a clear error rather than passed through.

## Uncertainty Invariant: Uncertainty Never Passes

**No field may resolve to `match` unless both of the following are true:**
1. `extraction/` produced a **confident** reading for that field (not a
   low-confidence guess, not an empty/missing value, not a failed
   extraction call), **and**
2. the deterministic rule in `rules/` **affirmed** the match given that
   confident reading and the applicant-declared value for that field.

If either condition is not met, the field must **never default to
`match`**. Specifically:
- **Blurry/illegible text, or text the extraction model could not
  confidently read** → `needs-review`.
- **Missing/absent or unreadable information in an applicable field at
  runtime** (including an empty/null extraction) → `needs-review`, not a
  confident absence finding. Context-based `not-applicable` remains distinct.
  Fixture authors may know a required field is truly absent and record
  semantic mismatch ground truth. Preserve that source truth separately
  from the expected safe runtime decision (`needs-review`); do not silently
  rewrite fixture truth to make the runtime outcome appear accurate.
- **Extraction failure** (provider error, timeout, exception) →
  `needs-review` for the affected field(s), never a silent pass and never a
  fabricated value.
- **Malformed or schema-violating model output** (extraction response that
  does not conform to the expected schema) → treated as extraction failure
  for that field: routes to `needs-review`, and the malformed output is
  **logged** (metadata about the failure, not raw image bytes — see
  `THREAT_MODEL.md`) so it can be investigated, rather than retried
  silently into a guessed value or defaulted to green.
- **`mismatch`** is reserved for cases where extraction was confident and
  the rule affirmatively found a discrepancy or contradiction against the
  declared value (or, for the government warning, against the required
  statutory wording) — mismatch is a positive finding, not a fallback for
  uncertainty.

There is no code path in which the absence of a definitive answer produces
a default `match`. When in doubt, the system is designed to say "a human
needs to look at this," never "this is fine."

## Upload Hardening (OWASP-aligned)

Uploaded images are treated as untrusted input. Hardening measures:

- **Extension allow-list** — only accept expected image extensions
  (e.g., .jpg/.jpeg/.png/.webp); reject everything else outright.
- **Magic-byte verification** — verify the actual file content's magic bytes
  match a permitted image format; do not trust the client-supplied extension
  or MIME type alone.
- **Server-side byte/pixel limits** — enforce maximum file size and maximum
  image dimensions server-side (not just client-side, which is trivially
  bypassable).
- **Re-encode and strip EXIF** — the server re-encodes the uploaded image
  (rather than passing the raw uploaded bytes through) and strips EXIF
  metadata, which both normalizes the input and removes a metadata-based
  attack/leak surface.
- **`nosniff`** — set `X-Content-Type-Options: nosniff` on responses serving
  or echoing any uploaded/derived content to prevent MIME-sniffing attacks.
- **Rate limiting** — server-enforced rate limits on upload/extraction
  endpoints, independent of and in addition to the batch queue quotas above.

## Extraction Architecture

- Label field extraction is performed by a **vision-capable model**, accessed
  through a **provider-abstracted interface** (an internal adapter/interface
  boundary, not a hardcoded call to one vendor's SDK/API shape).
- The **specific engine/provider is selected based on the results of the
  BENCHMARK** (see `BENCHMARK_PLAN.md`) — this decision is deliberately
  deferred until benchmark data exists, not asserted up front.
- **Azure / Microsoft Foundry is a potential enterprise/firewall-constrained
  deployment path.** The provider interface is intended to support such
  an adapter without changing rule logic. Actual network boundaries,
  model hosting, retention/training terms, and configuration still require
  verification; selecting Azure alone does not resolve external retention
  concerns or establish deployment acceptance.

## Non-Goals (Explicit)

- Historically, Stage 1 excluded app code, UI, fixture generation, and
  benchmark execution. Stage 2 now includes the benchmark harness and
  synthetic images/results, but not a deployed application or UI.
- No persistence layer, user accounts, or auth system — this is a stateless
  single-session tool.
- No claim of full TTB COLA-system equivalence or legal certification; this
  is a verification aid, and `needs-review` is a first-class, expected
  outcome, not a fallback failure mode.

## Amendments

- **Bounded Stage 2 audit revision:** Corrected the spending gate (manual
  kill switch/per-instance quota cannot substitute for a verified global
  bound), selected required buffer-only processing without a temp-file
  exception, separated external retention boundaries and synthetic artifacts,
  and clarified absent/unreadable runtime referrals versus fixture truth.
  Benchmark engine-call timing is not deployed end-to-end timing. These
  are corrections to the existing scope, not evidence of implemented gates.

- **Revision (post-review of initial commit):** Added explicit
  comparison-first framing (label image vs. applicant-declared application
  data, not abstract legal judgment), the batch image-to-application-record
  mapping mechanism (filename convention / CSV manifest), the Module
  Boundaries architecture section (`ui/`, `intake/`, `extraction/`,
  `rules/` with enforced test boundaries), and the Uncertainty Invariant
  ("uncertainty never passes"). Made in response to review feedback on the
  initial planning-docs commit; no app code exists yet, so this is a
  clarification/strengthening of the frozen scope, not a scope change.
- **Revision (post-review of `605a782`):** Split alcohol content into two
  independently-reported questions — a pure label-vs-application
  consistency verdict (the only thing that produces match/mismatch/
  needs-review) and TTB regulatory tolerance, which is now explicitly
  out of scope for the verdict and, if mentioned at all, documented as a
  limitation only (see "Alcohol Content: Consistency-Only Verdict").
  Clarification of the frozen scope in response to review feedback; no
  app code exists yet, so no scope change.
