from pathlib import Path
import difflib, json, os, shutil

out = Path(__file__).resolve().parent
if (out / 'evidence/original/index.html').exists():
    raise SystemExit('Historical proposal generator: the approved fix is now applied. Do not overwrite baseline or final patch.')
repo = out.parents[2]
manifest = json.loads((out / 'evidence/snapshot.json').read_text(encoding='utf-8'))
draft = Path(manifest['runtime']) / 'blur-proposal'
for row in manifest['files']:
    source = repo / row['file']
    target = draft / row['file']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
source = (repo / 'index.html').read_text(encoding='utf-8')
changed = source
def replace(old, new, count=1):
    global changed
    assert changed.count(old) == count, old[:100]
    changed = changed.replace(old, new)

replace("            cameraError: 'Unable to access the camera.',", "            cameraError: 'Unable to access the camera.',\n            cameraBlurHelp: 'Privacy blur could not start. Your camera is off. Retry, or turn blur off only if you want to share unblurred video.',")
replace("            cameraError: 'تعذر الوصول إلى الكاميرا.',", "            cameraError: 'تعذر الوصول إلى الكاميرا.',\n            cameraBlurHelp: 'تعذر تشغيل تمويه الخصوصية، فأوقفنا الكاميرا. أعد المحاولة، أو أوقف التمويه فقط إذا أردت مشاركة الفيديو بدونه.',")
replace('    async function toggleBlur() {', '''    async function requireBlurredStream(stream) {
        try {
            if (!supportsCanvasFilter) throw new Error('Canvas blur unavailable');
            return await startBlurPipeline(stream);
        } catch (error) {
            error.name = 'BlurProcessingError';
            throw error;
        }
    }

    async function toggleBlur() {''')
replace('''            if (blurEnabled && supportsCanvasFilter) {
                localStream = await startBlurPipeline(rawStream);''', '''            if (blurEnabled) {
                localStream = await requireBlurredStream(rawStream);''')
replace('''            debugLog('ERROR', 'Blur toggle failed', err.message);
            stopBlurPipeline({ keepRaw: true });
            localStream = rawStream;''', '''            debugLog('ERROR', 'Blur toggle failed', err.name);
            disableCamera();
            showCameraHelp('cameraBlurHelp');
            return;''')
replace('const showButton = supportsCanvasFilter && isMeshRoom();', 'const showButton = isMeshRoom();')
replace('if (!cameraEnabled && !localStream) {', 'if (!cameraEnabled && !localStream && !rawStream) {')
replace('''            if (blurEnabled && supportsCanvasFilter) {
                try {
                    localStream = await startBlurPipeline(rawStream);
                } catch (blurErr) {
                    debugLog('ERROR', 'Blur pipeline failed, sending raw', blurErr.message);
                    stopBlurPipeline({ keepRaw: true });
                    localStream = rawStream;
                }
            } else {''', '''            if (blurEnabled) {
                localStream = await requireBlurredStream(rawStream);
            } else {''')
replace("            showCameraHelp(key);", "            showCameraHelp(err.name === 'BlurProcessingError' ? 'cameraBlurHelp' : key);")
replace("            cameraStarting = false;\n            document.getElementById('camera-retry').disabled = false;", "            cameraStarting = false;\n            updateCameraToggleLabel();\n            document.getElementById('camera-retry').disabled = false;")
(draft / 'index.html').write_text(changed, encoding='utf-8')
(out / 'blur-fail-closed.patch').write_text(''.join(difflib.unified_diff(source.splitlines(keepends=True), changed.splitlines(keepends=True), fromfile='a/index.html', tofile='b/index.html')), encoding='utf-8')
print(json.dumps({'draft': str(draft), 'originalModified': False, 'patch': str(out / 'blur-fail-closed.patch')}))
