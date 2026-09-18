# Consolidated benchmark baseline

**Review update:** ARGUS supplied final PASS on
`30beea903cb6c9fbe14aff8d259698ef3df90a4d`, superseding his preliminary REVISE.
The Windows cold-checkout instructions are now in README; both review stages
are preserved in [round 08](reviews/08-consolidation-review.md). Alex approved
this documentation follow-up and consolidation promotion. The sections below
record the original candidate's scope and builder handoff; their historical
pending-review/no-merge wording does not override this later authorization.
Consult PR #2/master for actual merge status. App build/deployment remain separate.

This is a source/evidence consolidation, **not an application release, new model
run, deployment, model recommendation, or independent final review approval**.
The application (upload/form/API/UI/batch flow) is still absent.

## Ancestry and resolution

A real two-parent merge joins these frozen remote lines, without squash,
force-push, replacement of master, or rewriting historical observations:

| Source | Exact commit | Retained role |
| --- | --- | --- |
| Stage-2 repair | `4039ccce1912130e3cc9c015e439bf62f720d32f` | Canonical root scorer, validator, offline runner, path/hash fixes and corrected acceptance/security documentation |
| Image corpus (descendant of the repair) | `1e68a94652f911665374db6d31e6d1184de17cd5` | First merge parent; images, portable fixture mapping and provenance |
| Foundry comparison | `23e7d6ef58a7d8c017056b65cee23c60cccddc39` | Second merge parent; adapter, original provider results and versioned historical comparison archive |

The sole content conflict was `bench/run_bench.py`: retain the repaired
**offline-only** entrypoint, not the older paid dispatcher / in-process spend
estimator. The historical Foundry runner remains accessible in its source
commit. `bench/engines.py` merges the Foundry adapter/registry with repaired
extraction validation; no prompt, model configuration or transport redesign is
introduced. Scoring and reporting source at the root retain the repair's bytes.

The earlier review-register reconciliation is retained, including the removal
of duplicate `ROUND-01` through `ROUND-04` documents. Their history and the
explicit [reconciliation record](reviews/REGISTER_RECONCILIATION.md) remain;
this merge does not manufacture or upgrade a reviewer verdict.

## Canonical code versus historical evidence

- Use root [`bench/scoring.py`](../bench/scoring.py) and
  [`bench/extraction_validation.py`](../bench/extraction_validation.py).
  Missing/invalid confidence cannot match; all five warning components gate
  the warning result. Unknown formatting refers; confidently wrong formatting
  or statutory words mismatch. Existing normalization rules are unchanged.
- [`bench/RESULTS.md`](../bench/RESULTS.md) is the repaired **162-observation
  Stage-2** report, not a pooled Foundry/severity report. Its raw evidence and
  pre-existing explicit replay remain byte-identical; nothing was regenerated.
- [`bench/corpora/ttb-foundry-20260918-v1/README.md`](../bench/corpora/ttb-foundry-20260918-v1/README.md)
  is the portable image/provenance publication. Hash integrity is not image
  realism or independent visual approval.
- [`bench/ava-foundry-v3/`](../bench/ava-foundry-v3/) is the **frozen historical
  archive at 23e7d6e**. Its nested `scorer-4039ccc` is a historical dependency,
  not a competing canonical scorer. Preserve original responses, scores,
  provider/operator distinctions and rejected old-glare provenance. The v4
  [report](../bench/ava-foundry-v3/recovery-v4/REPORT.txt) excludes rejected
  artificial glare from its primary summary; that exclusion is unchanged.
- Historical scripts/README commands inside the archive contain old absolute
  paths and live execution/report-writing capabilities. **Do not execute them
  directly or follow their former "authoritative live root" instructions.**
  They are retained as evidence, not portable current entrypoints. Likewise,
  `bench/foundry_vision_probe.py` is historical provider code, not an offline
  gate. Only the root runner and root standalone engine probe are disabled.

## Current-run exclusion and audit status

The separate completed OpenRouter Haiku severity batch and the new Azure
severity run (running at the supplied audit snapshot) are **not published by
this consolidation**. Their final publication is pending run closure and a
separate frozen handoff. No live Azure results, ledger, report, lock or runner
were copied, opened or modified here. This PR must not be described as publishing
all current results or completing the new severity comparison.

Consulted the supplied 2026-09-18 application-readiness, benchmark-evidence and
Azure-preflight audits. Their distinct conclusions remain: application absent;
scoped saved-snapshot accounting/scoring PASS (not model-selection approval);
Azure API connectivity established but restricted-network app deployment
unproved. The earlier auditors' missing-GitHub-auth limitation was resolved by
fresh authenticated branch/PR discovery for this task; their other scope limits
are not erased. These summaries do not import their live-run artifacts or
confer independent approval on this integration.

## Builder verification and review handoff

See [consolidation gate record](reviews/CONSOLIDATION-GATES.md) for measured
commands, results and limitations. Root regression `bench/test_consolidation.py`
explicitly catches the stale Foundry scorer and validates the combined adapter
without network calls. Offline gates are **builder validation**, not an
independent final PASS. Native Windows execution, live inference, application
build, deployment and restricted-network acceptance are outside this tranche.

PR #1 stays open and unmodified. This candidate targets `master`; only after
this integration is reviewed and merged would it supersede PR #1's work.
No master merge or branch deletion is authorized/performed here.
