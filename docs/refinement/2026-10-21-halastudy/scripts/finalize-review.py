"""Build the local, browsable review from real screenshot files and final evidence."""
from pathlib import Path
import html
import json
import re
import shutil

out = Path(__file__).resolve().parents[1]
def read(path):
    data = path.read_bytes()
    return data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig', errors='replace')
def image_link(relative, caption):
    return f'<figure><a href="{html.escape(relative)}" target="_blank"><img loading="lazy" src="{html.escape(relative)}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>'
def pair(name, before, after):
    return '<section><h2>'+html.escape(name)+'</h2><div class="pair">'+image_link(before,'قبل · Before')+image_link(after,'بعد · After')+'</div></section>'

manifest = json.loads(read(out/'evidence/candidate-source.json'))
parity_path=out/'evidence/final-parity.json'
parity=json.loads(read(parity_path)) if parity_path.exists() else {}
gate_label='verified-ci-2'
commands=[json.loads(line) for line in read(out/'evidence/commands.ndjson').splitlines() if line.strip()]
gate=next((row for row in reversed(commands) if row.get('label')==gate_label),None)
if not gate or gate.get('exitCode') != 0:
    raise SystemExit('The final complete CI gate must pass before generating the review.')
if gate['sourceManifestSha256'] != gate['endManifestSha256']:
    raise SystemExit('The source manifest changed during the final gate.')
if parity.get('mismatches') or not parity:
    raise SystemExit('Final source parity must pass before generating the review.')
if parity.get('envFiles') or parity.get('changedProtected') or parity.get('manifestSha256')!=gate['sourceManifestSha256']:
    raise SystemExit('The final source/environment boundary does not match the passing gate.')
ci_path=out/f'evidence/{gate_label}.log'
ci=read(ci_path)
integration=re.findall(r'# tests (\d+)',ci)
browser=re.findall(r'\b(\d+) passed \(',ci)
workspace_source=list((out/f'evidence/{gate_label}-results').glob('**/workspace-*.png'))
if len(workspace_source) != 64:
    raise SystemExit(f'Expected 64 final workspace views, found {len(workspace_source)}.')
workspace_directory=out/'screenshots/after/workspace'
workspace_directory.mkdir(parents=True,exist_ok=True)
for file in workspace_source:
    shutil.copy2(file,workspace_directory/file.name)
workspace=sorted(workspace_directory.glob('workspace-*.png'))
body='''<header><p class="eyebrow">HALASTUDY · LOCAL REVIEW · 21 OCT 2026</p><h1>مساحة أهدأ. تقدّم أوضح.</h1><p>A calmer start, dependable focus, private company and credible progress.</p><p>Real browser screenshots with synthetic local accounts. No production release or fabricated attendance is claimed.</p><nav><a href="http://127.0.0.1:3495/app">افتح التطبيق · App preview</a><a href="REVIEW.md">Final report</a><a href="ARCHITECTURE.md">Architecture</a><a href="FINDINGS.md">Findings</a><a href="ACCEPTANCE.md">External acceptance</a></nav></header>'''
body+=f'<aside><strong>Local candidate</strong><p>{len(manifest["files"])} files in the source manifest; {len(parity.get("mismatches",[]))} source/runtime mismatches.</p><p>Integration tests: {integration[-1] if integration else "see log"}. Browser passes: {browser[-1] if browser else "see log"}. <a href="evidence/{gate_label}.log">Exact gate log</a> · <a href="evidence/commands.ndjson">Command ledger</a> · <a href="evidence/final-parity.json">Source parity</a>.</p><p>Production acceptance remains open for real devices/media, Google, delivered recovery mail, hosted restore and release.</p></aside>'
for title,label,width,lang,theme in [
    ('بداية واضحة · Study front door','study',390,'ar','light'),
    ('تقدّم مفهوم · Personal progress','progress',1440,'ar','light'),
    ('رفقة هادئة · Room for focus','room',390,'ar','light'),
    ('English · Tablet and night sky','progress',768,'en','dark')]:
    file=f'{label}-{width}-{lang}-{theme}.png'
    before=f'screenshots/before/{file}'
    after=f'screenshots/after/{file}'
    if label=='study':
        after=f'screenshots/after/workspace/workspace-home-{width}-{lang}-{theme}.png'
    if (out/before).exists() and (out/after).exists():body+=pair(title,before,after)
