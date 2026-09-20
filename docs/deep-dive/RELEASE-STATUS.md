# Prototype release status

## Accepted Windows repair

ARGUS granted native Windows PASS for `106aac25a37e05840aa38e41ccc9f8db4c6009e6`:
506 passed, 5 POSIX-only skips, 0 failures; typecheck/build passed on unelevated
Windows with Node22.22.2 and PowerShell5.1. AVA's Linux Node24 gates passed 511
cases. [The attributed verdict and exact evidence](../reviews/24-pr9-native-windows-pass.md)
close the Windows bracket/ACL-fixture blockers. These are not hosted or live-model
results; the release gates below retain their separate scope.

## Baseline and implemented candidate

Base: `master`, commit `6f253361f7a3aa3e939f9fd813ba2f9fd8067da5`.

The candidate adds real arbitrary-image HTTP intake, server-only access control, the existing Haiku extraction adapter, existing comparison rules and the existing review cards. The former always-denied route remains default-closed but can now be configured for the guarded demo. A SQLite spending ledger enforces atomic reservations and claims across processes using one persistent local volume. No Supabase account/storage stack is required for this demo route.

Builder verification: 464 unit tests across 20 files, project typecheck and production build passed after restoring the original fixtures omitted by the sparse checkout. Synthetic browser upload tests passed on the worker candidate; those tests are not proof of real AI extraction or final deployed ingress. Parent corrected a catalog-compatibility blocker using observed cache tariffs, with RED/GREEN regression and conservative $1 holds. The $25 total ceiling is unchanged. No paid model call has been made by this integration work.

## Remaining release gates

- [ ] Independent review of exact candidate: access, upload bounds, response provenance, persistent cap, timeout/claim lifecycle.
- [ ] Select and verify a Node24 host with one persistent private spending-ledger volume and HTTPS.
- [ ] Inject private runtime credentials and demo access code without publishing them.
- [ ] Run real label uploads through the actual deployed route under the same $25 ledger.
- [ ] Measure upload-to-visible-result timing; document misses rather than claim unmeasured five-second performance.
- [ ] Connect and verify live batch scheduling; current batch remains offline-only.
- [ ] Update the root README with the verified live URL and release verdict.

## Explicit limitations

This is not yet a deployed working scanner. No real model accuracy, real end-to-end latency, multi-user authentication or persistent review history is certified. The shared access code is a demo capability, not user identity. SQLite must not be deployed onto independent ephemeral serverless instances. A missing ledger fails closed rather than resetting the budget. Review decisions remain unsaved page-memory drafts.

Repository cleanup provides a brief front page and optional deep-dive navigation while preserving original benchmarks, source and review history. Documentation and source tests do not close deployment gates.
