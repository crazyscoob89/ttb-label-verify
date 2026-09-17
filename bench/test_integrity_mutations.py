#!/usr/bin/env python3
"""Offline fault-injection tests for the required benchmark evidence gate."""
import contextlib
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import test_results_integrity as gate

ROOT = Path(__file__).resolve().parent.parent

class IntegrityMutationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'bench', self.root / 'bench', ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT / 'fixtures', self.root / 'fixtures')

    def run_gate(self):
        with patch.object(gate, 'H', self.root / 'bench'), contextlib.redirect_stdout(io.StringIO()):
            # Legacy runner keeps global counters; reset them for isolation.
            if hasattr(gate, 'fails'): gate.fails.clear()
            if hasattr(gate, 'checks'): gate.checks = 0
            return gate.main()

    def mutate_json(self, name, fn):
        p = self.root / 'bench' / name
        data = json.loads(p.read_text())
        fn(data)
        p.write_text(json.dumps(data))

    def test_clean_evidence_passes(self):
        self.assertEqual(self.run_gate(), 0)

    def test_changed_raw_extraction_rejects_stale_verdict(self):
        def change(data):
            row = next(r for r in data['results'] if r['engine'] == 'claude-haiku-4-5' and r['fixture_id'] == 'C-WINE-01')
            row['extracted']['brand_name'] = 'WRONG BRAND'
        self.mutate_json('raw_results.json', change)
        self.assertNotEqual(self.run_gate(), 0)

    def test_missing_required_evidence_fails(self):
        (self.root / 'bench' / 'raw_results.json').unlink()
        self.assertNotEqual(self.run_gate(), 0)

    def test_duplicate_record_fails(self):
        self.mutate_json('raw_results.json', lambda data: data['results'].append(data['results'][0]))
        self.assertNotEqual(self.run_gate(), 0)

    def test_report_engine_row_swap_fails(self):
        p = self.root / 'bench' / 'RESULTS.md'
        text = p.read_text()
        text = text.replace('| **claude-haiku-4-5** |', '| __SWAP__ |', 1)
        text = text.replace('| gpt-5-mini |', '| **claude-haiku-4-5** |', 1)
        text = text.replace('| __SWAP__ |', '| gpt-5-mini |', 1)
        # New deterministic report uses unbolded labels.
        if text == p.read_text():
            text = text.replace('| claude-haiku-4-5 |', '| __SWAP__ |', 1).replace('| gpt-5-mini |', '| claude-haiku-4-5 |', 1).replace('| __SWAP__ |', '| gpt-5-mini |', 1)
        self.assertNotEqual(text, p.read_text())
        p.write_text(text)
        self.assertNotEqual(self.run_gate(), 0)

    def test_current_verdict_cache_mutation_fails(self):
        def change(data):
            data['results'][0]['verdicts']['brand_name'] = 'mismatch'
        self.mutate_json('replayed_results.json', change)
        self.assertNotEqual(self.run_gate(), 0)

    def test_current_class_cache_mutation_fails(self):
        self.mutate_json('replayed_results.json', lambda data: data['results'][0]['classes'].update(brand_name='false_match'))
        self.assertNotEqual(self.run_gate(), 0)

    def test_fixture_truth_mutation_fails(self):
        p = self.root / 'fixtures' / 'ground_truth' / 'C-WINE-01.json'
        data = json.loads(p.read_text())
        data['expected']['brand_name'] = 'mismatch'
        p.write_text(json.dumps(data))
        self.assertNotEqual(self.run_gate(), 0)

    def test_missing_replayed_evidence_fails(self):
        (self.root / 'bench' / 'replayed_results.json').unlink()
        self.assertNotEqual(self.run_gate(), 0)

    def test_changed_analysis_fails(self):
        self.mutate_json('analysis.json', lambda data: data['engines']['claude-haiku-4-5'].update(false_match_n=99))
        self.assertNotEqual(self.run_gate(), 0)

if __name__ == '__main__':
    unittest.main(verbosity=2)
