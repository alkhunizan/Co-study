const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
let server;
let ip = 150;
test.use({ actionTimeout: 15000 });
test.beforeAll(async () => { server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', BILLING_PROVIDER: 'simulator', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true', TRUST_PROXY: '1' } }); });
test.afterAll(async () => { await server.stop(); });
test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${ip++}` });
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
});
async function signIn(page) {
    const account = await signupUser(server, { displayName: 'Returning student' });
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('='); return { name, value: value.join('='), url: server.baseUrl };
    }));
    return account;
}
test('return dashboard: four destinations, one-tap recent room, safe guest and empty states', async ({ page }, info) => {
    await signIn(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoTestPage(page, `${server.baseUrl}/open`);
    await page.locator('#room-name').fill('Return to quiet study');
    await page.locator('#create-form button[type=submit]').click();
    await expect(page.locator('#create-result')).toBeVisible();
    await gotoTestPage(page, `${server.baseUrl}/app`);
    await expect(page.locator('#return-room')).toContainText('Return to quiet study');
    await expect(page.locator('#next-session')).toContainText('No upcoming');
    for (const language of ['en', 'ar']) {
        await page.locator(`[data-lang-value=${language}]`).click();
        const links = page.locator('.platform-nav a');
        await expect(links).toHaveCount(4);
        for (const link of await links.all()) {
            const rect = await link.boundingBox(); expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(390); expect(rect.height).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await page.screenshot({ path: info.outputPath(`return-${language}-mobile.png`), fullPage: true });
    }
    await page.locator('#return-room a').click();
    await expect(page).toHaveURL(/\/study\?room=/);
    await gotoTestPage(page, `${server.baseUrl}/app#account`);
    await expect(page.locator('[data-panel=account]')).toBeVisible();
    await expect(page.locator('#staff-nav')).toBeHidden();
    await page.locator('[data-view=security]').click();
    await expect(page.locator('[data-panel=security]')).toBeVisible();
    await page.context().clearCookies();
    await page.reload();
    await expect(page.locator('#guest')).toBeVisible();
    await expect(page.locator('[data-panel=home]')).toBeHidden();
    expect((await page.request.get(`${server.baseUrl}/api/platform/dashboard`)).status()).toBe(401);
});
test('focus recap: exact server credit, short sessions, repeat completion and reload', async ({ page }, info) => {
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/app#progress`);
    await page.locator('#focus-start').click();
    await expect(page.locator('#focus-finish')).toBeVisible();
    await page.route('**/api/platform/focus/*/complete', (route) => route.abort('failed'));
    await page.locator('#focus-finish').click();
    await expect(page.locator('#feedback')).toContainText('Completion could not be confirmed');
    await expect(page.locator('#focus-recap')).toBeHidden();
    await expect(page.locator('#focus-finish')).toBeVisible();
    await page.unroute('**/api/platform/focus/*/complete');
    await page.locator('#focus-finish').click();
    await expect(page.locator('#focus-recap')).toBeVisible();
    await expect(page.locator('#recap-values')).toContainText('Credited minutes: 0');
    await expect(page.locator('#recap-values')).toContainText('Focus points: 0');
    await expect(page.locator('#recap-note')).toContainText('Saved to your account. Less than one');
    await expect(page.locator('#recap-next')).toBeVisible();
    const before = await page.request.get(`${server.baseUrl}/api/platform/progress`);
    const saved = await before.json();
    await page.reload();
    const after = await (await page.request.get(`${server.baseUrl}/api/platform/progress`)).json();
    expect(after.sessions.length).toBe(saved.sessions.length); expect(after.totals.xp).toBe(saved.totals.xp);
    // A server-response fixture isolates presentation from the existing credit engine.
    await page.route('**/api/platform/focus/*/complete', (route) => route.fulfill({ json: { id: 'fixture', state: 'completed', started_at: 100000, completed_at: 1900000, credited_ms: 1500000, xp: 25 } }));
    await page.locator('#focus-start').click(); await page.locator('#focus-finish').click();
    await expect(page.locator('#recap-values')).toContainText('Elapsed time: 30:00');
    await expect(page.locator('#recap-values')).toContainText('Credited minutes: 25');
    await expect(page.locator('#recap-values')).toContainText('Focus points: 25');
    await page.screenshot({ path: info.outputPath('focus-recap-en.png'), fullPage: true });
    await page.locator('[data-lang-value=ar]').click();
    await expect(page.locator('#recap-note')).toContainText('حُفظت');
});
test('local counters: explicit consent, actual joins/focus once, revoke and unavailable storage', async ({ page }) => {
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/app#account`);
    await expect(page.locator('#insights-consent')).not.toBeChecked();
    await page.locator('#insights-consent').check();
    await gotoTestPage(page, `${server.baseUrl}/en`);
    await page.locator('.hero-actions .btn-primary').click();
    await page.locator('#room-name').fill('Private counters');
    await page.locator('#create-form button[type=submit]').click();
    await page.locator('#btn-enter-room').click();
    await page.locator('#join-name').fill('Guest label never recorded');
    await page.locator('#join-form button[type=submit]').click();
    await expect(page.locator('#chat-input')).toBeEnabled();
    await gotoTestPage(page, `${server.baseUrl}/app#progress`);
    await page.locator('#focus-start').click(); await page.locator('#focus-finish').click();
    await expect(page.locator('#focus-recap')).toBeVisible();
    const counters = await page.evaluate(() => (/** @type {any} */ (window)).HalaInsights.summary());
    expect(counters['entry:create']).toBe(1);
    expect(Object.entries(counters).filter(([key]) => key.startsWith('join:success')).reduce((sum, [, value]) => sum + Number(value), 0)).toBe(1);
    expect(counters['focus:start:workspace:none']).toBe(1);
    expect(Object.entries(counters).filter(([key]) => key.startsWith('focus:complete:workspace:')).reduce((sum, [, value]) => sum + Number(value), 0)).toBe(1);
    expect(counters['return:sameDay']).toBe(1);
    expect(JSON.stringify(counters)).not.toContain('Guest label');
    await page.reload();
    expect(await page.evaluate(() => (/** @type {any} */ (window)).HalaInsights.summary())).toEqual(counters);
    await page.locator('.platform-nav [data-view=account]').click();
    await page.locator('#insights-reset').click();
    expect(await page.evaluate(() => localStorage.getItem('halastudyUx:v1'))).toBeNull();
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    await gotoTestPage(page, `${server.baseUrl}/app#progress`);
    await page.locator('#focus-start').click(); await expect(page.locator('#focus-finish')).toBeVisible();
});
test('schedule timezone: device inputs round-trip the same authoritative instant across DST', async ({ page, browser }) => {
    test.setTimeout(90000);
    const reference = Date.now();
    const today = new Date(reference);
    const day = 86400000;
    const first = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 2, 30);
    const zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' });
    const offset = (timestamp) => zone.formatToParts(new Date(timestamp)).find((part) => part.type === 'timeZoneName').value;
    let instants = [];
    // Choose a future DST transition while retaining the real scheduling guard.
    for (let days = 0; days < 364; days++) {
        const before = first + days * day, after = before + day;
        if (offset(before) !== offset(after)) {
            instants = [new Date(before).toISOString(), new Date(after).toISOString()];
            break;
        }
    }
    expect(instants).toHaveLength(2);
    expect(Date.parse(instants[0])).toBeGreaterThan(reference);
    expect(Date.parse(instants[1])).toBeLessThan(reference + 366 * day);
    expect(offset(Date.parse(instants[0]))).not.toBe(offset(Date.parse(instants[1])));
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/open`);
    await page.locator('#room-name').fill('Timezone study');
    await page.locator('#create-form button[type=submit]').click();
    await expect(page.locator('#create-result')).toBeVisible();
    const roomId = (await page.locator('#result-code').textContent()).trim();
    const circle = await page.evaluate(async () => {
        const core = (/** @type {any} */ (window)).HalaCore;
        const checkout = await core.postJson('/api/platform/billing/checkout', {});
        await core.postJson(`/api/platform/billing/checkout/${checkout.id}/complete`, { token: checkout.token, outcome: 'success' });
        return core.postJson('/api/platform/cohorts', { name: 'Timezone circle' });
    });
    const cookies = await page.context().cookies();
    for (const timeZone of ['Asia/Riyadh', 'Europe/London']) {
        const context = await createTestContext(browser, { timezoneId: timeZone });
        try {
            await context.addCookies(cookies);
            await context.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
            const organizer = await context.newPage();
            await gotoTestPage(organizer, `${server.baseUrl}/app#circles`);
            await organizer.locator('#circle-list button').click();
            await expect(organizer.locator('#schedule-zone')).toHaveText(timeZone);
            for (const instant of instants) {
                const localValue = await organizer.evaluate((value) => {
                    const d = new Date(value); const pad = (n) => String(n).padStart(2, '0');
                    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }, instant);
                const title = `${timeZone} ${instant}`;
                await organizer.locator('#session-create [name=title]').fill(title);
                await organizer.locator('#session-room').selectOption(roomId);
                await organizer.locator('#session-create [name=startsAt]').fill(localValue);
                const invalid = await organizer.locator('#session-create').evaluate((form) => [...form.querySelectorAll('input,select')].filter((input) => !(/** @type {HTMLInputElement} */ (input)).checkValidity()).map((input) => ({ name: input.getAttribute('name'), value: (/** @type {HTMLInputElement} */ (input)).value, reason: (/** @type {HTMLInputElement} */ (input)).validationMessage })));
                expect(invalid).toEqual([]);
                await organizer.locator('#session-create button').click();
                await expect(organizer.locator('#circle-sessions')).toContainText(title);
                const sessions = await (await organizer.request.get(`${server.baseUrl}/api/platform/cohorts/${circle.id}/sessions`)).json();
                expect(Number(sessions.sessions.find((entry) => entry.title === title).starts_at)).toBe(Date.parse(instant));
                await expect(organizer.locator('#circle-sessions')).toContainText(timeZone);
            }
        } finally { await context.close(); }
    }
});
test('shared shell: localized legal sections, primary target sizes and accessibility', async ({ page }, info) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const language of ['ar', 'en']) for (const name of ['privacy', 'terms']) {
        await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en/' : ''}${name}`);
        await expect(page.locator(`main section[lang=${language}] h1`)).toHaveCount(1);
        await expect(page.locator(`main section[lang=${language}]`)).toBeVisible();
        // Both languages ship in the page, one section each.
        await expect(page.locator(`main section[lang=${language === 'ar' ? 'en' : 'ar'}]`)).toHaveCount(1);
        for (const target of await page.locator('.topbar a, .topbar button, footer a').all()) {
            const box = await target.boundingBox();
            if (box) expect(box.height).toBeGreaterThanOrEqual(44); // hidden controls (desktop nav on phones) have no box
        }
        const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(scan.violations.filter((item) => ['critical', 'serious'].includes(item.impact) || item.id === 'target-size')).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await page.screenshot({ path: info.outputPath(`${language}-${name}.png`), fullPage: true });
        if (await page.locator('#nav-burger').isVisible()) await page.locator('#nav-burger').click();
        // The chosen theme persists across pages, so each click flips it.
        const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.locator('#theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', themeBefore === 'dark' ? 'light' : 'dark');
        // Colour transitions (180 ms) would otherwise be sampled mid-way by axe.
        await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
        const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(dark.violations.filter((item) => ['critical', 'serious'].includes(item.impact))).toEqual([]);
    }
});
test('workspace accessibility: returning-user views in both languages, themes and three widths', async ({ page }, info) => {
    test.setTimeout(180000);
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/app#progress`);
    await page.locator('#focus-start').click(); await page.locator('#focus-finish').click();
    await expect(page.locator('#focus-recap')).toBeVisible();
    const results = [];
    for (const width of [390, 844, 1440]) for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator(`[data-lang-value=${language}]`).click();
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
        for (const view of ['home', 'progress', 'circles', 'account']) {
            await page.locator(`.platform-nav [data-view=${view}]`).click();
            await expect(page.locator(`[data-panel=${view}]`)).toBeVisible();
            expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${view} ${width} overflow`).toBe(true);
            const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
            const violations = scan.violations.filter((item) => ['critical', 'serious'].includes(item.impact) || item.id === 'target-size');
            results.push({ width, language, theme, view, violations });
            expect.soft(violations, `${view} ${language} ${theme} ${width}`).toEqual([]);
            if ((language === 'ar' && theme === 'light') || (language === 'en' && theme === 'dark')) await page.screenshot({ path: info.outputPath(`${view}-${language}-${theme}-${width}.png`), fullPage: true });
        }
    }
    await info.attach('workspace-accessibility.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});
test('online fonts diagnostic and real-font layout stability', async ({ page }, info) => {
    test.skip(process.env.CO_STUDY_OFFLINE === '1', 'This diagnostic needs external font GETs.');
    test.setTimeout(90000);
    // Synthetic anti-rate-limit headers are local-only; never send them to font hosts.
    await page.setExtraHTTPHeaders({});
    const messages = []; const requests = [];
    page.on('console', (message) => { if (/font|Content Security Policy|violat/i.test(message.text())) messages.push(message.text()); });
    page.on('requestfailed', (request) => { if (/fonts\./.test(request.url())) requests.push({ url: request.url(), error: request.failure()?.errorText }); });
    await page.addInitScript(() => {
        const scope = /** @type {any} */ (window); scope.metrics = { cls: 0, lcp: 0 };
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!(/** @type {any} */ (entry)).hadRecentInput) scope.metrics.cls += (/** @type {any} */ (entry)).value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) scope.metrics.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const measurements = [];
    for (const language of ['ar', 'en']) for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 664 : 900 });
        await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
        await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(10000);
        const measurement = await page.evaluate(() => ({ language: document.documentElement.lang, width: innerWidth, ...(/** @type {any} */ (window)).metrics, fonts: [...document.fonts].map((font) => ({ family: font.family, status: font.status })) }));
        measurements.push(measurement);
        expect.soft(measurement.cls).toBeLessThanOrEqual(0.1);
        expect.soft(measurement.lcp).toBeGreaterThan(0);
        expect.soft(measurement.lcp).toBeLessThanOrEqual(2500);
        expect(measurement.fonts.filter((font) => font.status === 'error')).toEqual([]);
        if (width === 390) {
            await expect(page.locator('.nav-links')).toBeHidden();
            expect((await page.locator('.hero-actions .btn-primary').boundingBox()).y + (await page.locator('.hero-actions .btn-primary').boundingBox()).height).toBeLessThanOrEqual(664);
        }
        await page.screenshot({ path: info.outputPath(`online-fonts-${language}-${width}.png`), fullPage: false });
    }
    for (const route of ['/open', '/study', '/en/privacy']) {
        await gotoTestPage(page, server.baseUrl + route); await page.evaluate(() => document.fonts.ready);
    }
    await info.attach('online-fonts.json', { body: JSON.stringify({ messages, requests, measurements }, null, 2), contentType: 'application/json' });
    expect(messages).toEqual([]);
    expect(requests).toEqual([]);
});
