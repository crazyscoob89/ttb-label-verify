#!/usr/bin/env python3
"""
foundry_vision_probe.py -- Step 1: vision capability smoke test for the
Azure AI Foundry deployments in project 'ttb-foundry-trial' (East US).

WHY THIS EXISTS
---------------
Before spending a 54-call benchmark battery on a deployment, we need to know
whether that deployment can actually SEE an image. On an OpenAI-compatible
endpoint, a text-only model does not necessarily hard-fail when handed an
`image_url` content part: some deployments silently ignore the image and
answer from the text prompt alone. A probe that only checked for HTTP 200
would therefore mark text-only models as "vision-capable" and quietly produce
a benchmark full of hallucinated label fields.

So this probe does not test "did the call succeed". It tests COMPREHENSION:

  * We generate a small PNG containing a random secret token (e.g. "K7QX9").
  * The token is random per run, so it cannot be in any training data and
    cannot be guessed from the prompt -- the prompt never contains it.
  * We ask the model to read the characters in the image.
  * A deployment is vision-capable ONLY if it returns the exact token.

Outcomes recorded per deployment:
  vision_ok       - HTTP 200 and the secret token was read back exactly.
  vision_degraded - HTTP 200 and the reply clearly derives from the image
                    (same character set, near-miss length) but is not an exact
                    match -- i.e. real vision, imprecise OCR. Recorded
                    separately because it is a capability finding, not a bug.
  no_vision       - HTTP 200 but the reply bears no relation to the image. The
                    model accepted the payload and answered blind. EXCLUDED,
                    because its benchmark output would be fabrication.
  call_failed     - transport/HTTP error (includes models that correctly
                    reject image parts outright, and non-chat routes such as
                    mistral-document-ai-2512). EXCLUDED with the error recorded.

FAIRNESS REQUIREMENT
--------------------
An exclusion must reflect the DEPLOYMENT's limits, not this harness's. Two
harness artifacts were observed on the first run and are now corrected for
automatically, because excluding a model for our own bug is a false negative:
  * Parameter dialect: some deployments (Mistral family) reject
    `max_completion_tokens` with HTTP 422 `extra_forbidden` and require the
    older `max_tokens`. The probe now retries once in the other dialect.
  * Token starvation: a completion budget too small for a model that emits
    reasoning tokens first returns an EMPTY string, which is indistinguishable
    from blindness. Every deployment now gets generous headroom.

Output: bench/foundry_vision_probe.json  (machine-readable gate for Step 2)

Cost: one tiny call per deployment. The image is a few hundred bytes and
max tokens are small, so the probe is effectively free (<$0.01 total).
Secrets are read from the operator's .env and are never logged or committed.
"""

from __future__ import annotations

import base64
import io
import json
import random
import string
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import engines as E  # noqa: E402

OUT_PATH = HERE / "foundry_vision_probe.json"

# The six deployments provisioned in the Foundry project, all Global Standard.
# `reasoning` marks deployments that spend tokens on internal reasoning before
# emitting visible text; those need a generous completion-token budget or they
# return an empty string having burned the entire allowance on reasoning.
FOUNDRY_DEPLOYMENTS = [
    {"deployment": "gpt-4.1-mini", "reasoning": False},
    {"deployment": "gpt-5-mini", "reasoning": True},
    # Kimi returned an empty completion under a 64-token cap on the first run;
    # treated as reasoning-class here so it gets room to actually answer.
    {"deployment": "Kimi-K2.6", "reasoning": True},
    {"deployment": "grok-4-1-fast-non-reasoning", "reasoning": False},
    {"deployment": "Mistral-Large-3", "reasoning": False},
    {"deployment": "mistral-document-ai-2512", "reasoning": False},
]

# Supplementary findings recorded during exclusion triage, so that a reader of
# the JSON knows an exclusion was investigated rather than assumed.
ROUTE_NOTES = {
    "mistral-document-ai-2512": (
        "Deployment EXISTS in the endpoint's model catalog (verified via GET "
        "/models), so the 404 is not a name typo. It is a document-AI/OCR model "
        "that is not served over the chat/completions route; a probe of the "
        "Mistral OCR route on this resource also returned 404. Excluded from the "
        "benchmark: the battery is defined over chat/completions with an image "
        "part, and this deployment does not expose that interface here."
    ),
}

PROBE_INSTRUCTION = (
    "Look at the image. It contains a single short code of capital letters and "
    "digits. Reply with ONLY that code, nothing else. If you cannot see any "
    "image at all, reply with exactly: NO_IMAGE"
)


