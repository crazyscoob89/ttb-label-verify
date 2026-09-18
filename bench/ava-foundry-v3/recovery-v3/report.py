"""Deterministic evidence report; no network/provider calls."""
import v3 as V
from v3 import *
import statistics,csv,platform,subprocess

def group_key(r):return (r['operator'],r['model'],r.get('condition','flat'))
def summarize(rs):
 lat=[r['latency_s'] for r in rs if isinstance(r.get('latency_s'),(int,float))]
 classes=collections.Counter(v for r in rs for v in r['classes'].values())
 bs=collections.Counter(v for r in rs for v in r.get('bottle_outcomes',{}).values())
 clean=[r for r in rs if r['category']=='clean']
 auto=lambda r:r['ok'] and all(r['verdicts'][f]==r['truth'][f] and r['verdicts'][f]!='needs-review' for f in S.FIELDS) and all(v in ['visual-correct','correct-absence-not-applicable'] for v in r.get('bottle_outcomes',{}).values())
 return {'calls':len(rs),'valid':sum(bool(r['ok']) for r in rs),'unique_images':len({r['fixture_id'] for r in rs}),'field_n':len(rs)*len(S.FIELDS),'extraction_n':sum(sum(r['extraction_correct'].values()) for r in rs),'negative_fields':sum(t=='mismatch' for r in rs for t in r['truth'].values()),'false_matches':classes['false_match'],'referrals':sum(v=='needs-review' for r in rs for v in r['verdicts'].values()),'clean_n':len(clean),'clean_auto_n':sum(auto(r) for r in clean),'failure_n':sum(not r['ok'] for r in rs),'failure_classes':dict(collections.Counter(r.get('error_class') or 'unspecified' for r in rs if not r['ok'])),'median_s':statistics.median(lat) if lat else None,'p95_s':S.percentile(lat,.95) if lat else None,'latency_n':len(lat),'observed_cost_usd':sum(r.get('cost_usd') or 0 for r in rs),'unknown_cost_calls':sum(r.get('cost_usd') is None for r in rs),'input_tokens':sum(r.get('tokens_in') or 0 for r in rs),'output_tokens':sum(r.get('tokens_out') or 0 for r in rs),'pages':sum(r.get('pages_processed') or 0 for r in rs),'classes':dict(classes),'visual_recovery_n':bs['visual-correct'],'hidden_correct_n':bs['unverifiable-correct-not-recovery'],'dangerous_extraction_n':bs['dangerous-error'],'safe_referral_n':bs['safe-referral'],'bottle_outcomes':dict(bs)}

def warning_checks(r,g):
 if not r['ok']:return {'wording':False,'typography':False}
 ex=r.get('extracted') or {};gw=g['label_actual']['government_warning']
 return {'wording':ex.get('government_warning_heading')==gw['heading'] and isinstance(ex.get('government_warning_body'),str) and S.norm_words(ex['government_warning_body'])==S.norm_words(gw['body']), 'typography':all(type(ex.get(k)) is bool and ex[k]==gw[t] for k,t in [('government_warning_heading_all_caps','heading_is_all_caps'),('government_warning_heading_bold','heading_is_bold'),('government_warning_body_bold','body_is_bold')])}

