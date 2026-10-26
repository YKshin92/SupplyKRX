import importlib.util
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / 'scripts' / file)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


v = module('verify_production', 'verify-production.py')
f = module('collection_freshness', 'collection-freshness.py')


class Client:
    def __init__(self, states, date='2026-10-12', alias='expected'):
        self.states = states
        self.date = date
        self.alias = alias
        self.retries = []
        self.calls = 0
    def project(self): return 'project'
    def deployments(self, project):
        state = self.states[min(self.calls, len(self.states) - 1)]
        self.calls += 1
        return [] if state == 'MISSING' else [dict(uid=str(self.calls), state=state, meta={'githubCommitSha': 'expected'})]
    def retry(self, deployment): self.retries.append(deployment)
    def latest_commit(self): return self.alias if self.alias == 'newer' else 'expected'
    def production_sha(self): return self.alias
    def manifest(self): return {'as_of': self.date, 'mode': 'live'}


class ReliabilityTests(unittest.TestCase):
    def test_intraday_collection_uses_previous_day_in_seoul(self):
        self.assertEqual(f.collection_end('', datetime(2026, 10, 13, 2, tzinfo=timezone.utc)), '2026-10-12')
        self.assertEqual(f.collection_end('', datetime(2026, 10, 13, 6, 59, tzinfo=timezone.utc)), '2026-10-12')
        self.assertEqual(f.collection_end('', datetime(2026, 10, 13, 7, tzinfo=timezone.utc)), '2026-10-13')
    def test_weekend_and_explicit_recovery_dates(self):
        self.assertEqual(f.collection_end('', datetime(2026, 10, 12, 2, tzinfo=timezone.utc)), '2026-10-09')
        self.assertEqual(f.collection_end('', datetime(2026, 10, 11, 8, tzinfo=timezone.utc)), '2026-10-09')
        self.assertEqual(f.collection_end('2026-10-08', datetime(2026, 10, 13, 2, tzinfo=timezone.utc)), '2026-10-08')
        with self.assertRaises(ValueError): f.collection_end('invalid', datetime.now(timezone.utc))
    def run_check(self, client):
        ticks = iter(range(100))
        return v.verify(client, 'expected', '2026-10-12', timeout=8, sleep=lambda _: None, clock=lambda: next(ticks))
    def test_ready_alias_and_date(self): self.run_check(Client(['READY']))
    def test_failed_deployment_retried_same_commit(self):
        client = Client(['ERROR', 'BUILDING', 'READY'])
        self.run_check(client)
        self.assertEqual(len(client.retries), 1)
        self.assertEqual(v.commit_sha(client.retries[0]), 'expected')
    def test_retry_bounded(self):
        client = Client(['ERROR'])
        with self.assertRaises(v.VerificationError): self.run_check(client)
        self.assertEqual(len(client.retries), 2)
    def test_missing_deployment_is_not_success(self):
        with self.assertRaises(v.VerificationError): self.run_check(Client(['MISSING']))
    def test_wrong_alias_does_not_verify_or_redeploy(self):
        client = Client(['READY'], alias='another')
        with self.assertRaises(v.VerificationError): self.run_check(client)
        self.assertEqual(client.retries, [])
    def test_stale_data_is_not_success(self):
        with self.assertRaises(v.VerificationError): self.run_check(Client(['READY'], date='2026-10-08'))
    def test_newer_data_branch_never_redeploys_old_commit(self):
        client = Client(['ERROR'], alias='newer')
        with self.assertRaises(v.VerificationError): self.run_check(client)
        self.assertEqual(client.retries, [])
    def test_freshness_all_groups_and_time(self):
        now = datetime(2026, 10, 12, 10, tzinfo=timezone.utc)
        rows = [dict(date='2026-10-12', market=m, investor=i, collected_at=now.isoformat()) for m in ('KOSPI', 'KOSDAQ') for i in ('연기금 등', '외국인','기관합계','사모')]
        self.assertTrue(f.fresh(rows, '2026-10-12', now + timedelta(minutes=5)))
        self.assertFalse(f.fresh(rows, '2026-10-12', now + timedelta(minutes=20)))
        self.assertFalse(f.fresh(rows[:1], '2026-10-12', now))
        self.assertFalse(f.fresh(rows, '2026-10-13', now))
        self.assertFalse(f.fresh([r for r in rows if r['investor'] in ('연기금 등','외국인')], '2026-10-12', now))


if __name__ == '__main__': unittest.main()
