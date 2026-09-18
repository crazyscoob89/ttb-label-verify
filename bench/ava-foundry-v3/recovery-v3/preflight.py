"""Offline preflight: strict source-scoped liability envelope, never invoice claims."""
import v3 as V
from pathlib import Path
import json,datetime
Q=Path('/host-home/.openclaw/worker-queue')
job=Q/'cancelled/2026-09-18T14-28-34-8fee58.json';d=V.load(job)
assert d['status']=='cancelled' and d['_child'] is None
active=[]
for lane in ['active','pending']:
 for p in (Q/lane).glob('*.json'):
  q=V.load(p)
  if 'ttb-label-verify' in q.get('repo',''):active.append(q['jobId'])
assert not active
state={k:d.get(k) for k in ['jobId','status','endedAt','lastCommit','_child']}
state.update(source=str(job),source_sha256=V.sha(job),active_ttb_jobs=active,verified_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),evidence_scope='Host queue terminal record + owner process-killed toolResult/terminal handoff; not inferred from local ps')
V.save(V.ROOT/'runner-state.json',state)
r=V.load(V.BASE/'recovery-v2/reconciliation.json')
a=V.load(V.BASE/'recovery-v2/inherited-evidence/foundry_raw_results.json')['results']
# Charges on successful fixed-payload runs use returned usage, not original guard.
# Unknown attempts keep positive liability; unreturned tail conservatively reserves
# all nine remaining calls, not merely the one request sequentially in flight.
parts=[
 {'id':'observed','usd':r['costs']['combined_including_log_only_estimate_usd']+r['costs']['prior_AVA_smoke_estimate_usd'],'kind':'retail estimate, includes rounded log-only'},
 {'id':'AVA-interrupted-three','usd':sum(x['guard_usd'] for x in r['ledger']['interrupted']),'kind':'original full reservations retained'},
 {'id':'AVA-two-429','usd':.1,'kind':'original two OCR .05 reservations retained'},
 {'id':'ARGUS-run2-entire-tail','usd':9*(1048576*.25+8000*2)/1e6,'kind':'all nine possible GPT5 requests at full 1,048,576-input bound + actual inherited 8,000-output cap; no retry dialect triggered for GPT'},
 {'id':'ARGUS-rejected-dialects','usd':55*((2731*2)*.5+3000*1.5)/1e6,'kind':'54 saved Mistral battery + one smoke: each rejected dialect retains twice largest measured same fixed-corpus input + full output cap, even though validation rejection has no generated output'},
 {'id':'ARGUS-probes-and-route-triage','usd':.4,'kind':'source shows 3 six-deployment tiny-image sweeps + two route attempts. .40 reserve covers 24 attempts at 4,096 input + 2,000 output using elevated 1.1/5.5 guard rates (.3721344), including final observed probes already counted (intentional overlap)'},
 {'id':'ARGUS-five-adapter-smokes','usd':.025,'kind':'console reported .0006 + .0019 + .0012 + .0025 + .0178; rounded upward, not exact token bodies'},
 {'id':'rounding','usd':.01,'kind':'rounding slack for original logs/rows/pricing'}]
total=sum(x['usd'] for x in parts)
V.save(V.ROOT/'budget-basis.json',{'allowance_usd':10,'base_liability_usd':total,'headroom_usd':10-total,'parts':parts,'pricing':'existing retail snapshot, no cache discount, not invoice-verified','scope':'Foundry comparison only; historical $1.061835 separate prior experiment','assumptions':['Fixed original images/prompts; observed same-model input usage provides size bound for rejected identical dialect bodies (2x slack).','Tiny 320x120 probe source payload bounded at 4096 input (observed maximum298); max output2000. These are conservative request-size bounds, not provider invoice certifications.','9-tail bound deliberately assumes every remaining GPT5 request could have dispatched, despite sequential runner and terminal cancellation.','No account-wide spending outside these runners is controlled.'],'reconciled_OCR_pages':33,'original_guard_not_spend':r['ledger']['guard_total_usd'],'source_hashes':{str(p):V.sha(p) for p in [V.BASE/'harness.py',V.BASE/'budget.sqlite',V.BASE/'recovery-v2/inherited-evidence/run_bench.py',V.BASE/'recovery-v2/inherited-evidence/engines.py',V.BASE/'recovery-v2/inherited-evidence/_foundry_run2.log.utf8.txt']}})
V.save(V.ROOT/'flat-queue.json',V.flat_queue())
# Freeze visibility before any new benchmark outputs. Native QA is recorded in note.
p=V.ROOT/'bottles/manifest.json';m=V.load(p)
for f in m['fixtures']:
 for name,ann in f['visibility'].items():
  if ann['visibility']=='visible':ann['basis']='Pre-inference contact-sheet inspection; native representative/degraded/typography QA; same fixed layout. No prediction-based annotation.'
  if f['source_fixture']=='D-BLUR-01' and name=='government_warning' and f['condition']!='glare':ann.update(visibility='uncertain',expect_referral_ok=True,basis='Native view: wording largely readable but source blur prevents reliable fine stroke-weight/typography adjudication.')
  if f['source_fixture']=='D-GLARE-01' and f['condition']!='glare' and name in ['class_type','alcohol_content','net_contents','bottler_info']:ann['basis']='Native view: faint yet full letters recoverable; do NOT mark unreadable merely because source fixture is named glare.'
m['visibility_status']='frozen-pre-inference';m['visibility_frozen_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();V.save(p,m)
V.save(V.ROOT/'visibility-freeze.json',{'manifest_sha256':V.sha(p),'frozen_utc':m['visibility_frozen_utc'],'independence':'AVA visual annotations before benchmark inference; not independent human inter-rater labeling.','native_images_reviewed':['C-SPIRITS-01 original bottle','D-BLUR-01__angle','D-GLARE-01__angle','A-WARN-BOLDBODY-01__angle','C-SPIRITS-IMPORT-01__glare'],'overview':'all54 label crops in three sheets','limitations':'Native samples plus all54 overview, not 54 exhaustive independent full-resolution transcriptions. Physical point size unverified.'})
print(json.dumps({'base_liability_usd':total,'headroom':10-total,'flat_queue':len(V.flat_queue()),'bottle_images':len(m['fixtures'])}))
