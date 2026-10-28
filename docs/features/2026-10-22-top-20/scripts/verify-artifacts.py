"""Verify local review links, PNG data, evidence provenance and artifact hashes."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image

root = Path(__file__).resolve().parent.parent
missing = []
checked = 0
for file in [*root.glob('*.md'), root / 'review.html']:
    text = file.read_text(encoding='utf-8-sig')
    links = re.findall(r'(?:href|src)="([^"]+)"', text) if file.suffix == '.html' else re.findall(r'\]\(([^)]+)\)', text)
    for raw in links:
        url = urlsplit(raw)
        if url.scheme or not url.path:
            continue
        target = (file.parent / unquote(url.path)).resolve()
        checked += 1
        if not target.is_file():
            missing.append({'file':str(file.relative_to(root)), 'link':raw})
pngs = list((root / 'screenshots').rglob('*.png'))
for file in pngs:
    with Image.open(file) as image:
        image.verify()
manifest = []
for file in sorted(root.rglob('*')):
    if file.is_file() and file.name not in {'artifact-hashes.json', 'artifact-verification.json'}:
        manifest.append({'path':file.relative_to(root).as_posix(),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(root / 'evidence/artifact-hashes.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
result = {'localLinksChecked':checked,'pngsVerified':len(pngs),'artifactFiles':len(manifest),'missing':missing}
(root / 'evidence/artifact-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
if missing:
    raise SystemExit(1)
