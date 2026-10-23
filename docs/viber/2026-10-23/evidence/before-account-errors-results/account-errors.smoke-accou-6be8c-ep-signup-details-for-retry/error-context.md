# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: account-errors.smoke.spec.js >> account errors are useful in ar and keep signup details for retry
- Location: tests\smoke\account-errors.smoke.spec.js:4:5

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#signup-feedback')
Expected: "تعذّر حفظ التغييرات. حاول مرة أخرى بعد قليل."
Received: "errPERSISTENCE_UNAVAILABLE"
Timeout:  10000ms

Call log:
  - Expect "toHaveText" with timeout 10000ms
  - waiting for locator('#signup-feedback')
    13 × locator resolved to <p id="signup-feedback" class="form-feedback error">errPERSISTENCE_UNAVAILABLE</p>
       - unexpected value "errPERSISTENCE_UNAVAILABLE"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - link "Halastudy home" [ref=e3] [cursor=pointer]:
      - /url: /
      - generic [ref=e4]:
        - text: Hala
        - emphasis [ref=e5]: study
        - text: .
      - generic [ref=e7]: هلا
    - generic [ref=e8]:
      - group "Language" [ref=e9]:
        - button "EN" [ref=e10] [cursor=pointer]
        - button "ع" [pressed] [ref=e11] [cursor=pointer]
      - button "Toggle theme" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
  - main [ref=e15]:
    - generic [ref=e16]:
      - tablist "Sign in or sign up" [ref=e17]:
        - tab "دخول" [ref=e18] [cursor=pointer]
        - tab "حساب جديد" [selected] [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - heading "احجز مقعدك" [level=3] [ref=e21]
        - generic [ref=e22]:
          - generic [ref=e23]: اسمك في الغرفة
          - textbox "اسمك في الغرفة" [ref=e24]: Synthetic learner
        - generic [ref=e25]:
          - generic [ref=e26]: البريد الإلكتروني
          - textbox "البريد الإلكتروني" [ref=e27]:
            - /placeholder: you@example.com
            - text: retry@example.invalid
        - generic [ref=e28]:
          - generic [ref=e29]: كلمة المرور
          - textbox "كلمة المرور" [ref=e30]: fixture-password-123
        - paragraph [ref=e31]: لا حاجة لتأكيد البريد — تدخل مباشرة.
        - button "أنشئ الحساب" [active] [ref=e33] [cursor=pointer]
        - paragraph [ref=e34]: errPERSISTENCE_UNAVAILABLE
  - contentinfo [ref=e35]:
    - generic [ref=e36]: هلاستدي · غرف تركيز أونلاين للمذاكرة والعمل — ذاكر أو اشتغل لايف مع ناس جادّين.
    - generic [ref=e37]:
      - link "Halastudy home" [ref=e38] [cursor=pointer]:
        - /url: /
        - generic [ref=e39]: ←
        - text: Halastudy
      - link "الخصوصية" [ref=e40] [cursor=pointer]:
        - /url: /privacy
      - link "الشروط" [ref=e41] [cursor=pointer]:
        - /url: /terms
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | for (const lang of ['ar', 'en']) {
  4  |     test(`account errors are useful in ${lang} and keep signup details for retry`, async ({ page }) => {
  5  |         await page.addInitScript((language) => localStorage.setItem('halastudyLang', language), lang);
  6  |         let code = 'PERSISTENCE_UNAVAILABLE';
  7  |         await page.route('**/api/auth/signup', (route) => route.fulfill({
  8  |             status: 503, contentType: 'application/json', body: JSON.stringify({ errorCode: code })
  9  |         }));
  10 |         await page.goto('/account');
  11 |         await page.click('#tab-signup');
  12 |         await page.fill('#signup-nickname', 'Synthetic learner');
  13 |         await page.fill('#signup-email', 'retry@example.invalid');
  14 |         await page.fill('#signup-password', 'fixture-password-123');
  15 |         const submit = page.locator('#signup-form button[type="submit"]');
  16 |         await submit.click();
> 17 |         await expect(page.locator('#signup-feedback')).toHaveText(lang === 'en'
     |                                                        ^ Error: expect(locator).toHaveText(expected) failed
  18 |             ? 'Your changes could not be saved. Try again shortly.'
  19 |             : 'تعذّر حفظ التغييرات. حاول مرة أخرى بعد قليل.');
  20 |         await expect(page.locator('#signup-email')).toHaveValue('retry@example.invalid');
  21 |         code = 'UNRECOGNIZED_FAILURE';
  22 |         await submit.click();
  23 |         await expect(page.locator('#signup-feedback')).toHaveText(lang === 'en'
  24 |             ? 'Connection hiccup. Try again.' : 'مشكلة في الاتصال. جرّب مرة ثانية.');
  25 |         await expect(page.locator('#signup-password')).toHaveValue('fixture-password-123');
  26 |     });
  27 | }
  28 | 
```