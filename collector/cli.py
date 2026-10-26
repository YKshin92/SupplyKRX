import argparse
import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from .core import read_csv, upsert, publish, save_json, load_rows, validate_calendar, fill_legacy_absent_flows, key
from .demo import generate
from .investors import collection_start

def main():
    p=argparse.ArgumentParser(description='연기금 수급 수집·검증·게시')
    p.add_argument('command',choices=['demo','collect','import','publish'])
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    p.add_argument('--end',default=(datetime.now(timezone(timedelta(hours=9))).date()-timedelta(days=1)).isoformat())
    p.add_argument('--start')
    p.add_argument('--days',type=int,default=20)
    p.add_argument('--codes',help='쉼표로 구분한 대표 종목. 생략 시 전 종목')
    p.add_argument('--csv',type=Path)
    p.add_argument('--calendar',type=Path,help='sessions, checked_through, source를 가진 JSON')
    p.add_argument('--publish',action='store_true')
    args=p.parse_args()
    if not 1<=args.days<=20: p.error('--days는 1~20')
    date.fromisoformat(args.end)
    if args.start:
        date.fromisoformat(args.start)
        if args.start>args.end or (date.fromisoformat(args.end)-date.fromisoformat(args.start)).days>65:
            p.error('재수집 기간은 순서가 올바른 최대 65일 범위여야 합니다.')
    if args.command=='demo': print(generate(args.root)); return
    root=args.root/'data/live'
    if args.command=='collect':
        from .pykrx_provider import collect, INVESTORS
        existing=load_rows(root)
        start=collection_start(existing,args.start)
        rows,calendar=collect(args.end,args.days,start,args.codes.split(',') if args.codes else None)
        from .metadata_snapshots import write_snapshots
        snapshots=calendar.pop('metadata_snapshots',{})
        universes=calendar.pop('universe_snapshots',None)
        write_snapshots(root,snapshots,max(r['collected_at'] for r in rows),universes)
    elif args.command=='import':
        if not args.csv or not args.calendar: p.error('import는 --csv 및 --calendar가 필요합니다.')
        rows=read_csv(args.csv)
        if any(r['finality']=='demo' for r in rows): p.error('데모는 운영 저장소에 가져올 수 없습니다.')
        calendar=json.loads(args.calendar.read_text(encoding='utf-8-sig'))
    else:
        rows=[]
        calendar=json.loads((root/'calendar.json').read_text(encoding='utf-8'))
    if rows:
        validate_calendar(calendar)
        if any(r['date'] not in calendar['sessions'] for r in rows): p.error('거래일 달력에 없는 데이터')
        calendar_path=root/'calendar.json'
        if calendar_path.exists():
            old=json.loads(calendar_path.read_text(encoding='utf-8'))
            calendar['sessions']=sorted(set(old['sessions']+calendar['sessions']))
            calendar['checked_through']=max(old['checked_through'],calendar['checked_through'])
        if args.command=='collect':
            from .price_quality import reconcile_price_issues
            issues=calendar.get('price_quality_issues',[])
            rows=reconcile_price_issues(rows,existing,issues)
            if issues:
                print(f'Price quality: {len(issues)} ticker/session responses retried or quarantined; details retained in private calendar.')
            combined={key(r):r for r in fill_legacy_absent_flows(existing)}
            combined.update({key(r):r for r in rows})
            rows=list(combined.values())
        upsert(root,rows)
        if args.command=='collect' and issues:
            report_time=datetime.now(timezone.utc)
            report_name=report_time.strftime('%Y%m%dT%H%M%S%fZ')
            save_json(root/'quality'/f'prices-{report_name}.json',dict(observed_at=report_time.isoformat(),issues=issues))
        save_json(calendar_path,calendar)
        print(f'Validated and saved {len(rows)} rows. Not published yet.')
    if args.publish or args.command=='publish':
        if os.getenv('DATA_PUBLISH_ALLOWED')!='true':
            p.error('게시 전 이용 범위를 확인하고 DATA_PUBLISH_ALLOWED=true를 설정하세요. 원자료는 로컬에 유지됩니다.')
        print(publish(root,args.root/'public/data/live','live',calendar))

if __name__=='__main__': main()