def main():
 old=load(BASE/'recovery-v2/rescored-records.json');new=[load(p) for p in sorted((ROOT/'rows').glob('*.json'))];rows=old+new
 fixtures=R.load_evidence()[1]
 for r in rows:
  r.setdefault('condition','flat');r['warning_checks']=warning_checks(r,fixtures[r['fixture_id']])
  if r['operator']=='AVA':
   if r['model']==OCR:
    p=BASE/'responses'/f"{r['model']}--{r['fixture_id']}--{r['repeat']}.json"
    if p.exists():r['pages_processed']=len(load(p).get('pages',[]));r['cost_usd']=r['pages_processed']*.003
   elif r.get('tokens_in') is not None:
    a,b=RATES[r['model']];r['cost_usd']=(r['tokens_in']*a+r['tokens_out']*b)/1e6
  r['source_row_sha256']=None
  if r['operator']=='AVA-v3':r['source_row_sha256']=sha(ROOT/'rows'/(r['id']+'.json'))
  elif r['operator']=='AVA':r['source_row_sha256']=sha(BASE/'rows'/f"{r['model']}--{r['fixture_id']}--{r['repeat']}.json")
 groups=[]
 for key in sorted({group_key(r) for r in rows}):
  rs=[r for r in rows if group_key(r)==key];s=summarize(rs)
  s.update(operator=key[0],model=key[1],condition=key[2],warning_wording_n=sum(r['warning_checks']['wording'] for r in rs),warning_typography_n=sum(r['warning_checks']['typography'] for r in rs),warning_denominator=len(rs),returned_models=sorted({r.get('returned_model') or 'not-preserved' for r in rs}))
  groups.append(s)
 save(ROOT/'all-rescored-records.json',rows);save(ROOT/'summary.json',groups)
 # Each sample/condition has an explicit repeats/field denominator.
 sample=[]
 for key in sorted({(*group_key(r),r['fixture_id']) for r in rows}):
  rs=[r for r in rows if (*group_key(r),r['fixture_id'])==key];s=summarize(rs)
  sample.append({'operator':key[0],'model':key[1],'condition':key[2],'fixture_id':key[3],**s})
 save(ROOT/'per-sample-summary.json',sample)
 columns=['operator','model','condition','fixture_id','repeat','field','schema_ok','extraction_correct','truth','verdict','class','visibility','bottle_outcome','latency_s','call_cost_usd_repeated','input_tokens','output_tokens','pages']
 with (ROOT/'per-field.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
  for r in rows:
   for field in S.FIELDS:
    w.writerow(dict(operator=r['operator'],model=r['model'],condition=r['condition'],fixture_id=r['fixture_id'],repeat=r['repeat'],field=field,schema_ok=r['ok'],extraction_correct=r['extraction_correct'][field],truth=r['truth'][field],verdict=r['verdicts'][field],**{'class':r['classes'][field]},visibility=r.get('visibility',{}).get(field,{}).get('visibility','flat-not-annotated'),bottle_outcome=r.get('bottle_outcomes',{}).get(field,''),latency_s=r.get('latency_s'),call_cost_usd_repeated=r.get('cost_usd'),input_tokens=r.get('tokens_in'),output_tokens=r.get('tokens_out'),pages=r.get('pages_processed')))
 result=load(ROOT/'execution-result.json') if (ROOT/'execution-result.json').exists() else {'terminal':False,'blocked':[]}
 basis=load(ROOT/'budget-basis.json');recon=load(BASE/'recovery-v2/reconciliation.json')
 newflat=[r for r in new if r['condition']=='flat'];newb=[r for r in new if r['condition']!='flat']
 budget=Budget(ROOT/'budget.sqlite',10);newspent=sum(r.get('cost_usd') or 0 for r in new)
 observed=recon['costs']['combined_including_log_only_estimate_usd']+recon['costs']['prior_AVA_smoke_estimate_usd']+newspent
 costs={'preflight':basis,'new_observed_estimate_usd':newspent,'combined_observed_estimate_usd':observed,'combined_plus_smoke_console_estimate_usd':observed+.024,'historical_separate_usd':recon['costs']['historical_saved_record_estimate_usd'],'liability_guard_usd':budget.total(),'not_invoice_verified':True,'unknown_new_calls':sum(r.get('cost_usd') is None for r in new),'ledger':budget.entries()}
 save(ROOT/'costs-final.json',costs)
 # Unique flat coverage preserves multiplicity/operator detail elsewhere.
 cov=[]
 for model in MODELS:
  rs=[r for r in rows if r['operator']!='historical' and r['model']==model and r['condition']=='flat']
  ids={(r['fixture_id'],r['repeat']) for r in rs};expected={(fid,rep) for fid in fixtures for rep in range(1,4)}
  cov.append({'model':model,'saved_unique_flat_identities':len(ids),'target_identities':54,'saved_calls_all_operators':len(rs),'no_saved_output':[{'fixture_id':f,'repeat':n} for f,n in sorted(expected-ids)]})
 save(ROOT/'flat-coverage.json',cov)
 lines=['TTB FOUNDRY + SYNTHETIC BOTTLE BENCHMARK — AVA RECOVERY V3','',
 'STATUS: '+('EXECUTION TERMINAL; scope below is actual coverage, not an assertion of balanced completeness.' if result['terminal'] else 'INTERIM SNAPSHOT — RUN NOT TERMINAL'),
 f"Preserved/rescored: {len(old)} earlier saved calls; added {len(newflat)} flat calls and {len(newb)}/324 planned one-repeat bottle calls.",
 'Historical: Haiku/Sonnet via OpenRouter -> Anthropic. Historical GPT-5 mini DIRECT OpenAI Responses. New calls Azure Foundry.',
 'No production deployment. AVA implements/executes; ARGUS one read-only consolidated PASS/REVISE.',
 '', '1. RESULTS — OPERATOR/PROTOCOL GROUPS ARE NOT POOLED',
 'operator | model | condition | valid/calls | exact-normalized extraction/7-fields-per-call | false-match/negative fields | referrals/all fields | clean-auto/clean calls | median/p95 seconds | estimated USD']
 for g in groups:
  lines.append(f"{g['operator']} | {g['model']} | {g['condition']} | {g['valid']}/{g['calls']} | {g['extraction_n']}/{g['field_n']} | {g['false_matches']}/{g['negative_fields']} | {g['referrals']}/{g['field_n']} | {g['clean_auto_n']}/{g['clean_n']} | {g['median_s']:.3f}/{g['p95_s']:.3f} | {g['observed_cost_usd']:.8f}")
 lines+=['','Extraction includes correctly null absent fields. Semantic correctness on obscured fields is NOT visual recovery. Runtime verdicts never receive visibility/truth; annotations only affect offline evaluation.',
 '', '2. BOTTLE VISIBILITY / DANGEROUS ERRORS',
 'model | condition | visual-correct | correct-hidden-NOT-recovery | confident-wrong | safe-referrals | all field outcomes']
 for g in groups:
  if g['condition']!='flat':lines.append(f"{g['model']} | {g['condition']} | {g['visual_recovery_n']} | {g['hidden_correct_n']} | {g['dangerous_extraction_n']} | {g['safe_referral_n']} | {g['field_n']}")
 lines+=['Confident-wrong is an incorrect extraction allowed into a non-referral deterministic verdict; this is broader than false-match among negative application fields. Invalid-schema/HTTP failures yield failure-referrals, never rewarded as perceptual abstention.',
 'An exact hidden value receives unverifiable-correct-not-recovery, not visual credit or clean automatic success. Absent domestic origin resolved not-applicable is counted separately.',
 '54 images = original18 x straight/angle/glare. Straight preserves original bottle pixels. Angle uses cos(30-degree) horizontal affine foreshortening plus shear, not a physically accurate 3D rotation. Glare has an opaque central core plus 0.65px blur.',
 'No retyped/regenerated text; source label -> original cylindrical composite -> condition image hashes retained. Semantic truth files copied byte-for-byte.',
 'Resolution 2200x3200, label approximately1200x1800 before angle: provider resizing may change effective text resolution. Not real-camera validation, not physical point-size certification.',
 'Pre-inference AVA visual annotations: all54 overview crops, native degraded/typography/glare representatives. No model outputs used. Not independent human inter-rater validation; not 54 exhaustive native transcriptions.',
 'D-BLUR warning typography marked uncertain (referral acceptable); D-GLARE original low-contrast letters readable in native view, not automatically obscured. New glare fields genuinely lose central characters.',
 '', '3. WARNING WORDING VS TYPOGRAPHY', 'operator | model | condition | wording correct/calls | three typography flags correct/calls']
 for g in groups:lines.append(f"{g['operator']} | {g['model']} | {g['condition']} | {g['warning_wording_n']}/{g['calls']} | {g['warning_typography_n']}/{g['calls']}")
 lines+=['These are semantic comparisons, not recovery claims for glare. Exact warning heading + normalized body words tested separately from all-caps/heading-bold/body-bold booleans.',
 '', '4. COVERAGE, FAILURE AND LOST OUTPUTS']
 for c in cov:lines.append(f"{c['model']}: {c['saved_unique_flat_identities']}/54 unique flat fixture-repeat identities with saved output ({c['saved_calls_all_operators']} observations across separate operators).")
 lines += [f"Log-only ARGUS completions retained: {recon['argus_log_only']['completed_logged_calls']}; no recoverable extraction/body/exact usage. Not rerun for parity. They are excluded from accuracy, not invented as successes."]
 for g in recon['argus_log_only']['groups']:lines.append(f"Log-only {g['model']}: n={g['calls']}; rounded latency median={g['latency_s']['median']:.3f}s p95={g['latency_s']['p95']:.3f}s; accuracy unavailable.")
 lines += ['ARGUS run2 args allowed GPT4.1 + GPT5 only, sequential source. Latest logged GPT5 has45/54; all nine possible unlogged tail attempts reserved/excluded. No Kimi battery could dispatch from that invocation.',
 f"New skipped candidates: {len(result['blocked'])}; reasons {dict(collections.Counter(x['reason'] for x in result['blocked']))}. Exact per-call boundary in execution-result.json."]
 for g in groups:
  if g['failure_n']:lines.append(f"{g['operator']} {g['model']} {g['condition']}: {g['failure_n']}/{g['calls']} failed strict gate; {g['failure_classes']}")
 lines += ['', '5. SPEND — RETAIL ESTIMATES, NOT INVOICE ACTUALS',f"Human allowance: $10.00, NOT $20. New observed estimated cost: ${newspent:.8f}.",f"Combined Foundry observed estimate incl historical run1/run2 saved/log-only and prior AVA smoke: ${observed:.8f}, PLUS unresolved charges. Additional ARGUS five-smoke console estimate about $0.024 (rounding-limited).",f"Conservative incurred + unknown + new ledger liability: ${budget.total():.8f}; initial liability ${basis['base_liability_usd']:.8f}; initial headroom ${basis['headroom_usd']:.8f}.",f"Historical prior comparison cost separate: ${costs['historical_separate_usd']:.6f}; not charged again against this continuation. Original AVA guard $6.4538618 was not spend.", 'Liability components (positive unknowns never forgiven):']
 for x in basis['parts']:lines.append(f"  {x['id']}: ${x['usd']:.8f} — {x['kind']}")
 lines+=['33 previously returned OCR pages reconciled at .003/page; only two HTTP429 page attempts retain .05 each. Three interrupted AVA chat reservations retain1.1699336 each.',
 'Probe/dialect bounds rely on fixed payload source and observed input sizes with generous slack, NOT provider invoice verification: 4096 tiny-probe input vs observed max298; rejected Mistral identical-corpus input bound5462 vs max2731. Entire GPT5 tail instead uses full1048576 input and8000 output cap. Pricing scope/assumptions explicit in budget-basis.json.',
 'New chat reservation uses1048576 input +3000 output at model-specific snapshot rates with10% extra; new OCR .05/page. One request at a time, no automatic retries. Unknown errors keep full reservation; observed overage persists then stops.',
 'USD per million input/output: GPT4.1mini .40/1.60; GPT5mini .25/2.00; MistralLarge3 .50/1.50; Grok .20/.50; Kimi .95/4.00. OCR .003/page. No cache discount. Existing eastus2 Global retail lookup is a pricing assumption for the EastUS Global deployment, not an invoice.',
 'Raw input/output tokens, pages, original rounded operator costs and cumulative rounded log estimates are retained. ARGUS original rates included unverified third-party estimates; common report does not upgrade their provenance.',
 '', '6. COMPARABILITY AND TIMING',
 'All latency is nonstreaming request dispatch to full response, NOT TTFT, NOT upload-to-UI. Includes failed requests where duration exists. p95 linear interpolation from frozen scorer; small samples descriptive, not SLA.',
 'Historical runs and ARGUS have distinct host/concurrency/time/API settings. AVA original up to six simultaneous streams; v3 global concurrency1. ARGUS GPT5 uses Chat Completions +8000 reasoning-inclusive cap; AVA GPT5 uses Responses +3000 matching historical route shape. Do NOT pool operator results as one controlled protocol.',
 'Bottle repeat count1 versus flat target3 is disclosed; no stability claim from a single bottle result. Historical Claude bottle inference was not rerun; no Azure Claude comparison is claimed.',
 'OCR is its own annotation-schema track, not an interchangeable vision chat model. Predictions contain no expected values/application declarations. Frozen original prompt/image detail/API choices reused per AVA model.',
 f"Uniform strict extraction schema +4039ccc deterministic scorer revalidates original evidence without repair; {recon['scoring']['newly_invalid_records']} original-ok prior rows rejected. Original ok/verdicts remain in evidence. ARGUS original scorer differed; common replay is versioned, not replacement.",
 '', '7. ARTIFACTS / REPRODUCTION / QA',
 'all-rescored-records.json: every scored field, confidence/raw-text where available, operator/source provenance. per-field.csv: each sample/condition/repeat/field with denominator context. per-sample-summary.json and summary.json: grouped metrics.',
 'rows/, responses/, attempts/: incremental v3 exact provider bodies including schema failures and HTTP bodies; no auth headers. budget.sqlite and costs-final.json retain uncertainty.',
 'bottles/manifest.json + ground_truth/ + images/: source/derived hashes, transforms, seed, frozen visibility. visibility-freeze.json precedes inference. runner-state.json contains exact cancelled host job evidence.',
 'test_v3.py, test_runner.py, test_report.py and RED/GREEN logs. Existing original suites and final verification outputs listed in verification.json. No production deployment or external contact.',
 'Commands: /opt/data/asset-venv/bin/python -B -m unittest discover -s recovery-v3 -p test_*.py (run from benchmark parent with PYTHONPATH=recovery-v3). report.py is offline. runner.py without --run is dry. Do NOT rerun paid inference during QA.',
 'Primary evidence root: '+str(ROOT),
 'Windows shared path: C:\\Users\\alexm\\.hermes\\benchmarks\\ttb-foundry-20260918-v1\\recovery-v3\\',
 'QA request: one consolidated read-only PASS/REVISE, no implementation/no paid reruns. Remaining limitations are part of result, not hidden passes.']
 (ROOT/'REPORT.txt').write_text('\n'.join(lines)+'\n')
 print(json.dumps({'records':len(rows),'new_flat':len(newflat),'new_bottle':len(newb),'new_spend':newspent,'liability':budget.total(),'terminal':result['terminal']}))
if __name__=='__main__':main()
