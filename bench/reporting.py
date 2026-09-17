#!/usr/bin/env python3
"""Deterministic report generation from independently replayed benchmark evidence."""
import json
from pathlib import Path
from analyze import analyze
from replay import derive

HERE = Path(__file__).resolve().parent


def render(data, analysis):
    m = data['run_metadata']
    lines = [
        '# Extraction Benchmark — Verified Offline Replay', '',
        'Original run: ' + m['timestamp_utc'] + '. No new inference calls were made for this revision.', '',
        f"- Recorded observations: {m['calls_executed']} calls; {m['fixtures']} synthetic fixtures; N={m['repeats']}; {len(m['engines'])} engines.",
        '- `raw_results.json` preserves the original parsed extractions, usage, and historical verdict caches byte-for-byte. It is not a verbatim provider-response archive.',
        '- `replayed_results.json` contains current-rule verdicts and their explicit changes from the original run; `analysis.json` is recomputed from that replay.',
        '- `evidence_manifest.json` pins the raw file and every fixture image/ground-truth file; the required gate rejects missing, changed, duplicate, or incomplete evidence.', '',
        '## Current-rule comparison', '',
        '| Engine | False matches / negative outcomes | False matches / all outcomes | Referrals | Clean automation | Unstable fixtures | Median engine-call s | p95 individual-call s | Token-derived USD |',
        '|---|---|---|---|---|---|---|---|---|',
    ]
    for name, e in analysis['engines'].items():
        n = e['total_field_outcomes']
        neg = e['negative_outcomes']
        lines.append(f"| {name} | {e['false_match_n']}/{neg} ({100*e['false_match_n']/neg:.2f}%) | {e['false_match_n']}/{n} ({e['false_match_pct']:.2f}%) | {e['referral_n']}/{n} | {e['automation_definitive']}/{e['automation_total']} ({e['automation_pct']:.1f}%) | {e['consistency_flip_fixtures']} | {e['median_latency_s']:.2f} | {e['p95_latency_s']:.2f} | ${e['spend_usd']:.6f} |")
    lines += ['', 'Median engine-call latency is the median of each fixture\'s N=3 median. p95 uses the ordered individual call observations (floor-index 0.95*(n-1)). Neither includes browser upload, app intake, deterministic rule execution, or result rendering; the deployed ~5-second target is not certified here.', '',
              '## Separate accuracy measures', '',
              '| Engine | Normalized extracted-value accuracy | Recorded expected-outcome agreement | Expected safe-outcome accuracy | Adversarial warning correct | Failed calls |',
              '|---|---|---|---|---|---|']
    for name, e in analysis['engines'].items():
        n=e['total_field_outcomes']
        lines.append(f"| {name} | {e['extraction_correct_n']}/{n} | {e['recorded_outcome_correct_n']}/{n} | {e['safe_outcome_correct_n']}/{n} | {e['warning_adversarial_correct']}/{e['warning_adversarial_total']} | {e['failed_calls']} |")
    lines += ['',
        'Extracted-value accuracy compares observations with constructed label_actual, not applicant declarations or model confidence. Seven fields are evaluated; a warning is correct only when heading/case, normalized body words, and all three boolean formatting properties agree. Other text uses case/punctuation normalization. Null is correct only for a constructed absent field. This is not character-level OCR accuracy; it is independent of verdict accuracy.',
        'Recorded expected-outcome agreement uses the unchanged fixture expected map. Despite a stale explanatory note claiming otherwise, A-FIELD-MISSING-01 already records needs-review for its two absent fields; those correct referrals were previously excluded by the aggregate correct counter. Safe-outcome accuracy explicitly expects referral for absent required observations and agrees with the recorded map on this corpus. No source truth has been redefined to inflate accuracy. Correct referrals are human workload, not false matches or false mismatches. Physical warning type size is a separate mandatory human check and is excluded from these seven-field statistics.', '',
        '## Explicit replay changes', '']
    changes=data['replay_metadata']['verdict_changes']
    lines.append(f'{len(changes)} field verdict(s) changed under the corrected validation/confidence rules:')
    for c in changes:
        lines.append(f"- {c['engine']} / {c['fixture_id']} / repeat {c['repeat']} / {c['field']}: {c['before']} → {c['after']}.")
    lines += ['', 'No source extraction, usage observation, fixture image, or fixture semantic truth was altered to produce these changes.', '', '## Engine recommendation', '']
    survivors=[name for name,e in analysis['engines'].items() if e['false_match_n']==0 and e['automation_pct']>=60]
    if len(survivors)==1:
        lines.append('**Provisional recommendation: '+survivors[0]+'**. It is the only tested candidate with zero observed false matches and at least 60% clean-field automation under the corrected rules.')
    else:
        lines.append('Candidates passing the two gates: '+(', '.join(survivors) or 'none')+'. No automatic sole-engine recommendation.')
    lines += ['',
        'Zero observed false matches is a finite-test observation, not proof of zero real-world errors. The bold-body warning fixture explains the recorded false matches; the clean control and bold-body variant were visually reviewed. One injection phrase does not demonstrate general prompt-injection immunity.', '',
        '## Cost and routing limits', '']
    token_total=sum(r['cost_usd'] for r in data['results'])
    lines += [f'- Sum of per-call rounded token-derived estimates: ${token_total:.6f}; original unrounded accumulator recorded ${m["total_spend_usd"]:.6f}. The small difference is per-call rounding.',
              '- The original report additionally stated $0.0200 for a probe and $0.0773 for smoke validation, producing a reported rounded total of $1.1591. Their per-call records are not present here; this combined figure is not independently verified or an invoice total.',
              f'- The recorded runner estimator threshold was ${m["spend_cap_usd"]:.2f}, within the authorised $20 overall budget. Its per-process estimate and headroom were not proof of an account-wide hard cap. Unknown timeout charges are not zero-cost evidence.',
              '- Anthropic candidates used OpenRouter; GPT-5-mini used the direct OpenAI Responses API. These are different transport paths. Pricing constants are historical assumptions, not newly verified provider quotations.',
              '- Paid benchmark execution is disabled in this archived revision; --dry-run remains available. No automated rerun is authorised by regenerating evidence. Before a future paid run, establish a proven spending bound including failures and previously incurred spend.', '',
              '## Remaining acceptance boundaries', '',
              '- A non-bold warning heading and unreadable-value behavior are covered by offline rule regressions, not new image-based engine observations. Non-bold-heading and genuinely unreadable/cropped image extraction remain untested by this run.',
              '- No web app, production deployment, public-access spending cap, provider-retention validation, or deployed end-to-end latency acceptance is implied.',
              '- Public provider-backed access remains disabled until a verified enforced account/key cap or tested shared global quota exists. Manual kill switches and per-instance quotas cannot substitute.',
              '- Application processing must be verified buffer-only; synthetic offline fixtures/results intentionally persist on disk. Browser, platform, OpenRouter and upstream-provider handling require separate disclosures. Synthetic-only until actual route retention is verified.', '',
              '## Reproduction', '', '```sh', 'python3 bench/reporting.py', 'python3 bench/test_results_integrity.py', 'python3 bench/test_integrity_mutations.py', '```', '',
              'Generation is offline and preserves the immutable input evidence. The required integrity gate independently recomputes current verdicts, all derived records, aggregates and this complete rendered report; missing evidence fails rather than skips.', '']
    return '\n'.join(lines)


def main():
    data=derive(HERE)
    analysis=analyze(data)
    for name,obj in [('replayed_results.json',data),('analysis.json',analysis)]:
        (HERE/name).write_text(json.dumps(obj,indent=2)+'\n')
    (HERE/'RESULTS.md').write_text(render(data,analysis))
    print('Regenerated replay, analysis and report OFFLINE; paid calls: 0')

if __name__=='__main__':
    main()
