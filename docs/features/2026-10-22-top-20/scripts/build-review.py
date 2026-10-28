"""Build an offline review from real browser evidence, without altering images."""
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
before = json.loads((root / 'evidence/before-browser.json').read_text(encoding='utf-8-sig'))
after = json.loads((root / 'evidence/final-browser-review.json').read_text(encoding='utf-8-sig'))
zoom = json.loads((root / 'evidence/enlarged-text.json').read_text(encoding='utf-8-sig'))
verification = json.loads((root / 'evidence/final-verification.json').read_text(encoding='utf-8-sig'))
items = []
for row in before:
    if row.get('file'):
        items.append({**row, 'phase': 'before'})
for row in after['rows']:
    items.append({**row, 'phase': 'after'})
for row in zoom['rows']:
    items.append({**row, 'phase': 'after', 'theme': 'light', 'width': 390, 'enlarged': True})
items.append({'phase':'after','label':'progress','lang':'ar','theme':'light','width':390,'file':'after/progress-390-ar-light.png'})
cards = []
for row in items:
    file = row['file']
    assert (root / 'screenshots' / file).is_file(), file
    title = f"{row['label']} · {row['width']}px · {row['lang']} · {row['theme']}"
    if row.get('enlarged'):
        title += ' · text doubled'
    cards.append(f'''<article data-phase="{row['phase']}" data-language="{row['lang']}"><h3>{html.escape(title)}</h3>
<p>{row['phase'].title()}</p><a href="screenshots/{html.escape(file,quote=True)}" target="_blank" rel="noopener"><img src="screenshots/{html.escape(file,quote=True)}" loading="lazy" alt="{html.escape(title,quote=True)}"></a></article>''')
body = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halastudy — twenty features review</title>
<style> :root{{font:16px/1.6 system-ui,sans-serif;color:#293134;background:#f5f2eb}}*{{box-sizing:border-box}}body{{margin:0}}main{{max-width:1380px;margin:auto;padding:32px 20px 70px}}h1,h2{{font-family:Georgia,serif;font-weight:500}}h1{{font-size:clamp(30px,4vw,50px)}}a{{color:inherit;text-underline-offset:4px}}nav,.filters{{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}}button,nav a{{padding:12px 18px;min-height:44px;border:1px solid #b9a896;border-radius:24px;background:#fff;color:#293134}}button[aria-pressed=true]{{background:#e0b08b}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:24px}}article{{border:1px solid #d8cdbf;padding:16px;border-radius:20px;min-width:0;background:#faf7f1}}article h3{{font-size:16px}}article img{{display:block;width:100%;height:550px;object-fit:contain;object-position:top;background:#ece8e0}}.verdict{{border-inline-start:4px solid #b07b54;padding:12px 20px;background:#fff}}:focus-visible{{outline:3px solid #89542f;outline-offset:4px}}[hidden]{{display:none!important}}small{{color:#536067}}.pair{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}}.pair img{{width:100%;max-height:700px;object-fit:contain;object-position:top}}@media(max-width:600px){{.pair{{grid-template-columns:1fr}}}}</style></head><body><main>
<h1>Twenty features. One quieter study loop.</h1><p>Plan a task, choose a routine, focus with trusted credit, reflect and return to familiar company.</p>
<div class="verdict"><strong>{html.escape(verification['verdict'])}</strong><p>Local implementation and preview verified. No merge, push, deployment, hosted migration, real payment or external message.</p><small>Source {html.escape(verification['sourceHead'])}. Synthetic accounts and examples throughout.</small></div>
<nav aria-label="Review evidence"><a href="README.md">Start here</a><a href="FEATURES.md">All twenty features</a><a href="VERIFY.md">Verification</a><a href="ARCHITECTURE.md">Architecture</a><a href="RESEARCH.md">Research</a><a href="http://127.0.0.1:3510/app#planner">Local preview</a></nav>
<h2>Matched before and after</h2><p>Same 390px Arabic/light viewport. Before captures blocked external fonts; after captures loaded the real fonts. Typography differences alone are not claimed as code improvements.</p>
<div class="pair"><figure><figcaption>Before · Progress</figcaption><a href="screenshots/before/progress-390-ar-light.png"><img src="screenshots/before/progress-390-ar-light.png" alt="Before Progress at 390 pixels in Arabic and light theme"></a></figure><figure><figcaption>After · Progress</figcaption><a href="screenshots/after/progress-390-ar-light.png"><img src="screenshots/after/progress-390-ar-light.png" alt="After Progress at 390 pixels in Arabic and light theme"></a></figure></div>
<h2>Every review view</h2><p>Open any image at original size. The gallery includes every new planning destination, guided Progress, private resources and enlarged text.</p>
<div class="filters" aria-label="Filter screenshots"><button data-filter="all" aria-pressed="true">All</button><button data-filter="before" aria-pressed="false">Before</button><button data-filter="after" aria-pressed="false">After</button><button data-filter="ar" aria-pressed="false">Arabic</button><button data-filter="en" aria-pressed="false">English</button></div><p id="count" role="status">{len(items)} real browser screenshots</p><div class="grid">{''.join(cards)}</div>
<script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{{const key=button.dataset.filter;let count=0;document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('article').forEach(card=>{{card.hidden=key!=='all'&&card.dataset.phase!==key&&card.dataset.language!==key;if(!card.hidden)count++;}});document.getElementById('count').textContent=count+' real browser screenshots';}}));</script></main></body></html>'''
(root / 'review.html').write_text(body, encoding='utf-8')
print(f'Built review.html with {len(items)} real browser screenshots.')
