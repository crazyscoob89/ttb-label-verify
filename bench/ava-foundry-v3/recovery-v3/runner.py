"""One-at-a-time paid continuation with durable evidence and no automatic retries."""
import v3 as V
from v3 import *
import signal

def reservation(model):
 if model==OCR:return .05
 a,b=RATES[model]
 return round((1048576*a+3000*b)/1e6*1.10,9)

def cost(model,d):
 u=d.get('usage') or d.get('usage_info') or {}
 if model==OCR:
  # Retail estimate, not an invoice: .003/image (harness.py RESERVE_OCR).
  # Extraction zero does not mean annotation was free. Evidence overlaps,
  # so use the maximum positive count, never sum or accept bool/negative.
  counts=[]
  for usage in (d.get('usage'),d.get('usage_info')):
   if isinstance(usage,dict):
    counts.extend(n for k in ('pages_processed','pages_processed_annotation')
                  if type(n:=usage.get(k)) is int and n>0)
  pages=d.get('pages')
  if isinstance(pages,list) and pages:counts.append(len(pages))
  n=max(counts) if counts else None
  return (n*.003 if n is not None else None),None,None,n
 ti=u.get('input_tokens',u.get('prompt_tokens'));to=u.get('output_tokens',u.get('completion_tokens'))
 if type(ti) is int and type(to) is int and min(ti,to)>=0:
  a,b=RATES[model];return (ti*a+to*b)/1e6,ti,to,None
 return None,ti,to,None

def annotate(row,g,visibility):
 row=H.score(row,g)
 if visibility:
  row['visibility']=visibility
  row['bottle_outcomes']={f:field_outcome(row['extraction_correct'][f],visibility[f]['expect_referral_ok'],row['verdicts'][f]=='needs-review',row['ok']) for f in S.FIELDS}
  # An absent domestic origin is correctly null, not inferred through an occluder.
  for f in S.FIELDS:
   if visibility[f]['visibility']=='absent' and row['ok'] and row['extraction_correct'][f] and row['verdicts'][f]=='not-applicable':row['bottle_outcomes'][f]='correct-absence-not-applicable'
 return row

