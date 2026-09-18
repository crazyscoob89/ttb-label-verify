#!/usr/bin/env python3
"""Isolated, explicitly authorized $10 Foundry comparison. Archive stays read-only.
No automatic retries; persistent reservation ledger; one process lock; fixed corpus.
Dollar guard uses deliberately higher-than-published rates, not invoice prices.
No billing-account-wide cap is claimed. Other callers are outside this batch.
"""
import argparse,base64,concurrent.futures,datetime,fcntl,hashlib,json,os,random,re,sqlite3,statistics,sys,time,urllib.request,urllib.error
from pathlib import Path
HERE=Path(__file__).resolve().parent
REPO=Path('/opt/data/projects/ttb-label-verify-revision')
sys.path.insert(0,str(REPO/'bench'))
import engines as E,scoring as S,replay as R
from extraction_validation import validate_extraction
MODELS=['gpt-5-mini','gpt-4.1-mini','Mistral-Large-3','grok-4-1-fast-non-reasoning','Kimi-K2.6','mistral-document-ai-2512']
OCR=MODELS[-1]
# Conservative bookkeeping rates (USD per million), >= retrieved regional/global
# rates for these exact five models. Cache discounts are never assumed.
GUARD_INPUT=1.1
GUARD_OUTPUT=5.5
MAX_INPUT=1048576
MAX_OUTPUT=3000
RESERVE_CHAT=(MAX_INPUT*GUARD_INPUT+MAX_OUTPUT*GUARD_OUTPUT)/1e6
RESERVE_OCR=.05 # one-page image, retail global .003; deliberately conservative

class Budget:
 def __init__(self,path,limit):
  self.path=str(path);self.limit=int(round(limit*1e9))
  with self.connect() as c:
   c.execute('CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,nano INTEGER NOT NULL,status TEXT NOT NULL)')
 @__import__('contextlib').contextmanager
 def connect(self):
  c=sqlite3.connect(self.path,timeout=30,isolation_level='IMMEDIATE')
  try:
   with c:yield c
  finally:c.close()
 def reserve(self,id,amount):
  n=int(round(amount*1e9))
  if n<=0:raise ValueError('positive reservation required')
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE')
   if c.execute('SELECT 1 FROM ledger WHERE id=?',(id,)).fetchone():return False
   total=c.execute('SELECT COALESCE(SUM(nano),0) FROM ledger').fetchone()[0]
   if total+n>self.limit:return False
   c.execute('INSERT INTO ledger VALUES(?,?,?)',(id,n,'reserved'))
  return True
 def settle(self,id,amount):
  if amount is None:
   with self.connect() as c:c.execute("UPDATE ledger SET status='unknown-charge' WHERE id=?",(id,))
   return
  n=int(round(amount*1e9))
  if n<0:raise ValueError('negative charge')
  with self.connect() as c:
   c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT nano FROM ledger WHERE id=?',(id,)).fetchone()
   if not row:raise ValueError('unreserved call')
   old=row[0];c.execute('UPDATE ledger SET nano=?,status=? WHERE id=?',(n,'usage-guard',id))
  if n>old:raise ValueError('usage exceeded reservation; stop dispatch')
 def total(self):
  with self.connect() as c:return c.execute('SELECT COALESCE(SUM(nano),0) FROM ledger').fetchone()[0]/1e9
 def entries(self):
  with self.connect() as c:return [{'id':a,'guard_usd':b/1e9,'status':d} for a,b,d in c.execute('SELECT id,nano,status FROM ledger ORDER BY id')]

def write_json(path,data):
 tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');os.replace(tmp,path)

def schema():
 props={}
 # The same instructions are supplied as annotation descriptions rather than a
 # chat system/user pair. This OCR track is therefore explicitly not equivalent.
 for name in E.EXTRACTION_SCHEMA_FIELDS:
  typ='boolean' if name.endswith(('_all_caps','_bold')) else 'string'
  props[name]={'type':[typ,'null'],'description':name.replace('_',' ')+' as printed; null if absent/unreadable.'}
 props['confidence']={'type':'object','properties':{k:{'type':'number','minimum':0,'maximum':1} for k in E.EXTRACTION_SCHEMA_FIELDS},'required':list(E.EXTRACTION_SCHEMA_FIELDS),'additionalProperties':False}
 return {'type':'object','properties':props,'required':list(props),'additionalProperties':False,'description':E.SYSTEM_PROMPT+'\n\n'+E.USER_PROMPT}

