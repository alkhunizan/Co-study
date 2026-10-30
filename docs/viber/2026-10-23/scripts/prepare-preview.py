from pathlib import Path
import hashlib
import json
import shutil

out = Path(__file__).resolve().parents[1]
manifest = json.loads((out / 'evidence/candidate-source.json').read_text(encoding='utf-8-sig'))
runtime = Path(manifest['runtime'])
preview = runtime.parent / 'preview'
preview.mkdir(parents=True, exist_ok=True)
for item in manifest['files']:
    source, target = runtime / item['path'], preview / item['path']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
assert not (preview / '.env').exists()
(out / 'evidence/preview-source.json').write_text(json.dumps({**manifest, 'runtime': str(preview), 'dependencies': 'junction to the final frozen install', 'envCopied': False}, indent=2), encoding='utf-8')
print(f'Prepared exact {len(manifest["files"])} file preview at {preview}')
