# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: network-timeout.smoke.spec.js >> stalled room lookup releases Join with a useful error and preserves the draft
- Location: tests\smoke\network-timeout.smoke.spec.js:3:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#join-feedback')
Expected substring: "not found"
Received string:    "That room code does not exist."
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('#join-feedback')
    14 × locator resolved to <p id="join-feedback" class="form-feedback error">That room code does not exist.</p>
       - unexpected value "That room code does not exist."

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
      - link "Sign in" [ref=e9] [cursor=pointer]:
        - /url: /account.html
      - group "Language" [ref=e10]:
        - button "EN" [pressed] [ref=e11] [cursor=pointer]
        - button "ع" [ref=e12] [cursor=pointer]
      - button "Toggle theme" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
  - main [ref=e18]:
    - generic [ref=e19]:
      - heading "Choose your flow" [level=1] [ref=e20]
      - paragraph [ref=e21]: Open a new room or join one that’s already running.
      - generic [ref=e22]:
        - button "Open a room Set a name, optional password, optional schedule." [pressed] [ref=e23] [cursor=pointer]:
          - generic [ref=e24]: ✦
          - generic [ref=e25]:
            - heading "Open a room" [level=3] [ref=e26]
            - paragraph [ref=e27]: Set a name, optional password, optional schedule.
        - button "Join a room Got a code from your study group? Drop it in." [ref=e28] [cursor=pointer]:
          - generic [ref=e29]: ➤
          - generic [ref=e30]:
            - heading "Join a room" [level=3] [ref=e31]
            - paragraph [ref=e32]: Got a code from your study group? Drop it in.
    - generic [ref=e34]:
      - heading "Join a study room" [level=3] [ref=e35]
      - generic [ref=e36]:
        - generic [ref=e37]: Room code
        - textbox "Room code" [active] [ref=e38]:
          - /placeholder: ABC123
          - text: ABC123
      - generic [ref=e39]:
        - generic [ref=e40]: Room password (if needed)
        - textbox "Room password (if needed)" [ref=e41]:
          - /placeholder: Enter the password if the room is protected
          - text: keep-my-draft
      - paragraph [ref=e42]: You will be taken into the room next, where you can confirm your nickname.
      - button "Join room" [ref=e44] [cursor=pointer]
      - paragraph [ref=e45]: That room code does not exist.
  - contentinfo [ref=e46]:
    - generic [ref=e47]: هلاستدي · غرف تركيز أونلاين للمذاكرة والعمل — ذاكر أو اشتغل لايف مع ناس جادّين.
    - generic [ref=e48]:
      - link "Halastudy home" [ref=e49] [cursor=pointer]:
        - /url: /
        - generic [ref=e50]: ←
        - text: Halastudy
      - link "Privacy" [ref=e51] [cursor=pointer]:
        - /url: /privacy
      - link "Terms" [ref=e52] [cursor=pointer]:
        - /url: /terms
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
> 17 |     await expect(page.locator('#join-feedback')).toHaveText('That room code does not exist.');
     |                                                  ^ Error: expect(locator).toContainText(expected) failed
  18 | });
  19 | 
  20 | test('stalled room runtime configuration settles and releases RTC readiness', async ({ page }) => {
  21 |     await page.route('**/api/runtime-config', () => {});
  22 |     await page.goto('/study');
  23 |     const config = await page.evaluate(async () => {
  24 |         let timer;
  25 |         try {
  26 |             return await Promise.race([
  27 |                 /** @type {any} */ (window).ensureRtcConfigurationReady(),
  28 |                 new Promise((resolve) => {
  29 |                     timer = setTimeout(() => resolve(null), 18000);
  30 |                 }),
  31 |             ]);
  32 |         } finally {
  33 |             clearTimeout(timer);
  34 |         }
  35 |     });
  36 |     expect(config).toHaveProperty('iceServers');
  37 |     await page.unroute('**/api/runtime-config');
  38 |     expect(await page.evaluate(() => /** @type {any} */ (window).loadRtcConfiguration())).toHaveProperty('iceServers');
  39 | });
  40 | 
```