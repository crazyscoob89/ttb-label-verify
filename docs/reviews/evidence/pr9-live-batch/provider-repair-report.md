# OpenRouter compatibility repair — tested local candidate

## Source and result
- Canonical checkout: `/opt/data/ttb-prototype-delivery`.
- Existing branch: `ava/prototype-delivery`.
- Started clean at `f82be6e9a1757337f50c5131f937d3893a98ec91`.
- Local repair commit: **`bb1089868649ff522185454ccfc72cb23a3f6b7a`**, direct child of the starting SHA.
- Commit subject: `fix(extraction): accept bounded OpenRouter metadata and complete JSON fences`.
- Working tree verified clean after commit. **No push.**
- No inference requests, credential access, production ledger access/provisioning, hosting, app servers, external agents, batch implementation or save implementation performed. Test/build commands used an empty environment with only HOME, PATH and (build only) telemetry-disable supplied. Existing unit tests used their isolated temporary test ledgers, including test-only provisioning/security subprocesses; no canonical ledger was touched.

## Defect and narrow repair
The captured HTTP 200 completion was previously rejected for three unrecognized envelope keys. Its fenced JSON content independently failed direct JSON.parse.

Production change is confined to `web/lib/extraction/openrouter.ts`:
- `service_tier`: optional string, length 1–256, ignored as untrusted metadata.
- `native_finish_reason`: optional literal `end_turn`, appropriate to the already-pinned Claude model; native truncation/refusal/error still fails even if normalized finish_reason says stop.
- `message.reasoning`: optional null only; no unrequested reasoning text accepted.
- Bare JSON remains supported. One complete outer triple-backtick fence, either `json`-tagged or untagged, may be removed. LF/CRLF and surrounding JSON whitespace are supported. No prose salvage, multiple/nested fences, incomplete fences, concatenated objects, or malformed JSON. The same strict extraction schema validates the decoded payload.
- Existing strict envelope/evidence schemas, normalized stop check, single-choice/assistant/content requirements, refusal/error denial, response limits, timeout, spend reservation, no-retry and no-fallback behavior remain in place. No prompt, spend, route, schema or dependency changes.

## Changed paths (exact)
1. `web/lib/extraction/openrouter.ts`
2. `web/tests/openrouter-compatibility.test.ts`
3. `web/tests/fixtures/openrouter-captured-completion.json`

The new fixture is the unchanged completion-envelope JSON value from the synthetic-label capture, not the catalog or any request/credentials. Its formatting is normalized for the committed fixture; deep equality with the original captured envelope was separately verified.

## RED / GREEN evidence
Runtime: existing **Node v24.21.0** at `/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin/node`.

| Check | Result | Evidence |
|---|---|---|
| Focused RED before production edit | exit 1; **5 failed, 85 passed**, 2 files | `red.log` |
| Focused GREEN after repair | exit 0; **90 passed**, 2 files | `green.log` |
| TypeScript `tsc --noEmit` | exit 0; no diagnostics | `typecheck.log` |
| Production Next webpack build | exit 0; compiled, TypeScript passed, 5/5 static pages generated | `build.log` |
| Full unit suite | exit 0; **555 passed**, 24 files | `unit.log` |
| Original capture offline replay | exit 0; `processing: complete`, exact evidence equality | `replay-result.json` |
| Whitespace and final source checks | `git diff --check` passed; post-commit working tree clean | verified via Git |

RED's five failing tests were the exact captured response, captured metadata with bare valid JSON, a single json fence, an untagged fence, and a CRLF/whitespace fence. Existing extraction tests all passed RED. New regression coverage totals 44 tests and also exercises multiple fences, prose, malformed/truncated JSON, unknown root/nested extraction keys, missing evidence/content, refusal, error, non-null reasoning, bad metadata types/limits and native finish contradictions. Each new replay asserts retained test liability, one injected transport call, zero fetch calls and same-attempt retry denial.

## Exact captured-payload replay
`replay.ts` separately reads the original `/opt/data/ttb-live-acceptance/transport.jsonl`, asserts one completion, asserts deep equality with the committed fixture, and feeds the unmodified envelope through the actual provider adapter via an injected in-memory Response. Global fetch throws if called. It uses only `OfflineSpendStore`, never the production ledger.

Observed result:
```json
{
  "fixtureEqualsCapturedEnvelope": true,
  "processing": "complete",
  "evidenceEqualsEntireCapturedJsonPayload": true,
  "replayTransportCalls": 1,
  "networkCalls": 0,
  "testStoreUnresolvedMicrousd": 100,
  "sameAttemptRetry": { "processing": "failed", "code": "spend-unavailable" },
  "productionLedgerAccessed": false,
  "liveAcceptance": false
}
```
Original transport SHA-256: `a5b875c04415b44da4a3ce2e2995dff02d89b3e9fcbbcab9564a990ca7d3dd56`.

This proves offline compatibility with the captured response, not renewed live/browser acceptance, image accuracy, or billing reconciliation. The canonical authorization and existing unresolved production hold were neither opened nor changed.

## Reproducible commands actually executed
Working directory for test/typecheck/build commands: `/opt/data/ttb-prototype-delivery/web`.
Each command used the prefix:
```sh
env -i HOME=/opt/data PATH=/opt/data/tools/node24-phase0/node-v24.21.0-linux-x64/bin:/usr/bin:/bin
```
Commands following that prefix, with output redirected to this evidence directory:
```sh
# RED before source edit:
node node_modules/vitest/vitest.mjs run tests/extraction.test.ts tests/openrouter-compatibility.test.ts
# GREEN after source edit:
node node_modules/vitest/vitest.mjs run tests/extraction.test.ts tests/openrouter-compatibility.test.ts --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build --webpack
node node_modules/vitest/vitest.mjs run
# Separate original-capture replay, working directory /opt/data, same env prefix:
node --import /opt/data/ttb-prototype-delivery/web/node_modules/tsx/dist/loader.mjs /opt/data/ttb-openrouter-repair/replay.ts
```
Git staging and local commit were limited to the three listed files. No fetch/push command was used.

## Evidence preservation and issues
- Original `transport.jsonl`, `blocker-proof.json`, `REPORT.md` and `COMMANDS.md` were read-only; before/after SHA-256 equality verified against `prior-evidence-sha256.json` here. Prior external source/build/evidence was not edited.
- New logs, replay helper/result and this sanitized report are outside the checkout under `/opt/data/ttb-openrouter-repair/` (directory created with umask 077).
- Editor tooling's automatic TypeScript lint was unavailable (`npx` did not resolve a usable tsc); the explicit locked TypeScript CLI under Node24 passed, as did build TypeScript. No repair/test/build blockers remain.
- Compatibility deliberately remains narrow: non-null reasoning, unrecognized native finish reasons and arbitrary future metadata still fail closed rather than being silently trusted.

**Stopped at the repaired, tested, locally committed candidate. No further live inference or deployment.**
