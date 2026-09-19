# One-source severity ladder — PREVIEW ONLY / NOT MODEL-TESTED

12 native 2200x3200 PNGs: unchanged source copy, six independent Gaussian blurs sigma 1–6 native pixels, five independent glare levels x1–x5. No combined effects, recursive filtering, source wording edits, OCR, vision model predictions, confidence values, network or publication. No corpus expansion. Ground-truth content stays unchanged; visibility of every field is PENDING HUMAN REVIEW. Parent/Alex must inspect boards.

## Boards and coordinates
blur-ladder.jpg: 2 columns × 4 rows (last cell notes). glare-ladder.jpg: 2 columns × 3 rows. Both include unchanged baseline and EXACT same representative label-detail crop (650,1720,1550,2580), resized consistently to 550×526. Crop includes central text and upper warning detail; does not claim to display every field. Original native images in images/ remain authoritative. Source label bounds and optical geometry recorded in manifest unchanged.

## Renderer
Inspected glare-preview-v4/generate.py, glare-preview-v3/generate.py and blur-preview-v3/generate_v3.py. Uses AST-isolated original V3 optical function prefix, which V4 calls unchanged, through uint8 quantization. No corpus main or import-time entrypoint is executed. Legacy renderer acceptance assertions are not used as calibrated visibility thresholds; optical statements, lighting color, shape, seed and 0.65 cap are unchanged. x3 PNG must exactly match prior approved representative V4 PNG. Both intensity coefficients originate from ORIGINAL V1 on every level, never compounded. Blur is Pillow's Gaussian approximation in encoded RGB, directly from clean source each time. Source baseline is byte-identical, including its original PNG encoding.

## Descriptive metrics (not calibrated confidence)
Full native-image changed pixels: any RGB channel differs; MAE: mean absolute channel difference (0–255). Cap clipping fraction: requested pre-cap alpha >0.65 over full image, plus bottle and label denominators in manifest. Exact effective alpha peaks, uncapped peaks and peak gains are recorded. Label contrast is luminance SD and RMS (SD/mean), edge sharpness is RMS first differences on unscaled label crop (500,1079,1701,2944), encoded-sRGB luma weights .2126/.7152/.0722. Gaussian sigma normalized by original label width and height is recorded.

Known dark-text mask: invert documented cylinder mapping, restrict to original source warning-text region sx100..900, sy1010..1280 (generator anchors statutory heading/body at y1010), and select clean native max(R,G,B)<100. This is fixed clean-reference ink selection, not OCR. Saved mask is label-crop-local. Local paper estimate: 31×31 max-filter of rounded luminance per level; local Weber contrast (paper−ink)/paper averaged ONLY on the same clean dark-text pixels. Contrast loss = 100×(1−level/clean). This is an operational descriptive measure and may vary with window size, not a readability or accuracy threshold. It intentionally targets known warning text, not a claim to annotate all text glyphs. Source geometry gives warning area provenance. Whole-label SD also includes graphics/paper variation. No metric proves text preservation/readability.

## Reproduce / verify
`/opt/data/asset-venv/bin/python generate.py --verify` performs all12 independent PNG rerenders, measurement recomputation, dimensions/count, source and previous-preview file SHA/file-set invariance, exact x3 agreement with prior V4 and artifact hashes without writes. tests.json records completed checks. inventory.json captures previous artifacts plus source, original label/truth and label generator before rendering. All writes limited to this new directory; no runner/budget/reports touched.

## Plateau caveat
- Requested x1..x5 multiply ORIGINAL V1 coefficients, not brightness. Opacity cap remains 0.65.
- Peak alpha plateaus at 0.65 for x3/x4/x5; shoulders and affected area can still grow. No entire-image plateau unless pair measurements say so.
- High identical-pixel fractions include unaffected image regions; do not interpret as globally identical severity. No perceptual equivalence threshold used.

| Level | Peak alpha | Cap clipped % image | Changed % image | RGB MAE | Dark-text contrast loss % | Label edge RMS |
|---|---:|---:|---:|---:|---:|---:|
| baseline 0 | 0.000000 | 0.0000 | 0.000 | 0.0000 | 0.000 | 14.9844 |
| blur 1 | 0.000000 | 0.0000 | 5.635 | 0.9408 | 19.053 | 9.4089 |
| blur 2 | 0.000000 | 0.0000 | 8.790 | 2.1332 | 42.621 | 5.1861 |
| blur 3 | 0.000000 | 0.0000 | 12.063 | 3.0340 | 55.052 | 3.3070 |
| blur 4 | 0.000000 | 0.0000 | 15.042 | 3.7064 | 61.279 | 2.4168 |
| blur 5 | 0.000000 | 0.0000 | 17.645 | 4.2451 | 65.355 | 1.9080 |
| blur 6 | 0.000000 | 0.0000 | 20.111 | 4.7064 | 69.038 | 1.5833 |
| glare 1 | 0.304661 | 0.0000 | 15.407 | 1.1088 | 15.154 | 13.3386 |
| glare 2 | 0.609322 | 0.0000 | 19.951 | 1.9639 | 23.210 | 12.5720 |
| glare 3 | 0.650000 | 1.1825 | 22.474 | 2.6799 | 29.333 | 12.0457 |
| glare 4 | 0.650000 | 2.1489 | 24.188 | 3.2816 | 33.831 | 11.6559 |
| glare 5 | 0.650000 | 2.8814 | 25.458 | 3.8033 | 36.942 | 11.3581 |