def payload(name,image):
 img='data:image/png;base64,'+base64.b64encode(Path(image).read_bytes()).decode()
 if name==OCR:
  return 'ocr',{'model':name,'document':{'type':'image_url','image_url':img},'include_image_base64':False,'document_annotation_format':{'type':'json_schema','json_schema':{'name':'label_extraction','schema':schema()}}}
 if name=='gpt-5-mini':
  return 'responses',{'model':name,'input':[{'role':'system','content':[{'type':'input_text','text':E.SYSTEM_PROMPT}]},{'role':'user','content':[{'type':'input_text','text':E.USER_PROMPT},{'type':'input_image','image_url':img,'detail':'high'}]}],'text':{'format':{'type':'json_object'}},'max_output_tokens':MAX_OUTPUT}
 p={'model':name,'messages':[{'role':'system','content':E.SYSTEM_PROMPT},{'role':'user','content':[{'type':'text','text':E.USER_PROMPT},{'type':'image_url','image_url':{'url':img}}]}],'max_tokens':MAX_OUTPUT,'response_format':{'type':'json_object'}}
 return 'chat',p

def parse_response(kind,d):
 if kind=='ocr':return d.get('document_annotation') or '', 'completed' if d.get('pages') else 'missing-pages'
 if kind=='responses':return ''.join(c.get('text','') for i in d.get('output',[]) if i.get('type')=='message' for c in i.get('content',[]) if c.get('type')=='output_text'),d.get('status')
 c=d.get('choices',[{}])[0];return c.get('message',{}).get('content') or '',c.get('finish_reason')

def score(row,g):
 row=dict(row);dv=S.derive_verdicts(row,g['application']);sv=S.score_field_run(dv,g['expected'])
 row.update(fixture_id=g['fixture_id'],category=g['category'],commodity=g['commodity'],truth=g['expected'],expected_safe=R.expected_safe(g),verdicts={f:sv[f]['derived'] for f in S.FIELDS},classes={f:sv[f]['class'] for f in S.FIELDS},reasons={f:sv[f]['reason'] for f in S.FIELDS},extraction_correct=R.extraction_correct(row.get('extracted') or {},g) if row['ok'] else {f:False for f in S.FIELDS})
 return row

