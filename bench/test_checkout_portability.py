#!/usr/bin/env python3
"""Regression for Git's Windows-style CRLF checkout of hash-pinned evidence.

Build an isolated Git snapshot of the current working files, check it out with
core.autocrlf=true, and require the normal evidence gate to pass unmodified.
This emulates Git checkout behavior; it is not native Windows runtime proof.
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def git(*args, cwd):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


class CheckoutPortabilityTests(unittest.TestCase):
    def test_windows_style_checkout_preserves_evidence_and_passes_gate(self):
        with tempfile.TemporaryDirectory(prefix='ttb-checkout-test-') as directory:
            temp = Path(directory)
            source = temp / 'source'
            source.mkdir()
            names = set(git('ls-files', cwd=ROOT).splitlines())
            names.update(git('ls-files', '--others', '--exclude-standard', cwd=ROOT).splitlines())
            for name in names:
                path = ROOT / name
                if path.is_file():
                    target = source / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(path, target)
            git('init', '--quiet', cwd=source)
            git('config', 'core.autocrlf', 'false', cwd=source)
            git('add', '--all', cwd=source)
            git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid',
                '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'isolated test snapshot', cwd=source)
            checkout = temp / 'checkout'
            git('clone', '--quiet', '--no-checkout', str(source), str(checkout), cwd=temp)
            git('config', 'core.autocrlf', 'true', cwd=checkout)
            git('checkout', '--quiet', '--detach', 'HEAD', cwd=checkout)
            manifest = json.loads((checkout / 'bench/evidence_manifest.json').read_text(encoding='utf-8'))
            for name, expected in manifest.items():
                with self.subTest(evidence=name):
                    self.assertEqual(hashlib.sha256((checkout / name).read_bytes()).hexdigest(), expected)
            result = subprocess.run([sys.executable, 'bench/test_results_integrity.py'], cwd=checkout,
                                    capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
