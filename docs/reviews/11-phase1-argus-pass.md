# ARGUS Phase 1 PASS — original supplied review

## Provenance and acceptance

- Reviewed candidate: `2b59abcb0cb7e95abc1639ee4e81df50930dfe1a` on `ava/app-phase-1`.
- Source supplied by Alex: `doc_79cbf24075e3_argus_review.docx`.
- Source SHA-256: `bfad6e5024551705d03c346aad002352038e2450a294202c93f89e8505aa74c5`.
- Imported locally using Python `zipfile` and WordprocessingML paragraph text; paragraph boundaries retained below. No raw execution logs were supplied or invented.
- ARGUS verdict: **PASS, no revisions**. AVA agrees. ARGUS read the entire source, closure logs and diff; he did **not** rerun tests/build. His clean Windows native clone matched the candidate.
- Alex's current authorization: **“go as long as you are in agreement”**. Record the PASS and continue Phase 2 locally; AVA builds, ARGUS reviews read-only after the whole Phase 2. No remote writes, live/paid calls, provisioning, migrations or deployment authorized by this step.
- Nonblockers retained: address CSP `unsafe-inline` before deployment; future batch aggregate memory/concurrency controls; add explicit uncompressed iTXt-bound regression when metadata handling changes. This record changes no intake code.

## Original reviewer report (paragraph text)

**PASS** — Phase 1 candidate `2b59abc`.



What I actually executed vs. read: I read the full source at the candidate SHA in the native clone (`C:\Users\alexm\.hermes\ttb-governance-docs`, branch `ava/app-phase-1`, clean worktree, matches `2b59abc` exactly), read every closure log in the evidence dir, and diffed the full `07fdca6..2b59abc` range. I did **not** re-run `npm ci`/tests/build myself — my exec allowlist blocks inline builds, so unit/typecheck/build/e2e are read evidence, not reproduced by me. Calling that out plainly.



What holds up under review:

- **Schema coercion** is genuinely strict. ABV rejects `''`, `' '`, booleans, `0x28`, `4e1`, `'40%'`, `'+40'`, `'1,5'`, NaN/Infinity — a missing value never collapses to zero, which was the real risk. Identifier whitespace rejects instead of silently trimming, so identity is never rewritten. `.strict()` plus the `governmentWarning` rejection test closes the editable-warning hole.

- **Pairing is filename-keyed, not order-keyed**, and the test proves it by deliberately passing files out of order. Missing/extra/duplicate filenames and repeated applicationId+version all reject the whole manifest *before* any decode. Path/URL/null-byte names rejected.

- **Hostile image handling is the strongest part.** Container walk before libvips, CRC verification per chunk, APNG/MPO/concatenated/truncated rejection, and a genuinely well-formed two-frame APNG fixture that Sharp *will* decode — proving the rejection is the boundary's, not the decoder's failure. The 1 MiB expanded-metadata bound is real work: a tiny-pixel PNG with >1 MiB inflated zTXt was **accepted** before the fix, and the RED log for that defect is preserved rather than buried. Bounded `inflateSync` with `maxOutputLength` is the right call.

- **Buffer lifecycle/hash binding is correct.** `Buffer.from()` snapshot before the first `await`, with a test that fills the caller's buffer to zero mid-flight and confirms `sourceSha256` is unchanged. Original bytes never returned. No `withMetadata`, so EXIF/ICC/XMP genuinely drop; orientation applied then discarded, verified by the 4x3 → 3x4 assertion. Catch-all returns a fixed content-free message — no filename or payload leakage into future logs.

- **Browser honesty is the thing most builds get wrong, and this one gets right.** The success message literally says "Image content is still unvalidated. Nothing has been uploaded, analyzed or saved." Submit button disabled. Zero network requests asserted on both render and form interaction. `checkFileDeclaration` is explicitly labeled advisory. No fabricated verdicts.

- **Scope is clean.** 25 changed paths, all under `web/` plus README/IMPLEMENTATION-STATUS/the review doc. All 1,926 frozen files under `bench/`, `fixtures/`, `docs/ui/v3/` byte-identical. No lockfile install scripts. `.env.example` holds tooling names only, no credential shapes. POST `/api/comparisons` and GET `/history` returned 404 — absence, correctly not claimed as auth.



Non-blocking notes for Phase 2, not revisions:

- `'unsafe-inline'` in `script-src`/`style-src` is acceptable for a static local shell but becomes a real finding the moment this is deployed or handles non-synthetic data. Nonce it before Phase 6.

- The 300-pair manifest helper is correctly documented as *not* a batch queue — when Phase 5 wires it up, aggregate memory and concurrency bounds are still entirely unwritten. `sanitizeImage` bounds one decode, not N concurrent ones.

- `iTXt` uncompressed path returns `data.length` unbounded against the 1 MiB aggregate — it counts toward the total, so it's bounded in practice, but worth an explicit test when metadata handling changes.

- The `taskset` build workaround is Linux-host-specific and correctly kept out of product scripts; the final unrestricted build passing makes it a non-issue.



Phase 2 absence of comparison/auth/history is intentional scope, not failed delivery — noted and not counted against this gate.



Green light for Phase 2. Keep provider 

calls gated, Alex's approval covers local implementation only.
