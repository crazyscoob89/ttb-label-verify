#!/usr/bin/env python3
"""Offline evidence reconciliation. No provider imports, environment secrets or network.
Run: python3 -B reconcile.py. Outputs only in this script's directory.
"""
from pathlib import Path
import ast, collections, copy, hashlib, json, re, sqlite3, statistics, sys
ROOT=Path(__file__).resolve().parent
BASE=ROOT.parent
REPO=Path('/opt/data/projects/ttb-label-verify-ava-recovery-v2')
SCORER=ROOT/'scorer-4039ccc/bench'
sys.path.insert(0,str(SCORER))
import scoring as S
import replay as R
from extraction_validation import validate_extraction

def load(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,data): (ROOT/name).write_text(json.dumps(data,indent=2,allow_nan=False)+'\n')
def cid(r): return f"{r['model']}--{r['fixture_id']}--{r['repeat']}"
def prompts(p):
    out={}
    for n in ast.parse(p.read_text()).body:
        if isinstance(n,ast.Assign):
            for t in n.targets:
                if isinstance(t,ast.Name) and 'PROMPT' in t.id:
                    try: out[t.id]=ast.literal_eval(n.value)
                    except (ValueError,TypeError): pass
    return out

def main():
    manifest=load(BASE/'run_manifest.json'); inherited=ROOT/'inherited-evidence'
    ava=[load(p) for p in sorted((BASE/'rows').glob('*.json'))]
    argusdoc=load(inherited/'foundry_raw_results.json'); argus=argusdoc['results']
    historical=load(REPO/'bench/raw_results.json')['results']
    fixtures={g['fixture_id']:g for g in S.load_fixtures(SCORER.parent/'fixtures')}
    # Strict adapter-level schema gate uniformly applied; never repair extraction.
    rows=[]
    for operator,source,data in [('AVA',str(BASE/'rows'),ava),('ARGUS',str(inherited/'foundry_raw_results.json'),argus),('historical',str(REPO/'bench/raw_results.json'),historical)]:
        for original in data:
            r=copy.deepcopy(original); gt=fixtures[r['fixture_id']]
            assert r['truth']==gt['expected']
            r.update(operator=operator,source=source,original_ok=r['ok'],original_verdicts=r['verdicts'])
            r['revalidation_errors']=validate_extraction(r.get('extracted'))
            r['ok']=bool(r['original_ok'] and not r['revalidation_errors'])
            if r['original_ok'] and not r['ok']: r['error_class']='offline-schema-validation-failed'
            scores=S.score_field_run(S.derive_verdicts(r,gt['application']),gt['expected'])
            r['verdicts']={f:scores[f]['derived'] for f in S.FIELDS}
            r['classes']={f:scores[f]['class'] for f in S.FIELDS}
            r['expected_safe']=R.expected_safe(gt)
            r['extraction_correct']=R.extraction_correct(r['extracted'],gt) if r['ok'] else {f:False for f in S.FIELDS}
            r['reasons']={f:scores[f]['reason'] for f in S.FIELDS}
            rows.append(r)
    groups=[]
    for operator,model in sorted(set((r['operator'],r['model']) for r in rows)):
        rs=[r for r in rows if (r['operator'],r['model'])==(operator,model)]
        lat=[r['latency_s'] for r in rs if isinstance(r.get('latency_s'),(int,float))]
        classes=collections.Counter(v for r in rs for v in r['classes'].values())
        neg=sum(v=='mismatch' for r in rs for v in r['truth'].values())
        clean=[r for r in rs if r['category']=='clean']
        groups.append(dict(operator=operator,model=model,routes=sorted(set(r['route'] for r in rs)),calls=len(rs),ok_calls=sum(r['ok'] for r in rs),unique_fixtures=len(set(r['fixture_id'] for r in rs)),total_field_outcomes=len(rs)*len(S.FIELDS),extraction_correct_n=sum(sum(r['extraction_correct'].values()) for r in rs),negative_outcomes=neg,false_match_n=classes['false_match'],false_match_rate=classes['false_match']/neg if neg else None,classes=dict(classes),safe_referral_n=classes['referral'],clean_calls=len(clean),clean_fully_automated_correct_n=sum(r['ok'] and all(r['verdicts'][f]==r['truth'][f] and r['verdicts'][f]!='needs-review' for f in S.FIELDS) for r in clean),latency_s=dict(n=len(lat),mean=statistics.mean(lat),median=statistics.median(lat),p95=S.percentile(lat,.95),min=min(lat),max=max(lat))))
    conn=sqlite3.connect('file:'+str(BASE/'budget.sqlite')+'?mode=ro',uri=True)
    ledger=[dict(id=i,guard_usd=n/1e9,status=s) for i,n,s in conn.execute('select id,nano,status from ledger order by id')];conn.close()
    attempted={r['id'] for r in ledger}|{cid(r) for r in ava}
    interrupted=[r for r in ledger if r['id'] not in {cid(r) for r in ava}]
    # Parse every visible completion in both logs. Run1 duplicates the saved ARGUS file.
    logs=[]; totals={}
    for p in sorted(inherited.glob('_foundry_run*.log.utf8.txt')):
        model=None; total=None
        for line in p.read_text().splitlines():
            m=re.search(r'ENGINE: \S+\s+\((\S+) via ',line)
            if m: model=m[1]
            m=re.match(r'\s+([A-Z][A-Z0-9-]+)\s+r\d+:',line)
            if m and model:
                for rep,lat in re.findall(r'r(\d+):([\d.]+)s',line):
                    logs.append(dict(model=model,fixture_id=m[1],repeat=int(rep),latency_s=float(lat),source=p.name,precision='rounded log only'))
            t=re.search(r'\[\$([\d.]+)\]',line)
            if t: total=float(t[1])
        totals[p.name]=total
    saved_ids={cid(r) for r in argus}
    log_only=[r for r in logs if cid(r) not in saved_ids]
    log_only_ids={cid(r) for r in log_only}
    all_attempted=attempted|saved_ids|{cid(r) for r in logs}
    expected=[dict(id=f'{m}--{f}--{n}',model=m,fixture_id=f,repeat=n) for m in manifest['models'] for f in manifest['fixtures'] for n in range(1,manifest['repeats']+1)]
    # All known dispatches excluded, including reservations and log-only completions.
    ava_missing=[r for r in expected if r['id'] not in attempted]
    cross_missing=[r for r in expected if r['id'] not in all_attempted]
    rates={'gpt-4.1-mini':(.4,1.6),'gpt-5-mini':(.25,2),'grok-4-1-fast-non-reasoning':(.2,.5),'Mistral-Large-3':(.5,1.5),'Kimi-K2.6':(.95,4)}
    def token_cost(r,model):
        a,b=rates[model];return (r['tokens_in']*a+r['tokens_out']*b)/1e6
    ava_chat=sum(token_cost(r,r['model']) for r in ava if r['model'] in rates and r.get('tokens_in') is not None and r.get('tokens_out') is not None)
    pages=0
    for p in (BASE/'responses').glob('mistral-document-ai-2512*.json'):
        d=load(p);pages+=len(d.get('pages',[]))
    probe=load(inherited/'foundry_vision_probe.json')['results']
    probe_cost=sum(token_cost(r,r['deployment']) for r in probe if r.get('tokens_in') is not None)
    argus_cost=sum(r.get('cost_usd') or 0 for r in argus)
    ava_cost=ava_chat+pages*.003
    log_cost=totals['_foundry_run2.log.utf8.txt']
    measured=ava_cost+argus_cost+probe_cost
    historical_cost=sum(r.get('cost_usd') or 0 for r in historical)
    unknowns=[dict(operator='AVA',kind='interrupted/cancelled dispatch',**r) for r in interrupted]
    unknowns += [dict(operator='AVA',kind='HTTP429 charge unresolved',id=cid(r)) for r in ava if r.get('http_status')==429]
    unknowns += [dict(operator='ARGUS',kind='probe failed HTTP404; no usage',model=r['deployment']) for r in probe if r.get('tokens_in') is None]
    unknowns += [dict(operator='ARGUS',kind='additional probe dialect/route attempts and any in-flight run2 tail not captured by logs; dispatch count and charges unknown')]
    source_hashes=load(ROOT/'inherited-source-hashes.json')
    assert all(sha(Path(p))==v for p,v in source_hashes.items())
    eqimages=all(sha(REPO/'fixtures/images'/f'{f}.png')==sha(SCORER.parent/'fixtures/images'/f'{f}.png') for f in fixtures)
    eqtruth=all(sha(REPO/'fixtures/ground_truth'/f'{f}.json')==sha(SCORER.parent/'fixtures/ground_truth'/f'{f}.json') for f in fixtures)
    avaimages=all(r.get('image_sha256')==sha(REPO/'fixtures/images'/f"{r['fixture_id']}.png") for r in ava)
    p1=prompts(inherited/'engines.py');p2=prompts(SCORER/'engines.py')
    log_groups=[]
    for model in sorted(set(r['model'] for r in log_only)):
        ls=[r['latency_s'] for r in log_only if r['model']==model]
        log_groups.append(dict(model=model,calls=len(ls),latency_s={'mean':statistics.mean(ls),'median':statistics.median(ls),'p95':S.percentile(ls,.95)},scoring_available=False))
    result=dict(status='offline complete for available persisted records; provider billing and log-only outputs unresolved',paid_calls=0,network_calls=0,ownership={'execution':'AVA','QA':'ARGUS','note':'Latest human assignment supersedes old handover'},human_cap_usd=10,groups=groups,counts={'AVA_rows':len(ava),'AVA_response_bodies':len(list((BASE/'responses').glob('*.json'))),'ARGUS_persisted_rows':len(argus),'historical_rows':len(historical),'rescored_rows':len(rows),'ARGUS_probe_summary_records':len(probe)},scoring={'basis':'4039ccc deterministic scorer and extraction accuracy; uniform strict adapter validation before scoring','no_output_repair':True,'coverage':len(rows),'historical_and_ARGUS_original_ok_preserved':True,'newly_invalid_records':sum(r['original_ok'] and not r['ok'] for r in rows),'hashes':{p.name:sha(p) for p in [SCORER/'scoring.py',SCORER/'replay.py',SCORER/'extraction_validation.py']}},equivalence={'fixture_bytes_equal':eqimages and eqtruth and avaimages,'prompts_equal':bool(p1) and p1==p2,'original_scorers_equal':sha(inherited/'scoring.py')==sha(SCORER/'scoring.py'),'source_hashes_verified':True,'caveat':'Equal fixture/prompt sources do not establish identical provider settings or model revisions. OCR uses adapted prompt.'},ledger={'attempted_ids':sorted(attempted),'all_known_foundry_attempted_ids':sorted(all_attempted),'entries':ledger,'interrupted':interrupted,'http429_count':sum(r.get('http_status')==429 for r in ava),'status_counts':dict(collections.Counter(r['status'] for r in ledger)),'guard_total_usd':sum(r['guard_usd'] for r in ledger)},argus_log_only={'completed_logged_calls':len(log_only),'records':log_only,'groups':log_groups,'logged_cumulative_estimate_usd':log_cost,'note':'Run2 has no persisted extraction/usage records in recovered evidence. Run1 logs duplicate the 108 saved records and are NOT added again. Log2 truncates before run completion.'},costs={'ava_measured_estimate_usd':ava_cost,'ava_chat_estimate_usd':ava_chat,'ava_observed_ocr_pages':pages,'argus_saved_record_estimate_usd':argus_cost,'argus_saved_metadata_estimate_usd':argusdoc['run_metadata']['total_spend_usd'],'argus_probe_observed_usage_estimate_usd':probe_cost,'combined_measured_estimate_usd':measured,'combined_including_log_only_estimate_usd':measured+log_cost,'prior_AVA_smoke_estimate_usd':load(BASE/'handover-cost-summary.json')['prior_smoke_retail_estimate_usd'],'historical_saved_metadata_estimate_usd':load(REPO/'bench/raw_results.json')['run_metadata']['total_spend_usd'],'rounding_note':'Summed rounded row costs differ from run metadata: both preserved; combined totals use row sums, not a claim of exact billing.','historical_saved_record_estimate_usd':historical_cost,'all_observed_including_historical_and_smoke_estimate_usd':measured+log_cost+historical_cost+load(BASE/'handover-cost-summary.json')['prior_smoke_retail_estimate_usd'],'invoice_verified':False,'unknown_charges':unknowns,'rates_per_million_assumed':rates,'pricing_note':'AVA and probe use saved eastus2 Global Standard retail assumptions, no cache discount; ARGUS saved rows retain original rounded/unverified aggregator estimates. Log-only cost is rounded cumulative log estimate. Not invoices, not final spend or permission to consume remaining cap.'},tests_existing=load(ROOT/'tests-existing.json'),blockers=['99 log-only completions have no saved extraction or exact usage: cannot rescore or verify exact cost.','ARGUS cancelled/in-flight tail lacks a durable dispatch ledger: additional attempts/charges cannot be bounded; missing queues remain tentative and disabled.','Provider invoice/account-wide costs unverified; all unknown charges retained.','No bottle inference evidence in this recovered set; flat-label coverage is not bottle evaluation.'],caveats=['Historical Claude Haiku/Sonnet: OpenRouter -> Anthropic; historical GPT-5 mini: direct OpenAI Responses API. New calls are Azure Foundry, not interchangeable routes.','Operator groups remain separate; repetitions/overlaps are not new unique-image coverage.','Latency is full nonstreaming request duration, not TTFT or UI end-to-end; host, concurrency and transport confound comparisons.','OCR is a separate adapted-schema track.','Strict adapter-level revalidation can differ from original saved historical/ARGUS verdict caches; original evidence untouched.'])
    plan=dict(paid_execution_enabled=False,execution_owner='AVA',qa_owner='ARGUS',human_cap_usd=10,ava_protocol_unattempted=ava_missing,minimal_cross_operator_unattempted=cross_missing,counts={'ava_only_unattempted':len(ava_missing),'cross_operator_known_unattempted':len(cross_missing)},note='Inventory only, not executable authorization. Both sets exclude AVA reserved/cancelled attempts; cross-operator set additionally excludes all saved/logged ARGUS attempts. AVA-only set is not a dispatch queue. Cross-operator equivalence is not established; unlogged ARGUS cancellations require ledger reconciliation before any future execution.',blocked_pending=result['blockers'])
    assert not {r['id'] for r in cross_missing}&all_attempted
    assert len(rows)==sum(g['calls'] for g in groups)
    assert all(r['ok'] or (set(r['verdicts'].values())=={'needs-review'} and not any(r['extraction_correct'].values())) for r in rows)
    save('rescored-records.json',rows);save('resume-plan.json',plan);save('reconciliation.json',result)
    lines=['OFFLINE RECOVERY / NO PAID CALLS / NO NETWORK','Ownership: AVA execution, ARGUS QA. Human cap $10; paid execution disabled.',f"Persisted records rescored: {len(rows)} = AVA {len(ava)} + ARGUS {len(argus)} + historical {len(historical)}. AVA response bodies: {result['counts']['AVA_response_bodies']}.",f"ARGUS additional log-only completions: {len(log_only)}; rounded cumulative estimate ${log_cost:.4f}; no extraction/usage bodies recovered.",f"AVA estimate ${ava_cost:.8f}; ARGUS saved rows ${argus_cost:.6f}; ARGUS observed probe usage ${probe_cost:.8f}.",f"Combined Foundry observed estimate incl log-only ${measured+log_cost:.8f}, PLUS unknown charges. Earlier AVA smoke and historical spend itemized separately in JSON.",f"AVA ledger: {len(ledger)} attempted, {len(interrupted)} interrupted/reserved; {result['ledger']['http429_count']} HTTP429. Guard ${result['ledger']['guard_total_usd']:.7f} is NOT spend.",f"Tentative missing inventory: AVA-only {len(ava_missing)}; cross-operator known-unattempted {len(cross_missing)} (includes log-only exclusions). Human execution approval remains in force; paid dispatch is held pending spend/attempt reconciliation.",'','SCORING: strict schema gate + frozen 4039ccc deterministic replay; no repairs. FM denominator is negative field outcomes. Clean auto = entire clean call correct with no referrals.','operator | model | calls/ok | latency median/p95 seconds | extraction correct/fields | false matches/negative | referrals | clean auto/calls']
    for g in groups:
        lines.append(f"{g['operator']} | {g['model']} | {g['calls']}/{g['ok_calls']} | {g['latency_s']['median']:.3f}/{g['latency_s']['p95']:.3f} | {g['extraction_correct_n']}/{g['total_field_outcomes']} | {g['false_match_n']}/{g['negative_outcomes']} | {g['safe_referral_n']} | {g['clean_fully_automated_correct_n']}/{g['clean_calls']}")
    lines+=['','LOG-ONLY LATENCY (rounded source seconds, no scoring):']+[f"ARGUS {g['model']}: {g['calls']} calls; median {g['latency_s']['median']:.3f}s, p95 {g['latency_s']['p95']:.3f}s" for g in log_groups]
    lines+=['','BLOCKERS / CAVEATS']+result['blockers']+result['caveats']+['Existing tests: see tests-existing.json; no full suite rerun. Prior detached hardened-suite and initial bottle environment failures are preserved, alongside passing source suite and asset-venv rerun.','Generated: reconcile.py, reconciliation.json, rescored-records.json, resume-plan.json, REPORT.txt. Original source/evidence files unchanged.']
    (ROOT/'REPORT.txt').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))
if __name__=='__main__': main()
