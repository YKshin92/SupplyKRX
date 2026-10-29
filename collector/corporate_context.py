"""Validate explicit, versioned-by-evidence corporate reconciliation inputs."""
from datetime import date
import re
from urllib.parse import urlsplit

POLICY = 'corporate-v2: 단주 0원 처리 · 무상신주 상장일 시가 매도 · 회사분할 두 종목 합산 종가 판정 후 다음 거래일 시가 매도'


def action_start(a):
    return a['ex_date'] if a.get('kind') == 'bonus' else a['halt_start']


def action_map(context):
    result={}
    if context is None:return result
    def fail():raise ValueError('Invalid corporate reconciliation context')
    def valid_day(value):
        if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value):return False
        try:return date.fromisoformat(value).isoformat()==value
        except ValueError:return False
    def ratio(*values):return all(type(v) is int and 0<v<=9007199254740991 for v in values)
    if not isinstance(context,dict) or not valid_day(context.get('as_of')) or not isinstance(context.get('actions'),list):fail()
    if 'policy' in context and not isinstance(context['policy'],str):fail()
    ids=set()
    for a in context['actions']:
        if not isinstance(a,dict):fail()
        code=a.get('code');identity=a.get('id');source=a.get('source')
        if not isinstance(code,str) or not re.fullmatch(r'[0-9A-Z]{6}',code) or code in result or not isinstance(identity,str) or not identity.strip() or identity in ids:fail()
        if a.get('fraction_policy') not in (None,'zero'):fail()
        kind=a.get('kind','split')
        if kind=='bonus':
            if not all(valid_day(a.get(k)) for k in ('known_on','ex_date','listing_date','evidence_on')):fail()
            if not a['known_on']<=a['ex_date']<a['listing_date'] or not a['known_on']<=a['evidence_on']<=context['as_of']:fail()
        elif kind in ('split','spinoff'):
            if not all(valid_day(a.get(k)) for k in ('known_on','halt_start','resume_date','evidence_on')):fail()
            if not a['known_on']<=a['halt_start']<a['resume_date'] or not a['known_on']<=a['evidence_on']<=context['as_of']:fail()
            if kind=='spinoff':
                new=a.get('new_code');name=a.get('new_name')
                if not isinstance(new,str) or not re.fullmatch(r'[0-9A-Z]{6}',new) or new==code or not isinstance(name,str) or not name.strip() or not ratio(a.get('new_numerator'),a.get('new_denominator')):fail()
        else:fail()
        if not ratio(a.get('numerator'),a.get('denominator')):fail()
        if not isinstance(source,str):fail()
        try:
            url=urlsplit(source)
            _=url.port
            if url.scheme!='https' or not url.hostname or url.username or url.password:fail()
        except ValueError:fail()
        result[code]=dict(a,kind=kind);ids.add(identity)
    return result


def published_reconciliation(as_of):
    """Only explicitly audited actions; never inferred from a price jump.

    Each action is attached only once its listed evidence date has passed. The evidence for
    Vaxcell, Dongwha and Samyang establishes actual listings, not fractional payment dates,
    so the context fixes fraction_policy='zero' instead of crediting any fractional cash.
    """
    action_map(dict(as_of=as_of,actions=[]))
    from .corporate_position import ACTIONS
    by_code={a['code']:a for a in ACTIONS}
    dn,dongwha,vaxcell,samyang=(by_code[c] for c in ('007340','025900','323990','000070'))
    candidates=[
        dict(code='323990',id='323990:2023-bonus',kind='bonus',known_on='2023-10-30',ex_date=vaxcell['issue_date'],listing_date=vaxcell['listing_date'],
             numerator=1,denominator=5,fraction_policy='zero',evidence_on=vaxcell['listing_evidence_date'],source=vaxcell['listing_source']),
        dict(code='025900',id='025900:2024-split',known_on='2024-03-11',halt_start=dongwha['issue_date'],resume_date=dongwha['resume_date'],
             numerator=5,denominator=2,fraction_policy='zero',evidence_on=dongwha['resume_evidence_date'],source=dongwha['resume_source']),
        dict(code='007340',id='007340:2024-split',known_on='2024-07-19',halt_start=dn['issue_date'],resume_date=dn['resume_date'],
             numerator=5,denominator=1,evidence_on=dn['resume_evidence_date'],source=dn['resume_source']),
        dict(code='000070',id='000070:2025-spinoff',kind='spinoff',known_on='2025-05-30',halt_start=samyang['issue_date'],resume_date=samyang['resume_date'],
             numerator=9039233,denominator=10000000,new_code=samyang['new_code'],new_name=samyang['new_name'],new_numerator=960767,new_denominator=1000000,
             fraction_policy='zero',evidence_on=samyang['resume_evidence_date'],source=samyang['resume_source']),
    ]
    actions=[a for a in candidates if a['evidence_on']<=as_of]
    if not actions:return None
    context=dict(as_of=as_of,policy=POLICY,actions=actions)
    action_map(context)
    return context


def corporate_assets(context, sessions, lookup):
    """Raw OHLCV of spinoff-created securities, aligned to sessions. Missing rows stay None."""
    assets={}
    for a in (context or {}).get('actions',[]):
        if a.get('kind')!='spinoff':continue
        rows=lookup(a['new_code']) or {}
        assets[a['new_code']]=[({k:rows[d].get(k) for k in ('open','high','low','close','volume','change_pct')} if d in rows else None) for d in sessions]
    return assets
