from pathlib import Path
import subprocess, json, difflib, sys
folder=Path(__file__).resolve().parent
root=folder.parents[2]
phase=sys.argv[1]
if phase not in ['phase1','phase2','phase3','final']: raise ValueError('Unexpected checkpoint name')
git=['git','-c','safe.directory=//192.168.50.113/E/D-Backup/OS/Claude-Projects/body_doubling_live_cam/workspace/Co-study','-c','core.autocrlf=false']
files=subprocess.check_output(git+['diff','--name-only'],cwd=root,text=True).splitlines()
additions=['tests/smoke/ux-journeys.smoke.spec.js','public/css/room-shell.css','public/js/ux-insights.js','public/js/schedule-display.js','tests/integration/ux-insights.integration.test.js','tests/integration/ux-dashboard.integration.test.js','tests/smoke/ux-return.smoke.spec.js','services/platform/dashboard.js','public/js/legal-shell.js']
manifest=[]; patch=[]
for file in sorted(set(files+additions)):
    current=root/file
    if file.startswith('docs/') or not current.is_file() or current.suffix not in ['.html','.js','.css','.json']: continue
    snapshot=folder/'baseline'/(file+'.snapshot')
    plain=folder/'baseline'/file
    if snapshot.is_file(): before=snapshot.read_text(encoding='utf-8')
    elif plain.is_file(): before=plain.read_text(encoding='utf-8')
    elif file in additions: before=''
    else: before=subprocess.check_output(git+['show','HEAD:'+file],cwd=root).decode('utf-8')
    after=current.read_text(encoding='utf-8')
    if before.replace('\r\n','\n')==after.replace('\r\n','\n'): continue
    patch.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+file,tofile='b/'+file))
    target=folder/'evidence'/(phase+'-snapshot')/(file+'.snapshot')
    target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after,encoding='utf-8')
    manifest.append(file)
(folder/'evidence'/(phase+'-ux-only.patch')).write_text(''.join(patch),encoding='utf-8')
(folder/'evidence'/(phase+'-files.json')).write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(f'{phase}: {len(manifest)} UX files recorded; existing payment changes excluded.')
