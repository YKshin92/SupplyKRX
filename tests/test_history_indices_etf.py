import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('collect_history_indices',Path(__file__).resolve().parents[1]/'scripts/collect-history-indices.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
SESSIONS=['2025-12-30','2026-01-02','2026-01-05']
def rows(jump=1.0,drop=None):
    out=[['날짜','시가','고가','저가','종가','거래량','외국인소진율']]
    for i,d in enumerate(SESSIONS):
        if d==drop:continue
        p=100*(jump if i==2 else 1)+i;out.append([d.replace('-',''),p,p+1,p-1,p,1000,0])
    return out
class EtfSeries(unittest.TestCase):
    def run_with(self,etf_rows):
        old=m.fetch_year
        m.fetch_year=lambda symbol,wanted:[r for r in (rows() if symbol in ('KOSPI','KOSDAQ') else etf_rows) if r[0]=='날짜' or r[0][:4]==wanted[0][:4]]
        try:
            with tempfile.TemporaryDirectory() as t:
                target=Path(t)/'x.json';m.collect(SESSIONS,target);return json.loads(target.read_text(encoding='utf-8'))['indices']
        finally:m.fetch_year=old
    def test_complete_etf_is_kept(self):
        got=self.run_with(rows());self.assertEqual(set(got),{'KOSPI','KOSDAQ','ETF_KOSPI200','ETF_SP500','ETF_NASDAQ100'});self.assertEqual(got['ETF_NASDAQ100']['code'],'133690')
    def test_clean_split_is_back_adjusted(self):
        got=self.run_with(rows(jump=.5))['ETF_SP500'];self.assertEqual(got['split_adjustments'],[dict(date='2026-01-05',factor=.5)])
        self.assertAlmostEqual(got['prices']['2026-01-02']['close'],50.5);self.assertAlmostEqual(got['prices']['2026-01-05']['close'],52)
    def test_unclean_jump_or_gap_leaves_etf_out_without_blocking_indices(self):
        self.assertEqual(set(self.run_with(rows(jump=.55))),{'KOSPI','KOSDAQ'})
        self.assertIn('ETF_KOSPI200',self.run_with(rows(jump=1.2)))  # a large real move (+20%) is kept
        self.assertEqual(set(self.run_with(rows(drop='2026-01-02'))),{'KOSPI','KOSDAQ'})
if __name__=='__main__':unittest.main()
