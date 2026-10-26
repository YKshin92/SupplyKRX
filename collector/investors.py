"""Canonical KRX investor labels, API arguments and private publication paths."""
INVESTORS={'연기금 등':'연기금','외국인':'외국인','기관합계':'기관합계','사모':'사모'}
PUBLICATION_PATHS={'연기금 등':'','외국인':'foreign','기관합계':'institution','사모':'private-fund'}
INSTITUTION_COMPONENTS=('금융투자','보험','투신','사모','은행','기타금융','연기금 등')
INCLUSION_NOTE='기관합계에 연기금·사모가 포함됩니다. 네 투자자 금액을 더해 시장 전체 순매수로 표시하지 않습니다.'


def collection_start(rows,requested=None,recheck=3):
    """Old two-investor archives require a complete initial collection window."""
    if requested or not rows:return requested
    if not set(INVESTORS).issubset({r['investor'] for r in rows}):return None
    days=sorted({r['date'] for r in rows})
    # Every market/investor must have a response on each overlap session.
    overlap=days[max(0,len(days)-recheck):]
    expected={(market,investor) for market in ('KOSPI','KOSDAQ') for investor in INVESTORS}
    if any(not expected.issubset({(r['market'],r['investor']) for r in rows if r['date']==day}) for day in overlap):return None
    return overlap[0]
