const fs = require('node:fs');
const ar = {
    studyNav: 'المذاكرة', groupsNav: 'المجموعات', account: 'حسابي', accountTitle: 'حسابك وخياراتك',
    accountBody: 'الملف الشخصي وسجل الغرف وإعدادات الأمان في مكان واحد.', profileHistory: 'الملف الشخصي وسجل الغرف',
    continueStudy: 'أكمل مذاكرتك', nextSession: 'موعدك القادم', noRecentRoom: 'لا توجد غرفة سابقة متاحة. افتح غرفة جديدة عندما تكون جاهزًا.',
    noNextSession: 'لا يوجد موعد قادم متاح. يمكنك الدراسة الآن أو الاطلاع على مجموعاتك.',
    todayMinutes: 'دقائق اليوم الموثّقة', todayRule: 'دقائق اليوم من الجلسات المكتملة، بتوقيت الرياض (Asia/Riyadh).',
    passwordReminder: 'قد تحتاج كلمة مرور الغرفة.', recapTitle: 'انتهت جلستك', anotherSession: 'ابدأ جلسة أخرى',
    savedSession: 'حُفظت في حسابك.', shortSession: 'لم تكتمل دقيقة موثّقة؛ لا نقاط لهذه الجلسة.',
    elapsed: 'المدة المنقضية', credited: 'الدقائق الموثّقة', recapRule: 'المدة المنقضية تشمل التوقف والانقطاع؛ تُحسب النقاط من الوقت الموثّق فقط.',
    insightsTitle: 'عدادات استخدام اختيارية على جهازك', insightsBody: 'معطّلة افتراضيًا. تُحفظ أعداد الإجراءات وفئات المدة فقط لمدة 7 أيام على هذا المتصفح، دون إرسالها إلى أي جهة. لا تتضمن أسماء أو رموز غرف أو محتوى. إيقافها يحذفها.',
    insightsEnable: 'اسمح بالعدادات المحلية على هذا المتصفح', insightsReset: 'امسح العدادات وأوقفها', insightsOn: 'العدادات المحلية مفعّلة لمدة 7 أيام من موافقتك.', insightsOff: 'العدادات معطّلة. يمكنك الدراسة كالمعتاد.',
    security: 'الأمان', vip: 'عضوية VIP', staff: 'الإدارة'
};
let js = fs.readFileSync('public/js/platform.js', 'utf8').replace(/\r\n/g, '\n');
js = js.slice(0, js.indexOf('})();') + 5) + '\n';
const start = js.indexOf('    Object.assign(ar, {\n        studyNav:');
const end = js.indexOf('    Object.assign(en, {\n        studyNav:', start);
if (start < 0 || end < 0) throw new Error('Copy block not found');
js = js.slice(0, start) + `    Object.assign(ar, ${JSON.stringify(ar, null, 4)});\n` + js.slice(end);
js = js.replace(/    Object.assign\(ar, \{ insightsTitle:[^\n]+\n/, '');
fs.writeFileSync('public/js/platform.js', js);
let html = fs.readFileSync('platform.html', 'utf8');
html = html.replace('data-view="home" data-lang="home"', 'data-view="home" data-lang="studyNav"').replace('data-view="circles" data-lang="circles"', 'data-view="circles" data-lang="groupsNav"');
html = html.replace(/(<([a-z0-9]+)\b[^>]*data-lang="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g, (whole, opening, tag, key, text, closing) => ar[key] ? opening + ar[key] + closing : whole);
html = html.replace('<a href="/account" data-lang="account">', '<a href="/app#account" data-view="account" data-lang="account">');
if (!html.includes('id="return-room"')) html = html.replace('<div class="metrics" id="home-metrics">', `<h2 data-lang="continueStudy">${ar.continueStudy}</h2><div id="return-room" class="rows"></div>\n        <h2 data-lang="nextSession">${ar.nextSession}</h2><div id="next-session" class="rows"></div>\n        <p class="note" data-lang="todayRule">${ar.todayRule}</p>\n        <div class="metrics" id="home-metrics">`);
html = html.replace('<span data-lang="startsAt">البدء بتوقيت جهازك</span>', '<span data-lang="startsAt">البدء بتوقيت جهازك</span><small id="schedule-zone"></small>');
fs.writeFileSync('platform.html', html);
let open = fs.readFileSync('open.html', 'utf8').replace("scheduleTimezoneLabel: 'توقيت الرياض'", "scheduleTimezoneLabel: 'توقيت الرياض (Asia/Riyadh، UTC+03:00)'");
// The schedule input hint is explicit before a room is created too.
open = open.replace(/(scheduleHint:\s*')([^']+)(')/g, '$1$2 (Asia/Riyadh, UTC+03:00)$3');
fs.writeFileSync('open.html', open);
let landing = fs.readFileSync('landing.html', 'utf8').replaceAll('href="/open.html"', 'href="/open.html" data-ux-entry="create"').replaceAll('href="/open.html#join"', 'href="/open.html#join" data-ux-entry="join"');
fs.writeFileSync('landing.html', landing);
