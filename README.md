# TTB Label Verify

## Latest completed benchmark — start here

**[Final Azure + Haiku + severity results, timing, costs and model decision](BENCHMARK-RESULTS.md)**

The completed September 18 battery is now archived with raw responses, failed
attempts, images, scoring, cost ledger and a portable offline verifier. See the
[benchmark landing page](bench/README.md) and
[publication record](docs/reviews/16-final-benchmark-publication.md).
Older root benchmark counts below describe the historical flat-label run only;
they are not the latest seven-engine comparison. Publication is not deployment
or new independent benchmark approval.

Prototype for comparing each alcohol beverage label image with its own
applicant-declared application record across seven field categories, with
statutory government-warning checks (27 CFR Parts 4, 5, 7, and 16). This is
a verification aid, not COLA approval or legal certification.

**Status: Phases 1–3 reviewed; ARGUS PASS for Phase 4 source foundation ONLY and Phase 5 offline batch ONLY; no deployment.**
See [exact reviewed targets, original verdicts and limitations](docs/reviews/21-phase45-argus-pass.md), [current implementation status](docs/IMPLEMENTATION-STATUS.md), and [local app commands](web/README.md). Development-only exact-fixture single/batch review exists; outcomes and versions remain UNSAVED page-memory drafts. Dormant identity/storage/persistence libraries and SQL source are reviewed, not connected or database-accepted. Live inference, managed auth/session, concrete private-object storage and durable history remain unverified/unavailable; acceptance budget remains zero.
Stage 1 was planning-only. The repository now includes generated synthetic
fixtures, a provider-adapter benchmark harness, deterministic scoring and
offline tests, and saved engine results. The existing run contains **18
fixtures × 3 engines × N=3 repeats = 162 recorded calls**. That is bounded
engine evidence, not a deployed Next.js application or verified security
controls. No new provider run is authorized by this documentation audit.

## Implementation authorization

Alex has approved the phased local application build. The documentation candidate in PR #3 is merged; [current execution status and external-action boundaries](docs/IMPLEMENTATION-STATUS.md) supersede historical documentation-only wording below. No working/deployed application is claimed by that approval.

## Frozen UI and proposed governance build

Open the [v3 design entry point](docs/ui/v3/README.md) for the downloadable offline HTML and desktop/mobile screenshots, then read the [governance specification](docs/GOVERNANCE-AND-AUDIT-DESIGN.md) and [phased build plan](docs/BUILD-PLAN.md). **Historical proposal-stage authorization was documentation only; the approved local phased implementation is now governed by [IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md).** ARGUS independently reviews each frozen implementation phase. Nothing here deploys authentication, storage or a live app.

**Explicit scope amendment:** earlier sections/docs describe stateless processing without accounts or retained content. The proposed next design adds individual reviewer identity and private, version-bound persistent review history, subject to approval of destinations, retention and access. The legacy no-retention statements below are preserved baseline requirements, not claims that persistence is implemented or a newly approved target remains stateless. Upload/inference/spend safety gates still apply. See [review provenance and open decisions](docs/reviews/09-governance-design-package.md).

The benchmark counts below describe the root archived evidence set, not every later experiment. The additive [final benchmark publication](BENCHMARK-RESULTS.md) now supplies those later results without changing the historical archive.

## Documentation and evidence

- [docs/CONSOLIDATION.md](docs/CONSOLIDATION.md) — consolidated benchmark candidate: canonical scorer, frozen historical archives, current severity-run exclusion and review status

- [docs/reviews/README.md](docs/reviews/README.md) — management review register: findings, historical verdicts, evidence, owners and open decisions

- [docs/PLAN.md](docs/PLAN.md) — scope, planned architecture, matching rules
- [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) — acceptance and open deployment gates
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — required security/retention controls, not implementation certification
- [docs/BENCHMARK_PLAN.md](docs/BENCHMARK_PLAN.md) — methodology, scoring boundaries, and untested coverage
- [bench/RESULTS.md](bench/RESULTS.md) — benchmark report
- `bench/raw_results.json` — saved engine-call evidence
- `fixtures/manifest.json`, `fixtures/images/`, `fixtures/ground_truth/` — synthetic fixture set and paired records

## Offline review

**Windows checkout warning:** cloning the older `master` and then switching to
this reviewed branch can leave unchanged hash-pinned files with CRLF bytes from
that first checkout. New `.gitattributes` rules may not rematerialize those files.
Do not replace evidence hashes or normalize the evidence to make a gate pass.
Use a new directory with line-ending conversion disabled **before any checkout**:

```sh
git -c core.autocrlf=false clone --no-checkout https://github.com/crazyscoob89/ttb-label-verify.git ttb-label-verify-review
git -C ttb-label-verify-review config core.autocrlf false
git -C ttb-label-verify-review checkout --detach <reviewed-commit-sha>
```

