#!/usr/bin/env python3
"""The closed benchmark may be inspected offline, never silently re-spent."""
import contextlib
import io
import unittest
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
import run_bench

class ArchivedSpendTests(unittest.TestCase):
    def test_paid_execution_refuses_before_credentials_or_dispatch(self):
        with patch('sys.argv', ['run_bench.py']), patch.object(run_bench.E, 'load_env', side_effect=AssertionError('credentials accessed')) as credentials, patch.object(run_bench.E, 'call_engine', side_effect=AssertionError('paid dispatch')) as dispatch, contextlib.redirect_stdout(io.StringIO()) as out:
            code = run_bench.main()
        self.assertEqual(code, 2)
        self.assertIn('disabled', out.getvalue().lower())
        self.assertEqual(credentials.call_count, 0)
        self.assertEqual(dispatch.call_count, 0)

    def test_standalone_provider_probe_is_disabled(self):
        code = "import runpy,urllib.request; urllib.request.urlopen=lambda *a,**k: (_ for _ in ()).throw(AssertionError('network forbidden')); runpy.run_module('engines',run_name='__main__')"
        result = subprocess.run([sys.executable, '-c', code], cwd=Path(__file__).resolve().parent, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn('disabled', result.stdout.lower())

    def test_dry_run_remains_offline_and_successful(self):
        with patch('sys.argv', ['run_bench.py', '--dry-run']), patch.object(run_bench.E, 'load_env', side_effect=AssertionError('credentials accessed')), patch.object(run_bench.E, 'call_engine', side_effect=AssertionError('paid dispatch')), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(run_bench.main(), 0)

if __name__=='__main__':
    unittest.main(verbosity=2)