def one(model,g,rep,condition,visibility,env,budget,out=ROOT,transport=urllib.request.urlopen):
 ident=f"{model}--{g['fixture_id']}--{condition}--{rep}"
 for sub in ['rows','responses','attempts']:(out/sub).mkdir(parents=True,exist_ok=True)
 # Restart/duplicate check precedes credentials and payload construction.
 if any(x['id']==ident for x in budget.entries()):return None
 kind,p=payload(model,g['_image_path']);body=json.dumps(p).encode()
 reserve=reservation(model)
 if not budget.reserve(ident,reserve):return None
 row={'id':ident,'operator':'AVA-v3','model':model,'engine':model,'fixture_id':g['fixture_id'],'repeat':rep,'condition':condition,'route':'Azure Foundry '+kind,'tier':'OCR separate' if model==OCR else 'vision','ok':False,'extracted':None,'error_class':None,'cost_usd':None,'request_sha256':hashlib.sha256(body).hexdigest(),'image_sha256':sha(g['_image_path']),'transport':kind,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reserved_usd':reserve,'source_image':str(g['_image_path']),'timeout_seconds':120,'auto_retries':0}
 # Identity/prompt/image hashes are durable before external side effects.
 save(out/'attempts'/(ident+'.json'),row)
 if kind=='ocr':url=env['AZURE_FOUNDRY_ENDPOINT'].rstrip('/')+'/providers/mistral/azure/ocr';headers={'Authorization':'Bearer '+env['AZURE_FOUNDRY_API_KEY']}
 else:url=env['AZURE_OPENAI_ENDPOINT'].rstrip('/')+('/responses' if kind=='responses' else '/chat/completions');headers={'api-key':env['AZURE_FOUNDRY_API_KEY']}
 headers['Content-Type']='application/json';start=time.perf_counter();billed=None
 try:
  with transport(urllib.request.Request(url,data=body,headers=headers),timeout=120) as response:
   row['http_status']=response.status;raw=response.read();row['request_id']=response.headers.get('apim-request-id') or response.headers.get('x-request-id')
  row['latency_s']=time.perf_counter()-start
  dest=out/'responses'/(ident+'.json')
  with dest.open('wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
  row['response_sha256']=sha(dest);row['response_file']=str(dest)
  d=json.loads(raw);billed,ti,to,pages=cost(model,d)
  row.update(cost_usd=billed,tokens_in=ti,tokens_out=to,pages_processed=pages,usage=d.get('usage',d.get('usage_info',{})),returned_model=d.get('model'))
  # Usage evidence saved BEFORE content parsing or scoring can fail.
  save(out/'attempts'/(ident+'.json'),row)
  text,finish=H.parse_response(kind,d);row.update(raw_text=text,finish_reason=finish)
  row['extracted']=json.loads(E._strip_fences(text));row['validation_errors']=H.validate_extraction(row['extracted'])
  row['ok']=not row['validation_errors'] and finish in ['stop','completed']
  if not row['ok']:row['error_class']='schema-or-incomplete-output'
 except urllib.error.HTTPError as e:
  row.update(latency_s=time.perf_counter()-start,http_status=e.code,error_class='http-'+str(e.code))
  raw=e.read().replace(env['AZURE_FOUNDRY_API_KEY'].encode(),b'[REDACTED]')
  dest=out/'responses'/(ident+'.http-error.txt');dest.write_bytes(raw)
  row.update(response_file=str(dest),response_sha256=sha(dest))
 except Exception as e:
  row.setdefault('latency_s',time.perf_counter()-start);row['error_class']=type(e).__name__
  row['error']=str(e).replace(env['AZURE_FOUNDRY_API_KEY'],'[REDACTED]')[:1000]
 # Settle only grounded usage; HTTP/timeout never silently becomes zero.
 overage=False
 try:budget.settle(ident,billed)
 except ValueError:overage=True;row['budget_overage']=True
 row=annotate(row,g,visibility);row['pipeline_seconds']=time.perf_counter()-start
 save(out/'rows'/(ident+'.json'),row)
 print(json.dumps({'id':ident,'ok':row['ok'],'seconds':round(row['latency_s'],3),'error':row['error_class'],'cost_usd':row['cost_usd'],'liability_usd':budget.total()}),flush=True)
 if overage:raise RuntimeError('observed charge exceeds reservation; persisted and stopped')
 return row

def main():
 import argparse
 ap=argparse.ArgumentParser();ap.add_argument('--run',action='store_true');a=ap.parse_args()
 basis=load(ROOT/'budget-basis.json');state=load(ROOT/'runner-state.json');assert state['status']=='cancelled' and not state['active_ttb_jobs']
 manifest=load(ROOT/'bottles/manifest.json');freeze=load(ROOT/'visibility-freeze.json');assert sha(ROOT/'bottles/manifest.json')==freeze['manifest_sha256']
 # Original and continuation use the SAME local filesystem lock.
 lock=open(BASE/'run.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 raw,fixtures=R.load_evidence();env=E.load_env('/opt/data/.env')
 assert 'ttb-foundry-trial-resource.' in env['AZURE_FOUNDRY_ENDPOINT']
 queue=[]
 for r in flat_queue():queue.append((r['model'],fixtures[r['fixture_id']],r['repeat'],'flat',None))
 # Fixture-first condition/model rotation gives broad balanced evidence before cap.
 for f in manifest['fixtures']:
  g=copy.deepcopy(fixtures[f['source_fixture']]);g['_image_path']=ROOT/'bottles'/f['image']
  for model in MODELS:queue.append((model,g,1,f['condition'],f['visibility']))
 save(ROOT/'execution-plan.json',{'flat_candidates':len(flat_queue()),'bottle_candidates':len(manifest['fixtures'])*len(MODELS),'bottle_repeats':1,'original_repeats':3,'reason':'bounded budget; no repeated parity runs','concurrency':1,'max_output_tokens':3000,'timeout_seconds':120,'retries':0,'base_liability_usd':basis['base_liability_usd'],'system_prompt_sha256':hashlib.sha256(E.SYSTEM_PROMPT.encode()).hexdigest(),'user_prompt_sha256':hashlib.sha256(E.USER_PROMPT.encode()).hexdigest(),'payload_source_sha256':sha(BASE/'harness.py'),'visibility_manifest_sha256':freeze['manifest_sha256'],'candidate_ids':[f'{m}--{g["fixture_id"]}--{c}--{rep}' for m,g,rep,c,v in queue]})
 if not a.run:print('DRY RUN',len(queue));return
 b=Budget(ROOT/'budget.sqlite',10)
 b.reserve('inherited-incurred-and-unknown',basis['base_liability_usd'])
 # No restart is allowed to change the inherited liability envelope.
 entry=next(e for e in b.entries() if e['id']=='inherited-incurred-and-unknown');assert abs(entry['guard_usd']-basis['base_liability_usd'])<1e-8
 transport_failures=collections.Counter();blocked=[]
 for model,g,rep,condition,visibility in queue:
  if (ROOT/'STOP').exists():blocked.append({'reason':'stop-file'});break
  ident=f"{model}--{g['fixture_id']}--{condition}--{rep}"
  if any(e['id']==ident for e in b.entries()):continue
  if condition=='glare':
   blocked.append({'id':ident,'reason':'user-rejected-artificial-occlusion-not-realistic-glare'});continue
  if transport_failures[model]>=2:blocked.append({'id':ident,'reason':'two-transport-failures'});continue
  if b.total()+reservation(model)>10:
   blocked.append({'id':ident,'reason':'budget','liability_usd':b.total(),'next_reservation_usd':reservation(model),'over_cap_usd':b.total()+reservation(model)-10});continue
  row=one(model,g,rep,condition,visibility,env,b)
  if row and row.get('http_status')!=200:transport_failures[model]+=1
 save(ROOT/'execution-result.json',{'terminal':True,'rows':len(list((ROOT/'rows').glob('*.json'))),'blocked':blocked,'ledger':b.entries(),'liability_usd':b.total(),'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 print('RUN TERMINAL',b.total(),flush=True)
if __name__=='__main__':main()
