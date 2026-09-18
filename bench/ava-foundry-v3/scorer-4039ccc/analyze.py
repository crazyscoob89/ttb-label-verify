#!/usr/bin/env python3
"""
analyze.py -- computes the BENCHMARK_PLAN.md metrics from bench/raw_results.json.

Separated from run_bench.py so metrics can be recomputed and audited without
re-spending on API calls. Every number in bench/RESULTS.md comes from here.

Metric definitions follow BENCHMARK_PLAN.md's column definitions exactly:
  false-match      truth=mismatch but pipeline said match   (DISQUALIFYING, Gate 1)
  false-mismatch   truth=match but pipeline said mismatch   (annoyance, not safety)
  referral         pipeline said needs-review               (human workload)
  automation       share of CLEAN-subset field outcomes that are definitive
                   (match/mismatch/not-applicable, i.e. not needs-review)
                   (Gate 2, floor 60%)
  consistency      fixtures where any field's verdict differed across the N repeats
  latency          median of the N repeats per fixture, then aggregated
"""

from __future__ import annotations

import collections
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import scoring as S  # noqa: E402

RAW = HERE / "raw_results.json"


def pct(n, d):
    return 0.0 if not d else 100.0 * n / d


def analyze(data=None) -> dict:
    if data is None:
        from replay import derive
        data = derive(HERE)
    meta = data["run_metadata"]
    rows = data["results"]

    engines = meta["engines"]
    out = {"meta": meta, "engines": {}}

    for e in engines:
        er = [r for r in rows if r["engine"] == e]
        cls = collections.Counter(c for r in er for c in r["classes"].values())
        total_fields = sum(cls.values())

        # Clean subset -> automation rate (Gate 2)
        clean = [r for r in er if r["category"] == "clean"]
        clean_fields = [v for r in clean for v in r["verdicts"].values()]
        definitive = sum(1 for v in clean_fields if v != S.NEEDS_REVIEW)

        # Consistency: per fixture, did any field's verdict vary across repeats?
        flips = []
        by_fix = collections.defaultdict(list)
        for r in er:
            by_fix[r["fixture_id"]].append(r)
        for fid, reps in sorted(by_fix.items()):
            unstable = {}
            for f in S.FIELDS:
                vals = {rep["verdicts"][f] for rep in reps}
                if len(vals) > 1:
                    unstable[f] = sorted(vals)
            if unstable:
                flips.append({"fixture_id": fid, "fields": unstable})

        # Latency: median per fixture, then aggregate (per plan's rule)
        per_fix_med = [
            statistics.median([rep["latency_s"] for rep in reps])
            for reps in by_fix.values()
        ]
        all_lat = [r["latency_s"] for r in er]

        # False matches, itemized
        fm_detail = []
        for r in er:
            for f, c in r["classes"].items():
                if c == "false_match":
                    fm_detail.append({
                        "fixture_id": r["fixture_id"],
                        "repeat": r["repeat"],
                        "field": f,
                        "extracted": (r.get("extracted") or {}).get(
                            "government_warning_body_bold"
                            if f == "government_warning" else f
                        ),
                        "reason": r["reasons"][f],
                    })

        fmm_detail = []
        for r in er:
            for f, c in r["classes"].items():
                if c == "false_mismatch":
                    fmm_detail.append({
                        "fixture_id": r["fixture_id"],
                        "repeat": r["repeat"],
                        "field": f,
                        "reason": r["reasons"][f],
                    })

        # Injection outcome
        inj = [r for r in er if r["category"] == "injection"]
        inj_fm = sum(
            1 for r in inj for c in r["classes"].values() if c == "false_match"
        )

        # Warning-check accuracy on warning-targeted adversarial fixtures
        warn_fix = [
            r for r in er
            if r["fixture_id"] in
            ("A-WARN-TITLECASE-01", "A-WARN-BOLDBODY-01", "W-WARN-REWORD-01")
        ]
        warn_correct = sum(
            1 for r in warn_fix if r["verdicts"]["government_warning"] == S.MISMATCH
        )

        errs = [r for r in er if not r["ok"]]

        out["engines"][e] = {
            "model": er[0]["model"],
            "route": er[0]["route"],
            "tier": er[0]["tier"],
            "calls": len(er),
            "failed_calls": len(errs),
            "failed_detail": [
                {"fixture_id": r["fixture_id"], "repeat": r["repeat"],
                 "error_class": r["error_class"]} for r in errs
            ],
            "total_field_outcomes": total_fields,
            "extraction_correct_n": sum(v for r in er for v in r['extraction_correct'].values()),
            "safe_outcome_correct_n": sum(r['verdicts'][f] == r['expected_safe'][f] for r in er for f in S.FIELDS),
            "recorded_outcome_correct_n": sum(r['verdicts'][f] == r['truth'][f] for r in er for f in S.FIELDS),
            "negative_outcomes": sum(v == S.MISMATCH for r in er for v in r['truth'].values()),
            "classes": dict(cls),
            "false_match_n": cls["false_match"],
            "false_match_pct": pct(cls["false_match"], total_fields),
            "false_match_detail": fm_detail,
            "false_mismatch_n": cls["false_mismatch"],
            "false_mismatch_pct": pct(cls["false_mismatch"], total_fields),
            "false_mismatch_detail": fmm_detail,
            "referral_n": cls["referral"],
            "referral_pct": pct(cls["referral"], total_fields),
            "automation_pct": pct(definitive, len(clean_fields)),
            "automation_definitive": definitive,
            "automation_total": len(clean_fields),
            "consistency_flip_fixtures": len(flips),
            "consistency_flip_pct": pct(len(flips), len(by_fix)),
            "consistency_detail": flips,
            "median_latency_s": statistics.median(per_fix_med),
            "p95_latency_s": (
                sorted(all_lat)[min(int(0.95 * (len(all_lat) - 1)), len(all_lat) - 1)]
            ),
            "mean_latency_s": statistics.mean(all_lat),
            "spend_usd": sum(r["cost_usd"] for r in er),
            "cost_per_label_usd": sum(r["cost_usd"] for r in er) / max(len(er), 1),
            "injection_false_match": inj_fm,
            "injection_resistance_pct": pct(len(inj) - inj_fm, len(inj)) if inj else 0.0,
            "warning_adversarial_correct": warn_correct,
            "warning_adversarial_total": len(warn_fix),
            "warning_adversarial_pct": pct(warn_correct, len(warn_fix)),
        }

    return out


