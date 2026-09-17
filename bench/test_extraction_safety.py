#!/usr/bin/env python3
"""Offline boundary regressions. Provider transport is stubbed; no secrets/network."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import engines as E
import scoring as S
from test_scoring import CLEAN_APP, good_extraction, v

TEXT_KEYS = E.EXTRACTION_SCHEMA_FIELDS[:8]
FLAG_KEYS = E.EXTRACTION_SCHEMA_FIELDS[8:]
WARNING_KEYS = E.EXTRACTION_SCHEMA_FIELDS[6:]
BAD_CONFIDENCE = [None, True, False, "0.99", [], {}, float("nan"),
                  float("inf"), -float("inf"), -0.01, 1.01, 10**400]


class ExtractionSafetyTests(unittest.TestCase):
    def adapter(self, ex):
        reply = {"raw_text": json.dumps(ex), "tokens_in": 0, "tokens_out": 0}
        with patch.dict(E._DISPATCH, {"openai": lambda *a: reply}):
            return E.call_engine("gpt-5-mini", "not-read.png", {})

    def assert_referral(self, call, field):
        app = dict(CLEAN_APP, is_imported=True, country_of_origin="Scotland")
        self.assertEqual(v(call, app, field), S.NEEDS_REVIEW)
        if field != "brand_name":
            self.assertEqual(v(call, app, "brand_name"), S.MATCH)

    def test_valid_contract_including_nulls_and_confidence_bounds(self):
        for c in [0, 0.75, 1]:
            call = good_extraction()
            call["extracted"]["confidence"] = {k: c for k in E.EXTRACTION_SCHEMA_FIELDS}
            self.assertTrue(self.adapter(call["extracted"])["schema_valid"])
        for key in E.EXTRACTION_SCHEMA_FIELDS:
            with self.subTest(key=key):
                self.assertTrue(self.adapter(good_extraction(**{key: None})["extracted"])["schema_valid"])

    def test_absent_confidence_never_certifies_clean_oracle(self):
        call = good_extraction()
        del call["extracted"]["confidence"]
        self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
        result = v(call)
        for key in S.FIELDS:
            self.assertEqual(result[key], S.NOT_APPLICABLE if key == "country_of_origin" else S.NEEDS_REVIEW)

    def test_malformed_confidence_map(self):
        for value in [None, [], "high", True]:
            with self.subTest(value=value):
                call = good_extraction()
                call["extracted"]["confidence"] = value
                self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
                self.assert_referral(call, "brand_name")

    def test_every_component_requires_its_own_valid_confidence(self):
        for key in E.EXTRACTION_SCHEMA_FIELDS:
            for value in ["MISSING"] + BAD_CONFIDENCE:
                with self.subTest(key=key, value=value):
                    call = good_extraction(country_of_origin="Scotland")
                    if value == "MISSING":
                        del call["extracted"]["confidence"][key]
                    else:
                        call["extracted"]["confidence"][key] = value
                    self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
                    self.assert_referral(call, "government_warning" if key in WARNING_KEYS else key)

    def test_low_confidence_all_warning_components_gate(self):
        for key in WARNING_KEYS:
            with self.subTest(key=key):
                call = good_extraction()
                call["extracted"]["confidence"][key] = 0.01
                self.assert_referral(call, "government_warning")

    def test_aggregate_warning_confidence_cannot_replace_components(self):
        call = good_extraction()
        for key in WARNING_KEYS:
            del call["extracted"]["confidence"][key]
        call["extracted"]["confidence"]["government_warning"] = 0.99
        self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
        self.assert_referral(call, "government_warning")

    def test_optional_aggregate_cannot_override_component_uncertainty(self):
        for value in BAD_CONFIDENCE + [0.01]:
            with self.subTest(value=value):
                call = good_extraction()
                call["extracted"]["confidence"]["government_warning"] = value
                self.assert_referral(call, "government_warning")
        call = good_extraction()
        call["extracted"]["confidence"]["government_warning"] = 1
        call["extracted"]["confidence"]["government_warning_body_bold"] = 0.01
        self.assert_referral(call, "government_warning")

    def test_invalid_value_types_cannot_be_trusted_via_schema_valid_true(self):
        for key in E.EXTRACTION_SCHEMA_FIELDS:
            bad = [True, 40, [], {}] if key in TEXT_KEYS else ["true", "false", 0, 1, [], {}]
            for value in bad:
                with self.subTest(key=key, value=value):
                    call = good_extraction(**{key: value})
                    self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
                    self.assert_referral(call, "government_warning" if key in WARNING_KEYS else key)

    def test_deleted_keys_block_affected_fields_despite_claimed_validity(self):
        for key in E.EXTRACTION_SCHEMA_FIELDS:
            with self.subTest(key=key):
                call = good_extraction()
                del call["extracted"][key]
                self.assertFalse(self.adapter(call["extracted"])["schema_valid"])
                self.assert_referral(call, "government_warning" if key in WARNING_KEYS else key)

    def test_nonobject_extractions_are_referrals_not_exceptions(self):
        for ex in [None, [], ["brand_name"], "bad", True, 4]:
            with self.subTest(ex=ex):
                call = {"ok": True, "schema_valid": True, "extracted": ex}
                self.assertTrue(all(x["verdict"] == S.NEEDS_REVIEW for x in S.derive_verdicts(call, CLEAN_APP).values()))

    def test_warning_unreadable_or_unknown_formatting_refers(self):
        for key in WARNING_KEYS:
            values = [None, "", "  "] if key in TEXT_KEYS else [None, "false", "true"]
            for value in values:
                with self.subTest(key=key, value=value):
                    call = good_extraction(**{key: value})
                    self.assert_referral(call, "government_warning")
                    self.assertEqual(S.rule_government_warning(call["extracted"])[0], S.NEEDS_REVIEW)

    def test_confident_nonbold_heading_is_mismatch(self):
        self.assertEqual(v(good_extraction(government_warning_heading_bold=False), field="government_warning"), S.MISMATCH)

    def test_genuinely_unreadable_field_is_review(self):
        call = good_extraction(brand_name=None)
        call["extracted"]["confidence"]["brand_name"] = 0.01
        self.assert_referral(call, "brand_name")

    def test_bottler_requires_full_declared_identity(self):
        app = dict(CLEAN_APP, bottler_info="Harbor Cellars, 999 Wrong Road, Miami FL")
        for value in [None, "", "Harbor Cellars", "Produced and bottled by Harbor Cellars", "Harbor Cellars, 999", "999 Wrong Road, Miami FL"]:
            with self.subTest(value=value):
                self.assertEqual(v(good_extraction(bottler_info=value), app, "bottler_info"), S.NEEDS_REVIEW)
        for value in ["Harbor Cellars, 123 Right Road, Miami FL", "Other Cellars, 999 Wrong Road, Miami FL", "Harbor Cellars, 999 Wrong Road, Miami FL and Other Cellars, Tampa FL"]:
            with self.subTest(value=value):
                self.assertEqual(v(good_extraction(bottler_info=value), app, "bottler_info"), S.MISMATCH)

    def test_full_bottler_matches_normalization_and_known_prefixes(self):
        app = dict(CLEAN_APP, bottler_info="Harbor Cellars, 999 Wrong Road, Miami FL")
        for prefix in ["", "Produced and bottled by ", "Distilled and bottled by ", "Brewed and bottled by ", "Imported by ", "Bottled by "]:
            with self.subTest(prefix=prefix):
                value = prefix + "HARBOR  Cellars,\n999 Wrong Road, Miami FL"
                self.assertEqual(v(good_extraction(bottler_info=value), app, "bottler_info"), S.MATCH)


if __name__ == "__main__":
    unittest.main(verbosity=2)
