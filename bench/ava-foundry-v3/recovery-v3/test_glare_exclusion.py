"""Offline regression for the actual main queue loop; never invokes transport."""
import ast
import collections
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
import runner


class GlareExclusionTests(unittest.TestCase):
    def test_main_queue_blocks_only_glare_and_preserves_attempted_ids(self):
        tree = ast.parse(Path(runner.__file__).read_text())
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        loop = next(n for n in main.body if isinstance(n, ast.For) and isinstance(n.iter, ast.Name) and n.iter.id == 'queue')
        code = compile(ast.fix_missing_locations(ast.Module(body=[loop], type_ignores=[])), runner.__file__, 'exec')
        attempted = [{'id': 'model--saved--glare--1', 'guard_usd': .003}, {'id': 'model--saved--straight--1', 'guard_usd': .01}]
        budget = Mock()
        budget.entries.return_value = attempted
        budget.total.return_value = 8
        one = Mock(return_value={'http_status': 200})
        queue = [('model', {'fixture_id': 'new'}, 1, c, None) for c in ('flat', 'straight', 'angle', 'glare')]
        queue += [('model', {'fixture_id': 'saved'}, 1, c, None) for c in ('glare', 'straight')]
        with tempfile.TemporaryDirectory() as td:
            ns = dict(ROOT=Path(td), queue=queue, blocked=[], b=budget,
                      transport_failures=collections.Counter(), reservation=lambda m: .01,
                      one=one, env={})
            exec(code, ns)
        self.assertEqual([c.args[3] for c in one.call_args_list], ['flat', 'straight', 'angle'])
        self.assertEqual(ns['blocked'], [{'id': 'model--new--glare--1', 'reason': 'user-rejected-artificial-occlusion-not-realistic-glare'}])
        self.assertEqual(attempted, [{'id': 'model--saved--glare--1', 'guard_usd': .003}, {'id': 'model--saved--straight--1', 'guard_usd': .01}])
        budget.reserve.assert_not_called()
        budget.settle.assert_not_called()


if __name__ == '__main__':
    unittest.main()
