import unittest
from pathlib import Path
import v3 as V
class ReportTests(unittest.TestCase):
 def module(self):
  self.assertTrue((V.ROOT/'report.py').exists(),'report module required')
  import report;return report
 def test_denominators_failure_latency(self):
  m=self.module();r={'ok':True,'fixture_id':'a','repeat':1,'latency_s':2,'category':'clean','truth':{f:'match' for f in V.S.FIELDS},'verdicts':{f:'match' for f in V.S.FIELDS},'extraction_correct':{f:True for f in V.S.FIELDS},'classes':{f:'correct' for f in V.S.FIELDS},'cost_usd':.1}
  r['truth']['brand_name']='mismatch';r['classes']['brand_name']='false_match'
  s=m.summarize([r]);self.assertEqual(s['negative_fields'],1);self.assertEqual(s['false_matches'],1);self.assertEqual(s['field_n'],7);self.assertEqual(s['clean_auto_n'],0)
 def test_hidden_correct_never_clean_auto(self):
  m=self.module();r={'ok':True,'fixture_id':'a','repeat':1,'latency_s':2,'category':'clean','truth':{f:'match' for f in V.S.FIELDS},'verdicts':{f:'match' for f in V.S.FIELDS},'extraction_correct':{f:True for f in V.S.FIELDS},'classes':{f:'correct' for f in V.S.FIELDS},'bottle_outcomes':{f:'unverifiable-correct-not-recovery' for f in V.S.FIELDS},'cost_usd':.1}
  s=m.summarize([r]);self.assertEqual(s['clean_auto_n'],0);self.assertEqual(s['visual_recovery_n'],0);self.assertEqual(s['hidden_correct_n'],7)
 def test_group_identity_preserves_operator_condition(self):
  m=self.module();self.assertNotEqual(m.group_key({'operator':'AVA','model':'x','condition':'flat'}),m.group_key({'operator':'ARGUS','model':'x','condition':'flat'}));self.assertNotEqual(m.group_key({'operator':'AVA','model':'x','condition':'flat'}),m.group_key({'operator':'AVA','model':'x','condition':'glare'}))
if __name__=='__main__':unittest.main(verbosity=2)
