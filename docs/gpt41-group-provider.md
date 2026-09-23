# GPT-4.1 group extraction — refined release candidate

Historical integration status (before the separately recorded migration/deployment): successful refined actual-photo responses integrated and replayed offline. Existing Haiku, Azure and original benchmark artifacts are retained. This is not a general accuracy or legal approval claim.

**Producer clarification r2 follow-up:** the archived prompt below is now an unchanged base prefix, not the complete current prompt. A generic append requires contiguous selected-name-plus-distillery-role support and entity-only names without enclosing quotation delimiters. An authorized local production-adapter run on the exact normalized front/back photographs returned seven matches with a complete named distillery sentence; it used two POSTs and the already-applied 008 production tuple. This follow-up made no deployment or migration and did not save a review. External audit: `/opt/data/ttb-gpt41-final-prompt-result.md`, evidence `/opt/data/ttb-gpt41-final-prompt-evidence/`. Physical print size remains unverified. Prompt content SHA-256: `cfc7744486c5b1dae243f1f80651f94d220abc94b97ad8d99ee5ad831b16802d`. Persisted contract/admission version remains `gpt41-photo-observations-v1`; exact content revision is source-hashed rather than relabeling old captures.

## Selection and identity

Trusted server configuration only:

```text
TTB_PERSISTENCE=supabase
TTB_GROUP_EXTRACTION_PROVIDER=gpt41
OPENROUTER_API_KEY=<server secret>
```

Keep all existing managed storage/access/signing configuration. There is no browser model choice. Unset selection still means the existing Haiku group provider; the legacy singleton also remains Haiku. GPT group failure never falls back to another provider.

New records use exactly `source=openrouter`, `model=openai/gpt-4.1`, `promptVersion=gpt41-photo-observations-v1`, schema version 2, comparison revision 7 and aggregation v2. Revision 7 adds only bounded ABV abbreviation-period recognition; revision 6 remains available for original GPT history and other providers. Rules version, asset format and historical replay remain unchanged. The production tuple is distinct from `isolated-vision-benchmark-v1`.

## Execution and wire

`web/lib/extraction/gpt41.ts` performs full normalized image validation and builds isolated, single-photo requests. No application declarations, other photos, previous answers, or shared conversation enter a photo context. Each photograph has its own $1 unresolved hold. The first two calls overlap; the retained parent is photo 0's real claim and exclusive group gate, so later photographs run serially in the one remaining claim slot. All started siblings drain before completion/failure; there are no retries.

The request retains the successful refined per-photo routing/settings and strict JSON Schema: 3,200 output tokens, temperature 0, high-detail image, and provider `only/order=['openai']`, `allow_fallbacks=false`, `require_parameters=true`. The prompt alone now has the append-only producer clarification r2.

The generic prompt is exported as `GPT41_PHOTO_PROMPT` from `gpt41-prompt.ts`. Repository-local `gpt41-refined-prompt.txt` locks the archived base-prefix bytes, and `gpt41-refined-schema.json` still locks the unchanged schema serialization (`JSON.stringify(schema,null,2) + '\n'`). The request golden separately locks the current prompt digest and append boundaries. Raw response envelopes are historical captures copied byte-for-byte, not outputs of r2; no photograph or image base64 is committed. The old request and response fixtures are retained, not overwritten. See `web/tests/fixtures/gpt41-refined-provenance.md`.

### Actual replay finding and history boundary

The production parser still maps null plus uncertainty to `unreadable`. That does **not** block the back producer: aggregation v2 excludes nulls from conflicting identity variants and selects the independent readable name/address. No parser or producer/warning rules were relaxed.

Regression-first replay found a different composition bug: `40% Alc./Vol.` remained exact in evidence but the old ABV grammar rejected the abbreviation periods. `group-rules-v7.ts` permits only optional periods in the complete `number% alc./vol.` notation, through a temporary comparison-only projection into the existing exact-decimal evaluator. It does not mutate extraction, observed text, provenance or saved history. Negative/ambiguous strings, proof, tolerances and real mismatches are not repaired. Existing raw cross-photo conflicts remain conservative. Fresh GPT records opt into revision 7; saved revision 6 records recompute under revision 6 forever. Other providers remain on revision 6.

