import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('score',Path(__file__).resolve().parents[1]/'score-raster-benchmark.py')
score=importlib.util.module_from_spec(spec);spec.loader.exec_module(score)
class ScoringTests(unittest.TestCase):
 def test_overlap_is_counted_once(self):self.assertEqual(score.union_area([(0,0,10,10),(5,0,10,10)]),150)
 def test_nested_box_does_not_inflate_coverage(self):self.assertEqual(score.union_area([(0,0,10,10),(2,2,2,2)]),100)
 def test_disjoint_and_empty(self):self.assertEqual(score.union_area([(0,0,2,2),(5,5,2,2)]),8);self.assertEqual(score.union_area([]),0)
 def test_clipping_uses_pixel_bounds(self):self.assertEqual(score.clip((-1.2,2.2,5,3),10,10),(0,2,4,4));self.assertIsNone(score.clip((15,0,1,1),10,10))
 def test_duplicate_prediction_is_false_positive(self):
  p=[dict(x=0,y=0,width=10,height=10,confidence=.9),dict(x=0,y=0,width=10,height=10,confidence=.8)]
  self.assertEqual(score.match(p,[(0,0,10,10)]),(1,1,0))
 def test_missed_annotation_stays_false_negative(self):self.assertEqual(score.match([],[(0,0,10,10)]),(0,0,1))
 def test_low_overlap_is_not_detection(self):
  p=[dict(x=0,y=0,width=10,height=10,confidence=.9)]
  self.assertEqual(score.match(p,[(8,8,10,10)]),(0,1,1))
if __name__=='__main__':unittest.main()
