# Azure Foundry Mistral OCR group lane

This additive, server-selected lane is **not a Haiku model-name swap**. Default group extraction remains OpenRouter when `TTB_GROUP_EXTRACTION_PROVIDER` is absent. Set it to `azure-foundry` only with managed persistence and a separately approved, current published-retail operational estimate including the relevant annotation page meter. Unknown/empty selection fails closed; there is no retry/provider fallback. Existing singleton extraction remains Haiku. Use a one-photo group for OCR of one image.

## Frozen contract

- Source: `azure-foundry`
- Model: `mistral-document-ai-2512`
- Prompt version: `azure-ocr-photo-observations-v1`
- Group evidence schemaVersion / saved recordVersion: `2`
- Public per-photo evidence remains extraction schemaVersion `1` (status/text/reason; separate producer name/address; separate complete warning heading/body; nullable bold booleans). New requests use a [private compact annotation wire](azure-compact-annotation.md), expanded deterministically by the host. Captured full-v1 annotations still replay strictly and unchanged.
- Rules: unchanged `prototype-seven-fields-v1`, current rulesRevision 6 and `photo-set-aggregation-v2`. Historical fixtures/Haiku records, legacy singleton records and historical v4/aggregation-v1 replay remain unchanged.
- Display identity: **Azure Foundry · Mistral Document AI 2512 (OCR annotation)**.

## Server configuration and authority

Required for selected Azure group runtime:

```
TTB_PERSISTENCE=supabase
TTB_GROUP_EXTRACTION_PROVIDER=azure-foundry
AZURE_FOUNDRY_ENDPOINT=https://ttb-foundry-trial-resource.services.ai.azure.com/providers/mistral/azure/ocr
AZURE_FOUNDRY_API_KEY=<server-only key>
TTB_AZURE_OCR_PRICING_JSON=<reviewed price object below>
```

Existing managed runtime/access/media signer settings remain required. The archived endpoint origin (`https://ttb-foundry-trial-resource.services.ai.azure.com`, optionally ending `/`) is also accepted and resolves **only** to the exact approved OCR route. No arbitrary URL, path, query, fragment or redirect is accepted. The Azure key participates in media-signer key-separation checks. No key/env discovery takes place inside the adapter, and no public/client provider choice is accepted.

Programmatic diagnostic entrypoint is `createAzureMistralOcrGroupProvider({authorized:true, endpoint, apiKey, pricing, store, transport?, onResponse?})`. `store` must be the existing managed spend store for an actual call; no new ledger or inherited benchmark headroom. `authorized` and `pricing` are trusted server composition inputs, not browser request fields. The ordinary demo handler supports trusted constructor `azurePricing` or parses the server pricing JSON.

## Pricing is default deny

`AzureOcrPricing` requires exactly:

| Key | Meaning |
|---|---|
| `approved` | literal `true`, explicitly reviewed configuration |
| `endpoint`, `model`, `operation` | exact full OCR endpoint, pinned model, `single-image-ocr-document-annotation` |
| `evidenceReference`, `evidenceSha256` | retained current published-retail meter evidence and its SHA256; mandatory, not an account guarantee |
| `verifiedAt`, `reviewBy` | ISO UTC evidence-verification time and operator review deadline; max 24h from verification, with dispatch + 20s before the deadline. Policy dates, not tariff effective/validity dates |
| `pricingBasis` | literal `published-retail-estimate`; an approved operational estimate, never settled actual cost |
| `pageAssumption` | literal `one-page-per-single-frame-image`; explicitly an assumption, not a proven provider billing definition |
| `annotationBilling` | enum `additive-published-meter-estimate`; add the published Document AI page meter conservatively rather than assert annotation is included |
| `ocrMicrousd`, `annotationMicrousd`, `fixedRequestMicrousd` | upward-rounded integer estimates for one image/request: sum all published relevant page meters (highest relevant regional OCR plus Document AI meters) and any published fixed fee; both page components positive, fixed component nonnegative |
| `approvedMaxMicrousd` | separate approved operational threshold; positive and no more than 1,000,000 |

