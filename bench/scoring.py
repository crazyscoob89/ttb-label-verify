#!/usr/bin/env python3
"""
scoring.py -- deterministic verdict derivation and benchmark classification.

This is the `rules/`-equivalent layer for the benchmark. Per PLAN.md it is pure,
deterministic code: it takes an already-extracted field set and the
applicant-declared record and returns one of four outcomes per field. It makes
no network calls, imports no provider SDK, and never asks a model anything.

The model is never consulted about compliance. Every verdict in the benchmark is
produced here, which is exactly what makes the prompt-injection fixture
meaningful: injected text can at most corrupt an extracted *value*, it cannot
reach the verdict logic.

Asymmetric matching strategy (PLAN.md):
  brand_name          normalized equivalence (case/whitespace/punctuation tolerant)
  class_type          normalized equivalence
  alcohol_content     numeric consistency, format-normalized, NO tolerance band
  net_contents        numeric compare after unit normalization to mL
  bottler_info        full normalized identity/address (known label prefix allowed)
  country_of_origin   not-applicable unless the application declares an import
  government_warning  EXACT statutory wording + heading caps/bold + body non-bold

Uncertainty Invariant (PLAN.md): a field may resolve to `match` only if
extraction was confident AND the rule affirmed it. Null values, sub-threshold
confidence, schema violations and provider failures all route to `needs-review`.
There is no code path here in which absence of a definitive answer yields
`match`.

DESIGN DECISION -- absent-vs-unreadable (resolves the open question
BENCHMARK_PLAN.md left to implementation for A-FIELD-MISSING-01):

  A missing value is ALWAYS routed to `needs-review`, never to `mismatch`.

  Rationale: the extraction layer cannot distinguish "this field is genuinely
  absent from the label" from "this field is present but I could not read it"
  -- both arrive here as null. Treating null as an affirmative regulatory
  violation would mean a glare-obscured or blurred field gets reported as a
  confident finding of absence, which is a fabricated conclusion the evidence
  does not support. PLAN.md permits `mismatch` for affirmative absence, but
  only where absence is genuinely established; from a photo alone it is not.

  Consequence for scoring: on fixtures whose designed truth is `mismatch`
  because a required field is absent, even a flawless engine yields a
  referral. That is the correct, safe outcome -- a human is asked to confirm
  the field really is missing. It is counted in the referral rate (workload),
  never as a false match (safety) or false mismatch (annoyance). Determining
  affirmative absence is a human judgment, not a vision-model judgment.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

from extraction_validation import field_confidence, validate_extraction

CONFIDENCE_THRESHOLD = 0.75

FIELDS = [
    "brand_name",
    "class_type",
    "alcohol_content",
    "net_contents",
    "bottler_info",
    "country_of_origin",
    "government_warning",
]

MATCH = "match"
MISMATCH = "mismatch"
NOT_APPLICABLE = "not-applicable"
NEEDS_REVIEW = "needs-review"

STATUTORY_HEADING_CORE = "GOVERNMENT WARNING"
STATUTORY_BODY = (
    "(1) According to the Surgeon General, women should not drink alcoholic "
    "beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a "
    "car or operate machinery, and may cause health problems."
)

# Net-contents unit conversion needs a rounding epsilon (fl oz -> mL is not
# exact). This is unit-conversion slack ONLY. It is deliberately NOT a
# regulatory tolerance band, and no equivalent slack exists for ABV.
VOLUME_REL_EPSILON = 0.005


# --------------------------------------------------------------------------
# Normalization helpers
# --------------------------------------------------------------------------


def norm_text(s) -> str:
    """Case-insensitive, whitespace- and punctuation-tolerant normalization."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u2014", " ").replace("\u2013", " ")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def norm_words(s) -> str:
    """Whitespace/punctuation-normalized but word-preserving (for wording checks)."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.lower()
    s = re.sub(r"[^a-z0-9()]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_abv(s):
    """First percentage-like number. '40% ALC/VOL (80 PROOF)' -> 40.0"""
    if s is None:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", str(s))
    if not m:
        m = re.search(r"(\d+(?:\.\d+)?)", str(s))
    return float(m.group(1)) if m else None


def parse_volume_ml(s):
    """Normalize a net-contents statement to millilitres."""
    if s is None:
        return None
    t = str(s).lower().replace(",", "")
    t = t.replace("millilitres", "ml").replace("milliliters", "ml").replace("litres", "l")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(ml|l\b|liter|litre|fl\s*\.?\s*oz|fluid\s*ounce)", t)
    if not m:
        return None
    val, unit = float(m.group(1)), m.group(2).replace(" ", "").replace(".", "")
    if unit == "ml":
        return val
    if unit in ("l", "liter", "litre"):
        return val * 1000.0
    return val * 29.5735295625


# --------------------------------------------------------------------------
# Confidence
# --------------------------------------------------------------------------

def _confident(extracted: dict, field: str) -> bool:
    c = field_confidence(extracted, field)
    return c is not None and c >= CONFIDENCE_THRESHOLD


# --------------------------------------------------------------------------
# Per-field rules
# --------------------------------------------------------------------------


def rule_brand(extracted, app):
    v = extracted.get("brand_name")
    if v is None or not str(v).strip():
        return NEEDS_REVIEW, "no value extracted"
    return (
        (MATCH, "normalized equivalence")
        if norm_text(v) == norm_text(app.get("brand_name"))
        else (MISMATCH, f"{v!r} vs declared {app.get('brand_name')!r}")
    )


def rule_class_type(extracted, app):
    v = extracted.get("class_type")
    if v is None or not str(v).strip():
        return NEEDS_REVIEW, "no value extracted"
    return (
        (MATCH, "normalized equivalence")
        if norm_text(v) == norm_text(app.get("class_type"))
        else (MISMATCH, f"{v!r} vs declared {app.get('class_type')!r}")
    )


def rule_abv(extracted, app):
    """Pure label-vs-application consistency. No regulatory tolerance band."""
    v = parse_abv(extracted.get("alcohol_content"))
    d = parse_abv(app.get("alcohol_content"))
    if v is None:
        return NEEDS_REVIEW, "no readable ABV"
    if d is None:
        return NEEDS_REVIEW, "no declared ABV to compare"
    return (
        (MATCH, f"{v} == {d}")
        if abs(v - d) < 1e-9
        else (MISMATCH, f"label {v} vs declared {d}")
    )


def rule_net_contents(extracted, app):
    v = parse_volume_ml(extracted.get("net_contents"))
    d = parse_volume_ml(app.get("net_contents"))
    if v is None:
        # Absent-vs-unreadable is indistinguishable from a photo -- refer out.
        return NEEDS_REVIEW, "no readable net contents (absent or illegible)"
    if d is None:
        return NEEDS_REVIEW, "no declared net contents to compare"
    tol = max(abs(d) * VOLUME_REL_EPSILON, 0.01)
    return (
        (MATCH, f"{v:.2f}mL ~= {d:.2f}mL")
        if abs(v - d) <= tol
        else (MISMATCH, f"label {v:.2f}mL vs declared {d:.2f}mL")
    )


def rule_bottler(extracted, app):
    v = extracted.get("bottler_info")
    if v is None or not str(v).strip():
        # Absent-vs-unreadable is indistinguishable from a photo -- refer out.
        return NEEDS_REVIEW, "no value extracted (absent or illegible)"
    # Only a recognized, anchored role prefix may be omitted for comparison.
    # Arbitrary containment cannot certify a full name/address or extra entities.
    def identity(statement):
        return re.sub(
            r"^(?:(?:produced|distilled|brewed)(?: and bottled)?|bottled|imported) by\s+",
            "", norm_words(statement),
        )

    nv, nd = identity(v), identity(app.get("bottler_info"))
    if not nd:
        return NEEDS_REVIEW, "no declared bottler to compare"
    if not nv:
        return NEEDS_REVIEW, "no readable bottler identity"
    if nv == nd:
        return MATCH, "full normalized bottler identity and address"
    if nv in nd:
        return NEEDS_REVIEW, "partial bottler extraction cannot certify full declared identity"
    return MISMATCH, f"{v!r} vs declared {app.get('bottler_info')!r}"


def rule_country_of_origin(extracted, app):
    """Only evaluated for imported products (PLAN.md commodity-aware rules)."""
    if not app.get("is_imported"):
        return NOT_APPLICABLE, "domestic product"
    v = extracted.get("country_of_origin")
    if v is None or not str(v).strip():
        return NEEDS_REVIEW, "imported but no origin statement extracted"
    declared = norm_text(app.get("country_of_origin"))
    return (
        (MATCH, "declared country present in origin statement")
        if declared and declared in norm_text(v)
        else (MISMATCH, f"{v!r} vs declared {app.get('country_of_origin')!r}")
    )


def rule_government_warning(extracted, app=None):
    """Strictest check in the system. Exact statutory wording + formatting.

    Deviation in heading text/capitalization, a non-bold heading, a bold body,
    or any wording change in the statutory statement is a mismatch. This field
    gets no fuzzy matching.
    """
    heading = extracted.get("government_warning_heading")
    body = extracted.get("government_warning_body")
    caps = extracted.get("government_warning_heading_all_caps")
    head_bold = extracted.get("government_warning_heading_bold")
    body_bold = extracted.get("government_warning_body_bold")

    if not all(isinstance(value, str) and value.strip() for value in (heading, body)):
        return NEEDS_REVIEW, "warning partially unreadable"
    if not all(type(value) is bool for value in (caps, head_bold, body_bold)):
        return NEEDS_REVIEW, "formatting flags missing or invalid"

    # Heading: tolerate colon/whitespace variance, but capitalization is
    # load-bearing and is compared case-sensitively.
    core = str(heading).strip().rstrip(":").strip()
    if core != STATUTORY_HEADING_CORE:
        return MISMATCH, f"heading {heading!r} != {STATUTORY_HEADING_CORE + ':'!r}"
    if caps is False:
        return MISMATCH, "heading not in all capital letters"
    if head_bold is False:
        return MISMATCH, "heading not bold"
    if body_bold is True:
        return MISMATCH, "warning body rendered in bold (heading must stand out)"

    if norm_words(body) != norm_words(STATUTORY_BODY):
        return MISMATCH, "statutory wording deviation in warning body"

    return MATCH, "exact statutory wording and formatting"


_RULES = {
    "brand_name": rule_brand,
    "class_type": rule_class_type,
    "alcohol_content": rule_abv,
    "net_contents": rule_net_contents,
    "bottler_info": rule_bottler,
    "country_of_origin": rule_country_of_origin,
    "government_warning": rule_government_warning,
}


# --------------------------------------------------------------------------
# Verdict derivation
# --------------------------------------------------------------------------


def derive_verdicts(call_result: dict, app: dict) -> dict:
    """Map one extraction call onto the four-state outcome for all 7 fields."""
    # Provider failure or schema violation: every field is unresolved.
    if not call_result.get("ok"):
        reason = call_result.get("error_class", "extraction-failed")
        return {
            f: {"verdict": NEEDS_REVIEW, "reason": f"extraction failure: {reason}"}
            for f in FIELDS
        }

    extracted = call_result.get("extracted")
    # Revalidate locally: schema_valid is metadata, never authority to bypass
    # type/confidence checks (including when scoring historical cached calls).
    errors = validate_extraction(extracted)
    if not isinstance(extracted, dict):
        return {
            f: {"verdict": NEEDS_REVIEW, "reason": "schema-validation-failed"}
            for f in FIELDS
        }
    invalid = set(errors)
    if not call_result.get("schema_valid", True):
        invalid.update(call_result.get("missing_keys") or [])
    blocked = {
        "government_warning" if key.startswith("government_warning") else key
        for key in invalid
    }
    if "confidence" in blocked:
        blocked.update(FIELDS)

    out = {}
    for f in FIELDS:
        # country_of_origin applicability is decided by the declared record,
        # never by the model, so it is resolved before any confidence gate.
        if f == "country_of_origin" and not app.get("is_imported"):
            out[f] = {"verdict": NOT_APPLICABLE, "reason": "domestic product"}
            continue
        if f in blocked:
            out[f] = {"verdict": NEEDS_REVIEW, "reason": "schema-validation-failed"}
            continue
        if not _confident(extracted, f):
            c = field_confidence(extracted, f)
            out[f] = {
                "verdict": NEEDS_REVIEW,
                "reason": f"confidence {c} below threshold {CONFIDENCE_THRESHOLD}",
            }
            continue
        verdict, reason = _RULES[f](extracted, app)
        out[f] = {"verdict": verdict, "reason": reason}
    return out


# --------------------------------------------------------------------------
# Benchmark classification
# --------------------------------------------------------------------------


def classify(derived: str, truth: str) -> str:
    """Classify one field outcome against the fixture's designed truth.

    false_match is the disqualifying error: truth says the label disagrees with
    the application, but the pipeline said it was fine.
    """
    if derived == NEEDS_REVIEW:
        return "referral"
    if truth == MISMATCH and derived == MATCH:
        return "false_match"
    if truth == MATCH and derived == MISMATCH:
        return "false_mismatch"
    if derived == truth:
        return "correct"
    return "other_incorrect"


def score_field_run(derived_verdicts: dict, expected: dict) -> dict:
    per_field = {}
    for f in FIELDS:
        dv = derived_verdicts[f]["verdict"]
        tv = expected[f]
        per_field[f] = {
            "derived": dv,
            "truth": tv,
            "class": classify(dv, tv),
            "reason": derived_verdicts[f].get("reason", ""),
        }
    return per_field


def median(xs):
    s = sorted(xs)
    n = len(s)
    if not n:
        return 0.0
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def percentile(xs, p):
    s = sorted(xs)
    if not s:
        return 0.0
    k = (len(s) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def load_fixtures(fixtures_dir: Path) -> list[dict]:
    manifest = json.loads((fixtures_dir / "manifest.json").read_text(encoding="utf-8"))
    out = []
    for entry in manifest["fixtures"]:
        gt = json.loads(
            (fixtures_dir / f"ground_truth/{entry['fixture_id']}.json").read_text(encoding="utf-8")
        )
        gt["_image_path"] = fixtures_dir / f"images/{entry['fixture_id']}.png"
        out.append(gt)
    return out
