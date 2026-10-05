"""pykrx adapter. Uses documented market-wide calls, refuses silent empty results."""
from datetime import datetime, timedelta, timezone
import os
import time
import contextlib
import io

class ProviderError(RuntimeError): pass

def call(fn, *args, **kwargs):
    for attempt in range(3):
        try:
            time.sleep(1)
            # pykrx prints the login identifier; keep authentication output private.
            with contextlib.redirect_stdout(io.StringIO()):
                result=fn(*args,**kwargs)
            if result is None or len(result)==0: raise ProviderError('빈 응답: 인증·조회일·원천 제공 상태 확인 필요')
            return result
        except Exception as exc:
            if attempt==2: raise ProviderError(f'{fn.__name__} 실패 ({type(exc).__name__}). 인증 및 공급자 상태를 확인하세요.') from None
            time.sleep(2**attempt)

INVESTORS = {"연기금 등": "연기금", "외국인": "외국인"}

def collect_metadata(stock, day):
    result = {}
    for market in ['KOSPI','KOSDAQ']:
        frame=call(stock.get_market_sector_classifications,day.replace('-',''),market)
        if not {'업종명','시가총액'}.issubset(frame.columns):
            raise ProviderError('업종·시가총액 스키마 변경')
        for code,r in frame.iterrows():
            cap=int(r['시가총액'])
            if not 0 <= cap <= 2**53-1: raise ProviderError('잘못된 시가총액')
            sector=str(r['업종명']).strip()
            result[str(code)]=dict(market_cap=cap,sector=sector if sector not in ('','nan','0','-') else None,metadata_date=day,metadata_source='KRX 업종분류현황 via pykrx')
    return result

def collect(end: str, days=20, start=None, codes=None, investors=None):
    investors = list(INVESTORS) if investors is None else list(investors)
    if not investors or any(i not in INVESTORS for i in investors):
        raise ProviderError("지원하지 않는 투자자 분류")
    if not os.getenv('KRX_ID') or not os.getenv('KRX_PW'):
        raise ProviderError('KRX_ID와 KRX_PW 환경변수가 필요합니다. 비밀번호를 코드에 넣지 마세요.')
    import requests
    if not getattr(requests.sessions.Session.request, '_pension_timeout', False):
        original=requests.sessions.Session.request
        def bounded(self,*args,**kwargs):
            kwargs.setdefault('timeout',30)
            return original(self,*args,**kwargs)
        bounded._pension_timeout=True
        requests.sessions.Session.request=bounded
    with contextlib.redirect_stdout(io.StringIO()):
        from pykrx import stock
    end_date=datetime.fromisoformat(end).date()
    begin=(end_date-timedelta(days=65)).isoformat()
    business=call(stock.get_previous_business_days,fromdate=begin.replace('-',''),todate=end.replace('-',''))
    sessions=sorted({d.strftime('%Y-%m-%d') for d in business})
    selected=[d for d in sessions if (not start or d>=start)][-days:]
    if not selected: raise ProviderError('수집할 거래일이 없습니다.')
    master=call(stock.get_market_ohlcv_by_market,'ALL')
    required={'주식종류','증권구분','시장구분','한글종목약명','상장일'}
    if not required.issubset(master.columns): raise ProviderError('종목 기본정보 스키마 변경. 보통주를 추정하지 않습니다.')
    master=master[(master['주식종류']=='보통주') & (master['증권구분']=='주권') & master['시장구분'].str.startswith(('KOSPI','KOSDAQ'))]
    if codes: master=master.loc[master.index.intersection(codes)]
    if master.empty: raise ProviderError('검증 가능한 보통주 종목이 없습니다.')
    collected=datetime.now(timezone.utc).isoformat()
    rows=[]
    for day in selected:
        compact=day.replace('-','')
        for market in ['KOSPI','KOSDAQ']:
            universe=master[master['시장구분'].str.startswith(market)]
            universe=universe[universe['상장일'].dt.strftime('%Y-%m-%d')<=day]
            if universe.empty: continue
            prices=call(stock.get_market_ohlcv_by_ticker,compact,market=market)
            for investor in investors:
                flow=call(stock.get_market_net_purchases_of_equities_by_ticker,compact,compact,market,INVESTORS[investor])
                if not {'매수거래대금','매도거래대금','순매수거래대금'}.issubset(flow.columns):
                    raise ProviderError(f'{investor} 수급 스키마 변경')
                for code,info in universe.iterrows():
                    # An absent flow row is unknown, never an invented zero.
                    f=flow.loc[code] if code in flow.index else None
                    p=prices.loc[code] if code in prices.index else None
                    def val(record,col):
                        if record is None or col not in record or str(record[col]) in ('nan','None',''): return None
                        return float(record[col]) if col=='등락률' else int(record[col])
                    rows.append(dict(date=day,code=str(code),name=info['한글종목약명'],market=market,investor=investor,scope='KRX',
                        buy=val(f,'매수거래대금'),sell=val(f,'매도거래대금'),net=val(f,'순매수거래대금'),
                        buy_volume=val(f,'매수거래량'),sell_volume=val(f,'매도거래량'),net_volume=val(f,'순매수거래량'),
                        open=val(p,'시가'),high=val(p,'고가'),low=val(p,'저가'),close=val(p,'종가'),change_pct=val(p,'등락률'),volume=val(p,'거래량'),turnover=val(p,'거래대금'),
                        source='KRX via pykrx',collected_at=collected,finality='unknown'))
            print(f'{day} {market}: {len(universe)} stocks processed',flush=True)
    for investor in investors:
        if not any(r['net'] is not None for r in rows if r['investor']==investor):
            raise ProviderError(f'{investor}: 유효한 수급값이 없습니다.')
    calendar=dict(sessions=sessions,checked_through=end,source='pykrx.get_previous_business_days / KRX 관측 거래일')
    calendar['instruments']=collect_metadata(stock,selected[-1])
    return rows,calendar
