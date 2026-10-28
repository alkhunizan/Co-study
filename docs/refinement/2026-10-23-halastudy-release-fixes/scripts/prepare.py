"""Create a reproducible runtime from Git's shipped source, never from workspace env."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile
from urllib.parse import urlsplit

repo = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parents[1]
runtime = Path(os.environ['LOCALAPPDATA']) / 'Temp/halastudy-release-fixes-2026-10-23/candidate'
runtime.mkdir(parents=True, exist_ok=True)
git = ['git', '-c', f'safe.directory={repo.as_posix()}']
def command(*args):
    return subprocess.check_output([*git, *args], cwd=repo).decode('utf-8').strip()
head = command('rev-parse', 'HEAD')
archive = runtime.parent / 'source-head.zip'
subprocess.run([*git, 'archive', '--format=zip', f'--output={archive}', head], cwd=repo, check=True)
files = []
with zipfile.ZipFile(archive) as packed:
    for name in packed.namelist():
        if name.endswith('/') or name.startswith('docs/'):
            continue
        if not re.search(r'^(public/|services/|db/|design-system/|scripts/|tests/|images/|audio/|videos/|\.github/)|^[^/]+\.(html|js|ts|json|md|yml|webmanifest)$|^\.gitignore$', name):
            continue
        target = runtime / name
        target.parent.mkdir(parents=True, exist_ok=True)
        data = packed.read(name)
        target.write_bytes(data)
        files.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {'source': str(repo), 'runtime': str(runtime), 'head': head,
            'isolation': 'git archive HEAD, allowlisted application/runtime files only',
            'files': sorted(files, key=lambda item: item['path']),
            'envCopied': (runtime / '.env').exists()}
assert not manifest['envCopied']
for label in ('baseline-source', 'candidate-source'):
    dest = out / f'evidence/{label}.json'
    if dest.exists():
        raise RuntimeError(f'Refusing to overwrite {label}')
    dest.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
env_names = set()
for name in files:
    if name['path'].endswith(('.js', '.cjs')):
        env_names.update(re.findall(r'process\.env\.([A-Z][A-Z0-9_]*)', (runtime / name['path']).read_text(encoding='utf-8')))
(out / 'evidence/env-names.json').write_text(json.dumps(sorted(env_names), indent=2), encoding='utf-8')
env_summary = []
env_file = repo / '.env'
if env_file.exists():
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        match = re.match(r'\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)', line)
        if not match:
            continue
        key, value = match.groups()
        item = {'name': key, 'set': bool(value.strip())}
        if re.search(r'(URL|HOST|ORIGIN)$', key):
            try:
                host = urlsplit(value.strip('\"\x27')).hostname
                item['host'] = host
                item['local'] = host in (None, 'localhost', '127.0.0.1', '::1')
            except ValueError:
                item['host'] = 'unparseable'
        env_summary.append(item)
(out / 'evidence/workspace-env-targets.json').write_text(json.dumps({'notLoaded': True, 'variables': env_summary}, indent=2), encoding='utf-8')
print(json.dumps({'head': head, 'files': len(files), 'runtime': str(runtime), 'envCopied': False}))
