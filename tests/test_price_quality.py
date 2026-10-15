import unittest
from types import SimpleNamespace
from collector.pykrx_provider import checked_prices,ProviderError
from collector.price_quality import PRICE_FIELDS,price_issue,reconcile_price_issues
from collector.core import validate

def quote(**overrides):
    result={'시가':95,'고가':110,'저가':90,'종가':100,'등락률':1,'거래량':1000,'거래대금':100000}
    result.update(overrides)
    return result

class Frame:
    def __init__(self,values):
        self.index=values.keys()
        self.loc=values

def fetcher(frames,calls):
    iterator=iter(frames)
    def fetch(fn,day,market):
        calls.append((day,market))
        return Frame(next(iterator))
    return fetch

stock=SimpleNamespace(get_market_ohlcv_by_ticker=object())

def row(code='000001',day='2026-10-15',investor='연기금 등',**changes):
    result=dict(date=day,code=code,name='테스트',market='KOSPI',investor=investor,scope='KRX',buy=500,sell=100,net=400,buy_volume=None,sell_volume=None,net_volume=None,open=95,high=110,low=90,close=100,change_pct=1,volume=1000,turnover=100000,source='unit-test',collected_at='2026-10-15T17:00:00+09:00',finality='unknown')
    result.update(changes)
    return result

class PriceQualityTests(unittest.TestCase):
    def test_retry_recovers_only_invalid_quote_and_keeps_first_valid_quotes(self):
        calls=[]
        prices,issues=checked_prices(stock,'2026-10-15','KOSPI',['000001','000002'],fetcher([
            {'000001':quote(),'000002':quote(고가=80)},
            {'000001':quote(종가=1000),'000002':quote()},
        ],calls))
        self.assertEqual(len(calls),2)
        self.assertEqual(prices['000001']['close'],100)
        self.assertEqual(prices['000002']['high'],110)
        self.assertEqual(issues[0]['status'],'recovered_on_retry')
        self.assertEqual(issues[0]['raw']['high'],'80')

    def test_unresolved_price_is_null_not_zero_and_does_not_drop_flows(self):
        calls=[]
        frames=[{'000001':quote(),'000002':quote(고가=80)}]*3
        prices,issues=checked_prices(stock,'2026-10-15','KOSPI',['000001','000002'],fetcher(frames,calls))
        self.assertEqual(len(calls),3)
        self.assertTrue(all(v is None for v in prices['000002'].values()))
        incoming=row(code='000002',**prices['000002'])
        reconciled=reconcile_price_issues([incoming],[],issues)
        self.assertEqual(validate(reconciled[0])['net'],400)
        self.assertIsNone(reconciled[0]['close'])
        self.assertEqual(issues[0]['status'],'unresolved')

    def test_same_session_prior_prices_preserved_but_never_previous_day_or_other_investor(self):
        issue=dict(date='2026-10-15',code='000001',status='unresolved')
        empty={k:None for k in PRICE_FIELDS}
        incoming=[row(**empty),row(investor='외국인',**empty)]
        result=reconcile_price_issues(incoming,[row(net=300,buy=400)], [issue])
        self.assertEqual(result[0]['close'],100)
        self.assertEqual(result[0]['net'],400)
        self.assertIsNone(result[1]['close'])
        self.assertEqual(issue['preserved_investors'],['연기금 등'])
        result=reconcile_price_issues([row(**empty)],[row(day='2026-10-14')],[dict(date='2026-10-15',code='000001',status='unresolved')])
        self.assertIsNone(result[0]['close'])

    def test_market_wide_invalid_prices_remain_a_hard_failure(self):
        with self.assertRaises(ProviderError):
            checked_prices(stock,'2026-10-15','KOSPI',['000001'],fetcher([{'000001':quote(고가=80)}]*3,[]))
        with self.assertRaises(ProviderError):
            checked_prices(stock,'2026-10-15','KOSPI',['000001'],fetcher([{}],[]))

    def test_halted_stock_and_missing_ticker_are_not_fabricated(self):
        prices,issues=checked_prices(stock,'2026-10-15','KOSPI',['000001','000002'],fetcher([{'000001':quote(시가=0,고가=0,저가=0,거래량=0)}],[]))
        self.assertEqual(prices['000001']['close'],100)
        self.assertIsNone(validate(row(**prices['000001']))['open'])
        self.assertIsNone(prices['000002']['close'])
        self.assertEqual(issues,[])

    def test_invalid_numeric_prices_are_quarantined_and_strict_import_validation_remains(self):
        self.assertEqual(price_issue({'open':float('inf')}),'invalid_number')
        self.assertEqual(price_issue({'close':-1}),'invalid_price_or_volume')
        with self.assertRaisesRegex(ValueError,'2026-10-15 KOSPI 000001'):
            validate(row(high=80))

if __name__=='__main__':unittest.main()
