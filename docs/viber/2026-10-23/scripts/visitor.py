"""Counted anonymous GET/HEAD checks. Never follows redirects or authenticates."""
from pathlib import Path
import hashlib
import json
import subprocess

out = Path(__file__).resolve().parents[1] / 'evidence'
dest = out / 'visitor.json'
if dest.exists():
    raise SystemExit('Refusing to repeat the counted production batch')
paths = [('HEAD', '/'), ('GET', '/robots.txt'), ('GET', '/sitemap.xml'),
         ('HEAD', '/.env'), ('HEAD', '/.git/HEAD'), ('HEAD', '/.git/config'),
         ('HEAD', '/admin'), ('HEAD', '/api/debug'), ('HEAD', '/api/test'),
         ('HEAD', '/api/seed'), ('HEAD', '/app'), ('HEAD', '/account'),
         ('HEAD', '/api/platform/progress'), ('HEAD', '/api/platform/study/tasks'),
         ('GET', '/viber-no-such-page-2026-10-23'), ('GET', '/js/study-workspace.js'),
         ('GET', '/api/health'), ('GET', '/api/ready')]
ledger = {'productionRequestCount': 0, 'productionCap': 30, 'requests': []}
for base in ('http://127.0.0.1:3520', 'https://halastudy.com'):
    for method, path in paths:
        production = base.startswith('https://')
        if production:
            ledger['productionRequestCount'] += 1
        url = base + path
        args = ['curl.exe', '--silent', '--show-error', '--max-time', '12', '--max-redirs', '0',
                '--max-filesize', '2097152', '--include', url]
        if method == 'HEAD':
            args.insert(1, '--head')
        result = subprocess.run(args, capture_output=True)
        raw = result.stdout.replace(b'\r\n', b'\n')
        header, _, body = raw.partition(b'\n\n')
        lines = header.decode('latin-1').splitlines()
        selected = {}
        for line in lines[1:]:
            key, sep, value = line.partition(':')
            if sep and key.lower() in ('content-type', 'x-robots-tag', 'strict-transport-security',
                'x-content-type-options', 'x-frame-options', 'content-security-policy',
                'referrer-policy', 'cache-control', 'vary', 'location'):
                selected[key.lower()] = value.strip()
        item = {'number': ledger['productionRequestCount'] if production else None,
                'target': 'production' if production else 'local', 'method': method, 'url': url,
                'response': lines[0] if lines else None, 'exitCode': result.returncode,
                'headers': selected, 'bodyBytes': len(body), 'bodySha256': hashlib.sha256(body).hexdigest()}
        if path == '/api/health' or path == '/api/ready':
            try:
                status = json.loads(body)
                item['health'] = {k: status[k] for k in ('ok', 'status', 'checks') if k in status}
            except ValueError:
                item['health'] = 'not-json'
        if 'text/html' in selected.get('content-type', ''):
            item['htmlNoindex'] = b'noindex' in body.lower()
        if path == '/sitemap.xml':
            item['privateRoutesInSitemap'] = any((f'halastudy.com{p}<').encode() in body for p in ('/account', '/app', '/supervisor'))
        ledger['requests'].append(item)
        dest.write_text(json.dumps(ledger, indent=2), encoding='utf-8')
print(json.dumps({'productionRequests': ledger['productionRequestCount'],
                  'responses': [{'target': i['target'], 'url': i['url'], 'response': i['response']} for i in ledger['requests']]}))
