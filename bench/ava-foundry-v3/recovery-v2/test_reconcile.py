import json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent
class RecoveryTests(unittest.TestCase):
 def load(self):
  p=ROOT/'reconciliation.json';self.assertTrue(p.exists(),'offline reconciliation missing');return json.loads(p.read_text())
 def test_counts_and_no_operator_pooling(self):
  d=self.load();g=d['groups'];self.assertEqual(sum(x['calls'] for x in g if x['operator']=='AVA'),245);self.assertEqual(sum(x['calls'] for x in g if x['operator']=='ARGUS'),108);self.assertEqual(sum(x['calls'] for x in g if x['operator']=='historical'),162)
  self.assertTrue(all(x['total_field_outcomes']==x['calls']*7 for x in g));self.assertEqual(len(g),11)
 def test_usage_and_unknowns(self):
  d=self.load();self.assertAlmostEqual(d['costs']['ava_measured_estimate_usd'],.58834265);self.assertEqual(len(d['ledger']['interrupted']),3);self.assertEqual(d['ledger']['http429_count'],2);self.assertEqual(d['argus_log_only']['completed_logged_calls'],99)
  self.assertGreater(d['costs']['combined_measured_estimate_usd'],.58834265);self.assertFalse(d['costs']['invoice_verified'])
 def test_queue_does_not_rerun_attempts(self):
  d=self.load();p=json.loads((ROOT/'resume-plan.json').read_text());ids=[x['id'] for x in p['ava_protocol_unattempted']];self.assertEqual(len(ids),len(set(ids)));self.assertFalse(set(ids)&set(d['ledger']['attempted_ids']));self.assertEqual(len(ids),76);self.assertEqual(len(p['minimal_cross_operator_unattempted']),67);self.assertEqual(p['paid_execution_enabled'],False)
 def test_invalid_outputs_not_repaired(self):
  d=self.load();rows=json.loads((ROOT/'rescored-records.json').read_text());self.assertEqual(len(rows),515)
  for r in rows:
   if not r['ok']:self.assertEqual(set(r['verdicts'].values()),{'needs-review'});self.assertFalse(any(r['extraction_correct'].values()))
  self.assertTrue(d['equivalence']['fixture_bytes_equal']);self.assertTrue(d['equivalence']['prompts_equal']);self.assertFalse(d['equivalence']['original_scorers_equal'])
 def test_metrics_recomputed_and_provenance_preserved(self):
  d=self.load();rows=json.loads((ROOT/'rescored-records.json').read_text())
  for g in d['groups']:
   rs=[r for r in rows if r['operator']==g['operator'] and r['model']==g['model']];self.assertEqual(len(rs),g['calls']);self.assertEqual(sum(sum(r['extraction_correct'].values()) for r in rs),g['extraction_correct_n']);self.assertEqual(sum(v=='mismatch' for r in rs for v in r['truth'].values()),g['negative_outcomes']);self.assertTrue(all('original_ok' in r for r in rs))
if __name__=='__main__':unittest.main()
