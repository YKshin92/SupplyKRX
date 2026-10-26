"""Position transition for explicit reconciliation; default account path is unchanged."""
from copy import deepcopy
from .simulation import price_problem


def split_day(position, action, day, quote):
    """A verified halt is reversible; an unknown quote failure is not."""
    p=deepcopy(position)
    if p.get('last_day')==day:
        return p
    if p.get('last_day') and day<p['last_day']:
        raise ValueError('Out of order position day')
    if day<p['entry_date'] or p['phase']=='unresolved':
        return p
    if type(p['shares']) is not int or not 0<p['shares']<=9007199254740991:
        raise ValueError('Invalid position shares')
    p['last_day']=day
    def unresolved(reason):
        p.update(phase='unresolved',diagnosis=reason,cash_delta=0)
        return p
    eligible=p['entry_date']<action['halt_start'] and action['known_on']<=day
    if eligible and action['halt_start']<=day<action['resume_date']:
        p.update(phase='halted',pending_action=action['id'],cash_delta=0,diagnosis='확인된 거래정지')
        return p
    if p['phase']=='halted':
        if not eligible or p.get('pending_action')!=action['id'] or day!=action['resume_date']:
            return unresolved('재개일 또는 기업행사 일치 확인 필요')
        n,d=action['numerator'],action['denominator']
        if type(n) is not int or type(d) is not int or not 0<n<=9007199254740991 or not 0<d<=9007199254740991:
            raise ValueError('Invalid split ratio')
        product=p['shares']*n
        if product>9007199254740991:
            raise ValueError('Invalid split ratio')
        if product%d:
            p['fractional_claim']=dict(numerator=product%d,denominator=d)
            return unresolved('단주 권리 현금 정산 필요')
        problem=price_problem(dict(close=p['last_close']*d/n),quote)
        if problem:
            return unresolved('재개일 '+problem)
        p.update(shares=product//d,basis_price=p['invested']/(product//d),
                 phase='active',pending_action=None,diagnosis=None,cash_delta=0,
                 applied_actions=p.get('applied_actions',[])+[action['id']])
    else:
        problem=price_problem(dict(close=p['last_close']),quote)
        if problem:
            return unresolved(problem)
    p['last_close']=quote['close']
    return p
