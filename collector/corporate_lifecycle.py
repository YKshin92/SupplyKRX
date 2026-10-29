"""Bonus-issue and spinoff account lifecycle; mirrors src/corporate-lifecycle.ts field for field.

Fractional entitlements follow the context's explicit fraction_policy='zero': they are valued at
0 won and never credited as cash. No payment date is assumed.
"""
from copy import deepcopy
from math import gcd, isfinite
from .simulation import price_problem

MAX = 9007199254740991


def _int(v):
    return type(v) is int and 0 < v <= MAX


def _round4(v):
    return round(v * 1e4) / 1e4


def initial_corporate_position(trade, previous_close):
    return dict(entry_date=trade['entry_date'], entry_price=trade['entry_price'], invested=trade['invested'],
                shares=trade['shares'], basis_price=trade['entry_price'], phase='active',
                last_close=previous_close if previous_close is not None else trade['entry_price'],
                applied_actions=[], locked=0, sold=0, realized=0, new_shares=0, new_last_close=None,
                exit_status=None, exit_reason=None, exit_price=None, decision_day=None,
                fractional_forfeit=[], diagnosis=None)


def _entitle(shares, n, d, asset, forfeit):
    if not _int(n) or not _int(d):
        raise ValueError('Invalid corporate ratio')
    product = shares * n
    if product > MAX:
        raise ValueError('Invalid corporate ratio')
    remainder = product % d
    if remainder:
        g = gcd(remainder, d)
        forfeit.append(dict(asset=asset, fraction=f'{remainder // g}/{d // g}'))
    return (product - remainder) // d


def barrier(quote, basis, take, stop):
    upper, lower = basis * (1 + take / 100), basis * (1 - stop / 100)
    price, status, reason, ambiguous = quote['close'], 'open', '최신 종가 평가', False
    if quote['open'] <= lower:
        price, status, reason = quote['open'], 'stop', '손절선 아래 갭 시가 청산'
    elif quote['open'] >= upper:
        price, status, reason = quote['open'], 'take', '익절선 위 갭 시가 청산'
    elif quote['high'] >= upper and quote['low'] <= lower:
        ambiguous = True
        price, status, reason = lower, 'stop', '같은 날 양쪽 도달 · 손절 우선'
    elif quote['low'] <= lower:
        price, status, reason = lower, 'stop', '장중 손절선 도달'
    elif quote['high'] >= upper:
        price, status, reason = upper, 'take', '장중 익절선 도달'
    return dict(price=price, status=status, reason=reason, ambiguous=ambiguous)


