import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('collect_us_market', Path(__file__).resolve().parents[1] / 'scripts/collect-us-market.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class UsMarketCloseTests(unittest.TestCase):
    def test_morning_kst_run_keeps_the_just_closed_session(self):
        # 06:30 KST in winter = 16:30 EST, in summer = 17:30 EDT: both after the close margin
        self.assertTrue(mod.session_closed(datetime(2026, 11, 2, 21, 30, tzinfo=timezone.utc)))
        self.assertTrue(mod.session_closed(datetime(2026, 7, 6, 21, 30, tzinfo=timezone.utc)))

    def test_open_session_and_close_print_window_are_dropped(self):
        self.assertFalse(mod.session_closed(datetime(2026, 11, 2, 21, 10, tzinfo=timezone.utc)))  # 16:10 EST
        self.assertFalse(mod.session_closed(datetime(2026, 11, 2, 18, 0, tzinfo=timezone.utc)))   # 13:00 EST, market open
        self.assertTrue(mod.session_closed(datetime(2026, 11, 2, 21, 20, tzinfo=timezone.utc)))   # 16:20 EST


if __name__ == '__main__':
    unittest.main()
