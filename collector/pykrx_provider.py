"""pykrx adapter. Uses documented market-wide calls, refuses silent empty results."""
from datetime import datetime, timedelta, timezone
import os
import time
import contextlib
import io
from .price_quality import PRICE_FIELDS,price_issue
from .investors import INVESTORS

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

PRICE_COLUMNS={'open':'시가','high':'고가','low':'저가','close':'종가','change_pct':'등락률','volume':'거래량','turnover':'거래대금'}

def checked_prices(stock,day,market,codes,fetch=call):
    """Retry only failed quotes from the same market/date, then quarantine them."""
    quotes={}
    unresolved={}
    pending=set(map(str,codes))
    recovered=[]
    for attempt in range(3):
        frame=fetch(stock.get_market_ohlcv_by_ticker,day.replace('-',''),market=market)
        for code in list(pending):
            if code not in frame.index:
                if code not in unresolved:
                    quotes[code]={k:None for k in PRICE_FIELDS}
                    pending.remove(code)
                continue
            record=frame.loc[code]
            raw={key:str(record.get(column,'')) for key,column in PRICE_COLUMNS.items()}
            try:
                quote={key:None if raw[key] in ('nan','None','') else float(raw[key]) for key in PRICE_FIELDS}
                reason=price_issue(quote)
                if not reason:
                    quote={key:None if value is None else value if key=='change_pct' else int(value) for key,value in quote.items()}
            except (ValueError,TypeError,OverflowError):
                reason='invalid_number'
            if reason:
                unresolved[code]=dict(date=day,market=market,code=code,reason=reason,raw=raw,status='unresolved')
            else:
                if code in unresolved:
                    recovered.append({**unresolved.pop(code),'status':'recovered_on_retry'})
                quotes[code]=quote
                pending.remove(code)
        if not pending:
            break
        print(f'{day} {market}: price validation retry {attempt+1}/3; codes='+','.join(sorted(pending)),flush=True)
    if not any(q.get('close') is not None for q in quotes.values()):
        raise ProviderError(f'{day} / {market}: 전체 시세 검증 실패. 기존 데이터를 유지합니다.')
    for code,issue in unresolved.items():
        quotes[code]={k:None for k in PRICE_FIELDS}
        print(f'{day} {market} {code}: invalid prices quarantined ({issue["reason"]}); flow collection continues',flush=True)
    return quotes,recovered+list(unresolved.values())

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
    price_issues=[]
    snapshots={}
    universes={}
    observed_day=datetime.now(timezone(timedelta(hours=9))).date().isoformat()
    for day in selected:
        compact=day.replace('-','')
        universes[day]=dict(as_of=day,classification_observed_date=observed_day,classification_status='asof_observed' if observed_day==day else 'historical_classification_unverified',source='KRX current security master via pykrx; common stocks listed by requested day',stocks=[])
        for market in ['KOSPI','KOSDAQ']:
            universe=master[master['시장구분'].str.startswith(market)]
            universe=universe[universe['상장일'].dt.strftime('%Y-%m-%d')<=day]
            if universe.empty: continue
            universes[day]['stocks'].extend(dict(code=str(code),market=market,name=info['한글종목약명']) for code,info in universe.iterrows())
            prices,issues=checked_prices(stock,day,market,universe.index)
            price_issues.extend(issues)
            for investor in investors:
                try:
                    flow=call(stock.get_market_net_purchases_of_equities_by_ticker,compact,compact,market,INVESTORS[investor])
                except ProviderError as exc:
                    raise ProviderError(f'{day} / {market} / {investor}: {exc}') from None
                if not {'매수거래대금','매도거래대금','순매수거래대금'}.issubset(flow.columns):
                    raise ProviderError(f'{investor} 수급 스키마 변경')
                for code,info in universe.iterrows():
                    # User policy: absent ticker in a successful market response is zero.
                    f=flow.loc[code] if code in flow.index else None
                    def val(record,col):
                        if record is None or col not in record or str(record[col]) in ('nan','None',''): return None
                        return float(record[col]) if col=='등락률' else int(record[col])
                    rows.append(dict(date=day,code=str(code),name=info['한글종목약명'],market=market,investor=investor,scope='KRX',
                        buy=val(f,'매수거래대금'),sell=val(f,'매도거래대금'),net=val(f,'순매수거래대금'),
                        buy_volume=val(f,'매수거래량'),sell_volume=val(f,'매도거래량'),net_volume=val(f,'순매수거래량'),
                        **prices[str(code)],
                        source='KRX via pykrx',collected_at=collected,finality='unknown',flow_status='reported' if f is not None else 'absent_zero'))
                    if f is None:
                        for field in ['buy','sell','net','buy_volume','sell_volume','net_volume']:
                            rows[-1][field]=0
            print(f'{day} {market}: {len(universe)} stocks processed',flush=True)
        snapshots[day]=collect_metadata(stock,day)
    for investor in investors:
        if not any(r['net'] is not None for r in rows if r['investor']==investor):
            raise ProviderError(f'{investor}: 유효한 수급값이 없습니다.')
    calendar=dict(sessions=sessions,checked_through=end,source='pykrx.get_previous_business_days / KRX 관측 거래일')
    calendar['instruments']=snapshots[selected[-1]]
    calendar['metadata_snapshots']=snapshots
    calendar['universe_snapshots']=universes
    calendar['price_quality_issues']=price_issues
    return rows,calendar
