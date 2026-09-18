import unittest,tempfile,sqlite3,concurrent.futures,json
from pathlib import Path
import importlib.util

class HarnessTests(unittest.TestCase):
 def api(self):
  p=Path(__file__).with_name('harness.py')
  self.assertTrue(p.exists(),'Missing bounded comparison harness')
  spec=importlib.util.spec_from_file_location('harness',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def test_budget_persists_unknown_charges_and_blocks_duplicate(self):
  m=self.api()
  with tempfile.TemporaryDirectory() as d:
   b=m.Budget(Path(d)/'budget.sqlite',1)
   self.assertTrue(b.reserve('one',.7));self.assertFalse(b.reserve('one',.7));self.assertFalse(b.reserve('two',.4))
   b.settle('one',None)
   self.assertAlmostEqual(b.total(),.7)
   b2=m.Budget(Path(d)/'budget.sqlite',1);self.assertFalse(b2.reserve('two',.4))
   self.assertTrue(b2.reserve('three',.2));b2.settle('three',.05);self.assertAlmostEqual(b2.total(),.75)
 def test_atomic_parallel_budget(self):
  m=self.api()
  with tempfile.TemporaryDirectory() as d:
   b=m.Budget(Path(d)/'budget.sqlite',1)
   with concurrent.futures.ThreadPoolExecutor(8) as p:result=list(p.map(lambda i:b.reserve(str(i),.2),range(20)))
   self.assertEqual(sum(result),5);self.assertAlmostEqual(b.total(),1)
 def test_overspend_reported_not_discarded(self):
  m=self.api()
  with tempfile.TemporaryDirectory() as d:
   b=m.Budget(Path(d)/'budget.sqlite',1);b.reserve('one',.2)
   with self.assertRaises(ValueError):b.settle('one',1.2)
   self.assertAlmostEqual(b.total(),1.2);self.assertFalse(b.reserve('two',.1))
 def test_payload_has_no_ground_truth(self):
  m=self.api();gt=m.S.load_fixtures(m.REPO/'fixtures')[0]
  for name in m.MODELS:
   kind,p=m.payload(name,gt['_image_path'])
   self.assertEqual(p['model'],name)
   self.assertNotIn('application',p);self.assertNotIn('label_actual',p);self.assertNotIn('expected',p)
   if kind=='chat':
    self.assertEqual(p['messages'][0]['content'],m.E.SYSTEM_PROMPT)
    self.assertEqual(p['messages'][1]['content'][0]['text'],m.E.USER_PROMPT)
    self.assertEqual(p.get('max_completion_tokens',p.get('max_tokens')),3000)
   elif kind=='responses':self.assertEqual(p['max_output_tokens'],3000)
   else:self.assertIn('document_annotation_format',p)
 def test_response_parsing_variants(self):
  m=self.api()
  for kind,d in [('chat',{'choices':[{'message':{'content':'{"x":1}'},'finish_reason':'stop'}]}),('responses',{'output':[{'type':'message','content':[{'type':'output_text','text':'{"x":1}'}]}],'status':'completed'}),('ocr',{'document_annotation':'{"x":1}','pages':[]})]:
   text,finish=m.parse_response(kind,d);self.assertEqual(json.loads(text),{'x':1})
 def test_failed_call_cannot_pass(self):
  m=self.api();g=m.S.load_fixtures(m.REPO/'fixtures')[0]
  row=m.score({'ok':False,'extracted':None,'error_class':'timeout'},g)
  self.assertTrue(all(x=='needs-review' for x in row['verdicts'].values()))
  self.assertFalse(any(row['extraction_correct'].values()))

if __name__=='__main__':unittest.main()
