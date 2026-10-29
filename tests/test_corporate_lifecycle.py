import json
from copy import deepcopy
from pathlib import Path
import subprocess
import sys
import unittest
from collector.corporate_context import action_map
from collector.corporate_lifecycle import corporate_step, initial_corporate_position
from collector.split_lifecycle import split_day

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / 'tests/fixtures/corporate-lifecycle.json').read_text(encoding='utf-8'))


def q(v):
    return None if v is None else dict(open=v[0], high=v[1], low=v[2], close=v[3], volume=v[4], change_pct=None)


def run(s):
    p = initial_corporate_position(s['trade'], s['trade']['previous_close']); out = []
    for step in s['steps']:
        r = corporate_step(p, s['action'], step['day'], q(step.get('quote')), q(step.get('asset')), s.get('take', 30), s.get('stop', 10))
        p = r['position']; out.append(r)
        if p['phase'] == 'closed':
            break
    return out


class CorporateLifecycleTests(unittest.TestCase):
    def test_bonus_stop_sells_tradable_now_and_locked_shares_at_listing(self):
        out = run(FIXTURE['scenarios'][0])
        self.assertEqual(out[2]['shares'], 141)
        self.assertEqual(out[2]['position']['fractional_forfeit'], [dict(asset='무상배정 신주', fraction='3/5')])
        self.assertEqual(out[3]['cash_in'], 118 * 880); self.assertEqual(out[3]['status'], 'open')
        self.assertEqual(out[3]['position']['phase'], 'locked_exit')
        self.assertEqual(out[5]['status'], 'stop'); self.assertEqual(out[5]['cash_in'], 23 * 860)
        self.assertEqual(out[5]['pnl'], 118 * 880 + 23 * 860 - 141600)
        self.assertEqual(sum(r['cash_in'] for r in out), 118 * 880 + 23 * 860)

    def test_bonus_merge_take_and_ex_date_break(self):
        take = run(FIXTURE['scenarios'][1])[-1]
        self.assertEqual((take['status'], take['shares'], take['cash_in'], take['pnl']), ('take', 12, 15600, 3600))
        broken = run(FIXTURE['scenarios'][2])
        self.assertEqual([r['status'] for r in broken], ['open', 'unresolved', 'unresolved'])
        self.assertTrue(all(r['cash_in'] == 0 for r in broken))

    def test_spinoff_joint_close_decision_then_next_open_sale(self):
        out = run(FIXTURE['scenarios'][3])
        self.assertIsNone(out[1]['pnl']); self.assertEqual(out[1]['reference_value'], 34000)
        self.assertEqual([l['shares'] for l in out[3]['legs']], [30, 32])
        self.assertTrue(all(r['cash_in'] == 0 for r in out[:-1]))
        self.assertIn('007 합산 종가 익절선 도달', out[-1]['reason'])
        self.assertEqual((out[-1]['status'], out[-1]['cash_in'], out[-1]['pnl']), ('take', 30 * 795 + 32 * 505, 30 * 795 + 32 * 505 - 34000))
        stop = run(FIXTURE['scenarios'][4])[-1]
        self.assertEqual((stop['status'], stop['cash_in']), ('stop', 9 * 690 + 9 * 140))

    def test_spinoff_missing_new_quote_and_pre_halt_exit(self):
        missing = run(FIXTURE['scenarios'][5])
        self.assertEqual(missing[2]['status'], 'unresolved'); self.assertIn('신설 종목', missing[2]['reason'])
        early = run(FIXTURE['scenarios'][6])[-1]
        self.assertEqual((early['status'], early['cash_in']), ('take', 13000))

    def test_split_zero_fraction_policy(self):
        action = dict(id='split', known_on='001', halt_start='002', resume_date='004', numerator=5, denominator=2)
        p = dict(entry_date='001', entry_price=100, invested=5500, shares=55, basis_price=100, phase='active', last_close=100, applied_actions=[])
        price = dict(open=40, high=40, low=40, close=40, volume=100, change_pct=None)
        self.assertEqual(split_day(split_day(p, action, '002', None), action, '004', price)['phase'], 'unresolved')
        zero = dict(action, fraction_policy='zero')
        r = split_day(split_day(p, zero, '002', None), zero, '004', price)
        self.assertEqual((r['phase'], r['shares'], r['basis_price'], r['cash_delta']), ('active', 137, 5500 / 137, 0))
        self.assertEqual(r['fractional_forfeit'], [dict(asset='분할 후 주식', fraction='1/2')])
        self.assertNotIn('fractional_claim', r)

    def test_rejects_out_of_order_and_invalid_inputs(self):
        s = FIXTURE['scenarios'][0]; out = run(s)
        with self.assertRaises(ValueError):
            corporate_step(out[3]['position'], s['action'], '004', q([1, 1, 1, 1, 1]), None)
        with self.assertRaises(ValueError):
            corporate_step(out[0]['position'], dict(s['action'], fraction_policy='cash'), '002', q([1, 1, 1, 1, 1]), None)
        with self.assertRaises(ValueError):
            corporate_step(out[0]['position'], s['action'], '002', q([1, 1, 1, 1, 1]), None, take=0)

    def test_context_kinds(self):
        base = dict(as_of='2026-10-29', policy='test', actions=[
            dict(code='323990', id='b', kind='bonus', known_on='2023-10-30', ex_date='2023-11-10', listing_date='2023-11-30', numerator=1, denominator=5, fraction_policy='zero', evidence_on='2023-11-27', source='https://example.test/b'),
            dict(code='000070', id='s', kind='spinoff', known_on='2025-05-30', halt_start='2025-10-30', resume_date='2025-11-24', numerator=9039233, denominator=10000000, new_code='0120G0', new_name='신설', new_numerator=960767, new_denominator=1000000, fraction_policy='zero', evidence_on='2026-03-23', source='https://example.test/s')])
        self.assertEqual(len(action_map(base)), 2)
        for i, patch in [(0, dict(listing_date='2023-11-10')), (0, dict(ex_date=None)), (0, dict(fraction_policy='cash')), (0, dict(kind='merger')),
                         (1, dict(new_code='000070')), (1, dict(new_code='../x')), (1, dict(new_numerator=0)), (1, dict(new_name=' ')), (1, dict(evidence_on='2026-10-30'))]:
            c = deepcopy(base); c['actions'][i].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                action_map(c)

    def test_account_fixture_assertions_hold(self):
        proc = subprocess.run([sys.executable, str(ROOT / 'scripts/corporate-account-fixture.py')], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)


if __name__ == '__main__':
    unittest.main()
