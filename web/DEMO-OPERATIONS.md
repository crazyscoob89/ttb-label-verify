# Guarded single-label demo operations

Node 24, one service on one host, **one private persistent local volume**. Every worker must open the same `TTB_DEMO_DATA_DIR/spend.sqlite`. This is NOT safe for serverless ephemeral filesystems, independent horizontal disks, copied databases, network filesystems without SQLite lock guarantees, or restoring an older backup. Never change data paths, replace/delete the ledger, or re-provision to reset spend. The code deliberately does not create a missing ledger at startup.

Use `.env.example` as the non-secret configuration reference. Inject `OPENROUTER_API_KEY` and a privately generated 32-random-byte base64url demo code at runtime. No `NEXT_PUBLIC_` secrets. Users enter their code in the password field; it is sent only in the request header, not stored. Require HTTPS for deployment and set the exact canonical `TTB_DEMO_ORIGIN`; configure proxy request URLs to preserve that origin. Do not log request headers/bodies or model outputs at the proxy or host.

One-time provisioning, before live enablement, using Node 24 and locked dependencies:

```
node --import tsx scripts/provision-demo.ts /absolute/private/persistent/directory
```

The directory must already exist with permissions 0700. Provisioning refuses an existing ledger. This action is NOT part of startup. Retain DB, WAL and SHM on the same volume. Confirm mount durability across a restart before setting `TTB_DEMO_ENABLED=true`. Never create another production ledger for this $25 authorization.

Fixed code-level ceiling: 25,000,000 microUSD. Fixed reservation: 1,000,000 microUSD ($1), at most 25 unreconciled attempts. This is a conservative held upper bound, not the expected or measured charge. Reservations and claims commit using BEGIN IMMEDIATE; duplicate reservation and attempt IDs cannot dispatch. Completion never refunds a hold, even on error, timeout or malformed evidence. No reconciliation/reset endpoint exists. Crashed claims and work slots remain blocked; operator investigation is required, never automatic reclaim. No cost estimates from provider responses are trusted.

Before every completion POST, the guarded transport reads the OpenRouter model catalog with strict size/time bounds. It requires fixed Haiku, context <=200000, prompt <=0.000001 USD/token, completion <=0.000005 and each recognized cache tariff <=0.000002. All recognized input/cache rates are added conservatively and charged against the entire context plus 3000 output tokens; the bound must fit the $1 reservation. The request applies provider-side ordinary-token price caps. Unknown nonzero fee categories fail closed. The catalog's web-search tariff is not charged because the fixed request explicitly contains no tools, plugins or search options and uses no online-model suffix. No retries or fallback. Catalog or extraction errors retain reservations. Parent reproduced compatibility with the observed catalog fields, not real model execution; deployment and live-use verification remain open.

Concurrency: two in-process request slots, two shared durable intake slots, and at most two claimed provider attempts in the ledger. Configure reverse-proxy body/header/time/connection limits as defense in depth; the route independently bounds streamed bytes before multipart/JSON parsing and uses existing signature/decoder validation. Secret/origin checks precede reading the body.

Composition: browser PairInput -> Node route -> bounded multipart -> strict application and existing preparePair -> createComparisonService -> existing createOpenRouterProvider -> executeReserved -> SQLite -> catalog-checked transport -> strict extraction schema -> existing seven-field rules -> existing ReviewConfirmation/OutcomeCards. Page-memory draft only; no saved history or legal approval. Offline fixture demo remains separate. Batch is NOT wired to the paid endpoint.

No live extraction or deployment has been proven by synthetic transport tests. Parent verification and independent review remain required.