for label,lang in [('study','ar'),('open','en')]:
    before=f'screenshots/before/expanded-zoom-200-{label}-{lang}.png'
    after=f'screenshots/after/extended/zoom-200-{label}-{lang}.png'
    if (out/before).exists() and (out/after).exists():body+=pair(f'200% text · {label} · {lang}',before,after)
body+='<section><h2>الجولات المصوّرة · Full visual review</h2><p>Open a thumbnail for the original screenshot. Arabic/English, light/dark, 320/390/768/1440px and enlarged text. Independent synthetic accounts and room codes vary; the Study comparison uses fresh member states. Other preview views may contain earlier locally created test rooms. Main before views are from the initial baseline; enlarged-text before views document intermediate defects repaired later.</p>'
for surface in ['landing','open','lobby','account','room']:
    files=sorted((out/'screenshots/after/extended').glob(f'{surface}-*.png'))
    body+=f'<details><summary>{surface} · {len(files)} views</summary><div class="gallery">'
    for file in files:body+=image_link(file.relative_to(out).as_posix(),file.stem)
    body+='</div></details>'
zoom=sorted((out/'screenshots/after/extended').glob('zoom-200-*.png'))
body+=f'<details><summary>200% text · {len(zoom)} enlarged views</summary><div class="gallery">'
for file in zoom:body+=image_link(file.relative_to(out).as_posix(),file.stem)
body+='</div></details>'
body+=f'<details><summary>Workspace · {len(workspace)} final responsive/theme/language views</summary><div class="gallery">'
for file in sorted(workspace):body+=image_link(file.relative_to(out).as_posix(),file.stem)
body+='</div></details>'
online=sorted((out/'screenshots/after/online').glob('*.png'))
body+=f'<details><summary>Actual fonts · {len(online)} supplementary views</summary><div class="gallery">'
for file in online:body+=image_link(file.relative_to(out).as_posix(),file.stem)
body+='</div></details></section><footer><a href="JOURNEYS.md">Journey review</a> · <a href="EXECUTION-NOTES.md">Corrections and test conditions</a> · <a href="CHECKPOINT.md">Checkpoint</a></footer>'
css='''*{box-sizing:border-box}body{margin:0;background:#f5f2eb;color:#2d3436;font:16px/1.7 system-ui,sans-serif}header,main,footer{max-width:1280px;margin:auto;padding:36px 24px}h1{font:500 clamp(32px,5vw,64px)/1.2 Georgia,serif}h2{font-weight:500}.eyebrow{font-size:12px;letter-spacing:.1em}a{color:inherit;text-underline-offset:4px}nav{display:flex;flex-wrap:wrap;gap:12px 24px}aside{background:#fff;border:1px solid #e2d7c8;border-radius:24px;padding:24px;margin-block:20px 50px}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;min-width:0;background:#fff;border:1px solid #e2d7c8;border-radius:18px;overflow:hidden}figure a{display:block;max-height:680px;overflow:auto}img{display:block;width:100%;height:auto}figcaption{padding:12px;font-size:13px}section{margin-block:48px}details{margin-block:12px;border-block:1px solid #e2d7c8}summary{cursor:pointer;padding:16px;font-weight:600;min-height:44px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;padding:14px}.gallery figure a{height:300px}.gallery img{object-fit:cover;object-position:top}footer{padding-block:40px}a:focus-visible,summary:focus-visible{outline:3px solid #89542f;outline-offset:4px}@media(max-width:650px){.pair{grid-template-columns:1fr}header,main,footer{padding-inline:16px}}'''
(out/'REVIEW.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halastudy refinement review</title><style>{css}</style>{body[:body.index("<aside>")]}<main>{body[body.index("<aside>"):]}</main></html>',encoding='utf-8')
summary={'integrationTests':int(integration[-1]) if integration else None,'browserPasses':int(browser[-1]) if browser else None,'workspaceScreenshots':len(workspace),'extendedScreenshots':len(list((out/'screenshots/after/extended').glob('*.png'))),'onlineScreenshots':len(online),'sourceFiles':len(manifest['files'])}
(out/'evidence/review-summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary))
