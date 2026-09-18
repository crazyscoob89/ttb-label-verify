"""Offline, versioned final analysis. No credentials, transport or paid calls."""
from pathlib import Path
import sys,json,collections,statistics,datetime,hashlib,subprocess,csv
ROOT=Path(__file__).resolve().parent
V3ROOT=ROOT.parent/'recovery-v3'
sys.path.insert(0,str(V3ROOT))
import v3 as V
import report as R3

def field_metrics(rows,field):
 outcomes=collections.Counter(r.get('bottle_outcomes',{}).get(field,'flat') for r in rows)
 visible=[r for r in rows if r.get('visibility',{}).get(field,{}).get('visibility')=='visible']
 return dict(all_fields=len(rows),semantic_correct=sum(r['extraction_correct'][field] for r in rows),negative_fields=sum(r['truth'][field]=='mismatch' for r in rows),false_matches=sum(r['truth'][field]=='mismatch' and r['verdicts'][field]=='match' for r in rows),referrals=sum(r['verdicts'][field]=='needs-review' for r in rows),visible_denominator=len(visible),visible_semantic_correct=sum(r['extraction_correct'][field] for r in visible),visual_correct=outcomes['visual-correct'],hidden_correct_not_recovery=outcomes['unverifiable-correct-not-recovery'],confident_wrong=outcomes['dangerous-error'],safe_perceptual_referrals=outcomes['safe-referral'],failure_referrals=outcomes['failure-referral'],outcomes=dict(outcomes))

def cost_components(rows):
 ti=to=pages=0;ci=co=cp=0.;known=0;unknown=0
 for r in rows:
  if r.get('cost_usd') is None:unknown+=1
  else:known+=r['cost_usd']
  if r['model']==V.OCR:
   n=r.get('pages_processed') or 0;pages+=n;cp+=n*.003
  elif r['model'] in V.RATES and r.get('tokens_in') is not None and r.get('tokens_out') is not None:
   a,b=V.RATES[r['model']];ti+=r['tokens_in'];to+=r['tokens_out'];ci+=r['tokens_in']*a/1e6;co+=r['tokens_out']*b/1e6
  elif r['model'] in ['anthropic/claude-haiku-4.5','anthropic/claude-sonnet-4.5'] and r.get('tokens_in') is not None and r.get('tokens_out') is not None:
   a,b=(1,5) if 'haiku' in r['model'] else (3,15);ti+=r['tokens_in'];to+=r['tokens_out'];ci+=r['tokens_in']*a/1e6;co+=r['tokens_out']*b/1e6
 return dict(observed_total=known,unknown_calls=unknown,input_tokens=ti,output_tokens=to,pages=pages,input_usd=ci,output_usd=co,page_usd=cp,common_rate_recomputed_total=ci+co+cp,original_minus_common_rate_usd=known-ci-co-cp)

def paired(rows):
 # Fixed original AVA repeat1 only; no ARGUS or repeat selection after scoring.
 flat={}
 for r in rows:
  if r['operator']=='AVA' and r.get('condition','flat')=='flat' and r['repeat']==1:
   key=(r['model'],r['fixture_id'])
   if key in flat:raise ValueError('ambiguous flat pair')
   flat[key]=r
 pairs=[]
 for r in rows:
  if r['operator']!='AVA-v3' or r.get('condition','flat')=='flat' or r['repeat']!=1:continue
  a=flat.get((r['model'],r['fixture_id']))
  if a is None:continue
  pairs.append(dict(model=r['model'],fixture_id=r['fixture_id'],condition=r['condition'],flat_operator=a['operator'],flat_repeat=1,bottle_operator=r['operator'],bottle_repeat=1,paired_fields=len(V.S.FIELDS),flat_extraction=sum(a['extraction_correct'].values()),bottle_extraction=sum(r['extraction_correct'].values()),flat_ok=a['ok'],bottle_ok=r['ok'],flat_latency_s=a.get('latency_s'),bottle_latency_s=r.get('latency_s'),note='Same source label/prompt; different image bytes, run time and concurrency. Descriptive paired observation, not causal or real-camera validation.'))
 return pairs

def finished_scope(result,planned_ids,saved_ids):
 return bool(result.get('terminal') and all(x.get('reason') in ['budget','two-transport-failures','user-rejected-artificial-occlusion-not-realistic-glare'] for x in result.get('blocked',[])) and set(planned_ids)==set(saved_ids)|{x['id'] for x in result.get('blocked',[])})

