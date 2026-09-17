#!/usr/bin/env python3
"""
run_bench.py -- executes the extraction benchmark defined in docs/BENCHMARK_PLAN.md.

Runs every fixture against every candidate engine N=3 times, records per-call
latency/tokens/cost, derives verdicts deterministically via bench/scoring.py, and
persists RAW per-call results to bench/raw_results.json so that RESULTS.md can be
generated from data rather than narrated from memory.

Spend control (THREAT_MODEL.md section 4): a hard USD ceiling is enforced in-process.
Cost is accumulated from measured token counts after every call and the run
ABORTS before issuing the next call if the ceiling would be approached. Partial
results are always flushed to disk, so an abort costs data-completeness, never
the data already paid for.

Usage:
  python bench/run_bench.py                     # full run, N=3
  python bench/run_bench.py --repeats 1         # cheaper smoke run
  python bench/run_bench.py --engines gpt-5-mini
  python bench/run_bench.py --max-spend 5.00
  python bench/run_bench.py --dry-run           # no API calls; plan + cost estimate
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import engines as E  # noqa: E402
import scoring as S  # noqa: E402

FIXTURES_DIR = ROOT / "fixtures"
RAW_PATH = HERE / "raw_results.json"

# Hard ceiling for this build's goal. Overridable downward, never silently up.
DEFAULT_MAX_SPEND_USD = 20.00
# Stop before a call that could plausibly cross the ceiling.
PER_CALL_HEADROOM_USD = 0.05


def log(msg: str) -> None:
    print(msg, flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=3, help="N repeats per fixture per engine")
    ap.add_argument("--engines", nargs="*", default=list(E.ENGINES))
    ap.add_argument("--max-spend", type=float, default=DEFAULT_MAX_SPEND_USD)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sleep", type=float, default=0.4, help="pause between calls (s)")
    args = ap.parse_args()

    max_spend = min(args.max_spend, DEFAULT_MAX_SPEND_USD)

    for k in args.engines:
        if k not in E.ENGINES:
            log(f"unknown engine: {k}; known: {list(E.ENGINES)}")
            return 2

    fixtures = S.load_fixtures(FIXTURES_DIR)
    total_calls = len(fixtures) * len(args.engines) * args.repeats

    log("=" * 78)
    log("TTB LABEL VERIFICATION -- EXTRACTION BENCHMARK")
    log("=" * 78)
    log(f"fixtures : {len(fixtures)}")
    log(f"engines  : {', '.join(args.engines)}")
    log(f"repeats  : N={args.repeats}")
    log(f"calls    : {total_calls}")
    log(f"spend cap: ${max_spend:.2f} (hard, enforced in-process)")
    log("")

    if args.dry_run:
        log("DRY RUN -- no API calls issued.")
        for k in args.engines:
            c = E.ENGINES[k]
            log(f"  {k:<20} {c['model']:<32} via {c['route']}")
        return 0

    env = E.load_env()
    missing = []
    for k in args.engines:
        prov = E.ENGINES[k]["provider"]
        need = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
        }[prov]
        if not env.get(need):
            missing.append(f"{k} requires {need}")
    if missing:
        log("ABORT -- missing credentials:")
        for m in missing:
            log(f"  {m}")
        return 2

    results: list[dict] = []
    spend = 0.0
    aborted = False
    abort_reason = ""
    t_start = time.time()
    call_no = 0

    for engine_key in args.engines:
        cfg = E.ENGINES[engine_key]
        log("-" * 78)
        log(f"ENGINE: {engine_key}  ({cfg['model']} via {cfg['route']})")
        log("-" * 78)

        for gt in fixtures:
            fid = gt["fixture_id"]
            img = gt["_image_path"]
            row_bits = []

            for rep in range(1, args.repeats + 1):
                if spend + PER_CALL_HEADROOM_USD > max_spend:
                    aborted = True
                    abort_reason = (
                        f"spend ceiling: ${spend:.4f} + headroom "
                        f"${PER_CALL_HEADROOM_USD:.2f} would exceed ${max_spend:.2f}"
                    )
                    break

                call_no += 1
                r = E.call_engine(engine_key, img, env)
                spend += r["cost_usd"]

                derived = S.derive_verdicts(r, gt["application"])
                scored = S.score_field_run(derived, gt["expected"])

                results.append({
                    "engine": engine_key,
                    "model": cfg["model"],
                    "route": cfg["route"],
                    "tier": cfg["tier"],
                    "fixture_id": fid,
                    "category": gt["category"],
                    "commodity": gt["commodity"],
                    "repeat": rep,
                    "ok": r["ok"],
                    "error_class": r.get("error_class"),
                    "schema_valid": r.get("schema_valid"),
                    "missing_keys": r.get("missing_keys", []),
                    "latency_s": round(r["latency_s"], 4),
                    "tokens_in": r["tokens_in"],
                    "tokens_out": r["tokens_out"],
                    "cost_usd": round(r["cost_usd"], 6),
                    "extracted": r.get("extracted"),
                    "verdicts": {f: scored[f]["derived"] for f in S.FIELDS},
                    "truth": {f: scored[f]["truth"] for f in S.FIELDS},
                    "classes": {f: scored[f]["class"] for f in S.FIELDS},
                    "reasons": {f: scored[f]["reason"] for f in S.FIELDS},
                })

                fm = sum(1 for f in S.FIELDS if scored[f]["class"] == "false_match")
                flag = "  <<< FALSE MATCH" if fm else ""
                row_bits.append(
                    f"r{rep}:{r['latency_s']:.1f}s"
                    + ("" if r["ok"] else f"/{r.get('error_class')}")
                    + flag
                )
                time.sleep(args.sleep)

            log(f"  {fid:<24} {'  '.join(row_bits)}   [${spend:.4f}]")
            if aborted:
                break
        if aborted:
            break

    elapsed = time.time() - t_start

    payload = {
        "run_metadata": {
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "fixtures": len(fixtures),
            "engines": args.engines,
            "repeats": args.repeats,
            "calls_planned": total_calls,
            "calls_executed": len(results),
            "elapsed_s": round(elapsed, 1),
            "total_spend_usd": round(spend, 6),
            "spend_cap_usd": max_spend,
            "aborted": aborted,
            "abort_reason": abort_reason,
            "confidence_threshold": S.CONFIDENCE_THRESHOLD,
            "engine_config": {
                k: {
                    "model": E.ENGINES[k]["model"],
                    "route": E.ENGINES[k]["route"],
                    "tier": E.ENGINES[k]["tier"],
                    "price_in_per_1m": E.ENGINES[k]["price_in"],
                    "price_out_per_1m": E.ENGINES[k]["price_out"],
                }
                for k in args.engines
            },
        },
        "results": results,
    }
    RAW_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    log("")
    log("=" * 78)
    if aborted:
        log(f"RUN ABORTED -- {abort_reason}")
    log(f"calls executed : {len(results)}/{total_calls}")
    log(f"elapsed        : {elapsed/60:.1f} min")
    log(f"total spend    : ${spend:.4f} of ${max_spend:.2f} cap")
    log(f"raw results    : {RAW_PATH}")

    fm_total = sum(
        1 for r in results for f in S.FIELDS if r["classes"][f] == "false_match"
    )
    err = sum(1 for r in results if not r["ok"])
    log(f"false matches  : {fm_total}")
    log(f"failed calls   : {err}")
    log("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
