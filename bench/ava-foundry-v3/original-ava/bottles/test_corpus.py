import unittest,json,hashlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).parent
SRC=Path('/opt/data/projects/ttb-label-verify-revision/fixtures')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
class CorpusTests(unittest.TestCase):
 def test_coverage_hashes_transforms_and_bounds(self):
  m=json.loads((ROOT/'manifest.json').read_text()); s=json.loads((SRC/'manifest.json').read_text())
  self.assertEqual(len(m['fixtures']),18)
  self.assertEqual({f['fixture_id'] for f in m['fixtures']},{f['fixture_id'] for f in s['fixtures']})
  self.assertEqual(m['source_manifest_sha256'],sha(SRC/'manifest.json'))
  self.assertEqual(len(list((ROOT/'images').glob('*.png'))),18)
  for f in m['fixtures']:
   self.assertEqual(f['source_sha256'],sha(SRC/f['source_image']))
   self.assertEqual(f['ground_truth_sha256'],sha(SRC/f['source_ground_truth']))
   self.assertEqual(f['ground_truth_sha256'],sha(ROOT/f['ground_truth']))
   self.assertEqual(f['derived_sha256'],sha(ROOT/f['image']))
   self.assertNotEqual(f['source_sha256'],f['derived_sha256'])
   with Image.open(ROOT/f['image']) as im: self.assertEqual(list(im.size),[2200,3200])
   t=f['transform']; self.assertEqual(t['source_box'],[0,0,1000,1500]); self.assertFalse(t['cropped'])
   self.assertIn('seed',t); self.assertIn('mapping',t); self.assertGreaterEqual(t['minimum_horizontal_scale'],1)
   x0,y0,x1,y1=t['label_bounds']; self.assertTrue(0<x0<x1<2200 and 0<y0<y1<3200)
 def test_contact_sheet(self):
  self.assertTrue((ROOT/'contact-sheet.jpg').exists())
if __name__=='__main__': unittest.main()