The component sum must be no greater than the approved threshold or the unchanged **$1 per POST reservation**. The unchanged **$25 shared ledger cap**, receipt checks and retained liabilities still apply. The reservation is a local admission/liability ceiling, not a provider-enforced invoice guarantee. This schema validates an operator-approved estimate; it does not independently authenticate evidence or promise all account/region/deployment fees are bounded. Missing, malformed, unbounded, stale or over-reservation estimates block inference. No real price configuration is supplied. Test fixtures are **synthetic offline-only estimates**, never live approval. The old `allFeesBounded`, `singleImageIsOnePage`, `effectiveFrom` and `validUntil` assertions are not accepted.

Freshness is **inference-only**: the copied estimate is checked before reservation and immediately before every POST; expiry while waiting for a claim blocks dispatch. An operator must manually review current evidence and renew approval by `reviewBy` before new extraction. Shared runtime validation for saved history, evidence, review saves and uploads does not require fresh pricing. There is no verified Azure equivalent of OpenRouter `max_price`, and the review window is not a tariff guarantee. Usage validates one annotated page even when `pages_processed=0` and `pages_processed_annotation=1`; it is raw audit evidence, never zero-charge proof or settlement/refund authority. Any reported meter sum is a **published-retail estimate, not settled actual cost**.

## Execution and failure behavior

One decoded, single-frame JPEG/PNG per POST, exact normalized bytes. Container/decode/dimension/hash and existing byte/pixel limits apply before spending. No other photo IDs/images, application values, ground truth, remote documents, PDF, crops or conversation context enter the request. Schema descriptions hold transcription/uncertainty/role-separation/untrusted-label instructions. Bearer auth, native `document` + `document_annotation_format`; no chat messages/max_tokens/token tariffs.

At most two calls in flight, deterministic child IDs, slot-zero reservation/claim as exclusive group ownership gate and photo-zero's own $1 hold. No extra parent hold. Photos 0/1 may overlap; photos 2/3 run one at a time because the parent remains claimed and the existing managed ledger permits only two total claims. Started siblings drain after failure, subsequent waves stop, parent completes last. Parent/child permanent fences and all liabilities survive failure/replay. Ledger reserve/claim/complete receipt verification remains mandatory.

Transport bounds are 20 seconds per response, 128 KiB response bytes, 32 KiB annotation text, strict UTF-8/JSON, exact returned model and one page. Strict envelope/evidence checks; old flat annotations/confidence, fences/prose, truncated JSON, mismatched model, extra pages/keys, missing/invalid usage and HTTP/redirect/timeout failures cannot be salvaged into evidence. Host binds validated evidence to original photo IDs/hashes. No retry/fallback.

Optional trusted `onResponse` receives bounded `rawBody`, local request/photo IDs, HTTP status/provider request ID, headers/full-body timing **before** JSON/model/usage/evidence validation. A one-shot diagnostic must durably persist these raw envelopes and dispatch markers; they are not returned to browsers. Audit sink errors fail closed. Oversize/timeout responses may have no complete body; retain conservative liability. The ordinary web route does not automatically persist raw provider bodies.

## Activation and bounded real acceptance

Offline tests are not live accuracy/latency evidence. Apply/review the additive spend and photo-asset SQL admission migration before actual managed calls. Preserve all prior failed evidence and consumed markers. Supply a current operator-approved published-retail estimate with retained evidence, verify existing ledger custody/cap/headroom, and obtain execution authority for the exact proposed group. The one-shot runner must use fresh exclusive/fsynced markers, no save/upload/retry/fallback, at most two paid POSTs. If both claims/pricing gates must complete before either POST, use a bounded two-arrival barrier in its injected transport; production parent gating itself starts photo zero while its sibling reserves.

No reconciliation, ceiling increase, new ledger or automatic activation is part of this adapter. Two attempted photos retain two $1 holds, regardless of the retail estimate or inference success. A familiar two-photo acceptance does not establish broad reliability or a five-second SLA.

## Archived interface fixture

`web/tests/fixtures/azure-ocr-archived-envelope.json` is an unchanged copy of historical synthetic response `azure-foundry--mistral-document-ai-2512--017a0fc12f1447d2b4ae6e3e87c9676195494fc08f4a10477fde00d089671834.json` from `/opt/data/benchmarks/ttb-foundry-20260918-v1/azure-severity-v1/responses/`. SHA256: `c09a325637b475f577b15d61722f5f6773d09985bb60271d0a484536631b9599`. Its obsolete flat annotation deliberately fails today's parser. Success mocks replace only `document_annotation` with explicitly synthetic current-schema evidence; they do not claim the new annotation was actually returned by Azure.
