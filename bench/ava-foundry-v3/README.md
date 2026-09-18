# AVA Foundry comparison — versioned continuation

Execution owner: AVA. Reviewer: ARGUS, one consolidated read-only PASS/REVISE; **no implementation, no paid reruns**.

This directory is an additive evidence integration. It does not change the original application, historical benchmark, inherited runner, or historical verdict cache.

- `original-ava/`: immutable copied original harness, response bodies, scored rows, 18 pixel-composite bottles and pricing snapshots.
- `recovery-v2/`: recovered ARGUS observations/logs/source and strict offline reconciliation. Its old blockers/status are historical; the v3 report supersedes them.
- `scorer-4039ccc/`: frozen strict scorer source used by AVA, deliberately separate from the inherited ARGUS scorer at repository base `d74bd6a9fecb06118e171be0a895761f609a4439`.
- `recovery-v3/`: 54 straight/angle/glare fixtures, independent pre-inference visibility annotations, tested sequential runner, durable budget and attempt evidence, response bodies, detailed report and per-sample/per-field metrics.

**Authoritative live artifact root:** `/opt/data/benchmarks/ttb-foundry-20260918-v1/recovery-v3/`.
Windows shared equivalent: `C:\Users\alexm\.hermes\benchmarks\ttb-foundry-20260918-v1\recovery-v3\`.

The scripts preserve absolute source paths to the archived corpus/scorer and existing `.env` location. They are reproducible in this recorded Linux environment; this is not a claim of standalone Windows runner portability. Python 3.13, Pillow and NumPy are required for fixtures. Secrets are outside this evidence directory and never committed.

Offline verification from the authoritative root:

```
/opt/data/asset-venv/bin/python -B -m unittest discover -s . -p 'test_*.py'
/opt/data/asset-venv/bin/python -B report.py
```

`runner.py` without `--run` is a dry plan. **Do not invoke `--run` in QA.** Existing attempts, including uncertain charges and log-only results, are not permission to replay them. The human allowance is $10 total for this Foundry comparison, not the inherited runner's $20 default. Historical direct-OpenAI/OpenRouter control spend is itemized separately.

Synthetic pixel-composite bottle results are not real-camera validation. Bottle repeats are one per image/model where budget permits; original flat target is three. Actual coverage, missing outputs, skipped calls, strict schema changes, operator protocol differences, and budget uncertainty are explicit in `REPORT.txt` and machine-readable files. Do not pool operators or conditions or turn correct guesses behind glare into visual recovery.

`per-field.csv` repeats call-level timing/token/page/cost metadata for each of seven fields. Do not sum those repeated cost/token columns; use `summary.json` or `costs-final.json`.
