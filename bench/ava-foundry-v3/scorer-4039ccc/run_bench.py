#!/usr/bin/env python3
"""Inspect the archived Stage-2 protocol without issuing paid calls.

The original run is preserved at commit 2ca813e. Its per-process cost estimator
and guessed headroom were not a verified account-wide hard cap. This revision
intentionally removes the paid execution path rather than claim that estimator
is safe. A future approved run must first implement/prove a spending bound that
accounts for failures, concurrent callers and previously incurred spend.

Usage: python3 bench/run_bench.py --dry-run
For offline re-scoring/report generation: python3 bench/reporting.py
"""
import argparse
from pathlib import Path
import engines as E
import scoring as S

HERE = Path(__file__).resolve().parent
FIXTURES_DIR = HERE.parent / 'fixtures'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--engines', nargs='+', default=list(E.ENGINES))
    parser.add_argument('--repeats', type=int, default=3)
    args = parser.parse_args()
    if not args.dry_run:
        print('PAID EXECUTION DISABLED: archived benchmark. Establish and verify a new approved spending bound before any future paid run. Use --dry-run or bench/reporting.py offline.')
        return 2
    if args.repeats < 1 or any(k not in E.ENGINES for k in args.engines):
        print('Invalid engine selection or repeat count')
        return 2
    fixtures = S.load_fixtures(FIXTURES_DIR)
    print(f'DRY RUN: {len(fixtures)} fixtures x {len(args.engines)} engines x {args.repeats} repeats = {len(fixtures)*len(args.engines)*args.repeats} planned calls; ZERO issued.')
    for name in args.engines:
        cfg = E.ENGINES[name]
        print(f"  {name}: {cfg['model']} via {cfg['route']} (historical configuration)")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
