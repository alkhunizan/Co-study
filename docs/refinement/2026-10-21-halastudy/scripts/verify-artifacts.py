"""Check the copied final Playwright artifacts against their local originals."""
from pathlib import Path
import hashlib
import json

out=Path(__file__).resolve().parents[1]
def long_path(path):
    value=str(path.absolute())
    return Path('\\\\?\\UNC\\'+value[2:] if value.startswith('\\\\') else '\\\\?\\'+value)

source=long_path(Path.home()/'AppData/Local/Temp/halastudy-refinement-2026-10-21/artifacts/verified-ci-2/results')
target=long_path(out/'evidence/verified-ci-2-results')
files=[file for file in source.rglob('*') if file.is_file()]
mismatches=[]
for file in files:
    copy=target/file.relative_to(source)
    if not copy.is_file() or hashlib.sha256(file.read_bytes()).digest()!=hashlib.sha256(copy.read_bytes()).digest():
        mismatches.append(file.relative_to(source).as_posix())
last_run=json.loads((target/'.last-run.json').read_text(encoding='utf-8'))
result={'files':len(files),'mismatches':mismatches,'playwright':last_run}
(out/'evidence/artifact-parity.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
if not files or mismatches or last_run['status']!='passed' or last_run['failedTests']:
    raise SystemExit(1)
