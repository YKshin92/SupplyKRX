import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from collector.foreign_record import foreign_record


class ForeignRecordTest(unittest.TestCase):
    def fixture(self, current=-101):
        days=[str(i).zfill(3) for i in range(23)]
        rows={d:dict(net=-100) for d in days}
        rows['020']['net']=current
        return days,rows

    def test_strict_record_and_tie(self):
        days,rows=self.fixture()
        self.assertEqual(foreign_record('020',rows,days)['status'],'record')
        rows['020']['net']=-100
        self.assertEqual(foreign_record('020',rows,days)['status'],'normal')
        rows['020']['net']=1000
        self.assertEqual(foreign_record('020',rows,days)['status'],'normal')

    def test_prior_window_not_future_or_signal(self):
        days,rows=self.fixture()
        rows['021']['net']=-1e12
        self.assertEqual(foreign_record('020',rows,days)['prior_max_sell'],100)
        rows['000']['net']=-1e9
        rows['021']['net']=-102
        self.assertEqual(foreign_record('021',rows,days)['status'],'record')

    def test_missing_not_zero(self):
        days,rows=self.fixture()
        self.assertEqual(foreign_record('019',rows,days)['status'],'missing')
        del rows['010']
        result=foreign_record('020',rows,days)
        self.assertEqual(result['status'],'missing')
        self.assertEqual(result['observed_days'],19)
        self.assertIsNone(result['prior_max_sell'])
        rows['010']={'net':float('nan')}
        self.assertEqual(foreign_record('020',rows,days)['status'],'missing')

    def test_no_prior_sales(self):
        days,rows=self.fixture(-1)
        for d in days[:20]: rows[d]['net']=0
        self.assertEqual(foreign_record('020',rows,days)['status'],'record')
        self.assertEqual(foreign_record('020',rows,days)['prior_max_sell'],0)


if __name__=='__main__': unittest.main()
