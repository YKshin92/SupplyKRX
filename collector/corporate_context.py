"""Validate explicit, versioned-by-evidence split reconciliation inputs."""
from datetime import date
import re
from urllib.parse import urlsplit


def action_map(context):
    result={}
    if context is None:return result
    def fail():raise ValueError('Invalid corporate reconciliation context')
    def valid_day(value):
        if not isinstance(value,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',value):return False
        try:return date.fromisoformat(value).isoformat()==value
        except ValueError:return False
    if not isinstance(context,dict) or not valid_day(context.get('as_of')) or not isinstance(context.get('actions'),list):fail()
    ids=set()
    for a in context['actions']:
        if not isinstance(a,dict):fail()
        code=a.get('code');identity=a.get('id');source=a.get('source')
        if not isinstance(code,str) or not re.fullmatch(r'[0-9A-Z]{6}',code) or code in result or not isinstance(identity,str) or not identity.strip() or identity in ids:fail()
        if not all(valid_day(a.get(k)) for k in ('known_on','halt_start','resume_date','evidence_on')):fail()
        if not a['known_on']<=a['halt_start']<a['resume_date'] or not a['known_on']<=a['evidence_on']<=context['as_of']:fail()
        if any(type(a.get(k)) is not int or not 0<a[k]<=9007199254740991 for k in ('numerator','denominator')):fail()
        if not isinstance(source,str):fail()
        try:
            url=urlsplit(source)
            _=url.port
            if url.scheme!='https' or not url.hostname or url.username or url.password:fail()
        except ValueError:fail()
        result[code]=a;ids.add(identity)
    return result


def published_reconciliation(as_of):
    """Only explicitly audited whole-share splits; never infer from a price jump."""
    action_map(dict(as_of=as_of,actions=[]))
    from .corporate_position import ACTIONS
    dn=next(a for a in ACTIONS if a['code']=='007340')
    if as_of<dn['resume_evidence_date']:return None
    context=dict(as_of=as_of,actions=[dict(code='007340',id='007340:2024-split',known_on='2024-07-19',halt_start=dn['issue_date'],resume_date=dn['resume_date'],numerator=5,denominator=1,evidence_on=dn['resume_evidence_date'],source=dn['resume_source'])])
    action_map(context)
    return context
