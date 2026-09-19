# Corrected glare — version 1 — HUMAN PREVIEW ONLY

**SYNTHETIC PREVIEW. NOT APPROVED. NOT TESTED on models/OCR. Visibility annotations pending human approval.**

This is an isolated new preview corpus. Do not send it to benchmark models or replace the active corpus until Alex approves it. No inference, paid test, upload, Git operation, runner modification, ground-truth change, or frozen-visibility change was performed by this worker.

## Contents
- `images/`: all 18 fixture derivatives, RGB PNG, native 2200 × 3200 pixels.
- `selected3-pairs.jpg`: three complete-label no-glare/corrected pairs (spirits, wine, malt), readable with phone zoom. Review aid only; downsized, not native evidence.
- `full18-contact-sheet.jpg`: overview of all 18 full bottles plus upper-label detail. Not a readability adjudication image.
- `images/C-SPIRITS-01__glare-preview.png`: complete full-bottle exemplar.
- `C-SPIRITS-01-native-label.png`: native, unscaled label crop [470,1060,1730,2970]; includes whole label and small surrounding glass margin.
- `manifest.json`: every source/output SHA256, fixture lineage, per-fixture seed and parameters, original geometry, environment and lighting checks.
- `inventory.json`: immutable-source inventory and before/after hash baseline.
- `generate.py`: standalone offline deterministic pixel-lighting generator; never imports a runner.
- `tests.json`: artifact checks only, **not benchmark testing or human approval**.

## Source lineage and important exception
17 derivatives start directly from `bottles/images/<fixture>.png`, which are the original bottle pixels before recovery-v3's rejected stripe effect. The recovery-v3 straight copies are inventoried but not used. Rejected `__glare.png` files are never inputs.

The original **D-GLARE-01 already contained baked-in glare**, inherited from its flat source label. `fixtures/generate_labels.py` explicitly declares it derived from **C-MALT-01**. Its corrected derivative therefore starts from the unchanged clean **C-MALT-01 bottle** and receives its own deterministic reflection. This preserves the same complete lettering and semantic content without pretending lost ink can be restored. The clean parent's bottle geometry is used, not the old D-GLARE label's tilt. This is a deliberate preview-baseline substitution, recorded in the manifest, not a drop-in validated benchmark condition. Original D-BLUR and D-WARP degradations remain inherited; they have not been deblurred or unwarped.

## Lighting and content preservation
Only existing source RGB pixels are blended. No text is typed, regenerated, OCR-reconstructed, geometrically remapped, downsampled, or blurred. The original bottle geometry supplies cylindrical surface normals. A smooth asymmetric softbox reflection varies in location and width, bends with vertical position and surface angle, and tapers in both dimensions. A wider low-energy lobe approximates bloom; a separate narrow, weak opposite-edge reflection cues the glass surface. A feathered bottle silhouette prevents background lighting leakage.

Blending uses float32 linear-light RGB and a slightly warm illuminant. Alpha is bounded below 0.48, retaining over 52% original linear-light signal everywhere (actual bounds are in tests). Important text can become locally lower-contrast, but no opaque rectangles or saturated text-erasing bars are introduced. Reflection strength/placement vary deterministically by a stable fixture-derived seed. Source bottle PNG dimensions and native label sampling are preserved; any resampling already present in the original bottle render is inherited.

## Verification / reproduction
Run from any directory:

```
/opt/data/asset-venv/bin/python /opt/data/benchmarks/ttb-foundry-20260918-v1/glare-preview-v1/generate.py --verify
```

This regenerates each image in memory, compares exact encoded PNG SHA256 against the manifest and disk, checks all 18 dimensions/count, verifies immutable source hashes, bounded blend weights, zero newly saturated dark-ink pixels, zero solid saturated full-label-height columns, limited per-row strong-reflection coverage, meaningful nonzero label lighting, and zero changed pixels outside the bottle silhouette. It rewrites only this preview's `tests.json`.

For a separate full rebuild, copy `generate.py` into a NEW sibling preview directory and run without `--verify`; inputs are located relative to its parent. Full generation refuses to overwrite an existing manifest. Original source images are not duplicated in the ZIP; exact original paths/hashes and source geometry are provided, so regeneration requires the original local sources and matching dependency versions. Native output PNGs in the ZIP are lossless, never resized.

## Limitations
This is a physically inspired 2-D lighting approximation on already synthetic bottle mockups, **not a real photograph or calibrated glass/material renderer**. Broad bloom is analytic, not lens ray tracing. A bounded reflection is intentionally moderate and does not cover every possible real-camera glare severity. Quantitative checks do not prove every printed field is human-readable or that all18 pass independent visual QA. No automatic visibility labels or expected model outcomes are assigned. Human review must approve appearance and determine field-level visibility before any testing. JPEG boards are navigation/review aids only. The source fixture wording—including deliberate mistakes and adversarial printed content—is left unchanged; it is never treated as execution instructions.
