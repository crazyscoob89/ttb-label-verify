"""One-off saved OCR accounting reconciliation; never dispatches requests."""
import sqlite3, shutil, fcntl, json
import runner as R
from v3 import ROOT, BASE, OCR, Budget, load, save, sha

def main():
 lock=open(BASE/'run.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 before=ROOT/'accounting-before'
 assert (ROOT/'STOP').read_bytes()==(before/'STOP').read_bytes()
 assert not (ROOT/'accounting-repair.json').exists()
 b=Budget(ROOT/'budget.sqlite',10)
 entries={e['id']:e for e in b.entries()}
 assert all(e['status']!='reserved' for k,e in entries.items() if k!='inherited-incurred-and-unknown'), 'pending dispatch exists'
 with sqlite3.connect(b.path) as src, sqlite3.connect(before/'budget.sqlite') as dst:src.backup(dst)
 protected=[* (ROOT/'responses').glob('*'),ROOT/'budget-basis.json',ROOT/'visibility-freeze.json',ROOT/'bottles/manifest.json',ROOT/'report.py',BASE/'harness.py']
 hashes={str(p):sha(p) for p in protected if p.is_file()}
 audit={'rate_usd_per_image':.003,'rate_basis':'harness.py RESERVE_OCR existing retail global estimate, not actual bill','policy':'maximum positive exact-int extraction/annotation count or returned-page list length; overlapping counts not added; no evidence means unknown','ledger_before_usd':b.total(),'human_cap_usd':10,'inherited_before':entries['inherited-incurred-and-unknown'],'source_hashes':hashes,'source_before':{n:sha(before/n) for n in ['runner.py','test_runner.py']},'source_after':{n:sha(ROOT/n) for n in ['runner.py','test_runner.py']},'corrections':[],'unknowns':[]}
 for p in sorted((ROOT/'rows').glob(OCR+'--*.json')):
  row=load(p);ident=row['id'];rawpath=ROOT/'responses'/(ident+'.json')
  if not rawpath.exists():
   audit['unknowns'].append({'id':ident,'reason':'no saved JSON response','retained_ledger':entries[ident]});continue
  raw=load(rawpath);amount,_,_,pages=R.cost(OCR,raw)
  evidence={'id':ident,'response_sha256':sha(rawpath),'usage':raw.get('usage'),'usage_info':raw.get('usage_info'),'returned_pages':len(raw['pages']) if isinstance(raw.get('pages'),list) else None,'old_cost_usd':row.get('cost_usd'),'cost_usd':amount,'pages_processed':pages,'ledger_before':entries[ident],'files':[]}
  if amount is None:
   audit['unknowns'].append({'id':ident,'reason':'no positive observed page evidence'})
   assert entries[ident]['guard_usd']>0, 'unknown with no liability guard requires manual reconciliation'
  for path in [p,ROOT/'attempts'/(ident+'.json')]:
   if not path.exists():continue
   dest=before/path.relative_to(ROOT);dest.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(path,dest)
   old=load(path);new=dict(old);new.update(cost_usd=amount,pages_processed=pages)
   save(path,new)
   assert {k:v for k,v in load(path).items() if k not in ('cost_usd','pages_processed')}=={k:v for k,v in old.items() if k not in ('cost_usd','pages_processed')}
   evidence['files'].append({'path':str(path),'before_sha256':sha(dest),'after_sha256':sha(path)})
  try:b.settle(ident,amount)
  except ValueError as exc:
   assert str(exc)=='usage exceeded reservation; stop dispatch'
   evidence['settle_notice']='Budget.settle committed increased observed estimate then raised; corrective reconciliation of past responses, not new spending'
  current=next(e for e in b.entries() if e['id']==ident)
  assert amount is None or abs(current['guard_usd']-amount)<1e-9
  evidence['ledger_after']=current;audit['corrections'].append(evidence)
 after={e['id']:e for e in b.entries()}
 changed={e['id'] for e in audit['corrections']}
 assert all(after[k]==v for k,v in entries.items() if k not in changed)
 assert all(sha(p)==h for p,h in hashes.items())
 assert b.limit==10000000000
 audit.update(ledger_after_usd=b.total(),ocr_corrected_cost_usd=round(sum(e['cost_usd'] or 0 for e in audit['corrections']),9),row_count=len(list((ROOT/'rows').glob('*.json'))),inherited_after=after['inherited-incurred-and-unknown'],protected_hashes_verified=True,settled_cost_usd=round(sum(e['guard_usd'] for k,e in after.items() if k!='inherited-incurred-and-unknown'),9))
 save(ROOT/'accounting-repair.json',audit)
 print(json.dumps({k:v for k,v in audit.items() if k in ('ledger_before_usd','ledger_after_usd','ocr_corrected_cost_usd','settled_cost_usd','row_count')}))
 print('corrected',len(audit['corrections']),'unknowns',len(audit['unknowns']))
if __name__=='__main__':main()
