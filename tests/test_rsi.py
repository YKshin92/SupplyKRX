import unittest
from collector.rsi import cutler_series, summarize, PERIOD

def rows(closes, volume=100):
    days = [f'd{i:03}' for i in range(len(closes))]
    return {d: (None if c is None else dict(close=c, volume=volume, open=c, change_pct=None)) for d, c in zip(days, closes)}, days


class RsiTests(unittest.TestCase):
    def test_sma_definition_matches_hand_calculation(self):
        closes = [100 + (i % 2) * 2 - (i // 2) * 0 for i in range(15)]  # alternating +2/-2 changes
        r, d = rows(closes)
        s = cutler_series(r, d)
        self.assertTrue(all(x['rsi'] is None for x in s[:PERIOD]))
        self.assertEqual(s[PERIOD]['reason'], None)
        gains = sum(max(b - a, 0) for a, b in zip(closes, closes[1:])) / 14
        losses = sum(max(a - b, 0) for a, b in zip(closes, closes[1:])) / 14
        self.assertAlmostEqual(s[PERIOD]['rsi'], 100 - 100 / (1 + gains / losses))  # Wilder seed = SMA of the first 14 changes
        self.assertAlmostEqual(s[PERIOD]['cutler'], s[PERIOD]['rsi'])

    def test_main_value_is_wilder_and_cutler_is_secondary(self):
        closes = [100, 101, 103, 102, 104, 103, 101, 100, 99, 101, 103, 104, 102, 101, 100, 97, 95, 96]
        r, d = rows(closes)
        last = cutler_series(r, d)[-1]
        wilder, cutler = last['rsi'], last['cutler']
        ch = [b - a for a, b in zip(closes, closes[1:])]
        g = sum(max(c, 0) for c in ch[:14]) / 14; l = sum(max(-c, 0) for c in ch[:14]) / 14
        for c in ch[14:]:
            g = (g * 13 + max(c, 0)) / 14; l = (l * 13 + max(-c, 0)) / 14
        self.assertAlmostEqual(wilder, 100 - 100 / (1 + g / l))
        self.assertNotAlmostEqual(wilder, cutler, places=3)
        last = ch[-14:]
        self.assertAlmostEqual(cutler, 100 - 100 / (1 + (sum(max(c, 0) for c in last) / 14) / (sum(max(-c, 0) for c in last) / 14)))

    def test_flat_all_up_missing_zero_volume_and_break_reset(self):
        self.assertEqual(cutler_series(*rows([100] * 15))[-1]['reason'], 'flat')
        self.assertEqual(cutler_series(*rows(list(range(100, 115))))[-1]['rsi'], 100.0)
        gap = list(range(100, 110)) + [None] + list(range(110, 120))
        s = cutler_series(*rows(gap))
        self.assertEqual(s[10]['reason'], 'invalid'); self.assertIsNone(s[10]['rsi'])
        self.assertEqual(s[-1]['rsi'], 100.0)  # the missing day is skipped, not a restart: 19 valid bars
        r, d = rows(list(range(100, 130)))
        r[d[20]] = dict(r[d[20]], volume=0)
        s = cutler_series(r, d)
        self.assertIsNone(s[20]['rsi']); self.assertEqual(s[25]['rsi'], 100.0)  # halted day skipped
        r[d[22]] = dict(r[d[22]], close=r[d[22]]['close'] * 3, open=r[d[22]]['open'] * 3)  # unexplained break still restarts
        self.assertEqual(cutler_series(r, d)[22]['reason'], 'break')
        r, d = rows(list(range(100, 130)))
        r[d[20]] = dict(r[d[20]], close=300, open=300)  # >35% jump: corporate-action style break
        s = cutler_series(r, d)
        self.assertEqual(s[20]['reason'], 'break'); self.assertIsNone(s[25]['rsi'])
        self.assertIsNotNone(cutler_series(*rows(list(range(100, 130))))[25]['rsi'])

    def test_state_and_entry_event_are_separate(self):
        up = [100 + i for i in range(15)]
        down = [up[-1] - 3 * (i + 1) for i in range(12)]
        r, d = rows(up + down)
        s = cutler_series(r, d)
        crossings = [b['date'] for a, b in zip(s, s[1:]) if a['rsi'] is not None and b['rsi'] is not None and a['rsi'] >= 30 > b['rsi']]
        self.assertEqual(len(crossings), 1)
        summary = summarize(s)
        self.assertEqual(summary['state'], 'below30'); self.assertFalse(summary['entry_today'])
        self.assertEqual(summary['last_entry_date'], crossings[0]); self.assertGreater(summary['below_streak'], 1)
        at_cross = summarize(s[:d.index(crossings[0]) + 1])
        self.assertTrue(at_cross['entry_today']); self.assertEqual(at_cross['below_streak'], 1)


class RsiReferenceTests(unittest.TestCase):
    def test_warmup_history_is_merged_before_live_rows(self):
        import gzip, json, tempfile
        from pathlib import Path
        from collector.rsi import load_warmup
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, 'w.json.gz')
            p.write_bytes(gzip.compress(json.dumps(dict(sessions=['2026-01-02', '2026-01-05'], stocks={'005930': [[100, 5], None]})).encode()))
            sessions, stocks = load_warmup(p)
            self.assertEqual(sessions, ['2026-01-02', '2026-01-05'])
            self.assertEqual(stocks['005930'], {'2026-01-02': dict(close=100, volume=5)})
            self.assertEqual(load_warmup(Path(d, 'missing.json.gz')), ([], {}))

    def test_latest_caps_never_uses_a_later_snapshot(self):
        import json, tempfile
        from pathlib import Path
        from collector.rsi import latest_caps
        with tempfile.TemporaryDirectory() as d:
            for day, cap in (('2026-10-27', 1), ('2026-10-29', 2)):
                Path(d, f'{day}.json').write_text(json.dumps(dict(instruments={'005930': dict(market_cap=cap)})))
            self.assertEqual(latest_caps(d, '2026-10-28'), ('2026-10-27', {'005930': 1}))
            self.assertEqual(latest_caps(d, '2026-10-29')[0], '2026-10-29')
            self.assertEqual(latest_caps(d, '2026-10-01'), (None, {}))

    def test_us_block_uses_index_sessions_and_keeps_rank(self):
        from collector.rsi import us_rsi
        days = [f'2026-09-{i:02}' for i in range(1, 21)]
        idx = {d: dict(close=100 + i) for i, d in enumerate(days)}
        stock = {d: dict(close=50 - i, volume=10, open=50 - i) for i, d in enumerate(days) if d != days[3]}
        out = us_rsi(dict(cap_date='2026-09-20', indices={'S&P500': dict(symbol='^GSPC', prices=idx)},
                          stocks=[dict(rank=2, symbol='B', name='B', prices={}), dict(rank=1, symbol='A', name='A', market_cap_usd=5, prices=stock)]))
        self.assertEqual(out['as_of'], days[-1])
        self.assertEqual(out['indices']['S&P500']['summary']['rsi'], 100.0)
        self.assertEqual([s['symbol'] for s in out['top30']], ['A', 'B'])
        self.assertEqual(out['top30'][0]['rsi'], 0.0)  # warm-up restarted after the missing session, then 15 falling sessions
        self.assertIsNone(out['top30'][1]['rsi'])
        self.assertIsNone(us_rsi(None))


if __name__ == '__main__':
    unittest.main()
