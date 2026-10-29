"""Run shared synthetic corporate lifecycle scenarios in Python; TypeScript compares every field."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector.corporate_lifecycle import corporate_step, initial_corporate_position


def quote(v):
    return None if v is None else dict(open=v[0],high=v[1],low=v[2],close=v[3],volume=v[4],change_pct=None)


def run(scenario):
    t=scenario['trade'];p=initial_corporate_position(t,t['previous_close']);out=[]
    for step in scenario['steps']:
        r=corporate_step(p,scenario['action'],step['day'],quote(step.get('quote')),quote(step.get('asset')),scenario.get('take',30),scenario.get('stop',10))
        p=r['position'];out.append(r)
        if p['phase']=='closed':break
    return out


if __name__=='__main__':
    fixture=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/corporate-lifecycle.json').read_text(encoding='utf-8'))
    print(json.dumps([run(s) for s in fixture['scenarios']],ensure_ascii=False))
