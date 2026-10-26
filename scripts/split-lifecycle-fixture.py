"""Print complete staged transitions for cross-language parity tests."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from collector.split_lifecycle import split_day
from collector.split_valuation import split_value


def run_cases():
    fixture = json.loads((ROOT/'tests/fixtures/split-lifecycle.json').read_text(encoding='utf-8'))
    results = []
    for case in fixture['cases']:
        position = dict(fixture['position'], **case.get('position', {}))
        action = dict(fixture['action'], **case.get('action', {}))
        states = []
        for step in case['steps']:
            value = step.get('price')
            quote = dict(open=value, high=value, low=value, close=value, volume=100, change_pct=None) if value is not None else step.get('quote')
            position = split_day(position, action, step['day'], quote)
            for key, expected in step['expect'].items():
                assert position.get(key) == expected, (case['name'], step['day'], key)
            states.append(position)
        results.append(states)
    valuations=[]
    for case in fixture['valuations']:
        value=split_value(dict(fixture['position'],**case.get('position',{})),case['quote'])
        for key,expected in case['expect'].items():
            assert value.get(key)==expected,(case['name'],key)
        valuations.append(value)
    return dict(transitions=results,valuations=valuations)


if __name__ == '__main__':
    print(json.dumps(run_cases(), ensure_ascii=True))
