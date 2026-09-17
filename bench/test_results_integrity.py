#!/usr/bin/env python3
"""
test_results_integrity.py -- asserts bench/RESULTS.md faithfully reports the
recorded benchmark data.

A results document is a liability if it drifts from the data it claims to
summarize. This test re-derives every figure, ratio and structural claim in
RESULTS.md from analysis.json / raw_results.json and fails if any of them stops
being true -- so regenerating the benchmark without updating the writeup is a
test failure rather than a silently stale report.

Runs offline. No network, no model calls, no spend.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

H = Path(__file__).resolve().parent

fails: list[str] = []
checks = 0


def ck(cond, label: str) -> None:
    global checks
    checks += 1
    if not cond:
        fails.append(label)


def main() -> int:
    for p in ("analysis.json", "raw_results.json", "RESULTS.md"):
        if not (H / p).exists():
            print(f"SKIP: bench/{p} not present (run run_bench.py + analyze.py first)")
            return 0

    a = json.loads((H / "analysis.json").read_text(encoding="utf-8"))
    raw = json.loads((H / "raw_results.json").read_text(encoding="utf-8"))
    md = (H / "RESULTS.md").read_text(encoding="utf-8")
    E = a["engines"]

    # ---- run-level facts ---------------------------------------------
    ck(a["meta"]["calls_executed"] == 162, "162 calls executed")
    ck("162/162 executed" in md, "call count stated in md")
    ck(abs(a["meta"]["total_spend_usd"] - 1.0618) < 0.0002, "benchmark spend")
    ck("$1.0618" in md, "benchmark spend in md")
    ck(a["meta"]["total_spend_usd"] < 20.0, "spend under $20 hard cap")
    ck(abs((0.0200 + 0.0773 + 1.0618) - 1.1591) < 0.0002, "spend table sums")
    ck("$1.1591" in md, "total spend in md")
    ck(3 + 18 + 162 == 183 and "183" in md, "total call count")
    ck(18 * 7 * 3 == 378, "per-engine field-outcome denominator")

    # ---- per-engine figures ------------------------------------------
    exp = {
        "gpt-5-mini": dict(fm=2, fmm=0, ref=6, auto=100.0, flips=1, med=11.61,
                           p95=15.55, cost=0.00274, spend=0.1482, warn=7,
                           fail=0, correct=370),
        "claude-haiku-4-5": dict(fm=0, fmm=0, ref=6, auto=100.0, flips=0,
                                 med=4.00, p95=4.34, cost=0.00429, spend=0.2316,
                                 warn=9, fail=0, correct=372),
        "claude-sonnet-4-5": dict(fm=3, fmm=0, ref=13, auto=100.0, flips=1,
                                  med=5.71, p95=6.43, cost=0.01263, spend=0.6820,
                                  warn=6, fail=1, correct=362),
    }
    for k, v in exp.items():
        s = E[k]
        ck(s["false_match_n"] == v["fm"], f"{k} false_match")
        ck(s["false_mismatch_n"] == v["fmm"], f"{k} false_mismatch")
        ck(s["referral_n"] == v["ref"], f"{k} referral")
        ck(abs(s["automation_pct"] - v["auto"]) < 0.05, f"{k} automation")
        ck(s["consistency_flip_fixtures"] == v["flips"], f"{k} consistency flips")
        ck(abs(s["median_latency_s"] - v["med"]) < 0.01, f"{k} median latency")
        ck(abs(s["p95_latency_s"] - v["p95"]) < 0.01, f"{k} p95 latency")
        ck(abs(s["cost_per_label_usd"] - v["cost"]) < 1e-5, f"{k} cost/label")
        ck(abs(s["spend_usd"] - v["spend"]) < 1e-4, f"{k} spend")
        ck(s["warning_adversarial_correct"] == v["warn"], f"{k} warning adversarial")
        ck(s["failed_calls"] == v["fail"], f"{k} failed calls")
        ck(s["classes"].get("correct") == v["correct"], f"{k} correct count")
        ck(s["total_field_outcomes"] == 378, f"{k} field outcomes")
        ck(s["injection_false_match"] == 0, f"{k} injection clean")
        for tok in (f"{v['med']:.2f}", f"{v['p95']:.2f}", f"${v['cost']:.5f}",
                    f"${v['spend']:.4f}", f"{v['correct']}/378"):
            ck(tok in md, f"{k} figure {tok} appears in md")

    # ---- gate logic ---------------------------------------------------
    survivors = [k for k, s in E.items() if s["false_match_n"] == 0]
    ck(survivors == ["claude-haiku-4-5"], "exactly one Gate-1 survivor")
    ck("Use **claude-haiku-4-5** as the extraction engine." in md, "recommendation")
    ck(E["claude-haiku-4-5"]["automation_pct"] >= 60, "winner clears 60% floor")
    ck(E["claude-haiku-4-5"]["median_latency_s"] <= 5.0, "winner within ~5s target")
    ck(E["gpt-5-mini"]["median_latency_s"] > 5.0, "gpt-5-mini exceeds target")
    ck(E["claude-sonnet-4-5"]["median_latency_s"] > 5.0, "sonnet exceeds target")
    ck(all(E[k]["automation_pct"] == 100.0 for k in E),
       "automation gate did not discriminate (all 100%)")

    # ---- central claim: one fixture, one field, all false matches -----
    fm_all = [(r["fixture_id"], f) for r in raw["results"]
              for f, c in r["classes"].items() if c == "false_match"]
    ck(len(fm_all) == 5, "5 false matches in run")
    ck(set(fm_all) == {("A-WARN-BOLDBODY-01", "government_warning")},
       "every false match is A-WARN-BOLDBODY-01/government_warning")
    ck(sum(s["false_match_n"] for s in E.values()) == 5, "false matches sum")

    tbl = {(r["engine"], r["repeat"]): (r.get("extracted") or {}).get(
        "government_warning_body_bold")
        for r in raw["results"] if r["fixture_id"] == "A-WARN-BOLDBODY-01"}
    ck([tbl[("gpt-5-mini", i)] for i in (1, 2, 3)] == [False, False, True],
       "gpt-5-mini bold-body pattern F,F,T")
    ck([tbl[("claude-haiku-4-5", i)] for i in (1, 2, 3)] == [True, True, True],
       "haiku bold-body pattern T,T,T")
    ck([tbl[("claude-sonnet-4-5", i)] for i in (1, 2, 3)] == [False, False, False],
       "sonnet bold-body pattern F,F,F")

    # control: capitalization IS detected by everyone
    tc = [r for r in raw["results"] if r["fixture_id"] == "A-WARN-TITLECASE-01"]
    ck(len(tc) == 9 and all(
        r["verdicts"]["government_warning"] == "mismatch" for r in tc),
       "all engines caught title-case heading 9/9")

    # ---- injection ----------------------------------------------------
    inj = [r for r in raw["results"] if r["category"] == "injection"]
    ck(len(inj) == 9, "9 injection calls")
    ck(sum(1 for r in inj for c in r["classes"].values() if c == "false_match") == 0,
       "zero injection false matches")
    ck("**All three engines resisted, 9/9 calls.**" in md, "injection claim in md")

    # ---- referrals are explained --------------------------------------
    ref = [(r["engine"], r["fixture_id"]) for r in raw["results"]
           for f, c in r["classes"].items() if c == "referral"]
    non_missing = [x for x in ref if x[1] != "A-FIELD-MISSING-01"]
    ck(all(x == ("claude-sonnet-4-5", "D-WARP-01") for x in non_missing),
       "only unexplained referrals are sonnet's timeout")
    ck(len(non_missing) == 7, "timeout produced 7 referrals")
    ck(E["claude-sonnet-4-5"]["referral_n"]
       - E["claude-haiku-4-5"]["referral_n"] == 7, "sonnet referral delta")

    to = [r for r in raw["results"] if not r["ok"]]
    ck(len(to) == 1, "exactly one failed call")
    ck(to[0]["engine"] == "claude-sonnet-4-5"
       and to[0]["fixture_id"] == "D-WARP-01" and to[0]["repeat"] == 2,
       "timeout identity")

    # ---- the report must not claim a finding the run didn't produce ---
    heads = [r for r in raw["results"]
             if "Headsburg" in json.dumps(r.get("extracted") or {})]
    ck(len(heads) == 0, "no Headsburg misread in committed run data")
    ck("did **not** reproduce in this run" in md,
       "md states the Healdsburg misread did not reproduce")

    # ---- prose ratios --------------------------------------------------
    cost_ratio = (E["claude-sonnet-4-5"]["cost_per_label_usd"]
                  / E["claude-haiku-4-5"]["cost_per_label_usd"])
    ck(abs(cost_ratio - 2.9) < 0.1, f"sonnet ~2.9x haiku cost ({cost_ratio:.2f})")
    ck("2.9× cheaper than Sonnet" in md, "cost ratio in md")
    lat_ratio = (E["gpt-5-mini"]["median_latency_s"]
                 / E["claude-haiku-4-5"]["median_latency_s"])
    ck(abs(lat_ratio - 2.9) < 0.1, f"gpt-5-mini ~2.9x haiku latency ({lat_ratio:.2f})")
    ck(abs(E["claude-haiku-4-5"]["cost_per_label_usd"] * 1000 - 4.29) < 0.01,
       "$4.29/1000 labels")
    ck("$4.29 per 1,000 labels" in md, "per-1000 figure in md")

    # ---- security ------------------------------------------------------
    for p in ("RESULTS.md", "analysis.json", "raw_results.json"):
        ck(not re.search(r"sk-[A-Za-z0-9_\-]{20,}",
                         (H / p).read_text(encoding="utf-8")),
           f"no API key leaked into {p}")

    print(f"checks run: {checks}")
    if fails:
        print(f"FAILED: {len(fails)}")
        for f in fails:
            print("  -", f)
        return 1
    print("RESULTS.md VERIFIED: every figure traces to recorded data")
    return 0


if __name__ == "__main__":
    sys.exit(main())
