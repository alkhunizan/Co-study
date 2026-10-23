"""Metadata-only history scan. Never prints a matching source line or secret value."""
from pathlib import Path
import json
import subprocess

repo = Path(__file__).resolve().parents[4]
out = Path(__file__).resolve().parents[1] / 'evidence'
git = ['git', '-c', f'safe.directory={repo.as_posix()}']
def run(*args):
    p = subprocess.run([*git, *args], cwd=repo, capture_output=True, text=True, encoding='utf-8')
    return {'exitCode': p.returncode, 'metadata': p.stdout.splitlines()}
result = {
    'shapeHistory': run('log', '--all', '-Gsk-[A-Za-z0-9]|AKIA[0-9A-Z]{8}|ghp_[A-Za-z0-9]|service_role', '--format=%h %ad', '--date=short', '--name-only'),
    'deletedEnvPaths': run('log', '--all', '--diff-filter=D', '--name-only', '--format=%h', '--', '*.env*'),
    'trackedSensitivePaths': run('ls-files', '--', '.env', '.env.local', '*.pem', '*.key', 'data/*.json', 'node_modules'),
    'repoVisibility': 'UNVERIFIED: gh CLI unavailable; public/private status not inferred from remote URL'
}
(out / 'history-scan.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps({k: {'exitCode': v['exitCode'], 'metadataLines': len(v['metadata'])} for k,v in result.items() if isinstance(v,dict)}))
