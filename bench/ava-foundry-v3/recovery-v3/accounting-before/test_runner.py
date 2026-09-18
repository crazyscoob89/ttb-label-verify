import unittest,tempfile,json,io,urllib.error
from pathlib import Path
import v3 as V
class RunnerTests(unittest.TestCase):
 def setup_runner(self):
  self.assertTrue((V.ROOT/'runner.py').exists(),'safe incremental runner missing')
  import runner;return runner
 def fixture(self):return list(V.R.load_evidence()[1].values())[0]
 def test_usage_saved_invalid_schema_and_no_retry(self):
  r=self.setup_runner();calls=[]
  class Response:
   status=200;headers={}
   def __enter__(self):return self
   def __exit__(self,*a):pass
   def read(self):return json.dumps({'choices':[{'message':{'content':'{}'},'finish_reason':'stop'}],'usage':{'prompt_tokens':1000,'completion_tokens':20}}).encode()
  def transport(req,timeout):calls.append(req);return Response()
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);b=V.Budget(p/'b.db',10)
   row=r.one('gpt-4.1-mini',self.fixture(),1,'flat',None,{'AZURE_OPENAI_ENDPOINT':'https://example.invalid','AZURE_FOUNDRY_API_KEY':'test'},b,p,transport)
   self.assertFalse(row['ok']);self.assertGreater(row['cost_usd'],0);self.assertEqual(len(calls),1)
   self.assertEqual(len(list((p/'responses').glob('*'))),1)
   self.assertIsNone(r.one('gpt-4.1-mini',self.fixture(),1,'flat',None,{},b,p,transport));self.assertEqual(len(calls),1)
 def test_http_unknown_body_retained(self):
  r=self.setup_runner();calls=[]
  def transport(req,timeout):calls.append(req);raise urllib.error.HTTPError(req.full_url,429,'limit',{},io.BytesIO(b'{"error":"rate limited"}'))
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);b=V.Budget(p/'b.db',10)
   row=r.one('gpt-4.1-mini',self.fixture(),1,'flat',None,{'AZURE_OPENAI_ENDPOINT':'https://example.invalid','AZURE_FOUNDRY_API_KEY':'test'},b,p,transport)
   self.assertEqual(row['error_class'],'http-429');self.assertIsNone(row['cost_usd']);self.assertEqual(len(calls),1)
   self.assertEqual(b.total(),r.reservation('gpt-4.1-mini'));self.assertTrue(list((p/'responses').glob('*')))
 def test_ocr_page_shape(self):
  r=self.setup_runner()
  self.assertEqual(r.cost('mistral-document-ai-2512',{'pages':[{'index':0}], 'usage_info':{'pages_processed':1}})[0],.003)
 def test_visibility_not_runtime_cheat(self):
  r=self.setup_runner();g=self.fixture();raw=V.load(next((V.BASE/'rows').glob('gpt-4.1-mini--C-SPIRITS-01--1.json')))
  g=V.R.load_evidence()[1]['C-SPIRITS-01'];v={f:{'visibility':'obscured','expect_referral_ok':True} for f in V.S.FIELDS}
  row=r.annotate(raw,g,v)
  self.assertEqual(row['verdicts'],raw['verdicts'])
  self.assertNotIn('visual-correct',row['bottle_outcomes'].values())
if __name__=='__main__':unittest.main(verbosity=2)
