# TTB Label Verify

Prototype for comparing each alcohol beverage label image with its own
applicant-declared application record across seven field categories, with
statutory government-warning checks (27 CFR Parts 4, 5, 7, and 16). This is
a verification aid, not COLA approval or legal certification.

**Status: Stage 2 benchmark implemented; application/deployment pending.**
Stage 1 was planning-only. The repository now includes generated synthetic
fixtures, a provider-adapter benchmark harness, deterministic scoring and
offline tests, and saved engine results. The existing run contains **18
fixtures × 3 engines × N=3 repeats = 162 recorded calls**. That is bounded
engine evidence, not a deployed Next.js application or verified security
controls. No new provider run is authorized by this documentation audit.

## Documentation and evidence

- [docs/PLAN.md](docs/PLAN.md) — scope, planned architecture, matching rules
- [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) — acceptance and open deployment gates
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — required security/retention controls, not implementation certification
- [docs/BENCHMARK_PLAN.md](docs/BENCHMARK_PLAN.md) — methodology, scoring boundaries, and untested coverage
- [bench/RESULTS.md](bench/RESULTS.md) — benchmark report
- `bench/raw_results.json` — saved engine-call evidence
- `fixtures/manifest.json`, `fixtures/images/`, `fixtures/ground_truth/` — synthetic fixture set and paired records

## Offline review

From the repository root, with Python 3.10+ installed (standard library only for offline gates):

```sh
python3 bench/test_scoring.py
python3 bench/test_extraction_safety.py
python3 bench/test_results_integrity.py
python3 bench/test_integrity_mutations.py
python3 bench/test_archived_spend.py
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
pretends to verify a provider cap. Application install/build/deploy instructions
remain pending because the Next.js application has not been built.

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
