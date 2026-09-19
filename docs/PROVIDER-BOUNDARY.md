# Provider and spend boundary — Phase 2 candidate

## Scope and activation

This is a **local, unwired library boundary**, not a running extraction service. `web/lib/extraction/openrouter.ts` exports the only real-provider entrypoint, `createOpenRouterProvider(dependencies?)`. It defaults to `unconfigured`; neither the existing UI nor any API route imports it. No secrets/environment are read. The fixture provider is explicitly constructed, never a silent fallback.

D5 permission for paid/live provider calls is still absent. Do not configure production dispatch from this prototype. A future trusted server composition must establish authorization, persistent spend enforcement, verified pricing/envelopes, and provider acceptance before activation. The `authorized` flag is an injected server capability decision, **not** authentication, a client flag, or a substitute for Alex's permission. The constructor snapshots configuration; browser execution is denied. Node crypto dependencies and a browser-runtime guard are used; this sprint does not add a framework-specific `server-only` package or a production composition root.

## API contract

```ts
createOpenRouterProvider({
  authorized?: boolean,         // exactly true; default deny
  apiKey?: string,              // explicitly injected server-side, never env lookup
  maxCostMicrousd?: number,     // positive safe integer; no default spend amount
  store?: SpendStore,           // mandatory shared-store capability; no runtime implementation
  transport?: (url: string, init: RequestInit) => Promise<Response>, // defaults to native fetch
}): ExtractionProvider

ExtractionProvider.extract({
  image: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg',
  reservationId: string,        // server-issued UUID, permanently single-use
  attemptId: string,            // server-issued UUID, permanently single-use
}): Promise<ExtractionResult>
```

Input is strict: no application fields, expected values, desired verdict, free-form prompt, URL, endpoint or model override. The caller must supply bytes already decoded/sanitized through the Phase 1 intake boundary. This function only bounds/copies/hashes bytes: **it does not decode or certify an image**. Tests deliberately use synthetic bytes, not OCR evidence. SharedArrayBuffer-backed views are rejected. The image is snapshotted and SHA-256 hashed synchronously, before asynchronous reservation or transport. A new local request UUID is generated for each invocation, sent as `X-Request-ID`, and bound to the reservation; upstream support for that header is unverified.

Success:

```ts
{
  processing: 'complete',
  evidence: ExtractionEvidence, // shared schemaVersion: 1; no provider judgment
  metadata: {
    source: 'openrouter', model: 'anthropic/claude-haiku-4.5',
    schemaVersion: 1, rulesVersion: 'prototype-seven-fields-v1',
    promptVersion: 'image-observations-v1',
    imageSha256, requestId, reservationId, attemptId
  }
}
```

Failure is only `{ processing: 'failed', code }`, where code is `unconfigured`, `invalid-request`, `provider-failed`, `spend-unavailable` or (fixture only) `invalid-fixture`. No evidence, raw payload, key, file/application content, schema-error detail, usage or provider exception is returned/logged on failure. There is no success inferred from an HTTP code alone.

`complete` means valid extraction evidence returned, **not** match/Pass/compliance. Only `compareApplication(application: unknown, extraction: unknown)` performs the seven-field deterministic comparison; feed it `result.evidence`, not the extraction result envelope. It returns separate processing failure or seven field results, never an overall automated Pass. Model text/reasons remain untrusted evidence and must eventually be rendered as escaped text. Syntactic validation is not OCR truth or prompt-injection immunity.

`createFixtureProvider(evidence: unknown)` validates and snapshots explicit synthetic evidence, returns a detached copy per call, and labels metadata `source: 'fixture', model: 'offline-fixture'`. It never uses a store/transport and omits reservation/attempt metadata. Its image hash identifies the input supplied to a fixture run, **not evidence that fixture text was seen on that image**. Future persistence/UI must retain and display this source distinction. There is no default UI inference.

## Request and response policy

Local source read: frozen `bench/engines.py` lines 132–140 and 339–378 establish the model identifier, HTTPS endpoint, chat image payload, `max_tokens: 3000`, and `response_format: { type: 'json_object' }`. The archived adapter is not imported or modified.

- Only `https://openrouter.ai/api/v1/chat/completions`, model `anthropic/claude-haiku-4.5`.
- Exactly one POST per claimed attempt; native fetch `redirect: 'error'`; redirected responses and nonmatching nonempty response URLs are rejected even with an injected transport.
- No tools, functions, HTTP/auth retries, alternate model list or fallback path. `provider: { allow_fallbacks: false, require_parameters: true }` requests no upstream fallback; actual acceptance/enforcement remains untested.
- `temperature: 0`, `stream: false`, bounded output tokens. Temperature zero requests reduced sampling; it does not guarantee repeatable model behavior. Unsupported parameters fail closed, never trigger a dialect retry.
- Image-only user message; system prompt contains neutral extraction instructions and a JSON schema derived from the shared Zod schema. It explicitly treats label contents as untrusted data, requires actual observations, and prohibits reconstruction of familiar warning text. **Neither canonical warning wording nor applicant answers are supplied.**
- The archived dialect supports JSON-object mode, not proven strict JSON-schema response-format support. Therefore this adapter uses JSON-object mode plus a schema in the prompt and authoritative local strict validation. No live JSON-schema-mode support is claimed. Zod semantic refinements (readable/missing text, nonblank reasons/control characters) remain enforced locally, with corresponding prompt instructions.
- One `choices[0]`, index 0, finish reason `stop`, assistant string content. Tool/function calls, refusals, truncation, multiple choices, wrong model (if supplied), unknown root keys including errors/verdicts, and unknown message/choice keys fail closed.
- Allowed optional envelope metadata: id, object=`chat.completion`, created, provider, system_fingerprint, usage, model. `usage` is ignored entirely. Metadata `model` records the pinned requested model; absent upstream model metadata is permitted, not independent attestation of model identity. Strict supported-envelope shape may reject actual OpenRouter additions until separately verified; no live response acceptance is claimed.

