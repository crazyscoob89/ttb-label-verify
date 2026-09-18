import unittest, importlib.util, tempfile, json, hashlib, copy
from pathlib import Path
ROOT=Path(__file__).parent
class V3Tests(unittest.TestCase):
 def mod(self):
  self.assertTrue((ROOT/'v3.py').exists(),'versioned implementation must exist')
  spec=importlib.util.spec_from_file_location('v3',ROOT/'v3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_referral_policy(self):
  m=self.mod()
  self.assertEqual(m.field_outcome(True,True,False,True),'unverifiable-correct-not-recovery')
  self.assertEqual(m.field_outcome(False,True,False,True),'dangerous-error')
  self.assertEqual(m.field_outcome(False,True,True,True),'safe-referral')
  self.assertEqual(m.field_outcome(True,False,False,True),'visual-correct')
  self.assertEqual(m.field_outcome(False,False,True,True),'referral')
  self.assertEqual(m.field_outcome(False,True,True,False),'failure-referral')
 def test_reservation_restart_unknown_overage(self):
  m=self.mod()
  with tempfile.TemporaryDirectory() as td:
   p=Path(td)/'budget.sqlite'; b=m.Budget(p,1)
   self.assertTrue(b.reserve('one',.6)); self.assertFalse(b.reserve('two',.5));self.assertFalse(b.reserve('one',.1))
   b.settle('one',None); self.assertAlmostEqual(m.Budget(p,1).total(),.6)
   with self.assertRaises(ValueError): b.settle('one',1.2)
   self.assertAlmostEqual(b.total(),1.2)
   self.assertFalse(b.reserve('next',.01))
 def test_parallel_reservations(self):
  m=self.mod(); import concurrent.futures
  with tempfile.TemporaryDirectory() as td:
   b=m.Budget(Path(td)/'b.db',1)
   with concurrent.futures.ThreadPoolExecutor(8) as pool: r=list(pool.map(lambda i:b.reserve(str(i),.3),range(10)))
   self.assertEqual(sum(r),3);self.assertAlmostEqual(b.total(),.9)
 def test_renderer_deterministic_bounds(self):
  m=self.mod(); f=m.source_manifest()['fixtures'][0]
  for condition in m.CONDITIONS:
   a,meta=m.render(f,condition); b,_=m.render(f,condition)
   self.assertEqual(a.tobytes(),b.tobytes()); self.assertEqual(a.size,(2200,3200))
   x0,y0,x1,y1=meta['content_bounds']; self.assertTrue(0<=x0<x1<=2200 and 0<=y0<y1<=3200)
  self.assertEqual(m.render(f,'straight')[0].tobytes(),m.Image.open(m.BASE/'bottles'/f['image']).convert('RGB').tobytes())
 def test_payload_no_truth_and_protocol(self):
  m=self.mod(); f=m.source_manifest()['fixtures'][0];p=m.BASE/'bottles'/f['image']
  for model in m.MODELS:
   kind,body=m.payload(model,p);text=json.dumps(body)
   self.assertNotIn('label_actual',text);self.assertNotIn('expect_referral_ok',text)
   if model=='gpt-5-mini':self.assertEqual(kind,'responses');self.assertEqual(body['max_output_tokens'],3000)
   elif model!=m.OCR:self.assertEqual(kind,'chat');self.assertEqual(body['max_tokens'],3000)
 def test_queue_excludes_all_attempts_and_tail(self):
  m=self.mod();q=m.flat_queue();recon=json.loads((m.BASE/'recovery-v2/reconciliation.json').read_text())
  self.assertFalse({x['id'] for x in q}&set(recon['ledger']['all_known_foundry_attempted_ids']))
  self.assertTrue(all(x['model']!='gpt-5-mini' for x in q))
 def test_corpus_coverage_truth_hashes(self):
  m=self.mod(); manifest=ROOT/'bottles/manifest.json'
  self.assertTrue(manifest.exists(),'54-condition corpus required')
  fs=json.loads(manifest.read_text())['fixtures'];self.assertEqual(len(fs),54)
  self.assertEqual(len({(f['source_fixture'],f['condition']) for f in fs}),54)
  for f in fs:
   self.assertEqual(m.sha(ROOT/'bottles'/f['image']),f['sha256'])
   self.assertEqual(m.sha(ROOT/'bottles'/f['ground_truth']),f['truth_sha256'])
   self.assertEqual((ROOT/'bottles'/f['ground_truth']).read_bytes(),(m.BASE/'bottles'/f['source_ground_truth']).read_bytes())
   self.assertEqual(set(f['visibility']),set(m.S.FIELDS))
   self.assertTrue(all('expect_referral_ok' in a for a in f['visibility'].values()))
if __name__=='__main__':unittest.main(verbosity=2)
