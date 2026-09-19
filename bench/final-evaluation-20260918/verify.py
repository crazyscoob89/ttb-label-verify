#!/usr/bin/env python3
"""Portable stdlib-only, read-only publication verifier. Never imports runners.

This reconciles SAVED scoring, not a raw-response scorer replay. No network,
credential reads, provider dispatch, ledger writes or original absolute-path I/O.
"""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import sqlite3

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
FIELDS = ('brand_name', 'class_type', 'alcohol_content', 'net_contents',
          'bottler_info', 'country_of_origin', 'government_warning')
AZ = 'azure-severity-v1/'
HA = 'openrouter-haiku-severity-v1/'


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def local(root, relative):
    require(not Path(relative).is_absolute(), 'absolute published path')
    path = (root / relative).resolve()
    require(path.is_relative_to(root.resolve()), 'path escapes checkout')
    return path


class Archive:
    def __init__(self, root=ROOT):
        self.root = root
        self.home = root / 'bench/final-evaluation-20260918'
        self.mapping = load(self.home / 'source-map.json')
        self.entries = self.mapping['entries']
        self.by_source = {e['source']: e for e in self.entries}
        self.by_relative = {(e['source_namespace'], e['source_relative']): e
                            for e in self.entries}
        require(len(self.by_source) == len(self.entries), 'duplicate source mapping')

    def entry(self, name, namespace='observations'):
        return self.by_source[name] if name in self.by_source else self.by_relative[(namespace, name)]

    def path(self, name, namespace='observations'):
        return local(self.root, self.entry(name, namespace)['published'])

    def read(self, name, namespace='observations'):
        return load(self.path(name, namespace))

    def group(self, prefix):
        return {Path(e['source_relative']).stem: self.read(e['source'])
                for e in self.entries if e['source_namespace'] == 'observations'
                and str(Path(e['source_relative']).parent) == prefix.rstrip('/')
                and e['source_relative'].endswith('.json')}

    def verify_hashes(self):
        manifest = load(self.home / 'integrity-manifest.json')
        expected = manifest['files']
        for name, h in expected.items():
            p = local(self.root, name)
            require(p.is_file() and digest(p) == h, 'hash/missing: ' + name)
        current = {str(p.relative_to(self.root)) for p in self.home.rglob('*')
                   if p.is_file() and '__pycache__' not in p.parts
                   and p.name != 'integrity-manifest.json'}
        require(current == {n for n in expected if n.startswith('bench/final-evaluation-20260918/')},
                'unmanifested or missing publication file')
        for e in self.entries:
            p = self.path(e['source'])
            require(p.stat().st_size == e['published_bytes'] and digest(p) == e['published_sha256'],
                    'source mapping content drift: ' + e['source_relative'])
            require(e.get('omitted_json_paths') or e['source_sha256'] == e['published_sha256'],
                    'undisclosed source transformation')
        return len(expected)


def percentile(xs, p):
    xs = sorted(xs)
    require(bool(xs), 'missing timing')
    index = (len(xs) - 1) * p
    lo, hi = math.floor(index), math.ceil(index)
    return xs[lo] + (xs[hi] - xs[lo]) * (index - lo)


def metrics(rows):
    require(bool(rows), 'empty metric cohort')
    for r in rows:
        require(set(r['extraction_correct']) == set(FIELDS), 'wrong field denominator')
        require(r['ok'] or not any(r['extraction_correct'].values()), 'failure counted correct')
    valid = [r for r in rows if r['ok']]
    correct = {f: sum(bool(r['extraction_correct'][f]) for r in rows) for f in FIELDS}
    costs = [Decimal(str(r.get('retail_estimate_usd') if 'retail_estimate_usd' in r
                             else r.get('cost_usd'))) for r in rows
             if (r.get('retail_estimate_usd') if 'retail_estimate_usd' in r else r.get('cost_usd')) is not None]
    times = [r['latency_s'] for r in rows]
    require(all(isinstance(t, (int, float)) and math.isfinite(t) and t >= 0 for t in times), 'bad timing')
    return {
        'calls': len(rows), 'schema_valid_calls': len(valid),
        'processing_failures': len(rows) - len(valid),
        'negative_fields': sum(r['truth'][f] == 'mismatch' for r in rows for f in FIELDS),
        'false_matches': sum(r['truth'][f] == 'mismatch' and r['verdicts'][f] == 'match'
                             for r in rows for f in FIELDS),
        'valid_referral_calls': sum('needs-review' in r['verdicts'].values() for r in valid),
        'all_fields_correct': sum(all(r['extraction_correct'].values()) for r in rows),
        'field_correct': correct, 'correct_fields': sum(correct.values()),
        'field_opportunities': len(rows) * len(FIELDS),
        'accuracy_pct': sum(correct.values()) / (len(rows) * len(FIELDS)) * 100,
        'latency_p50_s': percentile(times, .5), 'latency_p95_s': percentile(times, .95),
        'calls_le_5s': sum(t <= 5 for t in times),
        'valid_latency_p50_s': percentile([r['latency_s'] for r in valid], .5),
        'valid_latency_p95_s': percentile([r['latency_s'] for r in valid], .95),
        'known_retail_cost_calls': len(costs), 'retail_estimate_usd': str(sum(costs)),
        'extrapolated_retail_usd_per_1000_known_calls': str(sum(costs) / len(costs) * 1000),
        'routes': sorted({r['route'] for r in rows}),
    }


