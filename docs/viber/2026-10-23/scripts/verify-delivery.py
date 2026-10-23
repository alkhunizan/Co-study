from pathlib import Path
import hashlib
import json
import re
import zipfile
from PIL import Image

root=Path(__file__).resolve().parents[1]
if str(root).startswith('\\\\') and not str(root).startswith('\\\\?\\'):
    root=Path('\\\\?\\UNC\\'+str(root)[2:])
html=(root/'review.html').read_text(encoding='utf-8')
links=re.findall(r'(?:src|href)="([^"]+)"',html)
missing=[link for link in links if not (root/link).is_file()]
assert not missing,missing
images=list((root/'screenshots').rglob('*.png'))
assert len(images)==36,len(images)
for image in images:
    with Image.open(image) as loaded: loaded.verify()
archives=list((root/'evidence').rglob('*.zip'))
for archive in archives:
    with zipfile.ZipFile(archive) as packed: assert packed.testzip() is None,str(archive)
manifest=json.loads((root/'evidence/candidate-source.json').read_text(encoding='utf-8-sig'))
preview=json.loads((root/'evidence/preview-source.json').read_text(encoding='utf-8'))
for item in manifest['files']:
    for directory in (manifest['runtime'],preview['runtime']):
        assert hashlib.sha256((Path(directory)/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
assert not (Path(preview['runtime'])/'.env').exists()
site=json.loads((root/'evidence/visitor.json').read_text(encoding='utf-8'))['productionRequestCount']
fonts=len((root/'evidence/font-requests.ndjson').read_text(encoding='utf-8').splitlines())
assert site+fonts<=30
commands=[json.loads(line) for line in (root/'evidence/commands.ndjson').read_text(encoding='utf-8-sig').splitlines() if line]
for label in ['final-ci','final-postgres','final-boundaries-original-url','final-seo','final-populated','final-gallery']:
    assert next(row for row in commands if row['label']==label)['exitCode']==0,label
excluded={'evidence/artifact-manifest.json','evidence/delivery-verification.json'}
files=[]
for path in sorted(root.rglob('*')):
    if path.is_file() and path.relative_to(root).as_posix() not in excluded:
        data=path.read_bytes()
        files.append({'path':path.relative_to(root).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                      'gitBlobSha1':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()})
(root/'evidence/artifact-manifest.json').write_text(json.dumps(files,indent=2),encoding='utf-8')
result={'sourceHead':manifest['head'],'sourceFiles':len(manifest['files']),'sourcePreviewMismatches':0,
        'artifactFilesHashed':len(files),'galleryLinks':len(links),'missingLinks':missing,'screenshots':len(images),
        'zipArchivesVerified':len(archives),'siteRequests':site,'fontRequests':fonts,'totalExternalRequests':site+fonts,
        'commandsPassed':sum(c['exitCode']==0 for c in commands),'commandsNonzero':sum(c['exitCode']!=0 for c in commands),
        'verdict':'NO-GO for production','openFinding':'V9-01','fontDiagnostic':'UNVERIFIED under request cap'}
(root/'evidence/delivery-verification.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
