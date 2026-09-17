# TTB Label Verify

Standalone prototype for automated verification of alcohol beverage labels against
TTB (Alcohol and Tobacco Tax and Trade Bureau) mandatory labeling requirements
(27 CFR Parts 4, 5, 7).

**Status:** Stage 1 — planning artifacts only. No application code yet.

## Planning docs

- [docs/PLAN.md](docs/PLAN.md) — frozen scope, architecture, matching rules
- [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) — evaluation criteria mapping
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — security threat model skeleton
- [docs/BENCHMARK_PLAN.md](docs/BENCHMARK_PLAN.md) — vision engine benchmark plan

## Known Limitations

- **External provider data retention (uploaded label images).** Extraction
  requires sending uploaded label image bytes to an external vision API for
  processing. This is an unavoidable external transmission, not an
  application storage decision. Once an image leaves the application's
  process boundary as part of that API call, the provider's own stated
  retention/training-use policy — not this application's policy — governs
  what happens to that transmitted copy, including whether it is retained,
  used for model training, or captured in provider-side logs/caches.
  Before go-live, deployment documentation must cite the chosen provider's
  retention/training-use policy by name (`<provider name/link — to be filled
  in once the extraction engine is selected>`), including whether a
  zero-data-retention (ZDR) option is available and selected. For a
  production federal deployment, this concern is resolved by on-tenant
  Azure/Microsoft Foundry hosting (see `docs/PLAN.md`), which keeps the
  vision call within the tenant's own governed boundary instead of a
  general commercial API. See `docs/THREAT_MODEL.md` §6 for the full
  analysis.
- **Type-size compliance is needs-review only.** Minimum type-size
  requirements cannot be reliably or physically measured from a photo, so
  type-size compliance is permanently routed to `needs-review` for every
  label, every time — it is never auto-passed or auto-failed. See
  `docs/PLAN.md`.
- **The application persists nothing in app-controlled storage.** No
  uploaded image, extracted data, or verification result is written to
  disk, a database, or any other durable store that this application
  controls. This claim covers only application-controlled storage; it does
  not extend to the external provider copy described above.

## Setup

_To be documented once the Next.js scaffold exists._