def corporate_step(position, action, day, quote, asset_quote, take=30, stop=10):
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and isfinite(v) for v in (take, stop)) or not 1 <= take <= 100 or not 1 <= stop <= 50:
        raise ValueError('Invalid barriers')
    if position.get('last_day') and day <= position['last_day']:
        raise ValueError('Out of order position day')
    if day < position['entry_date']:
        raise ValueError('Position day before entry')
    if type(position['shares']) is not int or not 0 <= position['shares'] <= MAX:
        raise ValueError('Invalid position shares')
    if action.get('fraction_policy') not in (None, 'zero'):
        raise ValueError('Invalid fraction policy')
    p = deepcopy(position)
    p['last_day'] = day
    spin = action['kind'] == 'spinoff'

    def legs():
        if spin and action['id'] in p['applied_actions']:
            return [dict(name='존속 주식', code='', shares=p['shares'], price=(quote or {}).get('close')),
                    dict(name=action['new_name'], code=action['new_code'], shares=p['new_shares'], price=(asset_quote or {}).get('close'))]
        return []

    def out(status, reason, **o):
        result = dict(position=p, status=status, reason=reason, pnl=None, return_pct=None, exit_price=None,
                      held_value=None, cash_in=0, reference_value=None, ambiguous=False,
                      shares=p['shares'] + p['locked'] + p['sold'], legs=legs())
        result.update(o)
        return result

    def valued(value, status, reason, **o):
        return out(status, reason, pnl=_round4(p['realized'] + value - p['invested']),
                   return_pct=(p['realized'] + value) / p['invested'] * 100 - 100, **o)

    def unresolved(reason):
        p.update(phase='unresolved', diagnosis=reason)
        return out('unresolved', reason)

    def closed_out(status, reason, exit_price, cash_in, **o):
        return out(status, reason, pnl=_round4(p['realized'] - p['invested']),
                   return_pct=p['realized'] / p['invested'] * 100 - 100, exit_price=exit_price, cash_in=cash_in, **o)

    def ratio_check(n, d):
        if not _int(n) or not _int(d):
            raise ValueError('Invalid corporate ratio')

    if position['phase'] == 'unresolved':
        return out('unresolved', position.get('diagnosis') or '기업행사 정산 확인 필요')
    if position['phase'] == 'closed':
        raise ValueError('Closed corporate position')

    if action['kind'] == 'bonus':
        ratio_check(action['numerator'], action['denominator'])
        eligible = p['entry_date'] < action['ex_date'] and action['known_on'] <= day
        if p['phase'] == 'locked_exit':
            problem = price_problem(dict(close=p['last_close']), quote)
            if problem:
                return unresolved(problem)
            p['last_close'] = quote['close']
            if day >= action['listing_date']:
                proceeds = p['locked'] * quote['open']
                p['realized'] += proceeds
                p['sold'] += p['locked']
                locked = p['locked']
                p['locked'] = 0
                p['phase'] = 'closed'
                return closed_out(p['exit_status'], f"{p['exit_reason']} · 무상신주 {locked}주 {day} 상장일 시가 매도",
                                  p['exit_price'], proceeds, shares=p['sold'])
            value = p['locked'] * quote['close']
            return valued(value, 'open', f"{p['exit_reason']} · 무상신주 {p['locked']}주 {action['listing_date']} 상장일 시가 매도 대기",
                          exit_price=quote['close'], held_value=value)
        if eligible and day >= action['ex_date'] and action['id'] not in p['applied_actions']:
            if day != action['ex_date']:
                return unresolved('권리락일 시세 확인 필요')
            if p['shares'] <= 0:
                raise ValueError('Invalid position shares')
            locked = _entitle(p['shares'], action['numerator'], action['denominator'], '무상배정 신주', p['fractional_forfeit'])
            reference = p['last_close'] * action['denominator'] / (action['denominator'] + action['numerator'])
            problem = price_problem(dict(close=reference), quote)
            if problem:
                return unresolved('권리락일 ' + problem)
            p['locked'] = locked
            p['basis_price'] = p['invested'] / (p['shares'] + locked)
            p['applied_actions'].append(action['id'])
        else:
            problem = price_problem(dict(close=p['last_close']), quote)
            if problem:
                return unresolved(problem)
        if p['locked'] > 0 and day >= action['listing_date']:
            p['shares'] += p['locked']
            p['locked'] = 0
        total = p['shares'] + p['locked']
        b = barrier(quote, p['basis_price'], take, stop)
        p['last_close'] = quote['close']
        if b['status'] == 'open':
            value = total * quote['close']
            return valued(value, 'open', b['reason'], exit_price=quote['close'], held_value=value)
        proceeds = p['shares'] * b['price']
        p['realized'] += proceeds
        p['sold'] += p['shares']
        p['shares'] = 0
        if p['locked'] == 0:
            p['phase'] = 'closed'
            return closed_out(b['status'], b['reason'], b['price'], proceeds, ambiguous=b['ambiguous'], shares=p['sold'])
        p.update(phase='locked_exit', exit_status=b['status'], exit_reason=b['reason'], exit_price=b['price'], decision_day=day)
        value = p['locked'] * quote['close']
        return valued(value, 'open', f"{b['reason']} · 무상신주 {p['locked']}주 {action['listing_date']} 상장일 시가 매도 대기",
                      exit_price=quote['close'], held_value=value, cash_in=proceeds, ambiguous=b['ambiguous'])

    # Spinoff: one original position becomes retained + new shares, judged jointly at the close.
    ratio_check(action['numerator'], action['denominator'])
    ratio_check(action['new_numerator'], action['new_denominator'])
    eligible = p['entry_date'] < action['halt_start'] and action['known_on'] <= day
    if p['phase'] == 'active' and action['id'] not in p['applied_actions']:
        if eligible and action['halt_start'] <= day < action['resume_date']:
            p.update(phase='halted', diagnosis='확인된 거래정지')
            return out('open', '확인된 거래정지 · 회사분할 재상장 대기', reference_value=p['shares'] * p['last_close'])
        problem = price_problem(dict(close=p['last_close']), quote)
        if problem:
            return unresolved(problem)
        b = barrier(quote, p['basis_price'], take, stop)
        p['last_close'] = quote['close']
        if b['status'] == 'open':
            value = p['shares'] * quote['close']
            return valued(value, 'open', b['reason'], exit_price=quote['close'], held_value=value)
        proceeds = p['shares'] * b['price']
        p['realized'] += proceeds
        p['sold'] = p['shares']
        p['shares'] = 0
        p['phase'] = 'closed'
        return closed_out(b['status'], b['reason'], b['price'], proceeds, ambiguous=b['ambiguous'], shares=p['sold'])
    if p['phase'] == 'halted':
        if eligible and day < action['resume_date']:
            return out('open', '확인된 거래정지 · 회사분할 재상장 대기', reference_value=p['shares'] * p['last_close'])
        if not eligible or day != action['resume_date']:
            return unresolved('재개일 또는 기업행사 일치 확인 필요')
        retained = _entitle(p['shares'], action['numerator'], action['denominator'], '존속 주식', p['fractional_forfeit'])
        fresh = _entitle(p['shares'], action['new_numerator'], action['new_denominator'], action['new_name'], p['fractional_forfeit'])
        problem = price_problem(None, quote)
        if problem:
            return unresolved('재개일 ' + problem)
        asset_problem = price_problem(None, asset_quote)
        if asset_problem:
            return unresolved('재개일 신설 종목 ' + asset_problem)
        p.update(shares=retained, new_shares=fresh, basis_price=p['invested'] / (retained + fresh), phase='joint', diagnosis=None)
        p['applied_actions'].append(action['id'])
    elif p['phase'] == 'joint':
        problem = price_problem(dict(close=p['last_close']), quote)
        if problem:
            return unresolved(problem)
        asset_problem = price_problem(dict(close=p['new_last_close']), asset_quote)
        if asset_problem:
            return unresolved('신설 종목 ' + asset_problem)
        if p['exit_status']:
            proceeds = p['shares'] * quote['open'] + p['new_shares'] * asset_quote['open']
            p['realized'] += proceeds
            p['last_close'] = quote['close']
            p['new_last_close'] = asset_quote['close']
            result = closed_out(p['exit_status'], f"{p['exit_reason']} · {day} 시가 두 종목 매도", quote['open'], proceeds,
                                legs=[dict(name='존속 주식', code='', shares=p['shares'], price=quote['open']),
                                      dict(name=action['new_name'], code=action['new_code'], shares=p['new_shares'], price=asset_quote['open'])])
            p['phase'] = 'closed'
            return result
    else:
        raise ValueError('Invalid corporate phase')
    p['last_close'] = quote['close']
    p['new_last_close'] = asset_quote['close']
    value = p['shares'] * quote['close'] + p['new_shares'] * asset_quote['close']
    reason = '두 종목 합산 종가 평가'
    if value >= p['invested'] * (1 + take / 100):
        p.update(exit_status='take', exit_reason=f'{day} 합산 종가 익절선 도달')
    elif value <= p['invested'] * (1 - stop / 100):
        p.update(exit_status='stop', exit_reason=f'{day} 합산 종가 손절선 도달')
    if p['exit_status']:
        p['decision_day'] = day
        reason = f"{p['exit_reason']} · 다음 거래일 시가 매도 예정"
    return valued(value, 'open', reason, exit_price=quote['close'], held_value=value)
