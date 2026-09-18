# Synthetic TTB bottle-image corpus — 2026-09-18

This is an **asset/provenance publication**, not a benchmark-completion report or independent QA approval. These images are deterministic synthetic mockups built from the original label raster pixels, **not camera captures**. Resampling, shading, perspective and glare alter pixels; label text was not regenerated. No inference was performed for this publication.

## Contents

- [Original manifest](bottles/manifest.json): 18 original bottle PNGs, with [preview sheet](bottles/contact-sheet.jpg).
- [Recovery-v3 manifest](recovery-v3/bottles/manifest.json): 54 PNGs (18 each: straight, angle, glare), with [straight](recovery-v3/bottles/straight-sheet.jpg), [angle](recovery-v3/bottles/angle-sheet.jpg) and [glare](recovery-v3/bottles/glare-sheet.jpg) preview sheets.
- [Frozen visibility record](recovery-v3/visibility-freeze.json), preserved byte-for-byte. It records AVA's pre-inference annotations, **not independent human inter-rater labeling**. The freeze's manifest SHA256 was verified. Historical visual-inspection statements are attributed records, not new checks by this publisher.
- [Image inventory](image-inventory.json): SHA256, Git blob SHA1, byte size and repository destination for **every one of the 94 images discovered** under the benchmark root. The 18 flat labels already exist unchanged in [repository fixtures](../../../fixtures/manifest.json); they are linked rather than duplicated. This publication adds 76 image paths: 72 bottle images plus four preview sheets. The original 18 and v3 straight 18 remain separate versioned paths even where bytes match.
- [Provenance inventory](provenance-inventory.json): hashes of all copied manifests, truth JSON, source hashes and renderer source.
- [Portable fixture map](portable-fixtures.json): repository-root-relative image/source/truth paths, hashes, transforms and original frozen visibility metadata.

New image paths total **64,015,424 bytes**; all 94 inventoried source-image paths total **66,031,394 bytes**. Largest image: **1,397,351 bytes**. Ordinary Git blobs are used; no LFS dependency. These sums count paths, including identical-byte versions; Git may deduplicate storage.

## Provenance and path semantics

Original metadata is archived **without rewriting bytes**. `bottles/manifest.json` resolves `image`, `ground_truth`, `renderer` and contact-sheet paths relative to `bottles/`. Its historical absolute `source_root` and `source-hashes.json` prefix map to this repository's `fixtures/`; `source_image` and `source_ground_truth` are relative to that source root, not the bottle folder.

Recovery-v3 `image` and `ground_truth` resolve relative to `recovery-v3/bottles/`. Its `source_bottle` and `source_ground_truth` resolve relative to the original `bottles/`. Its source-label IDs resolve to `fixtures/images/<source_fixture>.png`. Use the portable map for unambiguous repository-relative links. The original fixture manifest and labels were already tracked on the selected remote base.

The chain is: existing label/truth → original bottle → v3 condition image; source and derived hashes, renderer hashes, original source manifest hash, v3 source-manifest hash and frozen-visibility manifest hash all match. Original and v3 ground-truth copies are included in their own directories. Contact sheets are previews, not additional model-input cases.

## Generation recipe (historical; no regeneration performed)

[Original renderer](bottles/render.py) is an exact source snapshot. It uses Python, NumPy, Pillow and DejaVu Sans. It mounts the full 1000×1500 source label onto a 2200×3200 shaded bottle using the per-fixture cylindrical mapping in the manifest, bilinear sampling, deterministic commodity geometry, gentle shading and index-dependent tilt. Output PNG compression level is 6. The seed is 20260918; manifests record that randomness was not used.

[Recovery-v3 renderer source](recovery-v3/renderer-source.py.txt) preserves the exact hashed `v3.py` bytes as non-executable reference text. The original file also imports benchmark infrastructure; **do not execute it or import the active harness to reproduce images**. The self-contained `render` function documents:

1. `straight`: reuse the RGB original bottle and save PNG, compression level 6.
2. `angle`: affine foreshortening cos(30°), shear 0.065, bicubic resampling, fixed 2200×3200 canvas and fill RGB (221,216,204); not physical camera rotation.
3. `glare`: Gaussian blur sigma 0.65; white central band centered at `1100 + 0.018*(y-2000)`, outer half-width 200, opaque core half-width 135, tapered vertically as recorded in the source and manifest. Characters crossing the opaque band are deliberately destroyed.

For future reproduction, use a separate scratch output directory, point a **copy** of the original renderer at repository `fixtures/`, and extract only the v3 image-transform routine into an offline renderer. Never run the archived originals against historical absolute paths or overwrite this frozen corpus. Full dependency versions were not frozen; byte-identical regeneration across different NumPy/Pillow versions is not guaranteed. The committed original image bytes and hash inventory are authoritative.

## Verify offline

From the repository root:

```sh
python3 bench/corpora/ttb-foundry-20260918-v1/verify_publication.py
```

The [verifier](verify_publication.py) checks tracked bytes, SHA256/Git blob identities, truth/source chains, frozen visibility, portable paths and README relative links. It does not import a runner, render images, spend money, score models, or assert real-world-photo accuracy.

## Publication boundary

Base chosen from inspected live GitHub branches: `ava/stage2-review-revision` at `4039ccce1912130e3cc9c015e439bf62f720d32f`, the available active review/benchmark branch. The local recovery branch was not present on GitHub at discovery. Publication uses a new isolated clone and an assets-only branch. No application files, active working tree/index, runner, ledger, runtime database, response dumps or logs were modified or copied. No merge or deployment is authorized by this artifact.
