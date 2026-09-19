# Frozen v3 review mock

**Design reference only.** Download/open [REVIEW-MOCK.html](REVIEW-MOCK.html) locally; GitHub's source viewer is not the interactive application. No build, dependency install or server is required to view it. It uses synthetic samples, page-memory-only outcomes, no network/inference, no real uploads and no durable approval history. The governance controls are [designed separately](../../GOVERNANCE-AND-AUDIT-DESIGN.md); implementation remains gated by [the build plan](../../BUILD-PLAN.md).

## Selected design

- Single review: label and seven-field comparison side by side.
- Batch: queue plus horizontal item-card switcher, Previous/Next and full-width review.
- Green Pass, red Request correction and amber Second reviewer cards use icons/text as well as color. Pass stays visible with a reason if blocked.
- Confirmation and Submit review are co-located; Harbor Glen is the easy passing sample.
- Government-warning matching here compares predefined sample text, not uploaded-image OCR. Visible formatting is simulated, not production validation.

## Renders

| View | Desktop | Mobile |
| --- | --- | --- |
| Mismatch / blocked Pass | [Single](SINGLE-MISMATCH-DESKTOP.png) | [Single](SINGLE-MISMATCH-MOBILE.png) |
| Passing sample | [Single](SINGLE-PASS-DESKTOP.png) | [Single](SINGLE-PASS-MOBILE.png) |
| Outcome cards, blocked | [Detail](OUTCOMES-BLOCKED-DESKTOP.png) | [Detail](OUTCOMES-BLOCKED-MOBILE.png) |
| Outcome cards, Pass available | [Detail](OUTCOMES-PASS-DESKTOP.png) | [Detail](OUTCOMES-PASS-MOBILE.png) |
| Batch overview | [Queue](BATCH-OVERVIEW-DESKTOP.png) | [Queue](BATCH-OVERVIEW-MOBILE.png) |
| Batch quick switch | [Workspace](BATCH-SWITCHER-DESKTOP.png) | [Workspace](BATCH-SWITCHER-MOBILE.png) |

## Evidence and integrity

[manifest.json](manifest.json) pins all 15 imported source artifacts, including the HTML, 12 PNGs and original test script/results. Every imported file is byte-identical to the user-reviewed v3 artifact. This README and the manifest itself are publication metadata, not part of the earlier rendered review.

Original [TEST-RESULTS.json](TEST-RESULTS.json): 54 builder checks passed, zero failed. Desktop/mobile interactions, disabled/positive outcomes, cross-record isolation, batch switching, local-file non-analysis, contrast, bounded overflow, no network requests and original v2 immutability were tested. The [original test script](test-review.cjs) is archived unchanged: it contains AVA-machine-specific Playwright/Chromium and v2 evidence paths and is **not a portable clone-and-run command**. Those historical paths are not required to open the HTML. Do not rewrite the frozen script or claim this test suite validates a production app.

Portable byte verification (Python 3, repository root):

```sh
python -c "import pathlib,json,hashlib; p=pathlib.Path('docs/ui/v3'); m=json.loads((p/'manifest.json').read_text(encoding='utf-8')); assert all((p/f['path']).stat().st_size==f['bytes'] and hashlib.sha256((p/f['path']).read_bytes()).hexdigest()==f['sha256'] for f in m['files']); print('Frozen v3 bytes verified')"
```

Read [review provenance](../../reviews/09-governance-design-package.md) before treating any prior visual PASS as approval of the new specification, application code or deployment. v3 design is frozen; future changes belong in the approved app implementation, not another parallel mock.
