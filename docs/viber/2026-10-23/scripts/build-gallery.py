from pathlib import Path
import html
import json

root = Path(__file__).resolve().parents[1]
rows = []
for name in ['join-stalled','account-save-error','reminder-no-retry','provider-no-retry']:
    rows.append({'group':'before','title':name.replace('-',' '),'file':f'screenshots/before/{name}.png'})
for r in json.loads((root/'evidence/visual-review.json').read_text(encoding='utf-8'))['rows']:
    rows.append({'group':'recovery','title':f'{r["state"]} · {r["lang"]} · {r["theme"]} · {r["width"]}px','file':r['file']})
for r in json.loads((root/'evidence/final-browser-review.json').read_text(encoding='utf-8'))['rows']:
    rows.append({'group':'planner','title':f'{r["label"]} · {r["lang"]} · {r["theme"]} · {r["width"]}px'+(' · enlarged text' if r['zoom'] else ''),'file':'screenshots/'+r['file']})
for r in rows:
    assert (root/r['file']).is_file(),r['file']
cards=''.join(f'<article data-group="{r["group"]}"><h2>{html.escape(r["title"])}</h2><a href="{r["file"]}"><img loading="lazy" src="{r["file"]}" alt="{html.escape(r["title"])}"></a></article>' for r in rows)
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Halastudy gate review</title>
<style>body{background:#f5f1e9;color:#30261f;font:16px/1.6 system-ui;margin:32px}header{max-width:950px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}img{max-width:100%;height:auto}article{padding:16px;background:#fffaf3;border:1px solid #d9cbbd;border-radius:20px}h2{font-size:17px}a{color:#744426}button{font:inherit;min-height:44px;padding:8px 18px;margin:4px;border-radius:24px;background:#fffaf3;border:1px solid #8b6c52}button[aria-pressed=true]{background:#e0b08b}button:focus-visible,a:focus-visible{outline:3px solid #a56b43;outline-offset:3px}[hidden]{display:none}</style>
<header><h1>Halastudy: production gate review</h1><p><strong>NO-GO for production.</strong> Six fixes; current functional gate169 integration/83 browser passes. The final account-logo accessible name needs correction; full font verification hit the request cap.</p><p>Real screenshots, synthetic local accounts. Before states failed prior to the fix. Current source5015826, both languages/themes. <a href="RUN.md">Full evidence</a> · <a href="FINDINGS.md">Findings</a></p></header>
<nav aria-label="Screenshot group"><button type="button" data-filter="all" aria-pressed="true">All36 views</button><button type="button" data-filter="before" aria-pressed="false">Before4</button><button type="button" data-filter="recovery" aria-pressed="false">Recovery12</button><button type="button" data-filter="planner" aria-pressed="false">Planner20</button></nav><main>'''+cards+'''</main><script>document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('[data-group]').forEach(x=>x.hidden=b.dataset.filter!=='all'&&x.dataset.group!==b.dataset.filter)}))</script></html>'''
(root/'review.html').write_text(page,encoding='utf-8')
print(f'Gallery: {len(rows)} verified image links')