def unique(rows, key):
    result = {}
    for row in rows:
        k = key(row)
        if k in result:
            old = result[k]
            for f in ('model', 'image_sha256', 'response_sha256', 'latency_s', 'ok',
                      'truth', 'verdicts', 'extraction_correct'):
                require(old[f] == row[f], 'conflicting alias: ' + f)
        else:
            result[k] = row
    return list(result.values())


def same_metrics(derived, saved):
    for k in ('calls', 'schema_valid_calls', 'processing_failures', 'negative_fields',
              'false_matches', 'valid_referral_calls', 'field_correct', 'all_fields_correct'):
        require(derived[k] == saved[k], 'saved metric discrepancy: ' + k)
    for k in ('latency_p50_s', 'latency_p95_s'):
        require(abs(derived[k] - saved[k]) < 1e-9, 'saved latency discrepancy: ' + k)


def check_lane(a, lane, planned):
    rows, attempts = a.group(lane + 'rows'), a.group(lane + 'attempts')
    require(set(rows) == set(attempts) == set(planned), 'planned/attempt/row coverage mismatch ' + lane)
    response_entries = [e for e in a.entries if e['source_namespace'] == 'observations'
                        and str(Path(e['source_relative']).parent) == lane + 'responses']
    require(len(response_entries) == len(planned), 'raw response count mismatch')
    for identity, row in rows.items():
        require(row['id'] == identity == attempts[identity]['id'], 'identity mismatch')
        require(row['request_sha256'] == attempts[identity]['request_sha256'], 'request fingerprint mismatch')
        require(a.entry(row['response_file'])['source_sha256'] == row['response_sha256'], 'raw response mismatch')
        require(digest(a.path(row['response_file'])) == row['response_sha256'], 'raw bytes mismatch')
        require(row.get('auto_retries', 0) == 0, 'unexpected retry')
    return rows