def one(name,g,rep,env,budget,outdir):
 ident=f"{name}--{g['fixture_id']}--{rep}";dest=outdir/'rows'/(ident+'.json')
 if dest.exists():return json.loads(dest.read_text())
 kind,p=payload(name,g['_image_path'])
 reserve=RESERVE_OCR if kind=='ocr' else RESERVE_CHAT
 if not budget.reserve(ident,reserve):return None
 if kind=='ocr':url=env['AZURE_FOUNDRY_ENDPOINT'].rstrip('/')+'/providers/mistral/azure/ocr';headers={'Authorization':'Bearer '+env['AZURE_FOUNDRY_API_KEY']}
 else:url=env['AZURE_OPENAI_ENDPOINT'].rstrip('/')+('/responses' if kind=='responses' else '/chat/completions');headers={'api-key':env['AZURE_FOUNDRY_API_KEY']}
 headers['Content-Type']='application/json'
 body=json.dumps(p).encode();request_hash=hashlib.sha256(body).hexdigest()
 row={'engine':name,'model':name,'route':'Azure Foundry '+kind,'tier':'OCR separate' if kind=='ocr' else 'vision','repeat':rep,'ok':False,'extracted':None,'error_class':None,'raw_text':'','tokens_in':None,'tokens_out':None,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request_sha256':request_hash,'image_sha256':hashlib.sha256(g['_image_path'].read_bytes()).hexdigest(),'transport':kind,'cost_usd':None}
 d={};billed=None;start=time.perf_counter()
 try:
  req=urllib.request.Request(url,data=body,headers=headers)
  with urllib.request.urlopen(req,timeout=120) as r:
   row['http_status']=r.status;raw=r.read();row['response_bytes']=len(raw)
   row['request_id']=r.headers.get('apim-request-id') or r.headers.get('x-request-id')
  row['latency_s']=round(time.perf_counter()-start,6)
  # Preserve provider body separately and exactly, no auth headers or requests.
  (outdir/'responses'/(ident+'.json')).write_bytes(raw)
  d=json.loads(raw);text,finish=parse_response(kind,d);row['raw_text']=text;row['finish_reason']=finish;row['returned_model']=d.get('model');row['usage']=d.get('usage',d.get('usage_info',{}))
  u=row['usage']
  if kind=='ocr':
   pages=u.get('pages_processed');row['pages_processed']=pages
   if type(pages) is int and pages>=1:billed=pages*RESERVE_OCR
  else:
   tin=u.get('input_tokens',u.get('prompt_tokens'));tout=u.get('output_tokens',u.get('completion_tokens'));row['tokens_in']=tin;row['tokens_out']=tout
   if type(tin) is int and type(tout) is int and tin>=0 and tout>=0:billed=(tin*GUARD_INPUT+tout*GUARD_OUTPUT)/1e6
  # Don't repair malformed content; the archived adapters only stripped fences.
  row['extracted']=json.loads(E._strip_fences(text));errors=validate_extraction(row['extracted']);row['validation_errors']=errors
  row['ok']=not errors and finish in ['stop','completed']
  if not row['ok']:row['error_class']='schema-or-incomplete-output'
 except urllib.error.HTTPError as e:
  row['latency_s']=round(time.perf_counter()-start,6);row['http_status']=e.code;row['error_class']='http-'+str(e.code)
  row['error']=e.read().decode(errors='replace')[:6000].replace(env['AZURE_FOUNDRY_API_KEY'],'[REDACTED]')
 except Exception as e:
  row.setdefault('latency_s',round(time.perf_counter()-start,6));row['error_class']=type(e).__name__;row['error']=str(e).replace(env['AZURE_FOUNDRY_API_KEY'],'[REDACTED]')[:1000]
 budget.settle(ident,billed);row['guard_charge_usd']=billed;row['unknown_charge_reserved_usd']=reserve if billed is None else 0
 row=score(row,g);row['pipeline_seconds']=round(time.perf_counter()-start,6)
 write_json(dest,row)
 print(json.dumps({'model':name,'fixture':g['fixture_id'],'repeat':rep,'ok':row['ok'],'seconds':row['latency_s'],'error':row['error_class'],'budget_guard_usd':round(budget.total(),4)}),flush=True)
 return row

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--run',action='store_true');ap.add_argument('--probe',action='store_true');ap.add_argument('--models',nargs='+',default=MODELS);args=ap.parse_args()
 if any(n not in MODELS for n in args.models):raise SystemExit('Unknown model')
 # Separate directory, no calls through the deliberately disabled archive runner.
 raw,fixtures=R.load_evidence();env=E.load_env('/opt/data/.env')
 if not env.get('AZURE_FOUNDRY_API_KEY'):raise SystemExit('Missing key')
 if 'ttb-foundry-trial-resource.' not in env.get('AZURE_FOUNDRY_ENDPOINT',''):raise SystemExit('Wrong resource')
 for sub in ['rows','responses']:(HERE/sub).mkdir(exist_ok=True)
 lock=open(HERE/'run.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 budget=Budget(HERE/'budget.sqlite',10)
 if not args.run:print('DRY: 18 fixtures x 3 repeats; six deployments; no paid calls.');return
 manifest=HERE/'run_manifest.json'
 if not manifest.exists():
  write_json(manifest,{'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorization':'Alex selected $10 allowance for full comparison via clarify in current Discord task. No OpenRouter reruns.','allowance_usd':10,'models':MODELS,'fixtures':list(fixtures),'repeats':3,'max_output_tokens':MAX_OUTPUT,'auto_retries':0,'parallelism':'one sequential stream per model, up to six simultaneous requests across models','historical_raw_sha256':R.RAW_SHA256,'system_prompt_sha256':hashlib.sha256(E.SYSTEM_PROMPT.encode()).hexdigest(),'user_prompt_sha256':hashlib.sha256(E.USER_PROMPT.encode()).hexdigest(),'source_files_sha256':{n:hashlib.sha256((REPO/'bench'/n).read_bytes()).hexdigest() for n in ['engines.py','scoring.py','replay.py','extraction_validation.py']},'pricing_guard':{'input_usd_per_million':GUARD_INPUT,'output_usd_per_million':GUARD_OUTPUT,'unobserved_chat_charge_reservation_usd':RESERVE_CHAT,'ocr_usd_per_page_guard':RESERVE_OCR,'description':'Batch-only guard using conservative retail assumptions and measured usage; unknown errors retain full reservations. Not Azure invoice/account-wide hard cap.'},'timing':'request start to full nonstreaming response. TTFT not measured; app/UI end-to-end not measured. pipeline_seconds includes response persistence and deterministic scoring.','protocol':'Original frozen prompts, original PNG bytes, 3000 output budget. GPT-5 mini uses Responses/default reasoning to match old direct OpenAI run. Other chat models use Chat Completions/json_object/default settings. OCR schema descriptions are an adapted separate track.'})
 def worker(name):
  gs=list(fixtures.values());random.Random(19).shuffle(gs)
  if args.probe:gs=[next(g for g in gs if g['category']=='clean')]
  failures=0
  for rep in range(1,2 if args.probe else 4):
   for g in gs:
    row=one(name,g,rep,env,budget,HERE)
    if row is None:print('STOP: budget/duplicate-in-flight '+name,flush=True);return
    if not row['ok'] and row.get('http_status')!=200:failures+=1
    if failures>=2:print('STOP: repeated transport failures '+name,flush=True);return
  print('MODEL COMPLETE '+name,flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=len(args.models)) as pool:
  list(pool.map(worker,args.models))
 write_json(HERE/'budget_summary.json',{'guard_total_usd':budget.total(),'entries':budget.entries()})
 print('BATCH FINISHED '+json.dumps({'guard_total_usd':budget.total(),'rows':len(list((HERE/'rows').glob('*.json')))}),flush=True)

if __name__=='__main__':main()
