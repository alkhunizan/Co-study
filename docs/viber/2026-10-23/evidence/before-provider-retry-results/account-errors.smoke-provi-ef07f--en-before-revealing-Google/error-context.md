# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: account-errors.smoke.spec.js >> provider discovery failures can be retried in en before revealing Google
- Location: tests\smoke\account-errors.smoke.spec.js:4:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#provider-unavailable [data-core-unavailable=retry]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#provider-unavailable [data-core-unavailable=retry]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - button "EN" [pressed] [ref=e10] [cursor=pointer]
        - button "ع" [ref=e11] [cursor=pointer]
      - button "Toggle theme" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
  - main [ref=e15]:
    - generic [ref=e16]:
      - tablist "Sign in or sign up" [ref=e17]:
        - tab "Sign in" [selected] [ref=e18] [cursor=pointer]
        - tab "New account" [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - heading "Welcome back" [level=3] [ref=e21]
        - generic [ref=e22]:
          - generic [ref=e23]: Email
          - textbox "Email" [ref=e24]:
            - /placeholder: you@example.com
        - generic [ref=e25]:
          - generic [ref=e26]: Password
          - textbox "Password" [ref=e27]
        - button "Sign in" [ref=e29] [cursor=pointer]
        - paragraph [ref=e30]
        - link "Forgot your password?" [ref=e31] [cursor=pointer]:
          - /url: /recover
  - contentinfo [ref=e32]:
    - generic [ref=e33]: Halastudy · Online focus rooms for studying and working — study or work live, with serious people.
    - generic [ref=e34]:
      - link "Halastudy home" [ref=e35] [cursor=pointer]:
        - /url: /
        - generic [ref=e36]: ←
        - text: Halastudy
      - link "Privacy" [ref=e37] [cursor=pointer]:
        - /url: /privacy
      - link "Terms" [ref=e38] [cursor=pointer]:
        - /url: /terms
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | for (const lang of ['ar', 'en']) {
  4  |     test(`provider discovery failures can be retried in ${lang} before revealing Google`, async ({ page }) => {
  5  |         await page.addInitScript((language) => localStorage.setItem('halastudyLang', language), lang);
  6  |         let unavailable = true;
  7  |         await page.route('**/api/runtime-config', (route) => route.fulfill({
  8  |             status: unavailable ? 503 : 200, contentType: 'application/json',
  9  |             body: JSON.stringify(unavailable ? { errorCode: 'SERVICE_UNAVAILABLE' } : { googleAuthEnabled: true })
  10 |         }));
  11 |         await page.goto('/account');
  12 |         const retry = page.locator('#provider-unavailable [data-core-unavailable=retry]');
> 13 |         await expect(retry).toBeVisible();
     |                             ^ Error: expect(locator).toBeVisible() failed
  14 |         await expect(page.locator('[data-google-auth]')).toBeHidden();
  15 |         unavailable = false;
  16 |         await retry.click();
  17 |         await expect(page.locator('[data-google-auth]')).toBeVisible();
  18 |         await expect(page.locator('#provider-unavailable')).toBeHidden();
  19 |     });
  20 | 
  21 |     test(`account errors are useful in ${lang} and keep signup details for retry`, async ({ page }) => {
  22 |         await page.addInitScript((language) => localStorage.setItem('halastudyLang', language), lang);
  23 |         let code = 'PERSISTENCE_UNAVAILABLE';
  24 |         await page.route('**/api/auth/signup', (route) =>
  25 |             route.fulfill({
  26 |                 status: 503,
  27 |                 contentType: 'application/json',
  28 |                 body: JSON.stringify({ errorCode: code }),
  29 |             }),
  30 |         );
  31 |         await page.goto('/account');
  32 |         await page.click('#tab-signup');
  33 |         await page.fill('#signup-nickname', 'Synthetic learner');
  34 |         await page.fill('#signup-email', 'retry@example.invalid');
  35 |         await page.fill('#signup-password', 'fixture-password-123');
  36 |         const submit = page.locator('#signup-form button[type="submit"]');
  37 |         await submit.click();
  38 |         await expect(page.locator('#signup-feedback')).toHaveText(
  39 |             lang === 'en'
  40 |                 ? 'Your changes could not be saved. Try again shortly.'
  41 |                 : 'تعذّر حفظ التغييرات. حاول مرة أخرى بعد قليل.',
  42 |         );
  43 |         await expect(page.locator('#signup-email')).toHaveValue('retry@example.invalid');
  44 |         code = 'UNRECOGNIZED_FAILURE';
  45 |         await submit.click();
  46 |         await expect(page.locator('#signup-feedback')).toHaveText(
  47 |             lang === 'en' ? 'Connection hiccup. Try again.' : 'النت تعثّر. جرّب مرة ثانية.',
  48 |         );
  49 |         await expect(page.locator('#signup-password')).toHaveValue('fixture-password-123');
  50 |     });
  51 | }
  52 | 
```