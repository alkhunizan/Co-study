# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: network-timeout.smoke.spec.js >> stalled room runtime configuration settles and releases RTC readiness
- Location: tests\smoke\network-timeout.smoke.spec.js:20:1

# Error details

```
Error: expect(received).toHaveProperty(path)

Matcher error: received value must not be null nor undefined

Received has value: null
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog "الدخول إلى غرفة التركيز" [ref=e2]:
    - generic [ref=e3]:
      - generic "Language selector" [ref=e4]:
        - button "AR" [pressed] [ref=e5] [cursor=pointer]
        - button "EN" [ref=e6] [cursor=pointer]
      - img [ref=e8]
      - heading "الدخول إلى غرفة التركيز" [level=2] [ref=e11]
      - paragraph [ref=e12]: أدخل اسمك ورمز الغرفة لتبدأوا التركيز معاً.
      - generic [ref=e13]: اسمك داخل الغرفة
      - textbox "اسمك داخل الغرفة" [active] [ref=e14]:
        - /placeholder: الاسم الذي سيظهر للآخرين
      - generic [ref=e15]: رمز الغرفة
      - textbox "رمز الغرفة" [ref=e16]:
        - /placeholder: "مثال: ABC123"
        - text: TXQHUV
      - generic [ref=e17]: كلمة مرور الغرفة (عند الحاجة)
      - textbox "كلمة مرور الغرفة (عند الحاجة)" [ref=e18]:
        - /placeholder: اتركها فارغة إذا لم تكن هناك كلمة مرور
      - alert [ref=e19]
      - button "الدخول إلى الغرفة" [ref=e20] [cursor=pointer]
      - link "العودة لاختيار غرفة" [ref=e21] [cursor=pointer]:
        - /url: /open
  - banner [ref=e22]:
    - link "Halastudy home" [ref=e23] [cursor=pointer]:
      - /url: /
      - generic [ref=e24]: H
      - generic [ref=e25]:
        - text: Hala
        - emphasis [ref=e26]: study
    - generic [ref=e27]:
      - link "تسجيل الدخول" [ref=e28] [cursor=pointer]:
        - /url: /account.html
      - generic [ref=e29]:
        - button "AR" [pressed] [ref=e30] [cursor=pointer]
        - button "EN" [ref=e31] [cursor=pointer]
      - button "تبديل المظهر" [ref=e32] [cursor=pointer]:
        - img [ref=e33]
      - button "مشاركة رابط الغرفة" [ref=e35] [cursor=pointer]:
        - img [ref=e36]
  - generic [ref=e39]:
    - button "انسخ رمز الغرفة" [ref=e40] [cursor=pointer]:
      - generic [ref=e41]: الغرفة
      - strong [ref=e42]: "---"
    - generic [ref=e43]:
      - generic [ref=e44]: الوسائط
      - strong [ref=e45]: غرفة مذاكرة
    - generic [ref=e46]:
      - generic [ref=e47]: المتصلون
      - strong [ref=e48]: "0"
    - generic [ref=e49]: في انتظار دخول بقية المجموعة...
  - main [ref=e50]:
    - group [ref=e51]:
      - generic "الأعضاء واللوحة المشتركة" [ref=e52] [cursor=pointer]
      - generic [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]: أعضاء الغرفة
            - generic [ref=e57]: (0)
          - generic [ref=e59]: في انتظار دخول بقية المجموعة...
        - generic [ref=e60]:
          - generic [ref=e61]: حالتي
          - generic [ref=e62]:
            - button "استراحة طعام" [ref=e63] [cursor=pointer]:
              - img [ref=e64]
              - generic [ref=e66]: استراحة طعام
            - button "مبتعد" [ref=e67] [cursor=pointer]:
              - img [ref=e68]
              - generic [ref=e70]: مبتعد
            - button "أذاكر" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - generic [ref=e74]: أذاكر
            - button "أعمل" [ref=e75] [cursor=pointer]:
              - img [ref=e76]
              - generic [ref=e79]: أعمل
          - textbox "حالة مخصصة..." [ref=e80]
          - generic [ref=e81]:
            - generic [ref=e82] [cursor=pointer]:
              - checkbox "مزامنة مع المؤقّت" [ref=e83]
              - generic [ref=e84]: مزامنة مع المؤقّت
            - generic [ref=e85] [cursor=pointer]:
              - checkbox "مشاركة الحالة مع الغرفة" [checked] [ref=e86]
              - generic [ref=e87]: مشاركة الحالة مع الغرفة
        - generic [ref=e89]:
          - generic [ref=e90]: هدف الغرفة
          - textbox "هدف الغرفة" [disabled] [ref=e91]:
            - /placeholder: على ماذا سيركز الجميع؟
        - generic [ref=e92]:
          - generic [ref=e93]: اللوحة المشتركة
          - generic [ref=e94]: 0/0
        - generic [ref=e95]:
          - textbox "أضف مهمة مشتركة..." [disabled] [ref=e96]
          - button "أضف مهمة مشتركة" [disabled] [ref=e97]: +
        - generic [ref=e98]:
          - button "أولوية عالية" [disabled] [ref=e99]
          - button "أولوية متوسطة" [disabled] [ref=e101]
          - button "أولوية منخفضة" [disabled] [ref=e103]
        - status [ref=e105]
        - generic [ref=e107]: ستظهر المهام المشتركة هنا.
    - generic [ref=e108]:
      - paragraph [ref=e109]: الكاميرا اختيارية. عند تشغيلها يشاهدها أعضاء غرفتك، وتقدر توقفها في أي وقت.
      - generic [ref=e110]:
        - generic:
          - generic: الكاميرا مغلقة · ذاكر على راحتك
        - generic [ref=e112]:
          - button "تشغيل الكاميرا" [ref=e113] [cursor=pointer]
          - 'button "التمويه: مفعّل" [pressed] [ref=e114] [cursor=pointer]'
      - generic [ref=e115]:
        - heading "مساحتك للتركيز" [level=1] [ref=e116]
        - status [ref=e117]: بانتظار الاتصال بالغرفة.
        - generic [ref=e118]:
          - generic [ref=e119]: هدف الجلسة
          - textbox "هدف الجلسة" [ref=e120]:
            - /placeholder: على ماذا تعمل؟
        - generic [ref=e121]:
          - button "جاهز للتركيز" [ref=e122] [cursor=pointer]
          - generic [ref=e123]: تظهر حالتك للغرفة فقط عند تفعيل المشاركة.
        - generic [ref=e124]:
          - generic [ref=e125] [cursor=pointer]: وضع التركيز
          - generic [ref=e126] [cursor=pointer]: وضع الاستراحة
        - generic [ref=e127]:
          - generic [ref=e128]: 25:00
          - generic [ref=e129]:
            - generic [ref=e130]:
              - generic [ref=e131]: مؤقّت هذا الجهاز
              - strong [ref=e132]: ٠ دقيقة
            - button "مسح" [ref=e133] [cursor=pointer]
        - generic [ref=e134]:
          - button "أعد ضبط المؤقت" [ref=e135] [cursor=pointer]: ↻
          - button "ابدأ التركيز" [ref=e136] [cursor=pointer]: ▶
        - generic [ref=e137]:
          - generic [ref=e138]:
            - generic [ref=e139]: تركيز
            - text: ":"
            - spinbutton "تركيز" [ref=e140]: "25"
            - generic [ref=e141]: د
          - generic [ref=e143]:
            - generic [ref=e144]: استراحة
            - text: ":"
            - spinbutton "استراحة" [ref=e145]: "5"
            - generic [ref=e146]: د
        - group "Timer presets" [ref=e147]:
          - button "25 دقيقة تركيز / 5 دقائق استراحة" [ref=e148] [cursor=pointer]: 25/5
          - button "50 دقيقة تركيز / 10 دقائق استراحة" [ref=e149] [cursor=pointer]: 50/10
          - button "90 دقيقة تركيز / 15 دقيقة استراحة" [ref=e150] [cursor=pointer]: 90/15
        - status [ref=e152]: وقت المؤقّت على هذا الجهاز فقط. الحساب يحفظ الجلسات الموثّقة.
    - group [ref=e153]:
      - generic "غرفة الدردشة" [ref=e154] [cursor=pointer]
      - generic [ref=e155]:
        - generic [ref=e156]:
          - log "Room chat" [ref=e157]:
            - generic [ref=e158]: ستظهر الرسائل هنا
          - generic [ref=e159]:
            - textbox "اكتب رسالة..." [disabled] [ref=e160]
            - button "أرسل الرسالة" [disabled] [ref=e161]: ➤
        - button "الصوت المحيط" [ref=e163] [cursor=pointer]:
          - generic [ref=e164]: الصوت المحيط
          - generic [ref=e165]: ⌄
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('stalled room lookup releases Join with a useful error and preserves the draft', async ({ page }) => {
  4  |     await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
  5  |     await page.goto('/open#join');
  6  |     await page.route('**/api/rooms/ABC123', () => {});
  7  |     await page.fill('#join-code', 'ABC123');
  8  |     await page.fill('#join-password', 'keep-my-draft');
  9  |     await page.click('#join-form button[type="submit"]');
  10 |     await expect(page.locator('#join-form button[type="submit"]')).toBeDisabled();
  11 |     await expect(page.locator('#join-form button[type="submit"]')).toBeEnabled({ timeout: 18000 });
  12 |     await expect(page.locator('#join-feedback')).toHaveClass(/error/);
  13 |     await expect(page.locator('#join-code')).toHaveValue('ABC123');
  14 |     await expect(page.locator('#join-password')).toHaveValue('keep-my-draft');
  15 |     await page.unroute('**/api/rooms/ABC123');
  16 |     await page.click('#join-form button[type="submit"]');
  17 |     await expect(page.locator('#join-feedback')).toContainText('not found');
  18 | });
  19 | 
  20 | test('stalled room runtime configuration settles and releases RTC readiness', async ({ page }) => {
  21 |     await page.route('**/api/runtime-config', () => {});
  22 |     await page.goto('/study');
  23 |     const config = await page.evaluate(async () => {
  24 |         let timer;
  25 |         try {
  26 |             return await Promise.race([
  27 |                 (/** @type {any} */ (window)).ensureRtcConfigurationReady(),
  28 |                 new Promise((resolve) => { timer = setTimeout(() => resolve(null), 18000); })
  29 |             ]);
  30 |         } finally { clearTimeout(timer); }
  31 |     });
> 32 |     expect(config).toHaveProperty('iceServers');
     |                    ^ Error: expect(received).toHaveProperty(path)
  33 |     await page.unroute('**/api/runtime-config');
  34 |     expect(await page.evaluate(() => (/** @type {any} */ (window)).loadRtcConfiguration())).toHaveProperty('iceServers');
  35 | });
  36 | 
```