#!/usr/bin/env python3
"""Negative/positive controls for the portable verifier; no benchmark imports."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import verify as v


def deny_network(event, args):
    if event in ('socket.connect', 'socket.getaddrinfo', 'socket.bind'):
        raise AssertionError('network prohibited')


sys.addaudithook(deny_network)


class VerificationTests(unittest.TestCase):
    def test_actual_archive_reconciles(self):
        a = v.Archive()
        self.assertGreater(a.verify_hashes(), 4000)
        self.assertEqual(v.reconcile(a), v.load(v.HERE / 'aggregates.json'))

    def test_any_working_directory_no_credentials(self):
        with tempfile.TemporaryDirectory() as cwd:
            result = subprocess.run([sys.executable, '-B', str(v.HERE / 'verify.py')],
                                    cwd=cwd, env={}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('PASS:', result.stdout)

    def test_missing_planned_row_fails_semantically(self):
        a = v.Archive()
        original = a.group
        def missing(prefix):
            rows = original(prefix)
            if prefix == v.AZ + 'rows':
                rows.pop(next(iter(rows)))
            return rows
        with patch.object(a, 'group', side_effect=missing):
            with self.assertRaisesRegex(ValueError, 'coverage mismatch'):
                v.reconcile(a)

    def test_missing_logical_coverage_fails_semantically(self):
        a = v.Archive()
        original = a.read
        def missing(name, namespace='observations'):
            result = original(name, namespace)
            return result[:-1] if name == v.AZ + 'coverage.json' else result
        with patch.object(a, 'read', side_effect=missing):
            with self.assertRaisesRegex(ValueError, 'logical coverage'):
                v.reconcile(a)

    def test_conflicting_alias_rejected(self):
        row = v.Archive().read(v.HA + 'scored-rows.json')[0]
        conflict = copy.deepcopy(row)
        conflict['latency_s'] += 1
        with self.assertRaisesRegex(ValueError, 'conflicting alias'):
            v.unique([row, conflict], lambda r: r['id'])

    def test_failure_cannot_count_correct(self):
        row = v.Archive().read(v.HA + 'scored-rows.json')[0]
        row['ok'] = False
        with self.assertRaisesRegex(ValueError, 'failure counted correct'):
            v.metrics([row])

    def test_interpolated_percentile(self):
        self.assertEqual(v.percentile([1, 2, 3, 4], .5), 2.5)
        self.assertAlmostEqual(v.percentile([1, 2, 3, 4], .95), 3.85)

    def test_hash_tamper_missing_and_unlisted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            home = root / 'bench/final-evaluation-20260918'
            home.mkdir(parents=True)
            mapping = home / 'source-map.json'
            mapping.write_text(json.dumps({'entries': []}))
            artifact = home / 'raw.json'
            artifact.write_bytes(b'{"saved":true}\r\n')
            manifest = home / 'integrity-manifest.json'
            manifest.write_text(json.dumps({'files': {
                str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in (mapping, artifact)}}))
            a = v.Archive(root)
            self.assertEqual(a.verify_hashes(), 2)
            artifact.write_bytes(b'{"saved":false}\n')
            with self.assertRaisesRegex(ValueError, 'hash/missing'):
                a.verify_hashes()
            artifact.unlink()
            with self.assertRaisesRegex(ValueError, 'hash/missing'):
                a.verify_hashes()
            artifact.write_bytes(b'{"saved":true}\r\n')
            (home / 'unlisted.txt').write_text('not manifested')
            with self.assertRaisesRegex(ValueError, 'unmanifested'):
                a.verify_hashes()

    def test_path_escape_rejected(self):
        with self.assertRaisesRegex(ValueError, 'escapes checkout'):
            v.local(v.ROOT, '../outside')


if __name__ == '__main__':
    unittest.main(verbosity=2)
