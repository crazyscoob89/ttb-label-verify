# BLUR V2 — PREVIEW ONLY / NOT APPROVED / NOT MODEL-TESTED

18 native 2200 x 3200 PNGs in images/. Offline deterministic source-pixel processing only. No network, models, OCR, publication, runners, STOP files or ledgers touched. Alex review is required before GitHub or Azure testing.

Exact tuning: blur Gaussian sigma **5.2 native pixels**, previously 3.6. Glare **1.65x** every V1 lighting coefficient (strength and edge_strength); bloom_fraction 0.12, warm light RGB [1,.985,.955], unchanged seed, center, curvature, widths, falloff and geometry. Alpha bound 0.65 retains >35% linear source contribution everywhere. No clipped white stripe, no new saturated dark ink, no completely white label rows/columns. Numerical tests are NOT proof of character readability.

Sources come from verified blur-v1 source mappings, not its outputs. D-BLUR uses C-SPIRITS-01 and D-GLARE uses C-MALT-01. D-BLUR glare V1 had inherited blur: its V2 clean-source change is explicitly recorded; all other glare source identities and all blur sources unchanged. D-WARP retains original perspective/mild blur. 18 fixture IDs do not imply 18 unique clean sources.

No lettering is redrawn; RGB values necessarily change under deterministic lighting or Gaussian convolution. Blur is not claimed to preserve literal RGB source pixels. Original wording/geometry are inherited, not independently OCR-validated.

Reproduce/verify using `/opt/data/asset-venv/bin/python generate.py --verify` (either directory verifies both). Fresh generation intentionally refuses to overwrite finished manifests. Both folders contain the same self-contained generator with explicit sibling paths. manifest.json records source and derivative SHA256 plus exact per-fixture settings. inventory.json snapshots all V1 files byte-for-byte. tests.json records independent full PNG rerender/hash verification and bounded smooth glare falloff/no broad erased band.

Review boards: sibling blur-preview-v2/C-SPIRITS-01-three-way.jpg (same full-label crop), blur-preview-v2/C-SPIRITS-01-v1-v2.jpg (matched native detail crops, glare and blur), glare-preview-v2/selected3-pairs.jpg (spirits/wine/malt). Native images are authoritative. No vision tool available here; parent native vision and Alex review pending. No model-tested or approved status claimed.
