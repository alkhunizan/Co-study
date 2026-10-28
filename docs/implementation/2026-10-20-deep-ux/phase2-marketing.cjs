const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const file = path.join(root, 'public/js/marketing-copy.js');
const copy = require(file);
Object.assign(copy.home.ar, {
    livePillLabel: 'مساحة هادئة للمذاكرة معًا', illustrativeNote: 'معاينة توضيحية',
    communitySub: 'مشاهد توضيحية لأجواء المذاكرة. ادعُ مجموعتك إلى غرفة تخصّكم.',
    statFocusValue: '25/5', statFocusLabel: 'إيقاع تبدأ به', statGuestValue: 'ضيف', statGuestLabel: 'ابدأ دون حساب', statCameraValue: 'اختيارية', statCameraLabel: 'الكاميرا على راحتك',
    member1Name: 'جلسة قراءة', member2Name: 'مراجعة اختبار', member3Name: 'وقت للمشروع', member4Name: 'إنجاز مهمة', member5Name: 'مذاكرة مسائية',
    member1Major: 'فكرة لغرفتك', member2Major: 'فكرة لغرفتك', member3Major: 'فكرة لغرفتك', member4Major: 'فكرة لغرفتك', member5Major: 'فكرة لغرفتك',
    tileNames: ['جلسة قراءة', 'مذاكرة هادئة', 'مراجعة اختبار', 'وقت للمشروع', 'جلسة تركيز', 'إنجاز مهمة'],
    previewNames: ['جلسة قراءة', 'وقت للمشروع', 'جلسة تركيز']
});
Object.assign(copy.home.en, {
    livePillLabel: 'A quiet place to study together', illustrativeNote: 'Illustrative preview',
    communitySub: 'Illustrative study scenes. Invite your group into a room of your own.',
    statFocusValue: '25/5', statFocusLabel: 'A rhythm to start with', statGuestValue: 'Guest', statGuestLabel: 'Start without an account', statCameraValue: 'Optional', statCameraLabel: 'Camera at your pace',
    member1Name: 'Reading session', member2Name: 'Exam revision', member3Name: 'Project time', member4Name: 'One task done', member5Name: 'Evening study',
    member1Major: 'An idea for your room', member2Major: 'An idea for your room', member3Major: 'An idea for your room', member4Major: 'An idea for your room', member5Major: 'An idea for your room',
    tileNames: ['Reading session', 'Quiet study', 'Exam revision', 'Project time', 'Focus session', 'One task done'],
    previewNames: ['Reading session', 'Project time', 'Focus session']
});
fs.writeFileSync(file, `// Shared server/browser copy for crawlable marketing locales.\nconst marketingCopy = ${JSON.stringify(copy, null, 2)};\nif (typeof module !== 'undefined') module.exports = marketingCopy;\nif (typeof window !== 'undefined') (/** @type {any} */ (window)).HalaMarketingCopy = marketingCopy;\n`);
const htmlFile = path.join(root, 'landing.html');
let html = fs.readFileSync(htmlFile, 'utf8');
html = html.replace(/<div class="live-pill">[\s\S]*?<\/div>\s*<span class="illustrative-note"[^>]*>[^<]*<\/span>/, '<div class="live-pill" data-i18n="livePillLabel">مساحة هادئة للمذاكرة معًا</div>');
html = html.replace(/<div class="tile-chip"><span class="live-dot"><\/span><span>LIVE<\/span><\/div>/g, '<div class="tile-chip"><span data-i18n="illustrativeNote">معاينة توضيحية</span></div>');
html = html.replace(/<div class="community-stats">[\s\S]*?<\/div>/, `<div class="community-stats">
        <span class="stat"><span class="stat-num" data-i18n="statFocusValue">25/5</span><span class="stat-label" data-i18n="statFocusLabel">إيقاع تبدأ به</span></span>
        <span class="stat"><span class="stat-num" data-i18n="statGuestValue">ضيف</span><span class="stat-label" data-i18n="statGuestLabel">ابدأ دون حساب</span></span>
        <span class="stat"><span class="stat-num" data-i18n="statCameraValue">اختيارية</span><span class="stat-label" data-i18n="statCameraLabel">الكاميرا على راحتك</span></span>
      </div>`);
html = html.replace(/    \/\* ---------- Live counter[^]*?(?=    \/\* ---------- Preview pomodoro)/, '');
html = html.replace('      setInterval(tickLive, 1100);\n', '');
// The source remains honest even before JavaScript or server locale rendering.
html = html.replace(/(<[^>]+data-i18n="([^"]+)"[^>]*>)([^<]*)(<\/[^>]+>)/g, (whole, start, key, _text, end) => copy.home.ar[key] ? `${start}${copy.home.ar[key]}${end}` : whole);
html = html.replace(/(<span data-tile-name="(\d+)">)[^<]*(<\/span>)/g, (_whole, start, i, end) => start + copy.home.ar.tileNames[Number(i)] + end);
html = html.replace(/(<span data-preview-name="(\d+)">)[^<]*(<\/span>)/g, (_whole, start, i, end) => start + copy.home.ar.previewNames[Number(i)] + end);
fs.writeFileSync(htmlFile, html);
console.log('Illustrative previews now have honest labels; simulated attendance removed.');