Limits (`EXTRACTION_LIMITS`): image input **10 MiB** before copying/base64; response **128 KiB** accumulated from byte chunks before whole-body UTF-8/JSON decoding; output **3000 tokens**; response deadline **30,000 ms**. The input cap bounds raw image bytes, not the larger base64/JSON wire representation. Declared response lengths over the cap are rejected; undeclared/dishonest lengths still meet the actual chunk cap. UTF-8 decoding is fatal on invalid bytes. A race deadline covers headers and the entire streamed body even though the requested provider protocol is nonstreaming JSON. Abort and best-effort reader cancellation do not block timeout return, and late responses cannot return evidence. Tests use fake timers; they do not establish real provider/network timing. Store operations have no availability deadline here: a hung store blocks progress without granting dispatch authority.

## Atomic spend contract — not global enforcement proof

`web/lib/spend.ts` exports `SpendStore`, `SpendBinding`, `SpendReceipt`, `SpendResult<T>` and `executeReserved<T>(store | undefined, binding, work)`. The helper is generic and grants no provider authorization. There is no exported bare OpenRouter dispatch that bypasses the adapter's gate.

All money values are safe integer **USD millionths** (`Microusd`). Overflow-safe comparisons use BigInt internally; no fractional JavaScript budget arithmetic. The authoritative ceiling is persisted in the shared store, not initialized or reset by each provider instance. A receipt contains:

```text
binding = { reservationId, attemptId, requestId, imageSha256,
            schemaVersion, rulesVersion, promptVersion, model, maxCostMicrousd }
receipt = { binding, state: reserved | claimed | unresolved, claimId: UUID | null,
            ledger: { currency: USD, ceilingMicrousd,
                      incurredMicrousd, unresolvedMicrousd } }
```

The interface methods return `Promise<unknown>` so every receipt is validated, rather than trusted through TypeScript types. Bindings are detached/frozen before store calls; receipts must have strict keys, exact binding/state/claim identity, safe totals within the same ceiling, and at least the current reservation's liability. Across one execution, incurred/total liability cannot decrease; legitimate concurrent reconciliation may conservatively cause a refused receipt and require investigation, never a dispatch retry.

Required atomic durable semantics for a **future** shared store:

1. `reserve(binding)`: lock/check the cumulative ceiling against **all historical incurred plus all unresolved liabilities**, add the maximum authorized cost, and permanently deduplicate both reservation and attempt IDs. Must commit before acknowledgement. A duplicate may reject; replayed receipts must not grant another claim.
2. `claim(binding, freshClaimId)`: one-winner compare-and-set `reserved → claimed` for that exact binding. Persist the claim UUID before acknowledging. No leases, automatic reclaim, expiration release or reuse after crash. The adapter dispatches only after a valid matching claim receipt.
3. `complete(binding, claimId)`: `claimed → unresolved`, retaining the entire maximum liability even after HTTP success, valid evidence, invalid output, exception or timeout. No provider usage assertion may release/settle it. Completion errors/invalid receipts suppress extraction output and leave the existing hold for investigation.

`executeReserved` returns `{ ok: true, value }` or `{ ok: false, code: 'spend-unavailable' | 'execution-failed' }`. Reserve/claim failure prevents dispatch; completion failure prevents success output. A crash after claim but before dispatch may retain a charge that never happened: conservative unresolved liability is intentional. An ambiguous timeout may still be charged upstream and **must remain held**. A retry requires a new authorized reservation ID **and** attempt ID and another cumulative-cap check. Old identities cannot dispatch again, even after reconciliation.

Settlement is deliberately **not exposed in this adapter**. Only a future separately privileged reconciliation process, with verified external billing/non-charge evidence bound to the original request/attempt/reservation, may convert a hold to actual incurred cost or release a proven unused remainder; it must preserve incurred history and identity tombstones. This sprint has no reconciliation implementation, billing integration, ledger reset, automatic release or trusted provider `usage.cost` path.

`maxCostMicrousd` is an injected authorized worst-case reservation, not a calculated provider price or provider-side hard cap. This sprint does not prove that an actual invoice stays below it. Live activation requires verified input/output pricing, bounded worst-case charge, fees/rounding policy, approved cumulative ceiling, and an overrun/reconciliation policy. Under-reserving can defeat the economic guarantee even with perfect atomicity.

## Evidence limits and next gate

The only store implementation added is `web/tests/helpers/offline-spend-store.ts`, explicitly **test-only**, using synchronous Map mutations to simulate atomic receipts. Offline tests prove adapter behavior against this contract, including concurrent callers and replayed reserve receipts with single-winner claims. They do **not** prove cross-process/cross-host/database atomicity, durable ledger initialization/history import, real authorization, provider billing, or crash recovery. These remain Phase 4/integration acceptance work, not completed money control.

No API/UI wiring, Phase 3 workflow, auth, persistent history, database/schema work, external research, credential discovery, paid calls, migration, provisioning, Git remote writes or deployment occurred. Whole-phase independent review remains pending. See [Phase 2 Sprint 2 handoff](reviews/13-phase2-provider-spend.md) for executed local gates and frozen-tree evidence.
