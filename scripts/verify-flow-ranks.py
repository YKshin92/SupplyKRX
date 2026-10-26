"""Verify private rank shards independently; output aggregate coverage only."""
import argparse,json,math,sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def verify(target):
    reports={}
    for view in ('latest','1m','2m','3m'):
        base=target/'flow-ranks';manifest=json.loads((base/f'{view}.json').read_text(encoding='utf-8'))
        if manifest['state']!='ready':raise ValueError('Rank manifest unavailable')
        folder=(base/manifest['generation']).resolve()
        if not folder.is_relative_to((base/'generations').resolve()):raise ValueError('Invalid rank generation')
        stocks=[];sizes=[]
        for name in manifest['files']:
            if Path(name).name!=name:raise ValueError('Invalid rank shard')
            p=folder/name;sizes.append(p.stat().st_size)
            if sizes[-1]>1_200_000:raise ValueError('Oversized rank shard')
            stocks.extend(json.loads(p.read_text(encoding='utf-8')))
        if len(stocks)!=manifest['population'] or len({s['code'] for s in stocks})!=len(stocks):raise ValueError('Rank population mismatch')
        for key,coverage in manifest['coverage'].items():
            values=defaultdict(list)
            for s in stocks:
                part=s['components'][key]
                if part['value'] is not None:values[part['value']].append(part)
                elif part['rank'] is not None or part['points'] is not None:raise ValueError('Missing rank was scored')
                if part['population']!=coverage['ranked']:raise ValueError('Rank denominator mismatch')
            n=sum(map(len,values.values()))
            if n!=coverage['ranked'] or n+coverage['missing']!=len(stocks):raise ValueError('Rank coverage mismatch')
            higher=0
            for value,group in sorted(values.items(),reverse=True):
                expected=1+higher+(len(group)-1)/2
                if any(p['rank']!=expected for p in group):raise ValueError('Incorrect midrank')
                points=0 if value<=0 else 12.5*((n-expected)/(n-1) if n>1 else 1)
                if any(not math.isclose(p['points'],points,abs_tol=1e-8) for p in group):raise ValueError('Incorrect rank points')
                higher+=len(group)
        for stock in stocks:
            parts=stock['components'];points=[p['points'] for p in parts.values()]
            if len(parts)!=8:raise ValueError('Expected eight components')
            if stock['score'] is not None and (any(p is None for p in points) or not math.isclose(stock['score'],sum(points),abs_tol=1e-8)):raise ValueError('Incorrect total score')
            for investor in ('연기금 등','외국인','기관합계','사모'):
                a=parts[investor+':absolute']['value'];r=parts[investor+':relative']['value'];cap=stock['market_cap']
                if r is not None and (a is None or not cap or not math.isclose(r,a/cap*100,rel_tol=1e-10,abs_tol=1e-10)):raise ValueError('Incorrect cap-relative flow')
        reports[view]=dict(stocks=len(stocks),parts=len(sizes),maximum_bytes=max(sizes),complete_scores=sum(s['score'] is not None for s in stocks),sessions=manifest['sessions'],classification=manifest['universe']['classification_status'])
    return reports


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--target',type=Path,required=True);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    report=verify(args.target);args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