Replace `<reviewed-commit-sha>` with the full commit under review. Keep existing
working copies and local edits intact; do not use destructive cleanup commands.
See [ARGUS's consolidation review and resolution](docs/reviews/08-consolidation-review.md)
for the reported Windows reproduction and final verdict.

From the repository root, with Python 3.10+ installed (standard library only for offline gates):

```sh
python3 bench/test_scoring.py
python3 bench/test_extraction_safety.py
python3 bench/test_results_integrity.py
python3 bench/test_integrity_mutations.py
python3 bench/test_archived_spend.py
python3 bench/test_checkout_portability.py
python3 bench/run_bench.py --dry-run
```

The tests exercise scorer safeguards, evidence replay and mutation rejection,
and disabled paid-entrypoint controls without model calls. The final command
lists the archived matrix without credentials or API calls; it is **not** a paid-run
readiness check, provider-price verification, or spending-cap test. Neither
command proves engine perception on new images. Test counts may change
with regressions; they are not additional engine-call evidence.

`python3 bench/reporting.py` regenerates `replayed_results.json`, `analysis.json`
and `RESULTS.md` offline from preserved observations and current rules. It
never overwrites `raw_results.json` or fixtures. The required integrity gate
checks pinned input hashes, all 162 unique observation identities and 1,134
field verdicts, derived caches, aggregates and the full report. Missing evidence
is failure, not a skip. Original verdict caches remain historical; the current
replay records the single changed GPT warning referral explicitly. The original
missing-field fixture already expected `needs-review`, despite its stale prose
note; accuracy now counts that correct referral without changing source truth.

Paid harness execution and the standalone engine probe are **disabled**
before credentials or dispatch. Only offline review is enabled. Before a future
paid run, obtain authorization and implement/prove a spending bound accounting
for failures, concurrent callers and previous spend; no manual boolean flag
pretends to verify a provider cap. Application install/build instructions now exist in [web/README.md](web/README.md) for the reviewed local fixture workflow; deployment remains unapproved.

## Cross-platform evidence integrity

Hash-pinned observations and fixture JSON must keep the **exact committed
bytes**. `.gitattributes` disables Git text conversion for those evidence paths
and marks PNG fixtures binary. Windows `core.autocrlf=true` may otherwise change
LF to CRLF while Git still regards the checkout as clean, invalidating byte-level
SHA-256 checks. Do not replace a fingerprint with the hash of that transformed
copy or weaken evidence validation. Use a fresh checkout of this revision when
verifying an older Windows clone; preserve any local edits before refreshing it.

The raw committed hash remains `1b7fa04ba503de42ece3bcc382232fe2f5ccc19435f365eaf48ab9ce01efbcc0`.
Its former CRLF-converted checkout hashes to
`67167d2513ee4409979c28d4ab9828cd321b13977e9df3cb54cfde182776e300`.
Text report/replay I/O explicitly uses UTF-8, independent of the host locale.
`test_checkout_portability.py` requires Git and makes an isolated temporary
checkout with `core.autocrlf=true`, checks every evidence hash, then runs the
required integrity gate. Both LF and Windows-style Git checkouts were tested;
that is not a claim of having executed native Windows Python in this environment.
Discovered evidence paths use `.as_posix()` to compare with manifest keys across
operating systems. The integrity mutation suite also exercises Windows relative
path rendering while retaining complete-manifest and byte-hash rejection checks.
See [the native Windows finding and repair](docs/reviews/07-windows-path-repair.md)
for the separate path-separator defect discovered after the line-ending repair.

## Known limitations and open gates

- **Public provider-backed access must remain disabled.** The deployment
  has not met the global spending gate. It requires a **verified enforced
  account/key global cap**, a **tested shared atomic quota**, or another
  proven global bound. Manual environment-variable kill switches and
  per-instance daily quotas/rate limits are defense in depth, not a global
  ceiling across serverless instances. Budget alerts are not enforcement;
  a timeout does not prove cancellation or zero billing.
- **Buffer-only application processing is required, not verified.** The
  planned application must process uploaded images, applicant data, and
  extracted values/results in request-scoped memory, without content
  disk/temp-file, database, blob, cache, or log retention. Selected parsers,
  image libraries, framework, and provider SDK must be tested buffer-only,
  including failure paths. If this cannot be achieved, stop the deployment
  gate pending an explicit disclosed/approved alternative; library temp
  files are not a silent exception. Synthetic offline fixtures and results
  are intentionally stored on disk and excluded from this application policy.
- **Browser, platform, and external-provider retention remain unverified.**
  Server memory-only processing does not govern browser previews/caches,
  hosting request/log retention, or copies sent to vision APIs. For
  OpenRouter routes, both **OpenRouter and actual upstream/fallback model
  providers** need documented retention/training terms and selected privacy
  configurations. Actual policy links, retention periods, and any ZDR
  settings remain acceptance evidence to collect. Use stays **synthetic-only
  until verified**. Azure/Microsoft Foundry is a possible governed deployment
  path, not automatic elimination of external retention concerns.
- **Safety and usefulness are separate benchmark gates.** N=3 repeats,
  zero observed false matches, and ≥60% clean seven-field automation remain
  required. A finite synthetic zero-FM result is not proof of a zero
  real-world error rate. Extraction-value accuracy and outcome accuracy
  must be distinguished, not inferred from one another.
- **Coverage gaps remain.** The existing 18-fixture engine evidence does
  not test a dedicated non-bold warning heading or genuinely
  unreadable/cropped inputs. Offline rule regressions do not certify
  engine ability on those cases. At runtime, absent/unreadable values route
  to `needs-review`; source semantic absence truth and expected safe
  decisions must remain distinct rather than silently rewriting fixtures.
- **Physical type-size compliance is always `needs-review`.** It cannot
  reliably be measured from a photograph. This user-facing referral is
  separate from the seven scored fields and their automation denominator.
- **Current latency is engine-call only.** The ~5-second deployed
  end-to-end target (upload through displayed result) remains pending.
  Historical cost estimates are not verified current prices or final bills.
- **ABV checks numeric consistency only.** Regulatory tolerance evaluation
  is a TTB determination, not performed by this tool.