The captured front/back responses now yield seven sourced matches, with physical print size still `unverified`, through production parse/finalize, browser-client validation, real disposable SQLite save/close/reopen, and managed app-route adapters with a mocked network. Generated tiny images in these tests exercise custody only; no new image extraction is claimed.

Host expansion preserves exact transcription text:

- Non-null text without uncertainty → readable; text with uncertainty → uncertain.
- Null without uncertainty → missing; null with uncertainty → unreadable (conservative ambiguity handling).
- Producer role support and other-entity capture remain reasons, not replacement name/address text. Unsupported selected producer association becomes uncertain.
- No correction of negative-number strings, warning reconstruction, application-based repair or unit conversion.
- Reject malformed JSON, unknown keys, numeric values where text is required, blank/control/null-string observations, duplicate uncertainty entries, or typography for absent text. Reasons must fit the existing 500-character persisted limit; overflow fails instead of truncating support.

The saved GPT envelopes actually use normalized `finish_reason=stop` and **native `completed`**. The adapter accepts native `completed` and native Chat Completions `stop`, rejecting truncation/refusal and Claude `end_turn`. Model and provider metadata are mandatory and pinned to GPT-4.1/OpenAI. Untrusted usage never settles a hold.

## Price and image bounds

Every claimed photo performs a fresh uncached catalog check immediately before POST. The implementation was tested offline against the archived 2026-09-23 catalog, not a newly fetched catalog. Production dispatch will check current catalog pricing at runtime.

- Input cap: $2 per million tokens; output cap: $8 per million; both sent as provider-side `max_price`.
- Benchmark-proven reservation theory: `2 × (230000 × $0.000002 + 3200 × $0.000008) = $0.9712`, below the $1 hold.
- A 1,047,576-token model context is a capability ceiling, **not actual request usage**. The guard checks compatibility/drift rather than charging every photograph as a full context.
- Count all serialized non-image UTF-8 bytes as tokens, including the response schema, plus 32,768 vision tokens and 4,096 framing tokens. Base64 is image transport, not text token input.
- Decode the actual single-frame PNG/JPEG, enforce 20 MP, and bound high-detail 512-pixel tiles conservatively against even unresized dimensions (with a 2048-square allowance for small images). Reject pathological aspect ratios whose unresized bound exceeds the vision allowance. Never infer image token count from compressed bytes.
- Cache-read pricing must fit the ordinary input cap; cache writes/unknown nonzero fees deny dispatch. The strictly canonical body forbids tools, plugins, search, extra contexts, endpoint/model/provider substitution and extra request fields.

Timeouts, cancellation, malformed catalog responses and unknown pricing fail closed. Catalog failure after claim retains the unresolved hold conservatively. Pricing failure never blocks reopening saved history.

## Migration — historical admission scope; do not reapply

`web/db/migrations/008_gpt41_group_provider.sql` contains only two additive function-admission changes:

1. Existing 007 spend function plus the genuine production GPT tuple, preserving all benchmark/Haiku/Azure tuples, $50 ceiling, max-two claims, and unresolved liabilities.
2. Existing 005 asset admission function plus the exact GPT source/model/prompt/schema/aggregation tuples for retained revision 6 and fresh revision 7, with numeric JSON schema/rules checks. The outer revision gate admits revision 7 only with the complete GPT tuple, never a provider cross-product.

The migration's scope does not mutate ledger rows, ceilings, incurred costs, holds, receipts, ACLs or history. Static tests subtract the new branches and require exact equality with prior function definitions. At the original integration gate, migration 008 awaited independent review/application. The separately authorized application has since been verified (`/opt/data/ttb-gpt41-migration-evidence/managed-verified.json`); the r2 follow-up confirmed the exact applied spend/asset function hashes and reused that tuple without changing SQL. Migrations 005–008 must not be reapplied for this prompt-only change.

## Offline verification

Focused coverage includes managed route composition, prepare/execute, snapshot assets, human save/reopen, replay exclusion, preserved Haiku/Azure history, two actual simultaneous claims, sibling drain, source/model spoofing, null/string gates, negative real numbers, price drift, decoded 20 MP image limits, failure liability, and exact migration deltas. Existing benchmark tests now import a repository-local, frozen benchmark utility instead of `/opt/data` source.

No raw photograph is included in application source or the new fixtures. Test fixtures contain only the redacted request, captured response JSON, and archived model catalog entry.
