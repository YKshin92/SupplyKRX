import json, tempfile, unittest
from pathlib import Path
from collector.strategy_candidates import derive, publish, record, statuses

C = [dict(id='c001-sell-tolerance', created='2026-11-03', title='A', change='x'), dict(id='c002-weights', created='2026-11-04', title='B', change='y')]


def setup(root, candidates=C, events=(), items=()):
    base = Path(root) / 'data/strategy'; base.mkdir(parents=True)
    (base / 'candidates.json').write_text(json.dumps(dict(schema_version=1, candidates=list(candidates))))
    if events: (base / 'decisions.json').write_text(json.dumps(dict(schema_version=1, events=list(events))))
    if items: (base / 'applied.json').write_text(json.dumps(dict(schema_version=1, items=list(items))))


class StrategyCandidateTests(unittest.TestCase):
    def test_full_lifecycle(self):
        ev = [dict(at='2026-11-03T01:00:00Z', action='approve', id='c001-sell-tolerance'),
              dict(at='2026-11-03T01:05:00Z', action='apply', ids=['c001-sell-tolerance'])]
        s = derive(C, ev, [])
        self.assertEqual(s['c001-sell-tolerance']['status'], 'pending'); self.assertEqual(s['c002-weights']['status'], 'review')
        s = derive(C, ev, [dict(id='c001-sell-tolerance', at='2026-11-03T17:00:00Z', status='applied', app_commit='abc')])
        self.assertEqual(s['c001-sell-tolerance']['status'], 'applied'); self.assertEqual(s['c001-sell-tolerance']['app_commit'], 'abc')

    def test_result_before_request_is_ignored_and_failure_can_be_reapproved(self):
        early = [dict(id='c001-sell-tolerance', at='2026-11-02T00:00:00Z', status='applied')]
        self.assertEqual(derive(C, [], early)['c001-sell-tolerance']['status'], 'review', 'An apply result without an owner request must not count')
        ev = [dict(at='2026-11-03T01:00:00Z', action='approve', id='c001-sell-tolerance'), dict(at='2026-11-03T01:05:00Z', action='apply', ids=['c001-sell-tolerance'])]
        failed = [dict(id='c001-sell-tolerance', at='2026-11-03T17:00:00Z', status='failed', note='tests failed')]
        self.assertEqual(derive(C, ev, failed)['c001-sell-tolerance']['status'], 'failed')
        again = ev + [dict(at='2026-11-04T01:00:00Z', action='approve', id='c001-sell-tolerance')]
        self.assertEqual(derive(C, again, failed)['c001-sell-tolerance']['status'], 'approved')

    def test_record_validates_against_status(self):
        with tempfile.TemporaryDirectory() as root:
            setup(root)
            with self.assertRaises(ValueError): record(root, 'apply')  # nothing approved
            with self.assertRaises(ValueError): record(root, 'unapprove', 'c001-sell-tolerance')
            with self.assertRaises(ValueError): record(root, 'approve', 'c999-missing')
            record(root, 'approve', 'c001-sell-tolerance', run=7, now='2026-11-03T01:00:00Z')
            with self.assertRaises(ValueError): record(root, 'approve', 'c001-sell-tolerance')
            e = record(root, 'apply', now='2026-11-03T01:05:00Z')
            self.assertEqual(e['ids'], ['c001-sell-tolerance'])
            _, s = statuses(root)
            self.assertEqual(s['c001-sell-tolerance']['status'], 'pending'); self.assertEqual(s['c002-weights']['status'], 'review')
            with self.assertRaises(ValueError): record(root, 'unapprove', 'c001-sell-tolerance')  # already requested

    def test_publish_handles_missing_folder_and_bad_ids(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            self.assertEqual(publish(root, out)['candidates'], [])
            self.assertTrue((Path(out) / 'strategy-candidates.json').exists())
        with tempfile.TemporaryDirectory() as root:
            setup(root, candidates=[dict(id='bad id', title='A', change='x')])
            with self.assertRaises(ValueError): statuses(root)

    def test_hold_and_unhold(self):
        with tempfile.TemporaryDirectory() as root:
            setup(root)
            with self.assertRaises(ValueError): record(root, 'unhold', 'c001-sell-tolerance')  # not held
            record(root, 'hold', 'c001-sell-tolerance', now='2026-11-03T13:00:00Z')
            _, s = statuses(root)
            self.assertEqual((s['c001-sell-tolerance']['status'], s['c001-sell-tolerance']['held_at']), ('held', '2026-11-03T13:00:00Z'))
            with self.assertRaises(ValueError): record(root, 'hold', 'c001-sell-tolerance')
            with self.assertRaises(ValueError): record(root, 'apply')  # held is not approved, so nothing to apply
            record(root, 'unhold', 'c001-sell-tolerance', now='2026-11-03T13:01:00Z')
            self.assertEqual(statuses(root)[1]['c001-sell-tolerance']['status'], 'review')
            record(root, 'hold', 'c001-sell-tolerance', now='2026-11-03T13:02:00Z')
            record(root, 'approve', 'c001-sell-tolerance', now='2026-11-03T13:03:00Z')  # approve straight from held
            s = statuses(root)[1]['c001-sell-tolerance']
            self.assertEqual((s['status'], s['held_at']), ('approved', None))
            with self.assertRaises(ValueError): record(root, 'hold', 'c001-sell-tolerance')  # approved: cancel first
            e = record(root, 'apply', now='2026-11-03T13:04:00Z')
            self.assertEqual(e['ids'], ['c001-sell-tolerance'])
        ev = [dict(at='2026-11-03T01:00:00Z', action='hold', id='c002-weights'), dict(at='2026-11-03T01:05:00Z', action='unapprove', id='c002-weights')]
        self.assertEqual(derive(C, ev, [])['c002-weights']['status'], 'held', 'invalid transitions in the log are ignored')
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as out:
            setup(root, events=[dict(at='2026-11-03T01:00:00Z', action='hold', id='c002-weights')])
            rows = publish(root, out)['candidates']
            self.assertEqual([r['status'] for r in rows], ['review', 'held']); self.assertEqual(rows[1]['status_label'], '보류')


if __name__ == '__main__':
    unittest.main()
