import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

repo = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parents[1]
runtime = Path(os.environ['LOCALAPPDATA']) / 'Temp/halastudy-release-fixes-2026-10-23/candidate'
git = ['git', '-c', f'safe.directory={repo.as_posix()}']
def command(*args):
    return subprocess.check_output([*git, *args], cwd=repo).decode('utf-8').strip()
names = set(command('ls-files', '-z').split('\0') + command('ls-files', '--others', '--exclude-standard', '-z').split('\0'))
files = []
for name in sorted(names):
    if not re.search(r'^(public/|services/|db/|design-system/|scripts/|tests/|images/|audio/|videos/|\.github/)|^[^/]+\.(html|js|ts|json|md|yml|webmanifest)$|^\.gitignore$', name) or name.startswith('docs/'):
        continue
    source = repo / name
    if not source.is_file():
        continue
    data = source.read_bytes()
    target = runtime / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    files.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {'source': str(repo), 'runtime': str(runtime), 'head': command('rev-parse', 'HEAD'), 'files': files, 'envCopied': (runtime / '.env').exists()}
assert not manifest['envCopied']
(out / 'evidence/candidate-source.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f'Synchronized {len(files)} source files; envCopied=False')
