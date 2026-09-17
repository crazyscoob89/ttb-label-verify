#!/usr/bin/env python3
"""Offline replay of immutable Stage-2 observations; never imports provider code.

raw_results.json retains the original recorded verdict caches for historical
provenance. replayed_results.json is the current scorer's derived evidence.
"""
from __future__ import annotations
import collections
import copy
import hashlib
import json
from pathlib import Path
import scoring as S

HERE = Path(__file__).resolve().parent
RAW_SHA256 = '1b7fa04ba503de42ece3bcc382232fe2f5ccc19435f365eaf48ab9ce01efbcc0'


def load_evidence(here=HERE):
    raw_bytes = (here / 'raw_results.json').read_bytes()
    if hashlib.sha256(raw_bytes).hexdigest() != RAW_SHA256:
        raise ValueError('original raw evidence changed; do not silently replace the frozen run')
    raw = json.loads(raw_bytes)
    fixtures = {g['fixture_id']: g for g in S.load_fixtures(here.parent / 'fixtures')}
    meta = raw['run_metadata']
    if len(fixtures) != 18 or meta['repeats'] != 3 or len(meta['engines']) != 3:
        raise ValueError('unexpected frozen protocol')
    expected = {(e, fid, rep) for e in meta['engines'] for fid in fixtures for rep in range(1, 4)}
    actual = collections.Counter((r['engine'], r['fixture_id'], r['repeat']) for r in raw['results'])
    if set(actual) != expected or any(n != 1 for n in actual.values()):
        raise ValueError('missing, duplicate or unexpected engine/fixture/repeat record')
    if len(raw['results']) != meta['calls_executed'] or meta['calls_planned'] != len(expected):
        raise ValueError('record coverage differs from run metadata')
    manifest = json.loads((here / 'evidence_manifest.json').read_text())
    for name, sha in manifest.items():
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('invalid evidence path')
        if hashlib.sha256((here.parent / rel).read_bytes()).hexdigest() != sha:
            raise ValueError('fixture/evidence hash mismatch: ' + name)
    # The manifest must cover every immutable fixture, not a selective subset.
    required = {'bench/raw_results.json', 'fixtures/manifest.json'}
    required |= {str(p.relative_to(here.parent)) for p in (here.parent / 'fixtures/ground_truth').glob('*.json')}
    required |= {str(p.relative_to(here.parent)) for p in (here.parent / 'fixtures/images').glob('*.png')}
    if set(manifest) != required:
        raise ValueError('incomplete immutable-evidence manifest')
    return raw, fixtures


def expected_safe(gt):
    """Safe runtime outcomes, separate from unchanged semantic fixture truth."""
    result = dict(gt['expected'])
    la = gt['label_actual']
    for field in S.FIELDS:
        if field == 'country_of_origin' and not gt['application']['is_imported']:
            continue
        if field != 'government_warning' and la.get('brand_as_rendered' if field == 'brand_name' else field) is None:
            result[field] = S.NEEDS_REVIEW
    return result


def extraction_correct(ex, gt):
    """Normalized observed-value accuracy, NOT verdict or confidence accuracy.

Seven fields; warning requires exact heading/case, normalized body words and
all three exact boolean formatting properties. Other text uses case/punctuation
normalization. Missing observations are correct only where constructed truth is
null. This is not character-level OCR accuracy.
"""
    la = gt['label_actual']
    result = {}
    for field in S.FIELDS:
        if field == 'government_warning':
            gw = la[field]
            actual = [ex.get('government_warning_heading'), ex.get('government_warning_body'),
                      ex.get('government_warning_heading_all_caps'), ex.get('government_warning_heading_bold'),
                      ex.get('government_warning_body_bold')]
            result[field] = (isinstance(actual[0], str) and actual[0].strip() == gw['heading']
                             and isinstance(actual[1], str) and S.norm_words(actual[1]) == S.norm_words(gw['body'])
                             and all(type(v) is bool for v in actual[2:])
                             and actual[2:] == [gw['heading_is_all_caps'], gw['heading_is_bold'], gw['body_is_bold']])
        else:
            truth = la.get('brand_as_rendered' if field == 'brand_name' else field)
            observed = ex.get(field)
            result[field] = ((observed is None and truth is None) if truth is None else
                             isinstance(observed, str) and S.norm_text(observed) == S.norm_text(truth))
    return result


def derive(here=HERE):
    raw, fixtures = load_evidence(here)
    replayed = copy.deepcopy(raw)
    changes = []
    for row in replayed['results']:
        gt = fixtures[row['fixture_id']]
        if row['truth'] != gt['expected'] or row['category'] != gt['category'] or row['commodity'] != gt['commodity']:
            raise ValueError('record disagrees with fixture metadata: ' + row['fixture_id'])
        verdicts = S.derive_verdicts(row, gt['application'])
        scored = S.score_field_run(verdicts, gt['expected'])
        for f in S.FIELDS:
            if row['verdicts'][f] != scored[f]['derived']:
                changes.append({'engine': row['engine'], 'fixture_id': row['fixture_id'], 'repeat': row['repeat'],
                                'field': f, 'before': row['verdicts'][f], 'after': scored[f]['derived']})
        row['verdicts'] = {f: scored[f]['derived'] for f in S.FIELDS}
        row['classes'] = {f: scored[f]['class'] for f in S.FIELDS}
        row['reasons'] = {f: scored[f]['reason'] for f in S.FIELDS}
        row['expected_safe'] = expected_safe(gt)
        row['extraction_correct'] = (extraction_correct(row.get('extracted') or {}, gt)
                                     if row['ok'] else {f: False for f in S.FIELDS})
    replayed['replay_metadata'] = {'source_sha256': RAW_SHA256, 'paid_calls': 0, 'verdict_changes': changes,
                                  'note': 'Offline current-rule replay. Original observations and cached outcomes preserved in raw_results.json.'}
    return replayed


if __name__ == '__main__':
    data = derive()
    (HERE / 'replayed_results.json').write_text(json.dumps(data, indent=2) + '\n')
    print('Offline replay written; paid calls: 0; changed verdicts:', len(data['replay_metadata']['verdict_changes']))
