"""Final evidence acceptance tests. Offline; refuse unfinished paid execution."""
import unittest,sys,json,hashlib,io,fcntl,datetime,collections,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'recovery-v3'))
import v3 as V
import runner
from closeout import finished_scope

class EvidenceAcceptance(unittest.TestCase):
 def rows(self):return [V.load(p) for p in sorted((V.ROOT/'rows').glob('*.json'))]
 def test_terminal_scope_and_exclusive_lock(self):
  with (V.BASE/'run.lock').open('a') as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   result=V.load(V.ROOT/'execution-result.json');plan=V.load(V.ROOT/'execution-plan.json');rows=self.rows()
   self.assertTrue(finished_scope(result,plan['candidate_ids'],[r['id'] for r in rows]))
   self.assertEqual(len(rows),result['rows']);self.assertFalse((V.ROOT/'STOP').exists())
   self.assertEqual(len(plan['candidate_ids']),len(set(plan['candidate_ids'])))
   self.assertFalse({r['id'] for r in rows}&{r['id'] for r in result['blocked']})
 def test_budget_usage_raw_bodies_and_attempts(self):
  rows=self.rows();b=V.Budget(V.ROOT/'budget.sqlite',10);entries={e['id']:e for e in b.entries()}
  basis=V.load(V.ROOT/'budget-basis.json')
  self.assertLessEqual(b.total(),10)
  self.assertEqual(entries['inherited-incurred-and-unknown']['guard_usd'],basis['base_liability_usd'])
  self.assertEqual(set(entries)-{'inherited-incurred-and-unknown'},{r['id'] for r in rows})
  self.assertEqual({p.stem for p in (V.ROOT/'attempts').glob('*.json')},{r['id'] for r in rows})
  for r in rows:
   self.assertEqual(r['image_sha256'],V.sha(r['source_image']))
   kind,p=V.payload(r['model'],r['source_image'])
   self.assertEqual(r['request_sha256'],hashlib.sha256(json.dumps(p).encode()).hexdigest())
   entry=entries[r['id']]
   if r.get('response_file'):
    p=Path(r['response_file']);self.assertEqual(r['response_sha256'],V.sha(p))
    if r.get('http_status')==200:
     d=V.load(p);c,ti,to,pages=runner.cost(r['model'],d)
     self.assertEqual(r['cost_usd'],c)
     if c is not None:self.assertAlmostEqual(entry['guard_usd'],c,places=8)
     if r['model']==V.OCR and d.get('pages'):
      self.assertGreater(c,0);self.assertGreater(r['pages_processed'],0)
   if r.get('cost_usd') is None:
    self.assertGreater(entry['guard_usd'],0);self.assertIn(entry['status'],['reserved','unknown-charge'])
   else:
    self.assertTrue(math.isfinite(r['cost_usd']));self.assertGreaterEqual(r['cost_usd'],0)
    self.assertAlmostEqual(entry['guard_usd'],r['cost_usd'],places=8)
   self.assertEqual(r['auto_retries'],0);self.assertEqual(r['timeout_seconds'],120)
 def test_frozen_visibility_precedes_inference(self):
  frozen=V.load(V.ROOT/'visibility-freeze.json');manifest=V.load(V.ROOT/'bottles/manifest.json')
  self.assertEqual(V.sha(V.ROOT/'bottles/manifest.json'),frozen['manifest_sha256'])
  freeze=datetime.datetime.fromisoformat(frozen['frozen_utc'])
  byid={(f['source_fixture'],f['condition']):f for f in manifest['fixtures']}
  for r in self.rows():
   if r['condition']=='flat':continue
   self.assertLess(freeze,datetime.datetime.fromisoformat(r['started_at']))
   f=byid[(r['fixture_id'],r['condition'])]
   self.assertEqual(r['visibility'],f['visibility']);self.assertEqual(r['image_sha256'],f['sha256'])
 def test_determinism_all_54_encoded_png_hashes(self):
  sources={f['fixture_id']:f for f in V.source_manifest()['fixtures']}
  fs=V.load(V.ROOT/'bottles/manifest.json')['fixtures'];self.assertEqual(len(fs),54)
  for f in fs:
   image,meta=V.render(sources[f['source_fixture']],f['condition']);out=io.BytesIO();image.save(out,format='PNG',compress_level=6)
   self.assertEqual(hashlib.sha256(out.getvalue()).hexdigest(),f['sha256'],f['id'])
   x0,y0,x1,y1=meta['content_bounds'];self.assertTrue(0<=x0<x1<=2200 and 0<=y0<y1<=3200)
   self.assertEqual((V.ROOT/'bottles'/f['ground_truth']).read_bytes(),(V.BASE/'bottles'/f['source_ground_truth']).read_bytes())
 def test_no_duplicate_prior_flat_attempt_or_unlogged_tail(self):
  recon=V.load(V.BASE/'recovery-v2/reconciliation.json');prior=set(recon['ledger']['all_known_foundry_attempted_ids'])
  ids=[]
  for r in self.rows():
   ids.append(r['id'])
   if r['condition']!='flat':continue
   self.assertNotIn(f"{r['model']}--{r['fixture_id']}--{r['repeat']}",prior)
   self.assertNotEqual(r['model'],'gpt-5-mini')
  self.assertEqual(len(ids),len(set(ids)))
 def test_exact_replay_without_repairs(self):
  fixtures=V.R.load_evidence()[1]
  for r in self.rows():
   if r['ok']:self.assertFalse(V.H.validate_extraction(r['extracted']))
   result=runner.annotate(r,fixtures[r['fixture_id']],r.get('visibility'))
   for k in ['verdicts','classes','truth','extraction_correct','bottle_outcomes']:
    if k in r:self.assertEqual(r[k],result[k],r['id']+' '+k)
   if not r['ok']:self.assertEqual(set(r['verdicts'].values()),{'needs-review'})
 def test_immutable_sources(self):
  basis=V.load(V.ROOT/'budget-basis.json')
  for p,h in basis['source_hashes'].items():self.assertEqual(V.sha(p),h,p)
  prov=V.load(V.ROOT/'source-provenance.json')
  for name,h in prov['scorer_sha256'].items():self.assertEqual(V.sha(V.H.REPO/'bench'/name),h,name)
  manifest=V.load(V.ROOT/'bottles/manifest.json')
  self.assertEqual(manifest['renderer_sha256'],V.sha(V.ROOT/'v3.py'))
  self.assertEqual(manifest['source_manifest_sha256'],V.sha(V.BASE/'bottles/manifest.json'))
 def test_accounting_repair_preserves_predictions_and_responses(self):
  repair=V.load(V.ROOT/'accounting-repair.json')
  self.assertEqual(repair['inherited_before'],repair['inherited_after'])
  self.assertAlmostEqual(repair['ledger_after_usd']-repair['ledger_before_usd'],.093,places=8)
  self.assertEqual(len(repair['corrections']),31)
  for p,h in repair['source_hashes'].items():self.assertEqual(V.sha(p),h,p)
  for lane in ['rows','attempts']:
   backups=list((V.ROOT/'accounting-before'/lane).glob('*.json'));self.assertEqual(len(backups),31)
   for p in backups:
    old=V.load(p);new=V.load(V.ROOT/lane/p.name)
    self.assertEqual({k:v for k,v in old.items() if k not in ['cost_usd','pages_processed']},{k:v for k,v in new.items() if k not in ['cost_usd','pages_processed']})
    self.assertEqual(old['cost_usd'],0);self.assertEqual(new['cost_usd'],.003);self.assertEqual(new['pages_processed'],1)
 def test_rejected_glare_not_primary_and_no_new_glare_calls(self):
  exclusion=V.load(V.ROOT/'glare-exclusion.json')
  glare=[r for r in self.rows() if r['condition']=='glare'];self.assertEqual(len(glare),59)
  self.assertTrue(all(r['started_at']<exclusion['created_utc'] for r in glare))
  for name,h in exclusion['preserved_glare_row_sha256'].items():self.assertEqual(V.sha(V.ROOT/'rows'/name),h)
  scope=V.load(ROOT/'scope.json');self.assertFalse(scope['overall_requested_benchmark_complete']);self.assertFalse(scope['realistic_glare_completed'])
  self.assertTrue(all(g['condition']!='glare' for g in V.load(ROOT/'primary-summary.json')))
  self.assertTrue(all(g['condition']=='glare' for g in V.load(ROOT/'rejected-occlusion-summary.json')))
  angles=[g for g in V.load(ROOT/'primary-summary.json') if g['condition']=='angle'];self.assertEqual(len(angles),6);self.assertTrue(all(g['false_matches']>0 for g in angles))
 def test_no_credentials_in_evidence(self):
  env=V.E.load_env('/opt/data/.env')
  secrets=[str(value).encode() for key,value in env.items() if any(s in key.upper() for s in ['TOKEN','KEY','PASSWORD','SECRET']) and isinstance(value,str) and len(value)>16]
  for root in [V.ROOT,ROOT]:
   for p in root.rglob('*'):
    if p.is_file() and p.suffix in ['.py','.json','.txt','.md','.log','.csv']:
     content=p.read_bytes()
     self.assertFalse(any(secret in content for secret in secrets),'credential value found in '+str(p))
if __name__=='__main__':unittest.main(verbosity=2)
