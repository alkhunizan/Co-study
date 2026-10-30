const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const copyPath = path.join(root, 'public/js/marketing-copy.js');
const copy = require(copyPath);
Object.assign(copy.home.ar, {
    heroTitle1: 'جلسة هادئة.', heroTitle2: 'على إيقاعك.', heroTitle3: 'ذاكر مع رفقة.',
    heroSub: 'افتح غرفة تركيز للمذاكرة أو العمل. ادعُ رفاقك، وابدأ المؤقّت؛ الكاميرا اختيارية.',
    heroFoot: 'بدون تنزيل. ابدأ دون حساب. الكاميرا على راحتك.',
    why1P: 'وجود رفيق يذاكر معك يساعدك ترجع لمهمتك. ادعُ مجموعتك وابدأوا جلسة تناسبكم، بالكاميرا أو بدونها.',
    step1P: 'افتح غرفتك وشارك رمزها المكوّن من 6 خانات. اختر إيقاع التركيز من داخل الغرفة.',
    step2H: 'الكاميرا على راحتك', step2P: 'ابدأ بالكاميرا أو بدونها. عند تشغيلها يشاهدك أعضاء الغرفة، والمايك مقفول افتراضيًا.',
    step3P: 'ركّز على مهمتك حتى نهاية المؤقّت. خذ استراحة، ثم ابدأ جولة جديدة عندما تكون جاهزًا.',
    previewFootL: 'كاميرا اختيارية · المايك مقفول',
    closerSub: 'غرفة هادئة للمذاكرة والعمل مع رفاقك. الكاميرا اختيارية، وإيقاع الجلسة تختاره أنت.'
});
Object.assign(copy.home.en, {
    heroTitle1: 'A quiet session.', heroTitle2: 'Your own pace.', heroTitle3: 'Study together.',
    heroSub: 'Open a quiet room for study or work. Invite your group and start the timer. Camera optional.',
    heroFoot: 'No download. Start without an account. Camera optional.',
    why1P: 'Having a study companion can help you return to your task. Invite your group and choose a session that works for you, with or without a camera.',
    step1P: 'Open your room and share its six-character code. Choose your focus rhythm inside the room.',
    step2H: 'Camera at your pace', step2P: 'Start with or without a camera. When enabled, people in your room can see it. Mic is off by default.',
    step3P: 'Work on your task until the timer ends. Take a break, then start another round when you are ready.',
    previewFootL: 'Camera optional · mic off',
    closerSub: 'A quiet room for study and work with your group. The camera is optional, and you choose the rhythm.'
});
fs.writeFileSync(copyPath, `// Shared server/browser copy for crawlable marketing locales.\nconst marketingCopy = ${JSON.stringify(copy, null, 2)};\nif (typeof module !== 'undefined') module.exports = marketingCopy;\nif (typeof window !== 'undefined') (/** @type {any} */ (window)).HalaMarketingCopy = marketingCopy;\n`);
const landingPath = path.join(root, 'landing.html');
let landing = fs.readFileSync(landingPath, 'utf8');
landing = landing.replace(/(<[^>]+data-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/g, (whole, start, key, _text, end) => typeof copy.home.ar[key] === 'string' ? `${start}${copy.home.ar[key]}${end}` : whole);
landing = landing.replace('camera on, mic off, work alongside someone.', 'camera optional, mic off, work alongside someone.').replace(/الكاميرا شغّالة، المايك مقفول/g, 'الكاميرا اختيارية، المايك مقفول');
fs.writeFileSync(landingPath, landing);
let room = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
room = room.replace('        <div class="timer-box">', `        <section class="camera-help" id="camera-help" hidden>
            <p id="camera-help-message" role="status" aria-live="polite"></p>
            <div class="camera-help-actions">
                <button type="button" id="camera-retry" data-lang="cameraRetry">Try camera again</button>
                <button type="button" id="camera-continue" data-lang="cameraContinue">Continue without camera</button>
            </div>
        </section>
        <div class="timer-box">`);
room = room.replace("            cameraError: 'Unable to access the camera.',", `            cameraError: 'Unable to access the camera.',
            cameraPermissionHelp: 'Camera access is blocked. Allow it in your browser site settings, then try again. You can keep studying without it.',
            cameraDeviceHelp: 'No camera was found. Connect a camera and try again, or continue without one.',
            cameraBusyHelp: 'The camera may be in use. Close the other camera app and try again, or keep studying without it.',
            cameraGenericHelp: 'The camera could not start. Try again or continue your session without it.',
            cameraBrowserHelp: 'Camera access is unavailable in this browser. Continue studying, or open the room in a supported browser using HTTPS.',
            cameraRetry: 'Try camera again', cameraContinue: 'Continue without camera',
            cameraPrivacy: 'Camera optional. When enabled, people in your room can see it. You can turn it off at any time.',`);
room = room.replace("            cameraError: 'تعذر الوصول إلى الكاميرا.',", `            cameraError: 'تعذر الوصول إلى الكاميرا.',
            cameraPermissionHelp: 'إذن الكاميرا مغلق. اسمح به من إعدادات الموقع في متصفحك، ثم أعد المحاولة. تقدر تكمل المذاكرة بدونها.',
            cameraDeviceHelp: 'لم نعثر على كاميرا. وصّل كاميرا وأعد المحاولة، أو أكمل بدونها.',
            cameraBusyHelp: 'قد تكون الكاميرا مستخدمة في تطبيق آخر. أغلقه وأعد المحاولة، أو أكمل المذاكرة بدونها.',
            cameraGenericHelp: 'لم تعمل الكاميرا. أعد المحاولة أو أكمل جلستك بدونها.',
            cameraBrowserHelp: 'الكاميرا غير متاحة في هذا المتصفح. أكمل المذاكرة، أو افتح الغرفة في متصفح يدعمها عبر HTTPS.',
            cameraRetry: 'جرّب الكاميرا مجددًا', cameraContinue: 'أكمل بدون كاميرا',
            cameraPrivacy: 'الكاميرا اختيارية. عند تشغيلها يشاهدها أعضاء غرفتك، وتقدر توقفها في أي وقت.',`);
room = room.replace("videoCollapsedBanner: 'No video stream'", "videoCollapsedBanner: 'Camera off · study at your pace'").replace("videoCollapsedBanner: 'لا يوجد بث فيديو'", "videoCollapsedBanner: 'الكاميرا مغلقة · ذاكر على راحتك'");
room = room.replace("    async function toggleCamera() {", `    let cameraHelpKey = '';
    let cameraStarting = false;
    function renderCameraHelp() {
        document.getElementById('camera-help').hidden = !cameraHelpKey;
        document.getElementById('camera-help-message').textContent = currentCopy()[cameraHelpKey] || '';
    }
    function showCameraHelp(key) {
        cameraHelpKey = key;
        renderCameraHelp();
        document.getElementById('camera-help').scrollIntoView({ block: 'nearest' });
    }
    document.getElementById('camera-retry').addEventListener('click', () => { void toggleCamera(); });
    document.getElementById('camera-continue').addEventListener('click', () => {
        cameraHelpKey = ''; renderCameraHelp(); document.getElementById('btn-toggle').focus();
    });
    async function toggleCamera() {`);
room = room.replace("        if (!isMeshRoom()) return;\n        if (!navigator.mediaDevices", "        if (!isMeshRoom() || cameraStarting) return;\n        if (!navigator.mediaDevices");
room = room.replace("            alert(langDict[curLang].cameraError);\n            return;", "            showCameraHelp('cameraBrowserHelp');\n            return;");
room = room.replace("        updateCameraToggleLabel('loading');\n        try {", "        cameraStarting = true;\n        document.getElementById('camera-retry').disabled = true;\n        updateCameraToggleLabel('loading');\n        try {");
room = room.replace("            cameraEnabled = true;\n            debugLog('CAMERA'", "            cameraEnabled = true;\n            cameraHelpKey = ''; renderCameraHelp();\n            debugLog('CAMERA'");
room = room.replace("            console.error('camera error', err);\n            debugLog('ERROR', 'Camera access failed', err.message);\n            cameraEnabled = false;\n            updateCameraToggleLabel();\n            aiStatusEl.textContent = langDict[curLang].cameraError;\n            alert(langDict[curLang].cameraError);", `            debugLog('ERROR', 'Camera access failed', err.name);
            disableCamera();
            const key = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err.name) ? 'cameraPermissionHelp'
                : ['NotFoundError', 'DevicesNotFoundError'].includes(err.name) ? 'cameraDeviceHelp'
                : ['NotReadableError', 'TrackStartError'].includes(err.name) ? 'cameraBusyHelp' : 'cameraGenericHelp';
            showCameraHelp(key);
        } finally {
            cameraStarting = false;
            document.getElementById('camera-retry').disabled = false;`);
room = room.replace("        updateRemotePlaceholder();\n        const hasRemoteBuddy", "        renderCameraHelp();\n        updateRemotePlaceholder();\n        const hasRemoteBuddy");
room = room.replace('<div class="video-box">','<p class="camera-privacy" data-lang="cameraPrivacy">Camera optional. When enabled, people in your room can see it. You can turn it off at any time.</p>\n        <div class="video-box">',1);
room = room.replace("mediaModeMeshBadge: 'Mesh room'", "mediaModeMeshBadge: 'Study room'").replace("mediaModeMeshBadge: 'غرفة Mesh'", "mediaModeMeshBadge: 'غرفة مذاكرة'");
fs.writeFileSync(path.join(root, 'index.html'), room);
const openPath = path.join(root, 'open.html');
let open = fs.readFileSync(openPath, 'utf8');
open = open.replace("labelMediaMode: 'Room media mode'", "labelMediaMode: 'Room size'").replace("labelMediaMode: 'وضع وسائط الغرفة'", "labelMediaMode: 'حجم الغرفة'").replace('>وضع وسائط الغرفة<','>حجم الغرفة<');
open = open.replace("mediaModeMeshBadge: 'Mesh room'", "mediaModeMeshBadge: 'Study room'").replace("mediaModeMeshBadge: 'غرفة Mesh'", "mediaModeMeshBadge: 'غرفة مذاكرة'");
fs.writeFileSync(openPath, open);
console.log('Camera recovery guidance and optional-camera copy added.');
