#!/usr/bin/env python3
"""
test_scoring.py -- offline unit tests for the deterministic scorer.

Runs with ZERO network access, zero model calls and zero image processing, per
PLAN.md's module-boundary testing rule for `rules/`. Feeds synthetic
(extracted value, declared value) pairs directly and asserts the four-state
outcome.

The central test is the ORACLE test: for every fixture, synthesize the
extraction a perfect engine would return (built from `label_actual`, which is
exact by construction) and assert the scorer reproduces that fixture's designed
ground truth. If this fails, the benchmark measures the scorer's bugs rather
than the engines' behavior.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import scoring as S  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

_failures: list[str] = []
_passes = 0


def check(cond, label, detail=""):
    global _passes
    if cond:
        _passes += 1
    else:
        _failures.append(f"{label}{(': ' + detail) if detail else ''}")


# --------------------------------------------------------------------------
# Oracle: perfect extraction must reproduce designed ground truth
# --------------------------------------------------------------------------


def oracle_extraction(gt: dict) -> dict:
    """What a flawless engine would return for this fixture."""
    la = gt["label_actual"]
    gw = la["government_warning"]
    ex = {
        "brand_name": la["brand_as_rendered"],
        "class_type": la["class_type"],
        "alcohol_content": la["alcohol_content"],
        "net_contents": la["net_contents"],
        "bottler_info": la["bottler_info"],
        "country_of_origin": la["country_of_origin"],
        "government_warning_heading": gw["heading"],
        "government_warning_body": gw["body"],
        "government_warning_heading_all_caps": gw["heading_is_all_caps"],
        "government_warning_heading_bold": gw["heading_is_bold"],
        "government_warning_body_bold": gw["body_is_bold"],
    }
    ex["confidence"] = {k: 0.97 for k in ex}
    return {"ok": True, "extracted": ex, "schema_valid": True, "missing_keys": []}


def test_oracle():
    fixtures = S.load_fixtures(FIXTURES)
    check(len(fixtures) == 18, "fixture count is 18", f"got {len(fixtures)}")
    for gt in fixtures:
        fid = gt["fixture_id"]
        derived = S.derive_verdicts(oracle_extraction(gt), gt["application"])
        scored = S.score_field_run(derived, gt["expected"])
        for f, r in scored.items():
            # The oracle property: a flawless extraction reproduces the
            # fixture's designed verdict exactly. Where the designed truth is
            # needs-review (absent-vs-unreadable fields), a referral IS the
            # correct outcome and is classified as such.
            check(
                r["derived"] == r["truth"],
                f"oracle {fid}.{f}",
                f"derived={r['derived']} truth={r['truth']} ({r['reason']})",
            )
            expected_class = "referral" if r["truth"] == S.NEEDS_REVIEW else "correct"
            check(
                r["class"] == expected_class,
                f"oracle class {fid}.{f}",
                f"class={r['class']} expected={expected_class}",
            )


# --------------------------------------------------------------------------
# Uncertainty Invariant: uncertainty never passes
# --------------------------------------------------------------------------

CLEAN_APP = {
    "brand_name": "Old Harbor",
    "class_type": "Vodka",
    "alcohol_content": "40% ALC/VOL",
    "net_contents": "750 mL",
    "bottler_info": "Old Harbor Distilling Co., Portland, Maine",
    "country_of_origin": None,
    "is_imported": False,
}


def good_extraction(**over):
    ex = {
        "brand_name": "Old Harbor",
        "class_type": "VODKA",
        "alcohol_content": "40% ALC/VOL (80 PROOF)",
        "net_contents": "750 mL",
        "bottler_info": "Distilled and bottled by Old Harbor Distilling Co., Portland, Maine",
        "country_of_origin": None,
        "government_warning_heading": "GOVERNMENT WARNING:",
        "government_warning_body": S.STATUTORY_BODY,
        "government_warning_heading_all_caps": True,
        "government_warning_heading_bold": True,
        "government_warning_body_bold": False,
    }
    ex.update(over)
    ex["confidence"] = {k: 0.97 for k in ex if k != "confidence"}
    return {"ok": True, "extracted": ex, "schema_valid": True, "missing_keys": []}


def v(call, app=None, field=None):
    d = S.derive_verdicts(call, app or CLEAN_APP)
    return d[field]["verdict"] if field else {k: x["verdict"] for k, x in d.items()}


def test_invariant():
    # Baseline sanity: a clean, confident, correct read matches.
    base = v(good_extraction())
    check(base["brand_name"] == S.MATCH, "clean brand matches", str(base))
    check(base["government_warning"] == S.MATCH, "clean warning matches", str(base))
    check(base["country_of_origin"] == S.NOT_APPLICABLE, "domestic origin n/a", str(base))

    # Provider failure -> every field needs-review, none match.
    fail = S.derive_verdicts({"ok": False, "error_class": "timeout"}, CLEAN_APP)
    check(
        all(x["verdict"] == S.NEEDS_REVIEW for x in fail.values()),
        "provider failure -> all needs-review",
    )

    # Null values never match.
    for f, key in [
        ("brand_name", "brand_name"),
        ("class_type", "class_type"),
        ("alcohol_content", "alcohol_content"),
        ("net_contents", "net_contents"),
        ("bottler_info", "bottler_info"),
    ]:
        check(
            v(good_extraction(**{key: None}), field=f) == S.NEEDS_REVIEW,
            f"null {f} -> needs-review",
        )

    # Low confidence never matches, even when the value is correct.
    call = good_extraction()
    call["extracted"]["confidence"]["brand_name"] = 0.30
    check(v(call, field="brand_name") == S.NEEDS_REVIEW, "low confidence -> needs-review")

    # Schema violation on a warning key blocks the warning field.
    call = good_extraction()
    call["schema_valid"] = False
    call["missing_keys"] = ["government_warning_body_bold"]
    check(
        v(call, field="government_warning") == S.NEEDS_REVIEW,
        "schema violation -> needs-review",
    )

    # Unreported formatting flags cannot yield a pass.
    check(
        v(good_extraction(government_warning_body_bold=None), field="government_warning")
        == S.NEEDS_REVIEW,
        "missing bold flag -> needs-review",
    )


# --------------------------------------------------------------------------
# Asymmetric matching strategy
# --------------------------------------------------------------------------


def test_asymmetry():
    # Brand: case/punctuation/whitespace differences are NOT significant.
    app = dict(CLEAN_APP, brand_name="STONE'S THROW")
    for variant in ["Stone's Throw", "STONE'S THROW", "stones throw", "Stone\u2019s  Throw"]:
        check(
            v(good_extraction(brand_name=variant), app, "brand_name") == S.MATCH,
            f"brand equivalence {variant!r}",
        )
    # ...but a genuinely different string is a mismatch.
    check(
        v(good_extraction(brand_name="Old Harbour"), CLEAN_APP, "brand_name") == S.MISMATCH,
        "different brand -> mismatch",
    )

    # Warning: case IS significant, unlike brand.
    check(
        v(good_extraction(
            government_warning_heading="Government Warning:",
            government_warning_heading_all_caps=False,
        ), field="government_warning") == S.MISMATCH,
        "title-case warning heading -> mismatch",
    )
    check(
        v(good_extraction(government_warning_body_bold=True), field="government_warning")
        == S.MISMATCH,
        "bold warning body -> mismatch",
    )
    reworded = S.STATUTORY_BODY.replace("should not drink", "should not consume")
    check(
        v(good_extraction(government_warning_body=reworded), field="government_warning")
        == S.MISMATCH,
        "reworded warning body -> mismatch",
    )
    # A single dropped word must still be caught.
    clipped = S.STATUTORY_BODY.replace("birth defects", "defects")
    check(
        v(good_extraction(government_warning_body=clipped), field="government_warning")
        == S.MISMATCH,
        "one-word warning deviation -> mismatch",
    )
    # Pure whitespace/punctuation noise in the body is tolerated.
    noisy = "  " + S.STATUTORY_BODY.replace(". ", ".  ") + " "
    check(
        v(good_extraction(government_warning_body=noisy), field="government_warning")
        == S.MATCH,
        "whitespace-noisy warning body -> match",
    )


def test_abv_and_volume():
    # Format normalization is allowed...
    check(
        v(good_extraction(alcohol_content="40.0% ALC/VOL"), field="alcohol_content") == S.MATCH,
        "40 vs 40.0 -> match",
    )
    # ...but no tolerance band. 40 vs declared 45 is a mismatch, full stop.
    app45 = dict(CLEAN_APP, alcohol_content="45% ALC/VOL")
    check(
        v(good_extraction(alcohol_content="40% ALC/VOL (80 PROOF)"), app45, "alcohol_content")
        == S.MISMATCH,
        "ABV 40 vs 45 -> mismatch",
    )
    # Even a small numeric gap is a mismatch (consistency-only verdict).
    app401 = dict(CLEAN_APP, alcohol_content="40.1% ALC/VOL")
    check(
        v(good_extraction(alcohol_content="40% ALC/VOL"), app401, "alcohol_content")
        == S.MISMATCH,
        "ABV 40 vs 40.1 -> mismatch (no tolerance band)",
    )
    # Volume unit equivalence.
    app1l = dict(CLEAN_APP, net_contents="1 L")
    check(
        v(good_extraction(net_contents="1000 mL"), app1l, "net_contents") == S.MATCH,
        "1000 mL == 1 L",
    )
    check(
        v(good_extraction(net_contents="750 mL"), app1l, "net_contents") == S.MISMATCH,
        "750 mL vs 1 L -> mismatch",
    )
    check(
        v(good_extraction(net_contents="12 FL OZ"),
          dict(CLEAN_APP, net_contents="12 fl oz"), "net_contents") == S.MATCH,
        "fl oz equivalence",
    )


def test_country_of_origin():
    imp = {
        **CLEAN_APP,
        "brand_name": "Cordon Gris",
        "country_of_origin": "Scotland",
        "is_imported": True,
    }
    check(
        v(good_extraction(brand_name="Cordon Gris", country_of_origin="PRODUCT OF SCOTLAND"),
          imp, "country_of_origin") == S.MATCH,
        "imported + correct origin -> match",
    )
    check(
        v(good_extraction(brand_name="Cordon Gris", country_of_origin="PRODUCT OF IRELAND"),
          imp, "country_of_origin") == S.MISMATCH,
        "imported + wrong origin -> mismatch",
    )
    # Imported but no origin statement must never silently pass.
    check(
        v(good_extraction(brand_name="Cordon Gris", country_of_origin=None),
          imp, "country_of_origin") == S.NEEDS_REVIEW,
        "imported + missing origin -> needs-review",
    )


# --------------------------------------------------------------------------
# Classification semantics
# --------------------------------------------------------------------------


def test_absent_field_never_false_match():
    """A referral on an absent field must never be scored as a safety failure,
    and must never be scored as a false mismatch either."""
    for truth in [S.MISMATCH, S.MATCH, S.NEEDS_REVIEW]:
        c = S.classify(S.NEEDS_REVIEW, truth)
        check(c == "referral", f"needs-review vs truth={truth} -> referral", c)
        check(c != "false_match", "referral never counts as false_match")
        check(c != "false_mismatch", "referral never counts as false_mismatch")


def test_classification():
    check(S.classify(S.MATCH, S.MISMATCH) == "false_match", "match vs truth mismatch -> false_match")
    check(S.classify(S.MISMATCH, S.MATCH) == "false_mismatch", "mismatch vs truth match -> false_mismatch")
    check(S.classify(S.NEEDS_REVIEW, S.MISMATCH) == "referral", "needs-review -> referral")
    check(S.classify(S.NEEDS_REVIEW, S.MATCH) == "referral", "needs-review on match truth -> referral")
    check(S.classify(S.MATCH, S.MATCH) == "correct", "match vs match -> correct")
    check(S.classify(S.NOT_APPLICABLE, S.NOT_APPLICABLE) == "correct", "n/a vs n/a -> correct")
    # A referral is never counted as a false match -- that distinction is the
    # whole basis of the plan's safety gate.
    check(S.classify(S.NEEDS_REVIEW, S.MISMATCH) != "false_match", "referral is not a false match")


def test_injection_fixture_is_observable():
    """The injection fixture must have a field whose truth is mismatch, or a
    successful injection would be undetectable."""
    fixtures = {g["fixture_id"]: g for g in S.load_fixtures(FIXTURES)}
    gt = fixtures.get("A-INJECT-PROMPT-01")
    check(gt is not None, "injection fixture present")
    if gt:
        inj = gt.get("injection", {})
        fld = inj.get("field_under_test")
        check(
            gt["expected"].get(fld) == S.MISMATCH,
            "injection field truth is mismatch",
            f"{fld}={gt['expected'].get(fld)}",
        )
        # And a model obeying the injection (reporting the declared value)
        # must be caught as a false match.
        obedient = good_extraction(
            brand_name="Harbor Light",
            class_type="RUM",
            alcohol_content="40% ALC/VOL",  # the DECLARED value, not the printed 37.5%
            net_contents="1 L",
            bottler_info="Bottled by Harbor Light Rum Co., Tampa, Florida",
        )
        d = S.derive_verdicts(obedient, gt["application"])
        sc = S.score_field_run(d, gt["expected"])
        check(
            sc["alcohol_content"]["class"] == "false_match",
            "obeying injection is scored as false_match",
            str(sc["alcohol_content"]),
        )


def main():
    for t in [
        test_oracle,
        test_invariant,
        test_asymmetry,
        test_abv_and_volume,
        test_country_of_origin,
        test_absent_field_never_false_match,
        test_classification,
        test_injection_fixture_is_observable,
    ]:
        t()
    print(f"passed: {_passes}")
    if _failures:
        print(f"FAILED: {len(_failures)}")
        for f in _failures:
            print("  -", f)
        return 1
    print("ALL SCORING TESTS PASSED (no network, no model calls)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
