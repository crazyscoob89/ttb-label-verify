#!/usr/bin/env python3
"""Required OFFLINE release gate. Missing evidence is a failure, never a skip."""
import json
import re
from pathlib import Path
from replay import derive
from analyze import analyze
from reporting import render

H = Path(__file__).resolve().parent


def verify(here):
    data = derive(here)
    stored = json.loads((here / 'replayed_results.json').read_text())
    if stored != data:
        raise ValueError('replayed records differ from raw observations + current rules + fixture truth')
    analysis = analyze(data)
    if json.loads((here / 'analysis.json').read_text()) != analysis:
        raise ValueError('analysis differs from independently recomputed aggregates')
    if (here / 'RESULTS.md').read_text() != render(data, analysis):
        raise ValueError('report differs from recomputed figures/engine rows/provenance')
    for name in ('raw_results.json','replayed_results.json','analysis.json','RESULTS.md'):
        if re.search(r'sk-[A-Za-z0-9_\-]{20,}', (here / name).read_text()):
            raise ValueError('possible API credential in ' + name)
    return data


def main():
    try:
        data=verify(H)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print('FAIL: required evidence integrity:', exc)
        return 1
    fields=sum(len(r['verdicts']) for r in data['results'])
    print(f"PASS: {len(data['results'])} unique records / {fields} field verdicts independently replayed; fixture hashes, current caches, aggregates and entire report match. Zero paid calls.")
    return 0

if __name__=='__main__':
    raise SystemExit(main())
