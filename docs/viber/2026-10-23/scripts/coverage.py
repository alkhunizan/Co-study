from pathlib import Path
import json
import os
import re

out = Path(__file__).resolve().parents[1]
text = (out / 'audit/surface-trace.md').read_text('utf-8-sig')
routes = re.findall(r'\| (H\d+) \| `(GET|POST|PATCH|PUT|DELETE) ([^`]+)` \| `([^`]+)` \|', text)
sockets = re.findall(r'\| (S\d+) \| ([a-z-]+) \| ([^|]+) \|', text)
files = re.findall(r'\| (F\d+) \| `([^`]+)` \| ([FRSI]) \|', text)
assert len(routes) == 150 and len(sockets) == 14 and len(files) == 80
logs = list((out / 'evidence').glob('*local-http.ndjson'))
live = Path(os.environ['LOCALAPPDATA']) / 'Temp/halastudy-viber-2026-10-23/artifacts/final-ci'
logs += list(live.glob('local-http.ndjson'))
requests = []
for log in logs:
    for line in log.read_text('utf-8-sig').splitlines():
        if line.strip():
            requests.append(json.loads(line))
events = set()
for log in [*(out / 'evidence').glob('*local-socket.ndjson'), *live.glob('local-socket.ndjson')]:
    for line in log.read_text('utf-8-sig').splitlines():
        if line.strip():
            events.add(json.loads(line)['event'])
rows = []
def path_regex(route):
    pattern = re.escape(route).replace(re.escape('<ADMIN>'), r'/[^/]+')
    pattern = re.sub(r':[A-Za-z_][A-Za-z_0-9]*', r'[^/]+', pattern)
    return '^' + pattern.rstrip('/') + '/?$'
prepared = []
for id,method,route,source in routes:
    variants = {route}
    # Express's mutable req.url was observed at response finish. Reconstruct only
    # actual mount projections, and count a request only when its mapping is unique.
    for mount in ('/api', '/api/platform', '/api/platform/study', '<ADMIN>'):
        if route.startswith(mount + '/'):
            variants.add(route[len(mount):])
    prepared.append((id,method,route,source,[path_regex(v) for v in variants]))
observed = {id: [] for id,_,_,_,_ in prepared}
ambiguous = 0
for request in requests:
    candidates = [id for id,method,_,_,regexes in prepared
                  if request['method'] == method and any(re.match(regex,request['path']) for regex in regexes)]
    if len(candidates) == 1:
        observed[candidates[0]].append(request['status'])
    elif len(candidates) > 1:
        ambiguous += 1
for id, method, route, source in routes:
    if not ('/api/' in route or route.startswith('/auth/')):
        continue
    responses = observed[id]
    rows.append({'id': id, 'method': method, 'route': route, 'source': source,
                 'executed': bool(responses), 'statuses': sorted(set(responses))})
assert len(rows) == 119
socket_rows = [{'id': id, 'event': event, 'source': source.strip(), 'executed': event in events} for id,event,source in sockets]
covered = sum(row['executed'] for row in rows + socket_rows)
full_ids = {id for id,_,depth in files if depth == 'F'}
full_ids.update(['F007','F039','F046'])
full_paths = {'server.js','services/platform/common.js','services/platform/study-community.js',
 'services/platform/study-routes.js','services/platform/database.js','services/platform/maintenance.js',
 'services/platform/billing.js','services/platform/digetpay-client.js','services/socket-boundary.js',
 'services/video/revocations.js','services/video/realtimekit-provider.js','services/ops/alerts.js',
 'services/supabase/client.js','services/logging/logger.js','services/auth/recovery.js'}
full_ids.update(id for id,file,_ in files if file in full_paths)
result = {'denominator': 133, 'executedBoundaryPatterns': covered, 'percentExecuted': round(covered / 133 * 100, 2),
 'notExecuted': [r for r in rows + socket_rows if not r['executed']], 'http': rows, 'sockets': socket_rows,
 'fullyReadRuntimeFiles': [{'id':id,'path':file} for id,file,_ in files if id in full_ids],
 'notFullyReadRuntimeFiles': [{'id':id,'path':file,'depth':depth} for id,file,depth in files if id not in full_ids],
 'ambiguousObservationsExcluded': ambiguous,
 'limits': 'A pattern observed is executed, not full branch coverage. Mutable Express mount paths are mapped only when unique. Denials and positive statuses are distinguished. No source-only trace was added to the numerator.'}
(out / 'evidence/coverage.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({k:result[k] for k in ('denominator','executedBoundaryPatterns','percentExecuted')}))
print('not executed:', [(r['id'],r.get('route',r.get('event'))) for r in result['notExecuted']])
print('fully read:',len(result['fullyReadRuntimeFiles']),'of80')
