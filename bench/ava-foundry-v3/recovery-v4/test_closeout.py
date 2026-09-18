"""Offline closeout contracts, no inference. Run unittest discovery here."""
import unittest, importlib, sys
from pathlib import Path
ROOT=Path(__file__).parent
class CloseoutTests(unittest.TestCase):
 def mod(self):
  self.assertTrue((ROOT/'closeout.py').exists(),'versioned closeout implementation missing')
  return importlib.import_module('closeout')
 def row(self):
  fields=['brand_name','class_type','alcohol_content','net_contents','bottler_info','country_of_origin','government_warning']
  return dict(operator='AVA-v3',model='gpt-4.1-mini',fixture_id='C-X',condition='straight',repeat=1,ok=True,latency_s=2.,cost_usd=.002,tokens_in=1000,tokens_out=100,extraction_correct={f:True for f in fields},verdicts={f:'match' for f in fields},truth={f:'match' for f in fields},visibility={f:{'visibility':'visible','expect_referral_ok':False} for f in fields},bottle_outcomes={f:'visual-correct' for f in fields})
 def test_field_denominators_hidden_no_visual_credit(self):
  m=self.mod();r=self.row();r['visibility']['brand_name']={'visibility':'obscured','expect_referral_ok':True};r['bottle_outcomes']['brand_name']='unverifiable-correct-not-recovery'
  s=m.field_metrics([r],'brand_name');self.assertEqual(s['semantic_correct'],1);self.assertEqual(s['visible_denominator'],0);self.assertEqual(s['hidden_correct_not_recovery'],1);self.assertEqual(s['visual_correct'],0)
 def test_negative_denominator_and_dangerous_referral(self):
  m=self.mod();r=self.row();r['truth']['brand_name']='mismatch';r['extraction_correct']['brand_name']=False;r['bottle_outcomes']['brand_name']='dangerous-error'
  s=m.field_metrics([r],'brand_name');self.assertEqual(s['false_matches'],1);self.assertEqual(s['negative_fields'],1);self.assertEqual(s['confident_wrong'],1)
  r['verdicts']['brand_name']='needs-review';r['bottle_outcomes']['brand_name']='safe-referral'
  s=m.field_metrics([r],'brand_name');self.assertEqual(s['false_matches'],0);self.assertEqual(s['confident_wrong'],0);self.assertEqual(s['referrals'],1)
 def test_unknown_cost_not_zero_and_ocr_components(self):
  m=self.mod();a=self.row();b=self.row();b.update(model='mistral-document-ai-2512',cost_usd=.003,pages_processed=1,tokens_in=None,tokens_out=None);c=self.row();c['cost_usd']=None;c['tokens_in']=None;c['tokens_out']=None
  result=m.cost_components([a,b,c]);self.assertAlmostEqual(result['observed_total'],.005);self.assertEqual(result['unknown_calls'],1);self.assertAlmostEqual(result['input_usd'],.0004);self.assertAlmostEqual(result['output_usd'],.00016);self.assertAlmostEqual(result['page_usd'],.003)
 def test_fixed_pairs_exclude_other_operator_and_repeat(self):
  m=self.mod();b=self.row();a=self.row();a.update(operator='AVA',condition='flat');other=dict(a,operator='ARGUS');rep=dict(a,repeat=2)
  p=m.paired([a,other,rep,b]);self.assertEqual(len(p),1);self.assertEqual(p[0]['flat_operator'],'AVA');self.assertEqual(p[0]['flat_repeat'],1);self.assertEqual(p[0]['paired_fields'],7)
 def test_duplicate_pair_is_rejected_not_pooled(self):
  m=self.mod();b=self.row();a=self.row();a.update(operator='AVA',condition='flat')
  with self.assertRaises(ValueError):m.paired([a,a,b])
 def test_failure_retained_in_visible_denominator(self):
  m=self.mod();r=self.row();r['ok']=False;r['extraction_correct']={f:False for f in r['extraction_correct']};r['verdicts']={f:'needs-review' for f in r['verdicts']};r['bottle_outcomes']={f:'failure-referral' for f in r['bottle_outcomes']}
  s=m.field_metrics([r],'brand_name');self.assertEqual(s['all_fields'],1);self.assertEqual(s['visible_denominator'],1);self.assertEqual(s['failure_referrals'],1);self.assertEqual(s['safe_perceptual_referrals'],0)
 def test_stop_file_terminal_is_not_finished_scope(self):
  m=self.mod()
  self.assertFalse(m.finished_scope({'terminal':True,'blocked':[{'reason':'stop-file'}]},['a'],[]))
  self.assertFalse(m.finished_scope({'terminal':True,'blocked':[]},['a'],[]))
  self.assertTrue(m.finished_scope({'terminal':True,'blocked':[{'id':'a','reason':'budget'}]},['a'],[]))
  self.assertTrue(m.finished_scope({'terminal':True,'blocked':[]},['a'],['a']))
  self.assertTrue(m.finished_scope({'terminal':True,'blocked':[{'id':'a','reason':'user-rejected-artificial-occlusion-not-realistic-glare'}]},['a'],[]))
if __name__=='__main__':unittest.main(verbosity=2)