def main():
 result=V.load(V3ROOT/'execution-result.json')
 plan=V.load(V3ROOT/'execution-plan.json')
 saved_ids=[p.stem for p in (V3ROOT/'rows').glob('*.json')]
 if not finished_scope(result,plan['candidate_ids'],saved_ids):raise SystemExit('Refuse final closeout until every candidate is saved or explicitly budget/transport blocked; stop-file is NOT completion')
 R3.main()
 rows=V.load(V3ROOT/'all-rescored-records.json');groups=V.load(V3ROOT/'summary.json');costs=V.load(V3ROOT/'costs-final.json')
 V.save(ROOT/'primary-summary.json',[g for g in groups if g['condition']!='glare'])
 V.save(ROOT/'rejected-occlusion-summary.json',[g for g in groups if g['condition']=='glare'])
 V.save(ROOT/'scope.json',{'overall_requested_benchmark_complete':False,'realistic_glare_completed':False,'excluded_condition':'glare','excluded_condition_interpretation':'user-rejected artificial occlusion, archived only; not realistic reflection','primary_conditions':['flat','straight','angle'],'preserve_prior_glare_costs':True,'source_handoff':str(V.BASE/'GLARE-CORRECTION-HANDOFF.txt'),'source_handoff_sha256':V.sha(V.BASE/'GLARE-CORRECTION-HANDOFF.txt'),'runner_exclusion_sha256':V.sha(V3ROOT/'glare-exclusion.json'),'bottle_repeats':1,'flat_repeats_target':3})
 out=[];components=[]
 for key in sorted({R3.group_key(r) for r in rows}):
  rs=[r for r in rows if R3.group_key(r)==key]
  components.append(dict(operator=key[0],model=key[1],condition=key[2],**cost_components(rs)))
  for field in V.S.FIELDS:out.append(dict(operator=key[0],model=key[1],condition=key[2],field=field,**field_metrics(rs,field)))
 V.save(ROOT/'field-summary.json',out);V.save(ROOT/'cost-components.json',components)
 ps=paired(rows);V.save(ROOT/'paired-flat-bottle.json',ps)
 paired_groups=[]
 for key in sorted({(p['model'],p['condition']) for p in ps}):
  p=[x for x in ps if (x['model'],x['condition'])==key]
  paired_groups.append(dict(model=key[0],condition=key[1],pairs=len(p),fields=sum(x['paired_fields'] for x in p),flat_correct=sum(x['flat_extraction'] for x in p),bottle_correct=sum(x['bottle_extraction'] for x in p),median_flat_s=statistics.median(x['flat_latency_s'] for x in p),median_bottle_s=statistics.median(x['bottle_latency_s'] for x in p)))
 V.save(ROOT/'paired-summary.json',paired_groups)
 # Report record-level and field-level negative denominators separately.
 negcases=[]
 for key in sorted({R3.group_key(r) for r in rows}):
  rs=[r for r in rows if R3.group_key(r)==key and any(t=='mismatch' for t in r['truth'].values())]
  negcases.append(dict(operator=key[0],model=key[1],condition=key[2],negative_calls=len(rs),calls_with_false_match=sum(any(r['truth'][f]=='mismatch' and r['verdicts'][f]=='match' for f in V.S.FIELDS) for r in rs)))
 V.save(ROOT/'negative-case-summary.json',negcases)
 lines=['TTB LABEL VERIFIER — BOUNDED RESULTS / REALISTIC GLARE INCOMPLETE','',
 'Permitted continuation finished to recorded budget/scope boundaries. ARGUS QA ONLY: one consolidated read-only PASS/REVISE on these results; no implementation, no paid reruns.',
 'OVERALL REQUESTED BENCHMARK IS NOT COMPLETE: realistic-glare fixtures/testing remain outstanding. Alex rejected the broad white glare band because it erases text rather than representing realistic reflection. The parent correction handoff explicitly froze that condition and limited this worker to reporting.',
 'All prior glare images, predictions, costs and visibility annotations are preserved as REJECTED ARTIFICIAL OCCLUSION CONTROLS ONLY. They are excluded from realistic-glare comparisons, model recommendations and acceptance. No corrected-glare calls were run. Straight/angle and flat evidence retain their existing limitations.',
 'Scope authority/provenance: ../GLARE-CORRECTION-HANDOFF.txt and ../recovery-v3/glare-exclusion.json. Separate offline replacement preview is the next gate before any paid realistic-glare run.',
 'Report generated UTC: '+datetime.datetime.now(datetime.timezone.utc).isoformat(),
 '', 'DECISION SUMMARY',
 'Historical Haiku remains the strongest complete flat-label reference in the preserved data: 378/378 normalized field extractions, 0/24 negative-field false matches, 12/12 clean calls fully automatic; 4.001s median / 4.342s p95. It was OpenRouter -> Anthropic, NOT Foundry.',
 'Foundry selection must account for both false matches and failure/referral rates. Zero false matches is not proof of safe perception when schema rejection or unrelated warning mismatches prevent automation.',
 'Key bottle finding: all six tested Foundry deployments produced at least one false match on angled synthetic bottles (OCR remains a separate service track; Kimi coverage is partial). None earned an unattended compliance-approval recommendation. Historical Haiku was NOT tested on these bottle images.',
 'Current accepted synthetic-condition coverage: five deployments completed 18 straight +18 angle calls each; Kimi completed10 straight +9 angle, with17 remaining calls blocked by the conservative budget guard.59 previously paid rejected-occlusion calls remain archived and charged.49 genuinely missing flat calls were completed; lost prior log-only outputs were not rerun.',
 'Do not use any result here to promise arbitrary bottle-photo compliance. Real-camera validation and physical warning-size verification remain untested. Glare-correct guesses are explicitly not visual recovery.',
 '', 'COVERAGE AND COST',
 f"Saved/scored earlier observations: 515. New v3 observations: {result['rows']}. Exact flat and bottle coverage follows in the embedded report.",
 f"Foundry observed estimate ${costs['combined_observed_estimate_usd']:.8f}, plus approximately $0.024 of separately preserved rounded smoke costs, PLUS unresolved charges. New v3 estimate ${costs['new_observed_estimate_usd']:.8f}. Historical prior experiment ${costs['historical_separate_usd']:.6f} separate.",
 f"Conservative incurred + unknown liability ${costs['liability_guard_usd']:.8f} against authorised $10.00. This is NOT actual spend/invoice settlement. Positive unknown reserves remain.",
 'The v3 continuation was resumed after a container restart: all 104 prior v3 rows were retained, none replayed. resume-preflight.json records refreshed host queue/artifact evidence, original runner kill handoff, shared-lock reuse and passing tests.',
 'Accounting correction: the OCR annotation route returned pages_processed=0 but pages_processed_annotation=1 plus one page. The first31 v3 OCR calls were mistakenly recorded as free; +$0.093 was restored to observed cost and the ledger before continuation. Original rows/attempts/ledger are preserved in accounting-before/, all responses and predictions are unchanged. Accounting-repair.json and regression tests document the correction. Earlier interim snapshots are superseded.',
 'No Claude reruns, no deployment, no external contact, no recursive cron. Historical and operator protocols are deliberately separate.',
 '', 'COST DECOMPOSITION (USD, no cache discount; observed rows only, no log-only usage invented)',
 'operator | model | condition | input tokens/input USD | output tokens/output USD | pages/page USD | observed row USD | unknown-cost calls']
 for c in components:lines.append(f"{c['operator']} | {c['model']} | {c['condition']} | {c['input_tokens']}/{c['input_usd']:.8f} | {c['output_tokens']}/{c['output_usd']:.8f} | {c['pages']}/{c['page_usd']:.8f} | {c['observed_total']:.8f} | {c['unknown_calls']}")
 lines+=['Original ARGUS row costs can differ at rounding precision; original costs retained, common-rate recomputation recorded separately. Row sums exclude log-only, probes and unknown liabilities: use costs-final.json for comparison-wide accounting.',
 '', 'PAIRED FLAT/BOTTLE — fixed original AVA repeat1, never cherry-picked; no ARGUS pooling; GLARE ROWS ARE REJECTED OCCLUSION CONTROLS, NOT PRIMARY COMPARISONS',
 'model | condition | paired images | flat correct/fields | bottle semantic correct/fields | median flat/bottle seconds']
 for p in paired_groups:lines.append(f"{p['model']} | {p['condition']} | {p['pairs']} | {p['flat_correct']}/{p['fields']} | {p['bottle_correct']}/{p['fields']} | {p['median_flat_s']:.3f}/{p['median_bottle_s']:.3f}")
 lines+=['These are paired descriptive observations with differing run concurrency/time. Semantic extraction includes correctly null absent fields and unverifiable hidden guesses; use visibility metrics below for visual recovery. Not a causal provider ranking.',
 '', 'NEGATIVE CASES (calls, distinct from negative-field denominator)',
 'operator | model | condition | calls containing a false match / calls containing at least one negative field']
 for n in negcases:lines.append(f"{n['operator']} | {n['model']} | {n['condition']} | {n['calls_with_false_match']}/{n['negative_calls']}")
 lines+=['', 'BOTTLE PER-FIELD AUDIT — each denominator is actual observed calls, not all planned calls; glare is rejected artificial occlusion only',
 'model | condition | field | semantic correct/all | visible correct/visible | hidden-correct NOT recovery | confident-wrong | safe perceptual referrals | failure referrals']
 for f in out:
  if f['condition']=='flat':continue
  lines.append(f"{f['model']} | {f['condition']} | {f['field']} | {f['semantic_correct']}/{f['all_fields']} | {f['visible_semantic_correct']}/{f['visible_denominator']} | {f['hidden_correct_not_recovery']} | {f['confident_wrong']} | {f['safe_perceptual_referrals']} | {f['failure_referrals']}")
 lines+=['Visible semantic accuracy counts exact extracted text even if confidence caused referral. Visual-correct in v3 instead requires a non-referral verdict. Zero visible denominator means not applicable, never 0% or 100%.',
 'Confident-wrong is broad incorrect non-referral extraction, not necessarily an unsafe automatic match: it can produce a correct rejection for the wrong reason. The false-match column separately measures unsafe acceptance among true negatives.',
 '', 'EXACT BUDGET / TRANSPORT BOUNDARIES']
 for x in result['blocked']:lines.append(json.dumps(x,sort_keys=True))
 if not result['blocked']:lines.append('No candidate blocked by the v3 execution guard.')
 lines+=['', 'PROVENANCE AND VERIFICATION',
 'Baseline source SHA: 4039ccce1912130e3cc9c015e439bf62f720d32f. Inherited ARGUS base: d74bd6a9fecb06118e171be0a895761f609a4439. AVA initial integration: 80dfb661f9a21fb028de77f6861c2bb9a9c45593.',
 'Final integration Git SHA is recorded separately in git-integration.json (written after the evidence commit, outside its self-referential hash set). Test commands/status, exact evidence tree hashes, duplicate/ledger/response audits and source invariants are in verification.json and artifact-hashes.json. Final report includes no credentials.',
 'Historical and ARGUS evidence consists of saved observation documents with raw_text/usage, not independently preserved full HTTP envelopes. Original AVA has 243 exact bodies for 245 rows; failed calls differ. v3 responses/ retains every received body including malformed outputs and HTTP failures.',
 'Frozen v3 annotations were made before inference and are independent of model predictions; this is AVA visual annotation, not independent human double-labelling. v4 native review did not alter them.',
 'Portable standalone runner not claimed: original absolute paths retained for fidelity; this recorded environment has all referenced immutable sources. QA is read-only.',
 'Authoritative final root: '+str(ROOT),
 'Shared Windows root: C:\\Users\\alexm\\.hermes\\benchmarks\\ttb-foundry-20260918-v1\\recovery-v4\\',
 '', '=== DETAILED V3 OPERATOR / MODEL / CONDITION REPORT ===',
 'Scope override for the legacy tables below: every REJECTED-occlusion row is historical artificial-occlusion stress evidence, NOT accepted realistic glare. The top-level scope statement supersedes any earlier v3 wording about three completed conditions.',
 '', (V3ROOT/'REPORT.txt').read_text().replace('| glare |','| REJECTED-occlusion |')]
 (ROOT/'REPORT.txt').write_text('\n'.join(lines).rstrip()+'\n')
 print(json.dumps({'report':str(ROOT/'REPORT.txt'),'field_groups':len(out),'paired_rows':len(ps),'cost_groups':len(components),'terminal':True}))
if __name__=='__main__':main()
