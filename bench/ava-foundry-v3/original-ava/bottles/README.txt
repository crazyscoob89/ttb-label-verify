TTB paired synthetic bottle corpus — v1
======================================
These are deterministic SYNTHETIC MOCKUPS, NOT photographs.

ARTIFACTS
images/<fixture_id>.png: 18 full-resolution 2200 x 3200 RGB PNG images.
manifest.json: exact fixture pairing, source and output SHA256, source ground
truth SHA256, source-manifest and renderer SHA256, full transform parameters,
label bounds, resolution, fixed seed and limitations.
ground_truth/<fixture_id>.json: byte-for-byte copies, NOT new annotations.
source-hashes.json: hashes of all 37 source inputs checked before/after render.
contact-sheet.jpg: six representative examples, two columns, phone-friendly
1000 x 2300 preview. Use PNGs rather than contact sheet for inference.
render.py: complete deterministic local renderer.
test_corpus.py: coverage, hashes, source immutability, resolution, complete
source rectangle, transform metadata, no canvas cropping, and preview tests.

CONSTRUCTION
Full 1000 x 1500 source label rectangles are sampled directly; no retyping,
OCR, invented brand names, inpainting or text synthesis. A smooth invertible
cylindrical map, vertical arc, mild skew and perspective produce curvature.
Label width is 1200 pixels and height about 1800 pixels; even edge horizontal
scale stays above 1, keeping original small type larger than source size.
Bilinear interpolation and mild multiplicative edge shading modify raster
values while retaining the original content. All original margins and border
are included. The renderer asserts the complete curved label perimeter is
inside the compositing region, canvas, and bottle body. No label occlusion,
added glare or blur. Existing degraded fixtures remain degraded as supplied.

Procedural bottle silhouettes differ for spirits, wine and malt, with opaque
colored glass-like shading, softbox highlights, neutral unbranded caps, soft
contact shadows, and a warm studio tabletop/sweep. These are attractive raster
mockups rather than physically accurate transparent glass or photographs.
Label placement emphasizes legibility rather than realistic commercial label
size. No added wording appears in the individual images. Synthetic disclosure
is provided here, in manifest, and in the contact sheet heading.

REPRODUCE / TEST
uv run --with pillow --with numpy python render.py
uv run --with pillow --with numpy python test_corpus.py
Run from this directory, or use absolute script paths. Source paths are fixed.
Seeds are recorded but no random operation is used. Output PNG determinism
assumes the same Python, Pillow, NumPy and encoder versions; exact equations
and complete scene implementation are in render.py. System DejaVu Sans is
used only for the contact sheet, never the product labels.

QA / LIMITATIONS
TDD: tests were written and run first; both failed because artifacts were
absent. Final rerun: 2 tests passed, covering all 18 fixture records. One
full-resolution output was rerendered and verified byte-identical by SHA256.
qa.json records this check, runtime versions and native visual inspection.
Source files are
read-only to this workflow and hashes are checked across rendering. Ground
truth is copied without modification; fixture annotations must be interpreted
as supplied, including adversarial and wrong-answer cases. No model/API calls
or generative image charges. uv installed the permitted Pillow/NumPy runtime
(the NumPy wheel was downloaded); no external image assets were downloaded.
Native vision inspected the source label and rendered preview. This baseline
does not establish performance on actual camera photographs, reflective glass,
severe curvature, blur or occlusion. Contact-sheet small type is not a quality
reference; inspect full resolution PNGs instead.
