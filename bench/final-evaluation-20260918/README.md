# Final evaluation evidence — 2026-09-18

**[Readable benchmark results](../../BENCHMARK-RESULTS.md)** ·
[complete source index](SOURCE-INDEX.md) · [image battery](IMAGE-INDEX.md)

## Safe offline verification

```sh
python3 -B bench/final-evaluation-20260918/verify.py
python3 -B bench/final-evaluation-20260918/verify.py --json
python3 -B bench/final-evaluation-20260918/test_verify.py
```

Run from the repository root, or supply an absolute path to either script from
any working directory. Python 3.10+ standard library only. No credentials,
network, Pillow, model calls or installed app packages are required. Verification
is read-only; `--json` prints computed metrics rather than overwriting reports.

**Do not run the historical code.** Captured Python/shell source is named
`.py.txt`/`.sh.txt`, with original bytes/hashes retained. Do not rename or execute
it, especially `azure.py --run`, `run.py`, authorization, renderers or archived
test scripts. They can contain original absolute paths, paid dispatch or ledger
writes. The portable verifier imports none of them.

## What is preserved and what is derived

- `observations/`: versioned source observations, saved reports, queue/coverage,
  scoring, truth, original pricing, authorization, tests/logs and raw responses.
  Earlier failed/rejected variants remain historical, not the approved cohort.
- `decision/`: original requirement/model evaluation and assignment snapshot;
  its review attributions and implementation status reflect when it was written.
- `frozen-project/`: referenced source/scorer dependencies not already identical
  elsewhere in Git. Most shared fixtures map to existing immutable paths.
- `source-map.json`: every original source path, byte count, SHA-256 and relative
  published target. Exact historical duplicates/aliases point to shared bytes.
  Use this map or the source index when an original relative path is absent.
- `aggregates.json`: newly derived, alias-aware saved-score reconciliation, not
  new inference or a re-score. Seven-field accuracy, failure/referral counts,
  all-seven correctness, latency and cost denominators remain distinct.
- `integrity-manifest.json`: hashes every new archive file except itself, plus
  changed/new navigation and report files. The Git commit anchors the manifest;
  self-hashing would be circular. Existing shared targets are additionally
  verified through the source map.
- `copy-audit.json`, `security-scan.json`: publication-specific copy/security
  checks. Test and cold-checkout results are in the publication record.

All raw response, attempt, row, image and ledger bytes are preserved. Six JSON
source records have only `$.processes` removed to exclude unrelated host command
lines. They are explicitly **derived/sanitized**, even where identical redacted
copies share a target. Their original-source hashes remain in the map and
original freeze manifests; the original redacted process text cannot be
reconstructed or independently hashed from the publication. This exception
never removes benchmark request/response bodies or changes aggregate inputs.

The source inventory excludes caches, locks, secret configuration, prior
publication-worker metadata, and a directory-only reference (`fixtures`, not a
missing file). It does not invent an original independent reviewer report.
The complete omissions/reasons are in the map. The original source tree and
ledgers were not modified. No new compression or LFS was introduced; original
ZIP previews remain original bytes and were scanned internally as well.

## Verifier contract and limitations

1. Validate every new file hash, source mapping and available frozen provenance.
2. Reconcile planned IDs against attempts, responses and rows. Distinguish
   HTTP-200 invalid outputs, transport errors, missing coverage and aliases.
3. Verify 199 reused Azure controls + 1,073 new records; all 252 Haiku aliases;
   148 pre-continuation attempts/responses/rows unchanged and 64 new records.
4. Verify all 252 logical image records, original-label/truth hashes and approved
   source pixels through portable relative mappings; dedupe 212 unique images.
5. Recompute aggregate metrics from saved scored rows, compare every condition
   to the saved report, preserve failure denominators, and check the aggregate
   cache. Linear-interpolated p95 uses `(n-1)*p`; all-call and valid-only timing
   are separate. Retail cost means are over known-cost calls only.
6. Open the copied SQLite snapshot `mode=ro&immutable=1`; verify integrity,
   attempt identities, liability arithmetic and preserved earlier entries.
7. Negative tests prove missing rows, missing logical coverage, conflicting
   aliases, success fabricated from failure, tampered/missing/unlisted files and
   path traversal are rejected. Positive test runs from an unrelated cwd with
   an empty environment. Tests deny socket operations in-process.

These are publication/aggregate checks, **not** raw-response scorer replay,
invoice verification, visual-readability certification, independent ARGUS QA,
real-camera calibration, app latency or deployment readiness. Earlier original
runner tests are captured evidence, not freshly executed by this publication.

Windows: preserve checkout bytes. For shared old evidence, follow the root
README's fresh `--no-checkout` clone / `core.autocrlf=false` recipe before checkout.
The new archive has scoped `-text` rules; do not normalize CRLF captures or alter
fingerprints to force a green result.