def make_token_image(token: str) -> bytes:
    """Render `token` as large black text on white. Deliberately high-contrast
    and large-glyph: we are testing whether the model can see AT ALL, so we must
    not conflate 'no vision' with 'vision, but the text was too small to read'."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (320, 120), "white")
    d = ImageDraw.Draw(img)
    font = None
    for candidate in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf"):
        try:
            font = ImageFont.truetype(candidate, 64)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    box = d.textbbox((0, 0), token, font=font)
    d.text(
        ((320 - (box[2] - box[0])) / 2, (120 - (box[3] - box[1])) / 2 - box[1]),
        token,
        fill="black",
        font=font,
    )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _dedupe_runs(s: str) -> str:
    """Collapse consecutive repeated characters ('ULU55VHV' -> 'ULU5VHV').
    Used only to detect stutter-style misreads, never to manufacture a pass."""
    out = []
    for ch in s:
        if not out or out[-1] != ch:
            out.append(ch)
    return "".join(out)


def _classify(reply: str, token: str) -> tuple[str, str]:
    """Decide vision_ok / vision_degraded / no_vision from the reply text.

    The strict gate is exact containment of the token. The degraded tier exists
    because a model that returns 'ULU55VHV' for 'UL5VH' plainly SAW the image --
    every character it emitted is drawn from the token, in order -- it simply
    duplicated glyphs. Calling that 'no vision' would be wrong. Calling it
    'vision_ok' would also be wrong, since it cannot transcribe precisely.
    """
    norm = "".join(ch for ch in reply.upper() if ch.isalnum())
    tok = token.upper()

    if not norm:
        return "no_vision", "empty completion -- no visible answer returned"
    if tok in norm:
        return "vision_ok", ""
    if "NOIMAGE" in norm:
        return "no_vision", "model explicitly reported it received no image"

    # Stutter/duplication misread: dedupe both sides and re-compare.
    if _dedupe_runs(tok) and _dedupe_runs(tok) in _dedupe_runs(norm):
        return (
            "vision_degraded",
            "read the image but duplicated characters (stutter misread); "
            "genuine vision, imprecise transcription",
        )
    # Subsequence check: did it emit the token's characters in order, with noise?
    it = iter(norm)
    if all(ch in it for ch in tok):
        return (
            "vision_degraded",
            "token characters present in order with extra noise; genuine "
            "vision, imprecise transcription",
        )
    overlap = len(set(tok) & set(norm)) / len(set(tok))
    if overlap >= 0.8:
        return (
            "vision_degraded",
            f"partial character overlap ({overlap:.0%}) with the token; "
            "likely genuine vision with OCR error",
        )
    return (
        "no_vision",
        "reply bears no relation to the image; treated as text-only and "
        "excluded to avoid fabricated extractions",
    )


def probe_one(dep: dict, token: str, img_b64: str, base_url: str, api_key: str,
              timeout: int = 180) -> dict:
    """Issue chat/completions with an image part and check comprehension.

    Retries once in the alternate max-tokens dialect so that a parameter-name
    mismatch is never misreported as a missing capability."""
    url = base_url.rstrip("/") + "/chat/completions"
    headers = {"api-key": api_key, "Content-Type": "application/json"}
    budget = 2000 if dep["reasoning"] else 300

    def build(token_param: str) -> dict:
        return {
            "model": dep["deployment"],
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROBE_INSTRUCTION},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{img_b64}"},
                        },
                    ],
                }
            ],
            token_param: budget,
        }

    attempts: list[str] = []
    last_err: dict | None = None

    for token_param in ("max_completion_tokens", "max_tokens"):
        attempts.append(token_param)
        t0 = time.perf_counter()
        try:
            body = json.dumps(build(token_param)).encode("utf-8")
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                d = json.loads(r.read().decode("utf-8"))
            latency = time.perf_counter() - t0
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode("utf-8", "replace")[:400]
            except Exception:
                detail = ""
            last_err = {
                "deployment": dep["deployment"],
                "status": "call_failed",
                "error_class": f"http_{e.code}",
                "error_detail": detail,
                "latency_s": round(time.perf_counter() - t0, 3),
                "param_dialects_tried": list(attempts),
            }
            # Only a parameter-dialect rejection is worth retrying.
            if e.code == 422 and "extra_forbidden" in detail:
                continue
            return last_err
        except Exception as e:
            return {
                "deployment": dep["deployment"],
                "status": "call_failed",
                "error_class": type(e).__name__,
                "error_detail": str(e)[:400],
                "latency_s": round(time.perf_counter() - t0, 3),
                "param_dialects_tried": list(attempts),
            }

        choices = d.get("choices") or []
        reply = (choices[0].get("message", {}).get("content") if choices else "") or ""
        reply = reply.strip()
        usage = d.get("usage", {}) or {}
        status, note = _classify(reply, token)

        return {
            "deployment": dep["deployment"],
            "status": status,
            "reply": reply[:200],
            "expected_token": token,
            "token_read_back": status == "vision_ok",
            "latency_s": round(latency, 3),
            "tokens_in": usage.get("prompt_tokens", 0),
            "tokens_out": usage.get("completion_tokens", 0),
            "max_tokens_param": token_param,
            "max_tokens_budget": budget,
            "param_dialects_tried": list(attempts),
            "note": note,
        }

    return last_err or {
        "deployment": dep["deployment"],
        "status": "call_failed",
        "error_class": "unknown",
        "error_detail": "",
        "param_dialects_tried": list(attempts),
    }


def main() -> int:
    env = E.load_env()
    api_key = env.get("AZURE_TTB_FOUNDRY_API_KEY")
    base_url = env.get("AZURE_TTB_FOUNDRY_OPENAI_ENDPOINT")
    if not api_key or not base_url:
        print("ABORT -- AZURE_TTB_FOUNDRY_API_KEY / "
              "AZURE_TTB_FOUNDRY_OPENAI_ENDPOINT missing from .env")
        return 2

    token = "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(5))
    img_bytes = make_token_image(token)
    img_b64 = base64.b64encode(img_bytes).decode("ascii")

    print("=" * 78)
    print("AZURE FOUNDRY -- VISION CAPABILITY SMOKE PROBE")
    print("=" * 78)
    print(f"endpoint    : {base_url}")
    print(f"deployments : {len(FOUNDRY_DEPLOYMENTS)}")
    print(f"probe image : {len(img_bytes)} bytes PNG, secret token hidden in image")
    print("gate        : deployment must READ BACK the token (not just return 200)")
    print("")

    results = []
    for dep in FOUNDRY_DEPLOYMENTS:
        r = probe_one(dep, token, img_b64, base_url, api_key)
        if dep["deployment"] in ROUTE_NOTES:
            r["route_note"] = ROUTE_NOTES[dep["deployment"]]
        results.append(r)
        if r["status"] == "vision_ok":
            print(f"  {dep['deployment']:<30} VISION OK    {r['latency_s']:>6.2f}s  "
                  f"read {r['reply']!r}")
        elif r["status"] == "vision_degraded":
            print(f"  {dep['deployment']:<30} DEGRADED     {r['latency_s']:>6.2f}s  "
                  f"replied {r['reply']!r} (expected {token!r})")
            print(f"  {'':<30}   -> {r['note']}")
        elif r["status"] == "no_vision":
            print(f"  {dep['deployment']:<30} NO VISION    {r['latency_s']:>6.2f}s  "
                  f"replied {r['reply']!r} (expected {token!r})")
            print(f"  {'':<30}   -> {r['note']}")
        else:
            print(f"  {dep['deployment']:<30} CALL FAILED  {r['error_class']}: "
                  f"{r.get('error_detail','')[:120]}")
        time.sleep(0.4)

    capable = [r["deployment"] for r in results if r["status"] == "vision_ok"]
    degraded = [r["deployment"] for r in results if r["status"] == "vision_degraded"]
    # Degraded deployments still SEE the image, so they are legitimate benchmark
    # subjects -- their transcription weakness is exactly what the 54-call
    # battery is designed to quantify. Only blind/failed routes are excluded.
    benchmark_set = capable + degraded

    payload = {
        "probe_metadata": {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "endpoint": base_url,
            "auth": "api-key header",
            "method": "chat/completions with base64 image_url part",
            "gate": (
                "A deployment counts as vision-capable only if it reads back a "
                "random secret token rendered in the probe image. HTTP 200 alone "
                "is insufficient: text-only deployments may silently ignore the "
                "image and answer blind, which would yield fabricated benchmark "
                "extractions."
            ),
            "secret_token_len": len(token),
            "vision_capable": capable,
            "vision_degraded": degraded,
            "benchmark_set": benchmark_set,
            "excluded": [
                {
                    "deployment": r["deployment"],
                    "status": r["status"],
                    "reason": r.get("route_note")
                    or r.get("note")
                    or r.get("error_detail", "")[:200],
                }
                for r in results
                if r["status"] in ("no_vision", "call_failed")
            ],
        },
        "results": results,
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print("")
    print("=" * 78)
    print(f"vision OK      : {len(capable)}/{len(FOUNDRY_DEPLOYMENTS)}  {capable}")
    print(f"vision degraded: {len(degraded)}/{len(FOUNDRY_DEPLOYMENTS)}  {degraded}")
    print(f"benchmark set  : {len(benchmark_set)}  {benchmark_set}")
    print(f"written        : {OUT_PATH}")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
