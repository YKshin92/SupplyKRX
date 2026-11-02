"""전략 개선 후보 (2026-11-03): candidates written by research, owner decisions written only by the strategy-decision workflow,
apply results written only by the nightly apply task. Status is derived from one timeline so no file is edited in place.

Private files (SupplyKRX-data):
  data/strategy/candidates.json  {schema_version, candidates:[{id, created, goal, title, source, label, summary, change, metrics, risks, scope, withdrawn?}]}
  data/strategy/decisions.json   {schema_version, events:[{at, action: approve|unapprove|apply, id? , ids?, run?}]}
  data/strategy/applied.json     {schema_version, items:[{id, at, status: applied|failed, note, app_commit?, release_note?}]}
Statuses: review (검토 완료 · 승인 대기) -> approved (승인됨) -> pending (반영 대기) -> applied (반영됨) | failed (반영 실패, 다시 승인 가능).
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ID = re.compile(r'^c\d{3}(?:-[a-z0-9]+){0,6}$')
ACTIONS = ('approve', 'unapprove', 'apply')
LABELS = {'review': '검토 완료 · 승인 대기', 'approved': '승인됨', 'pending': '반영 대기', 'applied': '반영됨', 'failed': '반영 실패', 'withdrawn': '철회'}


def _read(path, key):
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema_version') != 1 or not isinstance(data.get(key), list):
        raise ValueError(f'{path.name}: unsupported format')
    return data[key]


def load(root):
    base = Path(root) / 'data/strategy'
    candidates = _read(base / 'candidates.json', 'candidates')
    seen = set()
    for c in candidates:
        if not isinstance(c.get('id'), str) or not ID.match(c['id']) or c['id'] in seen:
            raise ValueError(f'invalid or duplicate candidate id: {c.get("id")!r}')
        if not c.get('title') or not c.get('change'):
            raise ValueError(f'{c["id"]}: title and change are required')
        seen.add(c['id'])
    return candidates, _read(base / 'decisions.json', 'events'), _read(base / 'applied.json', 'items')


def derive(candidates, events, items):
    """Return {id: dict(status, approved_at, requested_at, applied_at, note, app_commit, release_note)} from one ordered timeline."""
    state = {c['id']: dict(status='withdrawn' if c.get('withdrawn') else 'review', approved_at=None, requested_at=None,
                           applied_at=None, note=None, app_commit=None, release_note=None) for c in candidates}
    timeline = [(e['at'], 0, 'decision', e) for e in events] + [(i['at'], 1, 'result', i) for i in items]
    for _, _, kind, x in sorted(timeline, key=lambda t: (t[0], t[1])):
        if kind == 'decision':
            ids = x.get('ids') if x['action'] == 'apply' else [x.get('id')]
            for cid in ids or []:
                s = state.get(cid)
                if not s:
                    continue
                if x['action'] == 'approve' and s['status'] in ('review', 'failed'):
                    s.update(status='approved', approved_at=x['at'])
                elif x['action'] == 'unapprove' and s['status'] == 'approved':
                    s.update(status='review', approved_at=None)
                elif x['action'] == 'apply' and s['status'] == 'approved':
                    s.update(status='pending', requested_at=x['at'])
        else:
            s = state.get(x.get('id'))
            if s and s['status'] == 'pending' and x.get('status') in ('applied', 'failed'):
                s.update(status=x['status'], applied_at=x['at'] if x['status'] == 'applied' else None, note=x.get('note'),
                         app_commit=x.get('app_commit'), release_note=x.get('release_note'))
    return state


def statuses(root):
    candidates, events, items = load(root)
    return candidates, derive(candidates, events, items)


def record(root, action, cid=None, run=None, now=None):
    """Validate an owner decision against the current status and append it to decisions.json. Returns the event."""
    if action not in ACTIONS:
        raise ValueError('unknown action')
    candidates, state = statuses(root)
    at = now or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    if action == 'apply':
        ids = [c['id'] for c in candidates if state[c['id']]['status'] == 'approved']
        if not ids:
            raise ValueError('승인된 후보가 없습니다.')
        event = dict(at=at, action='apply', ids=ids)
    else:
        if not cid or not ID.match(cid) or cid not in state:
            raise ValueError('없는 후보입니다.')
        current = state[cid]['status']
        allowed = ('review', 'failed') if action == 'approve' else ('approved',)
        if current not in allowed:
            raise ValueError(f'지금 상태({LABELS[current]})에서는 할 수 없습니다.')
        event = dict(at=at, action=action, id=cid)
    if run:
        event['run'] = str(run)
    path = Path(root) / 'data/strategy/decisions.json'
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(schema_version=1, events=[])
    data['events'].append(event)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return event


def publish(root, target):
    """Write the authenticated web file data/live/strategy-candidates.json (empty list when the private folder does not exist yet)."""
    candidates, state = statuses(root)
    rows = []
    for c in candidates:
        s = state[c['id']]
        rows.append({**{k: c.get(k) for k in ('id', 'created', 'goal', 'title', 'source', 'label', 'summary', 'change', 'metrics', 'risks', 'scope', 'withdrawn')},
                     **s, 'status_label': LABELS[s['status']]})
    order = {'pending': 0, 'approved': 1, 'review': 2, 'failed': 3, 'applied': 4, 'withdrawn': 5}
    rows.sort(key=lambda r: (r['created'] or '', r['id']), reverse=True)  # newest first within each status
    rows.sort(key=lambda r: order[r['status']])
    out = dict(schema_version=1, generated_at=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
               counts={k: sum(r['status'] == k for r in rows) for k in order}, candidates=rows)
    path = Path(target) / 'strategy-candidates.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return out
