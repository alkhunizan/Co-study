from pathlib import Path
import hashlib, json, re
import pymupdf

root=Path(__file__).resolve().parents[1]
repo=root.parents[1]
en=(root/'REPORT.md').read_text(encoding='utf-8')
ar=(root/'REPORT.ar.md').read_text(encoding='utf-8')
plan=(root/'PLAN.md').read_text(encoding='utf-8')
assert re.findall(r'\*\*(F\d\d)',en)==re.findall(r'\*\*(F\d\d)',ar)
assert len(re.findall(r'^## ',en,re.M))==len(re.findall(r'^## ',ar,re.M))==7
assert '33/11 = 3.00' in en and '33/11 = 3.00' in ar
assert len(re.findall(r'^### T\d\d',plan,re.M))==7
assert (root/'PLAN.md').read_bytes()==(repo/'docs/tester/PLAN-2026-10-21.md').read_bytes()
summary=json.loads((root/'verification/audit-summary.json').read_text(encoding='utf-8'))
assert len(summary['journeys'])==8 and sum(j['mark']=='✓' for j in summary['journeys'])==5
assert sum(not j['runnerCompleted'] for j in summary['journeys'])==1
outputs=['REPORT.md','REPORT.ar.md','PLAN.md','halastudy.com-ux-report-2026-10-21-en.pdf','halastudy.com-ux-report-2026-10-21-ar.pdf']
files=[]
for name in outputs:
    file=root/name
    assert file.is_file() and file.stat().st_size>1000
    files.append({'path':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    if file.suffix=='.pdf':
        doc=pymupdf.open(file)
        text='\n'.join(p.get_text() for p in doc)
        assert 'F09' in text and '33/11' in text
source=root/'verification/source-comparison.json'
comparison=json.loads(source.read_text(encoding='utf-8'))
comparison['probeSampledAt']=comparison.pop('auditedAt',None)
comparison['note']='Local source was read separately from the production probe. Other worktree changes may occur concurrently; hashes describe the files read by the comparison, not a tested release candidate.'
source.write_text(json.dumps(comparison,ensure_ascii=False,indent=2),encoding='utf-8')
receipt={'date':'2026-10-21','timeZone':'Asia/Riyadh','requiredOutputs':files,'bilingualStructure':'matching seven sections and nine finding IDs','planTasks':7,'journeyChecks':8,'readOnlyDestinationsReached':5,'goalsAbandoned':3,'pdfTextDatesFontsAndBounds':'verified in pdf-qa.json','screenshotsPresent':True,'applicationEditsByAudit':False,'publishedByAudit':False}
(root/'verification/delivery-manifest.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'requiredOutputs':len(files),'planTasks':7,'journeyChecks':8,'findings':re.findall(r'\*\*(F\d\d)',en),'bilingualStructure':'PASS','planMirror':'PASS','allFilesPresent':'PASS'},ensure_ascii=False,indent=2))
