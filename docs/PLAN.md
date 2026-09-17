# PLAN.md — TTB Label Verification Prototype

## Frozen Scope

This document defines the frozen scope for the prototype. Changes to scope after
this point should be recorded as amendments below, not silent edits.

**Goal:** A standalone prototype that verifies whether an alcohol beverage label
(spirits, wine, or malt beverage) complies with the mandatory labeling
requirements enforced by TTB (Alcohol and Tobacco Tax and Trade Bureau) under
27 CFR Parts 4, 5, 7, and 16 — specifically the government health warning
statement requirement (27 CFR 16.21).

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
3. **Alcohol content** — stated ABV (% alcohol by volume), format and
   tolerance rules vary by commodity.
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
  most granular (whiskey sub-types, vodka, gin, rum, etc.); ABV statement
  format and standards of fill governed by 27 CFR Part 5.
- **Wine** — class/type includes varietal, semi-generic, and generic
  designations; ABV tolerance bands differ from spirits; governed by 27 CFR
  Part 4.
- **Malt beverages** — class/type is typically "beer", "ale", "malt liquor",
  etc.; ABV statement requirements vary by state and are less federally
  standardized; governed by 27 CFR Part 7.

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
- **Other fields** (class/type, alcohol content, net contents,
  bottler/producer, country of origin) — matching strategy documented
  per-field in the implementation as each has its own regulatory tolerance
  (e.g., ABV has numeric tolerance bands; net contents has standards-of-fill
  constraints).

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

## Performance Target

- **Single-label design target: ~5 seconds** end-to-end (upload → extraction
  → rule evaluation → result), measured honestly (real end-to-end latency
  under realistic network/model conditions, not a best-case cherry-picked
  number). This is a target to design toward, not a guaranteed SLA — actual
  measured latency will be reported per the BENCHMARK_PLAN, not asserted
  without data.

## Batch Processing Model

- Batch mode is implemented as **per-file requests**, not a single monolithic
  batch API call — each label image is processed as its own independent
  request/response cycle.
- Concurrency is controlled via a **bounded browser-side queue** (client
  limits how many requests are in flight at once) combined with
  **server-enforced quotas** (rate limiting / concurrency caps enforced
  server-side, not trusted to the client). This protects both UX (avoids
  overwhelming the browser) and the backend/provider spend (avoids a
  malicious or careless client firing unbounded concurrent requests).

## Data Handling

- **Stateless, in-memory processing.** Uploaded images and extraction results
  are processed in memory for the duration of the request and are **not
  persisted** to disk, a database, or any durable store. No user data
  outlives the request.

## Architecture

- **Single Next.js service deployed on Vercel.** No separate backend service;
  API routes within the Next.js app handle upload, extraction orchestration,
  and rule evaluation. This keeps the prototype simple to run, deploy, and
  review (single repo, single deploy target, single README to onboard from).

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
- **Azure / Microsoft Foundry is documented as the answer for
  enterprise/firewall-constrained deployment contexts** — i.e., if the
  eventual deployment environment requires traffic to stay within an
  Azure-governed network boundary (a realistic constraint for a Treasury/
  government-adjacent context), the provider abstraction is designed so that
  swapping to Azure/Microsoft Foundry as the extraction backend is a
  configuration change, not a rearchitecture. This is documented as the
  answer to that constraint even though the initial benchmark may evaluate
  other providers too.

## Non-Goals (Explicit)

- No app code, UI implementation, or working extraction pipeline is part of
  this planning stage.
- No label images are generated or benchmarked during this stage.
- No persistence layer, user accounts, or auth system — this is a stateless
  single-session tool.
- No claim of full TTB COLA-system equivalence or legal certification; this
  is a verification aid, and `needs-review` is a first-class, expected
  outcome, not a fallback failure mode.

## Amendments

_(None yet — this section records any scope changes made after this document
was frozen, with date and reason.)_