def reconcile(a):
    # Verify the frozen provenance against the original-source identities. Six
    # process-list fields are redacted in publication; those original bytes are
    # attested by the source map, not falsely claimed reproducible after redaction.
    for name in (AZ + 'freeze.json', HA + 'freeze.json', HA + 'final-evidence-hashes.json'):
        declared = a.read(name)
        declared = declared.get('hashes', declared)
        for original, expected in declared.items():
            if isinstance(expected, str) and len(expected) == 64:
                entry = a.entry(original if original.startswith('/') else HA + original)
                require(entry['source_sha256'] == expected, 'frozen source hash mismatch: ' + original)
    plan = a.read(AZ + 'queue-manifest.json')
    hp = a.read(HA + 'execution-plan.json')
    az_ids = [q['id'] for q in plan['queue']]
    require(len(az_ids) == len(set(az_ids)) == 1073, 'Azure new queue size')
    require(len(hp['aliases']) == 212 and len(hp['queue']) == 212, 'Haiku planned size')
    az_rows = check_lane(a, AZ, az_ids)
    ha_rows = check_lane(a, HA, hp['aliases'])
    require(Counter(q['fixture']['condition'] for q in plan['queue'] if q['fixture']['condition'] in ('straight', 'angle')) == {'straight': 8, 'angle': 9}, 'Kimi catchup coverage')
    require(all(q['model'] == 'Kimi-K2.6' for q in plan['queue'] if q['fixture']['condition'] in ('straight', 'angle')), 'catchup model')
    for model in plan['models']:
        require(sum(q['model'] == model and q['fixture']['condition'].startswith(('blur-', 'glare-')) for q in plan['queue']) == 176, 'severity count')
    coverage, hc = a.read(AZ + 'coverage.json'), a.read(HA + 'coverage.json')
    scored, hs = a.read(AZ + 'scored-rows.json'), a.read(HA + 'scored-rows.json')
    require(len(coverage) == len(scored) == len(plan['mapping']) == 1512, 'Azure logical coverage')
    require(len(hc) == len(hs) == sum(len(v) for v in hp['aliases'].values()) == 252, 'Haiku logical coverage')
    cov = {(x['model'], x['fixture']): x for x in coverage}
    score = {(x['model'], x['logical_fixture_id']): x for x in scored}
    require(len(cov) == len(score) == 1512, 'duplicate logical coverage')
    reused = set()
    for item in plan['mapping']:
        key = item['model'], item['fixture']['id']
        c, s = cov[key], score[key]
        require(c['attempt_id'] == s['comparison_attempt_id'] == item['id'], 'alias identity mismatch')
        require(c['image_sha256'] == s['image_sha256'] == item['fixture']['sha256'], 'image identity mismatch')
        original = a.read(c['source_row'])
        for field in ('id', 'response_sha256', 'latency_s', 'ok', 'image_sha256', 'extracted'):
            require(original[field] == s[field], 'scored/source mismatch: ' + field)
        require(c['status'] == ('processed-valid' if original['ok'] else 'processed-with-failure'), 'coverage status')
        if item['reuse_row']:
            require(c['reused'] and c['source_row'] == item['reuse_row'], 'reused provenance')
            reused.add(item['id'])
            require(digest(a.path(original['response_file'])) == original['response_sha256'], 'reused raw response')
        else:
            require(not c['reused'] and item['id'] in az_rows, 'unaccounted Azure row')
    require(len(reused) == plan['reuse_unique'] == 199 and not reused.intersection(az_ids), 'reuse/replay accounting')
    hcov = {c['fixture']: c for c in hc}
    require(len(hcov) == 252, 'duplicate Haiku coverage')
    for r in hs:
        c = hcov[r['logical_fixture_id']]
        require(c['row_saved'] and c['attempt_id'] == r['id'] and c['image_sha256'] == r['image_sha256'], 'Haiku coverage mismatch')
        require(r['logical_fixture_id'] in hp['aliases'][r['id']], 'Haiku alias mismatch')
        for f in ('response_sha256', 'latency_s', 'ok', 'extracted', 'image_sha256'):
            require(r[f] == ha_rows[r['id']][f], 'Haiku source mismatch')
    manifest = a.read(HA + 'manifest.json')
    source_hashes = {e['source_sha256'] for e in a.entries}
    for key in ('renderer_sha256', 'approved_generator_sha256', 'approved_manifest_sha256', 'approval_sha256'):
        require(manifest[key] in source_hashes, 'missing approved corpus dependency: ' + key)
    require(len(manifest['fixtures']) == 252 and len({f['sha256'] for f in manifest['fixtures']}) == 212, 'image universe')
    for f in manifest['fixtures']:
        for path_key, hash_key in (('image', 'sha256'), ('source_path', 'source_sha256'),
                                   ('original_label_path', 'original_label_sha256'), ('original_truth_path', 'original_truth_sha256')):
            require(digest(a.path(f[path_key])) == f[hash_key], 'fixture provenance: ' + path_key)
    before = a.group(HA + 'continuation-1-before/rows')
    require(len(before) == 148 and len(set(ha_rows) - set(before)) == 64, 'continuation coverage')
    for folder in ('rows', 'attempts', 'responses'):
        prefix = HA + 'continuation-1-before/' + folder + '/'
        es = [e for e in a.entries if e['source_namespace'] == 'observations' and e['source_relative'].startswith(prefix)]
        require(len(es) == 148, 'continuation prior count')
        for e in es:
            after = a.entry(e['source_relative'].replace('continuation-1-before/', ''))
            require(e['source_sha256'] == after['source_sha256'], 'continuation mutated prior observation')
    ag = unique(scored, lambda r: (r['model'], r['comparison_attempt_id']))
    hg = unique(hs, lambda r: r['id'])
    result = {}
    comp = a.read(AZ + 'comparison.json')
    for model in plan['models'] + ['anthropic/claude-haiku-4.5']:
        rows = [r for r in ag + hg if r['model'] == model]
        require(len(rows) == len({r['image_sha256'] for r in rows}) == 212, 'canonical cohort')
        result[model] = metrics(rows)
        require(result[model]['negative_fields'] == 104, 'negative denominator')
        logical = [r for r in scored + hs if r['model'] == model]
        for condition in {r['condition'] for r in logical}:
            condition_rows = unique([r for r in logical if r['condition'] == condition], lambda r: r['image_sha256'])
            saved = comp['haiku_openrouter_by_condition'][condition] if model.startswith('anthropic/') else comp['azure_by_condition'][model][condition]
            same_metrics(metrics(condition_rows), saved)
    same_metrics(result['anthropic/claude-haiku-4.5'], a.read(HA + 'continuation-final-audit.json')['unique_request_metrics'])
    ledger_path = a.path('recovery-v3/budget.sqlite')
    with closing(sqlite3.connect(ledger_path.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
        require(db.execute('pragma integrity_check').fetchone() == ('ok',), 'ledger integrity')
        entries = {r[0]: (r[1], r[2]) for r in db.execute('select id,nano,status from ledger')}
        ledger_status = {s: {'entries': n, 'nano_usd': cost} for s, n, cost in db.execute('select status,count(*),sum(nano) from ledger group by status')}
        for table, ids in [('azure_severity_attempts', az_ids), ('openrouter_attempts', hp['aliases'])]:
            require({r[0] for r in db.execute('select id from ' + table)} == set(ids), 'ledger attempt coverage')
    # All available historical SQLite ledger snapshots must preserve prior ID/nano/status entries.
    checked = []
    for e in a.entries:
        if e['source_namespace'] == 'observations' and e['source_relative'].startswith((HA, 'azure-severity-preservation-before/')) and e['source_relative'].endswith('.sqlite'):
            with closing(sqlite3.connect(a.path(e['source']).as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
                if db.execute("select count(*) from sqlite_master where name='ledger'").fetchone()[0]:
                    old = list(db.execute('select id,nano,status from ledger'))
                    require(all(entries.get(i) == (n, s) for i, n, s in old), 'historical ledger entry changed')
                    checked.append({'source_relative': e['source_relative'], 'entries': len(old)})
    total = sum(n for n, _ in entries.values())
    require(total == 15220495100 and plan['total_cap_usd'] == 50, 'shared ledger liability/cap')
    # Original JSON retail estimates contain binary-float tails; reconcile at
    # the original report's eight-decimal USD precision, not by rewriting rows.
    az_cost = sum((Decimal(str(r['cost_usd'])) for r in az_rows.values()), Decimal(0)).quantize(Decimal('0.00000001'))
    ha_cost = sum(Decimal(str(r['usage_cost_usd'])) for r in ha_rows.values() if r['usage_cost_usd'] is not None)
    require(az_cost == Decimal('4.35116825') and ha_cost == Decimal('0.89336115'), 'cost reconciliation')
    az_invalid = sum(not r['ok'] for r in az_rows.values())
    require(az_invalid == 102 and all(r['http_status'] == 200 for r in az_rows.values()), 'Azure transport/processing split')
    require(sum(not r['ok'] for r in ha_rows.values()) == 6 and sum(r['http_status'] == 502 for r in ha_rows.values()) == 2, 'Haiku failure split')
    for lane in (AZ, HA):
        state = a.read(lane + 'execution-state.json')
        require(state['terminal'] and state['status'] == 'complete', 'not terminal')
    return {'scope': 'aggregate reconciliation of saved scoring; not scorer replay',
            'models': result,
            'coverage': {'azure_new': len(az_rows), 'azure_reused_unique': len(reused),
                         'azure_logical': len(coverage), 'azure_http_200_invalid_new': az_invalid,
                         'azure_transport_failures_new': 0, 'haiku_unique': len(ha_rows),
                         'haiku_logical': len(hc), 'haiku_preserved': len(before), 'haiku_continuation': 64,
                         'haiku_http_502': 2, 'haiku_http_200_invalid': 4, 'missing': 0},
            'costs': {'azure_new_retail_usd': str(az_cost), 'haiku_usage_cost_usd': str(ha_cost),
                      'shared_liability_nano_usd': total, 'cap_usd': 50,
                      'ledger_by_status': ledger_status, 'preserved_ledger_snapshots': checked}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='print reconciled metrics; never writes files')
    args = parser.parse_args()
    a = Archive()
    count = a.verify_hashes()
    result = reconcile(a)
    require(result == load(HERE / 'aggregates.json'), 'derived aggregate cache drift')
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f'PASS: {count} hashes; Azure 1073 new + 199 reused; Haiku 212; 7 x 212 canonical; saved-score aggregates/ledger reconciled.')
        print('Not raw-response scorer replay, independent benchmark review, invoice or production qualification.')


if __name__ == '__main__':
    main()
