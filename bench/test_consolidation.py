#!/usr/bin/env python3
"""Canonical-root regression: do not substitute a historical Foundry scorer."""
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import engines as E
import scoring as S
from test_scoring import CLEAN_APP, good_extraction, v


class ConsolidationTests(unittest.TestCase):
    def test_root_import_and_positive_control(self):
        self.assertEqual(Path(S.__file__).resolve(), Path(__file__).resolve().with_name('scoring.py'))
        self.assertEqual(v(good_extraction(), field='brand_name'), S.MATCH)
        self.assertEqual(v(good_extraction(), field='government_warning'), S.MATCH)

    def test_missing_or_invalid_confidence_never_matches(self):
        for confidence in [None, {}, {'brand_name': True}, {'brand_name': '0.99'},
                           {'brand_name': float('nan')}, {'brand_name': 1.01}]:
            with self.subTest(confidence=confidence):
                call = good_extraction()
                if confidence is None:
                    del call['extracted']['confidence']
                else:
                    call['extracted']['confidence'] = confidence
                self.assertEqual(v(call, CLEAN_APP, 'brand_name'), S.NEEDS_REVIEW)

    def test_each_warning_component_requires_confidence(self):
        for key in E.EXTRACTION_SCHEMA_FIELDS[6:]:
            for missing in [True, False]:
                with self.subTest(component=key, missing=missing):
                    call = good_extraction()
                    call['extracted']['confidence']['government_warning'] = 1
                    if missing:
                        del call['extracted']['confidence'][key]
                    else:
                        call['extracted']['confidence'][key] = 0.01
                    self.assertEqual(v(call, field='government_warning'), S.NEEDS_REVIEW)

    def test_warning_formatting_and_words_stay_enforced(self):
        for values, expected in [({'government_warning_heading_bold': None}, S.NEEDS_REVIEW),
                                 ({'government_warning_heading_bold': False}, S.MISMATCH),
                                 ({'government_warning_body_bold': True}, S.MISMATCH),
                                 ({'government_warning_body': 'Alcohol is harmless.'}, S.MISMATCH)]:
            with self.subTest(values=values):
                self.assertEqual(v(good_extraction(**values), field='government_warning'), expected)

    def test_foundry_dispatch_uses_repaired_validation_offline(self):
        extracted = good_extraction()['extracted']
        del extracted['confidence']
        reply = {'raw_text': json.dumps(extracted), 'tokens_in': 0, 'tokens_out': 0}
        with patch.dict(E._DISPATCH, {'foundry': lambda *args: reply}):
            result = E.call_engine('foundry-gpt-4.1-mini', 'never-read.png', {})
        self.assertFalse(result['schema_valid'])
        self.assertEqual(v(result, field='brand_name'), S.NEEDS_REVIEW)


if __name__ == '__main__':
    unittest.main(verbosity=2)
