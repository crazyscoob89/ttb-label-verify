# Glare V4 — PREVIEW ONLY / NOT APPROVED / NOT MODEL-TESTED

18 native 2200 x 3200 PNGs. Glare NOT APPROVED; parent vision and Alex review pending. Blur sigma 5.5 strength visually approved by Alex; blur-preview-v3 is frozen byte-for-byte, not regenerated or relabeled. Neither glare V4 nor blur V3 corpus cleared for publishing or model calls.

Strength and edge_strength are exactly 3.0 times ORIGINAL V1, not V3. Same seeds, geometry, curvature, widths, bloom fraction and clean-parent source mapping as V3. D-BLUR uses C-SPIRITS-01; D-GLARE uses C-MALT-01. D-WARP retains original warp/mild blur. No prior glare output is used as source.

{
  "requested_coefficient_gain_from_original_v1": 3.0,
  "opacity_cap": 0.65,
  "effective_peak_gain_from_original_v1_range": [
    1.7119060399204262,
    2.140983044491928
  ],
  "uncapped_alpha_max_range": [
    0.9107965303560714,
    1.1390811662566873
  ],
  "opacity_clipped_pixels_total": 2190801,
  "limitation": "Coefficients are 3x original V1, not 3x V3. Cap plateaus peaks at 0.65; shoulders increase. At least 35% linear source contribution retained. Numerical checks do not guarantee readability."
}

Board: C-SPIRITS-01-three-way.jpg, matched full-label crops of original, new glare, and EXISTING approved-strength blur V3. Native PNGs are authoritative. No RGB pixel-identity or character-readability claim; numerical checks rule out added fullheight white bars, saturated full-label rows/columns and newly saturated dark ink, but parent vision review is still required.

Reproduce verification without writes: `/opt/data/asset-venv/bin/python generate.py --verify`. Imports the immutable V3 renderer by recorded path/hash with bytecode writing disabled; does NOT execute its main or blur generation. tests.json contains independent full PNG rerender/hash comparisons for all18 and prior-version/blur invariance checks. No network, inference, ZIP, publishing, runner, ledger or unrelated-document changes.
