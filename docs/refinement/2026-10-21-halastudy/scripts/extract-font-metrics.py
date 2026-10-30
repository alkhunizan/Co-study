"""Preserve the existing font diagnostic's measurements and screenshots."""
from pathlib import Path
import base64
import json
import shutil

out=Path(__file__).resolve().parents[1]
report=json.loads((out/'evidence/verified-fonts-metrics.json').read_text(encoding='utf-8-sig'))
attachments=[]
def walk(value):
    if isinstance(value,dict):
        if value.get('name')=='online-fonts.json' and value.get('body'):
            attachments.append(json.loads(base64.b64decode(value['body'])))
        for child in value.values():walk(child)
    elif isinstance(value,list):
        for child in value:walk(child)
walk(report)
if report['stats']['unexpected'] or len(attachments)!=1:
    raise SystemExit('The online font diagnostic did not produce one passing measurement attachment.')
metrics=attachments[0]
if len(metrics['measurements'])!=4 or metrics['messages'] or metrics['requests']:
    raise SystemExit('Font measurements or diagnostics did not satisfy acceptance.')
screenshots=[]
for file in (out/'evidence/verified-fonts-metrics-results').glob('**/online-fonts-*.png'):
    target=out/'screenshots/after/online'/file.name.replace('online-fonts-','landing-')
    shutil.copy2(file,target)
    screenshots.append(target.relative_to(out).as_posix())
metrics['conditions']={'browser':'Chrome 155.0.8059.85','host':'Windows','cpuThrottle':False,'networkThrottle':False,
    'idleSecondsPerView':10,'viewports':[390,1440],'languages':['ar','en'],'cache':'one context; warms between views','fieldData':False}
metrics['screenshots']=screenshots
(out/'evidence/performance.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{key:row[key] for key in ['language','width','cls','lcp']} for row in metrics['measurements']]))
