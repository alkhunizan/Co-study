# كو-ستدي <img src="images/baby-chick_1f424.gif" width="32" height="32" alt="Logo">

[English Documentation](./README.md)

كو-ستدي مساحة تركيز جماعية تعمل من المتصفح، وتجمع بين الفيديو المباشر، والدردشة الفورية، والمؤقت، والمهام المشتركة في غرفة واحدة تساعد المجموعة على الاستمرار في الإنجاز.

هذه النسخة مهيأة للسعودية وتدعم:
- الإنجليزية كلغة افتراضية
- العربية كلغة إضافية قابلة للتبديل
- حفظ تفضيل اللغة عبر `coStudyLang`
- دعم RTL للنصوص العربية بدون عكس التخطيط بالكامل

## المزايا

- أسماء غرف مخصصة مع رموز مشاركة سريعة
- حماية اختيارية بكلمة مرور مع تشفير PBKDF2
- فيديو جماعي عبر WebRTC ودردشة مباشرة عبر Socket.IO
- مؤقت بومودورو مع إحصاءات تركيز يومية
- لوحة غرفة مشتركة، ومشاركة الحالة، والأصوات المحيطة
- غرف مجدولة قابلة لإعادة الاستخدام مع توقيت الرياض، وعدّ تنازلي، وتصدير تقويم، ودعوات جاهزة لواتساب
- حفظ حالة الغرف على القرص للدردشة واللوحة المشتركة
- إعداد TURN جاهز عبر `ICE_SERVERS_JSON`
- أوضاع وسائط مُدارة: غرف Mesh حتى 4 أشخاص، وغرف كبيرة عبر SFU عندما يتم ضبط `SFU_BASE_URL`
- نقاط فحص `health` و`ready` مع حدود إساءة استخدام خفيفة
- نسخ احتياطي واستعادة يدوية لملف حالة الغرف

## التشغيل المحلي

```bash
git clone https://github.com/sdxdlgz/Co-study.git
cd Co-study
npm install
npm start
```

بعد التشغيل افتح:

`http://localhost:3000`

### اختبار HTTPS المحلي

```bash
npm run https
```

بعدها افتح:

`https://localhost:3443`

هذا المسار مخصص فقط لاختبار الميزات التي تحتاج Secure Context محلياً.

## أوامر التشغيل والصيانة

```bash
npm run check
npm run audit:prod
npm run test:integration
npm run test:smoke
npm run backup:rooms
npm run restore:rooms -- /absolute/path/to/backup.json
npm run verify:deploy -- https://your-domain.com
```

الاستعادة عملية تشغيلية يدوية. أوقف التطبيق أولاً ثم استعد النسخة ثم أعد التشغيل وبعدها شغّل `verify:deploy`.

## النشر

راجع [DEPLOYMENT.md](./DEPLOYMENT.md) لإعداد Nginx و PM2 في بيئة الإنتاج.

في الإنتاج:
- `server.js` يعمل على HTTP محلي
- Nginx ينهي TLS العام
- `server-https.js` يبقى فقط للاختبار المحلي

## التقنيات

- الواجهة الأمامية: JavaScript و HTML و CSS بدون إطار عمل
- الواجهة الخلفية: Node.js و Express و Socket.IO
- الاتصال المرئي المباشر: WebRTC
- الحماية: PBKDF2 مع تحقق آمن زمنياً
- HTTPS المحلي: عبر `selfsigned`
- الإنتاج: Nginx HTTPS -> تطبيق HTTP محلي
- إدارة التشغيل: PM2

## الإعداد

- `PORT`: منفذ `server.js` المحلي، والافتراضي `3000`
- `HTTPS_PORT`: منفذ `server-https.js` المحلي، والافتراضي `3443`
- `TRUST_PROXY`: استخدم `1` خلف Nginx
- `ALLOWED_ORIGINS`: قائمة Origins مسموح بها مفصولة بفواصل، وإذا تُركت فارغة يعمل التطبيق بنفس الأصل فقط
- `ICE_SERVERS_JSON`: إعداد STUN/TURN اختياري
- `MESH_PARTICIPANT_LIMIT`: الحد الأقصى لغرف Mesh، والافتراضي `4`
- `ROOM_STATE_FILE`: مسار ملف حالة الغرف، والافتراضي `./data/rooms.json`
- `ROOM_STATE_BACKUP_DIR`: مجلد النسخ الاحتياطية، والافتراضي `./data/backups`
- `SFU_BASE_URL`: رابط أساسي مطلق `http(s)` لتكامل SFU المضمن

## ملاحظات الغرف المجدولة

- الغرف المجدولة تعيد استخدام نفس رمز الغرفة بدل أن تنتهي كغرف مؤقتة عادية.
- التكرار يدعم `once` و`daily` و`weekdays` و`weekly`، و`weekdays` يتبع أيام العمل السعودية من الأحد إلى الخميس.
- إعدادات المؤقت وهدف اللوحة عند البداية يتم حفظها مع جدولة الغرفة.
- الحضور في هذه النسخة على مستوى الغرفة نفسها: عدد الدخول في الوقت، وعدد الجلسات المفوّتة، والسلسلة الحالية.

## ملاحظات الوسائط

- وضع `mesh` هو الوضع الافتراضي للغرف، ويطبّق الحد الموجود في `MESH_PARTICIPANT_LIMIT`
- غرف `sfu` لا تظهر إلا عند ضبط `SFU_BASE_URL`
- الغرفة لا تغيّر وضع الوسائط بعد إنشائها
- مراقبة التركيز بالذكاء الاصطناعي متاحة في غرف Mesh فقط

## فحص وسائط يدوي قبل الإطلاق

- غرفة Mesh لشخصين مع تشغيل الكاميرا على الطرفين
- غرفة Mesh بأربعة أشخاص عند الحد الأقصى
- التأكد من منع المشارك الخامس من دخول غرفة Mesh ممتلئة
- إنشاء غرفة SFU والتأكد من تحميل الجلسة المضمنة
- اختبار كلمة المرور في وضعي Mesh وSFU
- فصل الاتصال ثم إعادة الدخول أثناء الجلسة
- تجربة شبكات تحتاج TURN
- Chrome على سطح المكتب وChrome على أندرويد وSafari على iPhone

## هيكل المشروع

```text
Co-study/
├── landing.html
├── index.html
├── server.js
├── server-https.js
├── co-study-server.js
├── room-store.js
├── schedule-utils.js
├── scripts/
├── tests/
├── audio/
├── images/
├── data/
├── DEPLOYMENT.md
├── nginx.conf
├── ecosystem.config.js
├── README.md
└── README_AR.md
```

## الترخيص

MIT

## المساهمة

البلاغات وطلبات الدمج مرحب بها.
