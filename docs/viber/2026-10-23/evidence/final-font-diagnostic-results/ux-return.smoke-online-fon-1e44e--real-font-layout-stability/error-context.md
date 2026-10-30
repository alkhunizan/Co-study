# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ux-return.smoke.spec.js >> online fonts diagnostic and real-font layout stability
- Location: tests\smoke\ux-return.smoke.spec.js:204:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 34

- Array []
+ Array [
+   Object {
+     "family": "JetBrains Mono",
+     "status": "error",
+   },
+   Object {
+     "family": "JetBrains Mono",
+     "status": "error",
+   },
+   Object {
+     "family": "Tajawal",
+     "status": "error",
+   },
+   Object {
+     "family": "Tajawal",
+     "status": "error",
+   },
+   Object {
+     "family": "JetBrains Mono",
+     "status": "error",
+   },
+   Object {
+     "family": "JetBrains Mono",
+     "status": "error",
+   },
+   Object {
+     "family": "Tajawal",
+     "status": "error",
+   },
+   Object {
+     "family": "Tajawal",
+     "status": "error",
+   },
+ ]
```

# Test source

```ts
  127 |         const core = (/** @type {any} */ (window)).HalaCore;
  128 |         const checkout = await core.postJson('/api/platform/billing/checkout', {});
  129 |         await core.postJson(`/api/platform/billing/checkout/${checkout.id}/complete`, { token: checkout.token, outcome: 'success' });
  130 |         return core.postJson('/api/platform/cohorts', { name: 'Timezone circle' });
  131 |     });
  132 |     const cookies = await page.context().cookies();
  133 |     for (const timeZone of ['Asia/Riyadh', 'Europe/London']) {
  134 |         const context = await browser.newContext({ timezoneId: timeZone });
  135 |         try {
  136 |             await context.addCookies(cookies);
  137 |             await context.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
  138 |             const organizer = await context.newPage();
  139 |             await organizer.goto(`${server.baseUrl}/app#circles`);
  140 |             await organizer.locator('#circle-list button').click();
  141 |             await expect(organizer.locator('#schedule-zone')).toHaveText(timeZone);
  142 |             for (const instant of ['2026-10-24T02:30:00Z', '2026-10-25T02:30:00Z']) {
  143 |                 const localValue = await organizer.evaluate((value) => {
  144 |                     const d = new Date(value); const pad = (n) => String(n).padStart(2, '0');
  145 |                     return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  146 |                 }, instant);
  147 |                 const title = `${timeZone} ${instant}`;
  148 |                 await organizer.locator('#session-create [name=title]').fill(title);
  149 |                 await organizer.locator('#session-room').selectOption(roomId);
  150 |                 await organizer.locator('#session-create [name=startsAt]').fill(localValue);
  151 |                 const invalid = await organizer.locator('#session-create').evaluate((form) => [...form.querySelectorAll('input,select')].filter((input) => !(/** @type {HTMLInputElement} */ (input)).checkValidity()).map((input) => ({ name: input.getAttribute('name'), value: (/** @type {HTMLInputElement} */ (input)).value, reason: (/** @type {HTMLInputElement} */ (input)).validationMessage })));
  152 |                 expect(invalid).toEqual([]);
  153 |                 await organizer.locator('#session-create button').click();
  154 |                 await expect(organizer.locator('#circle-sessions')).toContainText(title);
  155 |                 const sessions = await (await organizer.request.get(`${server.baseUrl}/api/platform/cohorts/${circle.id}/sessions`)).json();
  156 |                 expect(Number(sessions.sessions.find((entry) => entry.title === title).starts_at)).toBe(Date.parse(instant));
  157 |                 await expect(organizer.locator('#circle-sessions')).toContainText(timeZone);
  158 |             }
  159 |         } finally { await context.close(); }
  160 |     }
  161 | });
  162 | test('shared shell: localized legal sections, primary target sizes and accessibility', async ({ page }, info) => {
  163 |     test.setTimeout(90000);
  164 |     await page.setViewportSize({ width: 390, height: 844 });
  165 |     for (const language of ['ar', 'en']) for (const name of ['privacy', 'terms']) {
  166 |         await page.goto(`${server.baseUrl}/${language === 'en' ? 'en/' : ''}${name}`);
  167 |         await expect(page.locator('main h1')).toHaveCount(1);
  168 |         await expect(page.locator(`main section[lang=${language}]`)).toBeVisible();
  169 |         await expect(page.locator(`main section[lang=${language === 'ar' ? 'en' : 'ar'}]`)).toHaveCount(0);
  170 |         for (const target of await page.locator('.topbar a, .topbar button, footer a').all()) expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44);
  171 |         const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  172 |         expect(scan.violations.filter((item) => ['critical', 'serious'].includes(item.impact) || item.id === 'target-size')).toEqual([]);
  173 |         expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  174 |         await page.screenshot({ path: info.outputPath(`${language}-${name}.png`), fullPage: true });
  175 |         await page.locator('#theme-toggle').click();
  176 |         const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  177 |         expect(dark.violations.filter((item) => ['critical', 'serious'].includes(item.impact))).toEqual([]);
  178 |     }
  179 | });
  180 | test('workspace accessibility: returning-user views in both languages, themes and three widths', async ({ page }, info) => {
  181 |     test.setTimeout(180000);
  182 |     await signIn(page);
  183 |     await page.goto(`${server.baseUrl}/app#progress`);
  184 |     await page.locator('#focus-start').click(); await page.locator('#focus-finish').click();
  185 |     await expect(page.locator('#focus-recap')).toBeVisible();
  186 |     const results = [];
  187 |     for (const width of [390, 844, 1440]) for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
  188 |         await page.setViewportSize({ width, height: 900 });
  189 |         await page.locator(`[data-lang-value=${language}]`).click();
  190 |         if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
  191 |         for (const view of ['home', 'progress', 'circles', 'account']) {
  192 |             await page.locator(`.platform-nav [data-view=${view}]`).click();
  193 |             await expect(page.locator(`[data-panel=${view}]`)).toBeVisible();
  194 |             expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} ${width} overflow`).toBe(true);
  195 |             const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  196 |             const violations = scan.violations.filter((item) => ['critical', 'serious'].includes(item.impact) || item.id === 'target-size');
  197 |             results.push({ width, language, theme, view, violations });
  198 |             expect.soft(violations, `${view} ${language} ${theme} ${width}`).toEqual([]);
  199 |             if ((language === 'ar' && theme === 'light') || (language === 'en' && theme === 'dark')) await page.screenshot({ path: info.outputPath(`${view}-${language}-${theme}-${width}.png`), fullPage: true });
  200 |         }
  201 |     }
  202 |     await info.attach('workspace-accessibility.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  203 | });
  204 | test('online fonts diagnostic and real-font layout stability', async ({ page }, info) => {
  205 |     test.skip(process.env.CO_STUDY_OFFLINE === '1', 'This diagnostic needs external font GETs.');
  206 |     test.setTimeout(90000);
  207 |     // Synthetic anti-rate-limit headers are local-only; never send them to font hosts.
  208 |     await page.setExtraHTTPHeaders({});
  209 |     const messages = []; const requests = [];
  210 |     page.on('console', (message) => { if (/font|Content Security Policy|violat/i.test(message.text())) messages.push(message.text()); });
  211 |     page.on('requestfailed', (request) => { if (/fonts\./.test(request.url())) requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  212 |     await page.addInitScript(() => {
  213 |         const scope = /** @type {any} */ (window); scope.metrics = { cls: 0, lcp: 0 };
  214 |         new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!(/** @type {any} */ (entry)).hadRecentInput) scope.metrics.cls += (/** @type {any} */ (entry)).value; }).observe({ type: 'layout-shift', buffered: true });
  215 |         new PerformanceObserver((list) => { for (const entry of list.getEntries()) scope.metrics.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  216 |     });
  217 |     const measurements = [];
  218 |     for (const language of ['ar', 'en']) for (const width of [390, 1440]) {
  219 |         await page.setViewportSize({ width, height: width === 390 ? 664 : 900 });
  220 |         await page.goto(`${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
  221 |         await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(10000);
  222 |         const measurement = await page.evaluate(() => ({ language: document.documentElement.lang, width: innerWidth, ...(/** @type {any} */ (window)).metrics, fonts: [...document.fonts].map((font) => ({ family: font.family, status: font.status })) }));
  223 |         measurements.push(measurement);
  224 |         expect.soft(measurement.cls).toBeLessThanOrEqual(0.1);
  225 |         expect.soft(measurement.lcp).toBeGreaterThan(0);
  226 |         expect.soft(measurement.lcp).toBeLessThanOrEqual(2500);
> 227 |         expect(measurement.fonts.filter((font) => font.status === 'error')).toEqual([]);
      |                                                                             ^ Error: expect(received).toEqual(expected) // deep equality
  228 |         if (width === 390) {
  229 |             await expect(page.locator('.nav-links')).toBeHidden();
  230 |             expect((await page.locator('.hero-actions .btn-primary').boundingBox()).y + (await page.locator('.hero-actions .btn-primary').boundingBox()).height).toBeLessThanOrEqual(664);
  231 |         }
  232 |         await page.screenshot({ path: info.outputPath(`online-fonts-${language}-${width}.png`), fullPage: false });
  233 |     }
  234 |     for (const route of ['/open', '/study', '/en/privacy']) {
  235 |         await page.goto(server.baseUrl + route); await page.evaluate(() => document.fonts.ready);
  236 |     }
  237 |     await info.attach('online-fonts.json', { body: JSON.stringify({ messages, requests, measurements }, null, 2), contentType: 'application/json' });
  238 |     expect(messages).toEqual([]);
  239 |     expect(requests).toEqual([]);
  240 | });
  241 | 
```