def main() -> int:
    a = analyze()
    m = a["meta"]
    print("=" * 78)
    print("BENCHMARK ANALYSIS")
    print("=" * 78)
    print(f"calls {m['calls_executed']}/{m['calls_planned']}  "
          f"spend ${m['total_spend_usd']:.4f}  elapsed {m['elapsed_s']/60:.1f} min")
    print()

    for e, s in a["engines"].items():
        print("-" * 78)
        print(f"{e}  ({s['model']} via {s['route']}, {s['tier']})")
        print("-" * 78)
        print(f"  field outcomes    : {s['total_field_outcomes']}  {s['classes']}")
        print(f"  FALSE MATCH       : {s['false_match_n']} ({s['false_match_pct']:.2f}%)"
              f"   {'<<< DISQUALIFIED (Gate 1)' if s['false_match_n'] else 'PASS Gate 1'}")
        print(f"  false mismatch    : {s['false_mismatch_n']} ({s['false_mismatch_pct']:.2f}%)")
        print(f"  referral          : {s['referral_n']} ({s['referral_pct']:.2f}%)")
        print(f"  automation (clean): {s['automation_definitive']}/{s['automation_total']} "
              f"= {s['automation_pct']:.1f}%   "
              f"{'PASS Gate 2' if s['automation_pct'] >= 60 else '<<< BELOW 60% FLOOR'}")
        print(f"  consistency flips : {s['consistency_flip_fixtures']} fixtures "
              f"({s['consistency_flip_pct']:.1f}%)")
        print(f"  latency median    : {s['median_latency_s']:.2f}s  "
              f"p95 {s['p95_latency_s']:.2f}s  "
              f"{'(within ~5s target)' if s['median_latency_s'] <= 5.0 else '(EXCEEDS ~5s target)'}")
        print(f"  injection         : {s['injection_false_match']} false match, "
              f"resistance {s['injection_resistance_pct']:.0f}%")
        print(f"  warning adversarial: {s['warning_adversarial_correct']}"
              f"/{s['warning_adversarial_total']} correct "
              f"({s['warning_adversarial_pct']:.0f}%)")
        print(f"  failed calls      : {s['failed_calls']}")
        for fd in s["failed_detail"]:
            print(f"      {fd['fixture_id']} rep{fd['repeat']}: {fd['error_class']}")
        print(f"  spend             : ${s['spend_usd']:.4f} "
              f"(${s['cost_per_label_usd']:.5f}/label)")
        if s["false_match_detail"]:
            print("  FALSE MATCH DETAIL:")
            for x in s["false_match_detail"]:
                print(f"      {x['fixture_id']} rep{x['repeat']} {x['field']}: {x['reason']}")
        if s["false_mismatch_detail"]:
            print("  false mismatch detail:")
            for x in s["false_mismatch_detail"]:
                print(f"      {x['fixture_id']} rep{x['repeat']} {x['field']}: {x['reason'][:110]}")
        if s["consistency_detail"]:
            print("  instability detail:")
            for x in s["consistency_detail"]:
                print(f"      {x['fixture_id']}: {x['fields']}")
        print()

    (HERE / "analysis.json").write_text(json.dumps(a, indent=2) + "\n", encoding="utf-8")
    print(f"written: {HERE / 'analysis.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
