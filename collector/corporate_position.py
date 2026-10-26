"""Diagnostic entitlement plan only. Never credits cash or executes simulated orders."""
from fractions import Fraction
import json
from pathlib import Path

ACTIONS = json.loads(Path(__file__).with_name('corporate_actions.json').read_text(encoding='utf-8'))


def entitlement_plan(action, shares):
    if not isinstance(shares, int) or isinstance(shares, bool) or shares < 0:
        raise ValueError('Whole nonnegative shares required')
    def leg(name, ratio, available):
        exact = shares * Fraction(str(ratio))
        whole = exact.numerator // exact.denominator
        fraction = exact - whole
        return dict(name=name, whole_shares=whole, fractional_shares=str(fraction),
                    available_from=available, fractional_cash=None,
                    cash_available_from=None)
    kind = action['kind']
    if kind == 'split':
        legs = [leg('분할 후 주식', action['ratio'], action['resume_date'])]
    elif kind == 'bonus':
        legs = [leg('기존 주식', '1', None), leg('무상배정 신주', action['ratio'], action['listing_date'])]
    elif kind == 'spinoff':
        legs = [leg('존속 주식', action['retained_ratio'], action['resume_date']),
                leg(action['new_name'], action['new_ratio'], action['resume_date'])]
    else:
        raise ValueError('Unsupported corporate action')
    return dict(code=action['code'], kind=kind, original_shares=shares, legs=legs,
                account_settled=False, cash_credited=0,
                note='권리 수량 검증용 계획. 가격·원가·현금 정산 및 계좌 엔진 연동 미완료.')
