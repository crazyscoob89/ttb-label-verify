# Prototype release status

## Current candidate

Frozen code: `75fe83d30441b3917869fb6a1164506337b9940c`; independent review pending.
[Current findings and evidence](../reviews/25-live-provider-and-batch-candidate.md).

- Real browser -> guarded route -> Haiku -> seven-field results succeeded on two synthetic cases at provider-repair `bb1089868649ff522185454ccfc72cb23a3f6b7a`: matching artwork and a detected 45%-versus-40% alcohol discrepancy. Browser timings were 5360.36 ms and 4720.77 ms; no five-second guarantee.
- First paid attempt failed closed on response metadata/fenced JSON; narrow repair and captured-response regression preserve that failure.
- Live proof exposed fixture-only human-review validation. The current candidate repairs it; synthetic browser acceptance now covers UNSAVED review drafts.
- Guarded live batch wiring, stable-intent deduplication and retained Single/Batch tab state are implemented. Real batch acceptance is still open.
- Parent reproduced 562 tests / 26 files. Builder typecheck/build, 4 simulated-provider browser cases and 36 offline browser regressions passed. New independent/native review pending.
- Three total paid attempts; $3 retained unresolved holds, $22 hold capacity remaining under the same $25 ledger. Holds are not actual billed charges. Never reprovision/reset/copy the authorization into a second active deployment.

## Remaining release gates

- [ ] ARGUS independent review of the exact new code delta.
- [ ] Durable save/reopen implementation and runtime acceptance. Current review drafts remain page-memory only.
- [ ] Real-provider batch acceptance under the same bounded authorization, after source review.
- [ ] Approve hosting target/cost and qualify Node24, private durable local filesystem/locking, HTTPS and origin handling.
- [ ] Move authorization custody exclusively if hosting changes; never create a second active budget.
- [ ] Deployed browser acceptance and measured upload-to-result timings.
- [ ] Publish verified live URL and final source/setup handover.

No eligible existing host was confirmed in the Azure identity's inspected inventory. PAYG billing access is already present; that does not authorize new hosting spend. Azure-hosting OpenRouter is not proof of restricted-network Foundry compatibility.

## Accepted Windows baseline, preserved

ARGUS granted native Windows PASS for `106aac25a37e05840aa38e41ccc9f8db4c6009e6`: 506 passed, 5 POSIX-only skips, 0 failures; typecheck/build passed on unelevated Windows Node22.22.2 / PowerShell5.1. AVA Linux Node24 gates passed 511 cases. [Record 24](../reviews/24-pr9-native-windows-pass.md) preserves original evidence. This closes those bracket/ACL-fixture defects, not subsequent batch or deployment acceptance.

## Explicit limitations

No public deployment, durable review history, authenticated multi-user reviewer identity or legal certification. Shared demo code is a capability, not personal identity. Two paid synthetic examples are not representative model accuracy, camera robustness or throughput. Persistent spend does not imply persistent results. Reload loses page-memory drafts. Existing offline benchmarks remain historical, separate from app acceptance.
