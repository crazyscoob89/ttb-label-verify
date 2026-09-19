# BLUR PREVIEW ONLY — NOT APPROVED — NOT MODEL TESTED

18 native 2200 x 3200 PNG fixture derivatives; no network, OCR or model calls.
Run `python3 generate.py` only in a fresh preview folder adjacent to glare-preview-v1.

Gaussian defocus sigma = 3.6 native pixels, uniform whole frame, deterministic Pillow Gaussian approximation in encoded RGB. This approximates optical defocus, not a calibrated physical lens. No text redrawing/deletion, masks, inpainting, geometric resampling or glare added. Native pixel positions/wording are retained; convolution necessarily changes RGB values.

Severity: sigma/1200-pixel label width = 0.003; warning font reference is 27 source pixels at vertical scale 1800/1499 (about 32.42 native px/em), sigma/em about 0.111. Moderate setting; small print may become hard to read, but this is not a blank-texture transformation. Readability awaits Alex review, not algorithmic acceptance.

Sources are exactly those recorded by existing glare-preview-v1, except D-BLUR-01 explicitly uses its clean C-SPIRITS-01 parent (source generator lines 710–715), avoiding stacked blur. D-GLARE-01 continues to use clean C-MALT-01, as the glare manifest specifies. D-WARP-01 retains inherited perspective warp/mild original blur: it is not a clean defocus-only control. Parent-mapped fixtures share pixels with their clean counterparts; 18 fixture identities do NOT mean 18 unique source images. Every original fixture record, original bottle/source hashes, original truth and clean substitution is explicit in manifest.json. Truth JSON copies are byte-identical originals, provenance only; visibility/outcomes have NOT been relabeled for this preview.

## Review files
- C-SPIRITS-01-three-way.jpg: one representative label, Original / Corrected glare / Defocus blur. All three use identical native crop (470,1060,1730,2970), 1260 x 1910, displayed identically at 600 x 910. Existing glare counterpart reused without rerendering.
- images/C-SPIRITS-01__blur-preview.png: representative full native bottle.
- C-SPIRITS-01-native-label.png: native-resolution defocused label crop.
- full18-contact-sheet.jpg: inventory overview ONLY, not full-character QA.
- manifest.json, inventory.json, tests.json, generate.py, ground_truth/: provenance and reproducibility.

All 18 derivatives were rendered twice and full encoded PNG SHA256 matched. Source/truth hashes, counts and native shapes checked; the entire existing glare directory remained hash-identical. No active build, gateway, runner, corpus or ledger edited. No publication. No ZIP required for this preview.

No automated vision inspection: offline-only and no images sent to inference take precedence over optional vision. Alex must independently inspect the native example before approval. No full-character QA or model benchmarking claimed.
