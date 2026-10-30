const { test, expect, gotoTestPage, waitForTestUrl } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('node:path');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

let server;
let client = 70;
test.use({ actionTimeout: 15000 });
test.beforeAll(async () => {
    const directory = path.resolve('docs/implementation/2026-10-20-deep-ux/evidence/state');
    require('node:fs').mkdirSync(directory, { recursive: true });
    server = await startServer({
        roomStateFile: path.join(directory, 'rooms.json'), userStateFile: path.join(directory, 'users.json'),
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', BILLING_PROVIDER: 'digetpay', DIGETPAY_API_KEY: '', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true', TRUST_PROXY: '1', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }
    });
});
test.afterAll(async () => { if (server) await server.stop(); });
test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${client++}` });
    await page.addInitScript(() => {
        if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en');
        const devices = Object.create(navigator.mediaDevices || {});
        devices.getUserMedia = async () => { throw new DOMException('Audit camera denied', 'NotAllowedError'); };
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
    });
});
async function signIn(page) {
    const account = await signupUser(server, { displayName: 'UX student' });
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    return account;
}
async function joinRoom(page) {
    await gotoTestPage(page, `${server.baseUrl}/open`);
    await page.locator('#room-name').fill('UX focus room');
    await page.locator('#create-form button[type=submit]').click();
    await expect(page.locator('#create-result')).toBeVisible();
    await page.locator('#btn-enter-room').click();
    await page.waitForLoadState('load');
    if (await page.locator('#join-overlay').isVisible()) {
        await page.locator('#join-name').fill('UX guest');
        await page.locator('#join-form button[type=submit]').click();
    }
    await expect(page.locator('#join-overlay')).toBeHidden();
    await expect(page.locator('#chat-input')).toBeEnabled();
}

test('join promise: correct invitation wording and deep-link handoff', async ({ page }) => {
    for (const [language, label] of [['ar', 'شوف اللوبي'], ['en', 'Visit the lobby']]) {
        await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language); // canonical route follows the saved language
        await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
        const join = page.locator('.hero-actions .btn-secondary');
        await expect(join).toHaveText(label);
        await join.click();
        // The secondary call to action opens the shared Lobby.
        await expect(page).toHaveURL(/\/lobby$/);
    }
    await gotoTestPage(page, `${server.baseUrl}/open?room=ABC123`);
    await expect(page.locator('#join-code')).toHaveValue('ABC123');
});

test('join focus: closed dialog is absent from focus and keyboard paths', async ({ page }) => {
    await joinRoom(page);
    await expect(page.locator('#btn-toggle')).toBeFocused();
    for (const language of ['ar', 'en']) {
        await page.locator(`[data-lang-value=${language}]`).filter({ visible: true }).click();
        await expect(page.locator('#btn-toggle')).toHaveAttribute('aria-label', language === 'ar' ? 'ابدأ التركيز' : 'Start focus');
    }
    await page.locator('#join-name').evaluate((element) => element.focus());
    await expect(page.locator('#join-name')).not.toBeFocused();
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('#join-overlay'))).toBe(false);
    }
    expect(await page.locator('#join-overlay').ariaSnapshot()).toBe('');
    await gotoTestPage(page, `${server.baseUrl}/study?room=ZZZZZZ`);
    await expect(page.locator('#join-overlay')).toBeVisible();
    await page.locator('#join-name').fill('Retry guest');
    await page.locator('#join-form button[type=submit]').click();
    await expect(page.locator('#join-error')).not.toBeEmpty();
    await expect(page.locator('#join-name')).toBeFocused();
});

test('feedback scope: invitation errors translate and clear when leaving', async ({ page }) => {
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/app#circles`);
    await page.locator('#invite-token').fill('UX-INVALID');
    await page.locator('#invite-accept button').click();
    await expect(page.locator('#feedback')).toContainText('invalid or expired');
    await page.locator('[data-lang-value=ar]').click();
    await expect(page.locator('#feedback')).toContainText('الدعوة غير صالحة');
    await page.locator('.platform-nav [data-view=account]').click();
    await page.locator('[data-view=vip]').click();
    await expect(page.locator('#feedback')).toBeHidden();
    await expect(page.locator('#checkout-start')).toBeDisabled();
    await expect(page.locator('#test-notice')).toContainText('DigetPay');
});

test('workspace history: Back and Forward restore visited sections', async ({ page }) => {
    await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/account`);
    await page.locator('a[href="/app"]').click();
    await page.locator('[data-view=progress]').click();
    await page.locator('[data-view=circles]').click();
    await page.goBack();
    await expect(page.locator('[data-panel=progress]')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-panel=home]')).toBeVisible();
    await page.goForward();
    await expect(page.locator('[data-panel=progress]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-panel=progress]')).toBeVisible();
});

test('accessible controls: key entry and room states in both languages and themes', async ({ page }, testInfo) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const language of ['ar', 'en']) {
        for (const theme of ['light', 'dark']) {
            for (const route of [language === 'en' ? '/en' : '/', '/open', '/account', '/blog/best-online-group-study-rooms-saudi']) {
                console.log(`Accessibility review: ${language} ${theme} ${route}`);
                await gotoTestPage(page, `${server.baseUrl}${route}`);
                await page.evaluate(({ language, theme }) => { localStorage.setItem('halastudyLang', language); localStorage.setItem('halastudyTheme', theme); }, { language, theme });
                await page.reload();
                await expect(page.locator('html')).toHaveAttribute('lang', route.startsWith('/blog/') ? 'ar' : language);
                if (route === '/open' && await page.locator('#room-options').count()) await page.locator('#room-options').evaluate((element) => { /** @type {HTMLDetailsElement} */ (element).open = true; });
                const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
                expect.soft(scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })), `${language} ${theme} ${route}`).toEqual([]);
            }
            await joinRoom(page);
            await page.locator(`[data-lang-value=${language}]`).filter({ visible: true }).click();
            await expect(page.locator('#btn-toggle')).toHaveAttribute('aria-label', language === 'ar' ? 'ابدأ التركيز' : 'Start focus');
            await page.locator('main > details.room-tools').evaluateAll((panels) => panels.forEach((panel) => { /** @type {HTMLDetailsElement} */ (panel).open = true; }));
            const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
            expect.soft(scan.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })) })), `${language} ${theme} joined room`).toEqual([]);
            await page.screenshot({ path: testInfo.outputPath(`phase1-room-${language}-${theme}.png`), fullPage: true });
        }
    }
});

test('mobile first action: heading and study CTA fit the first screen', async ({ page }, testInfo) => {
    for (const language of ['ar', 'en']) {
        for (const height of [664, 844]) {
            await page.setViewportSize({ width: 390, height });
        await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language); // canonical route follows the saved language
            await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
            await expect(page.locator('.nav-links')).toBeHidden();
            for (const selector of ['h1', '.hero-actions .btn-primary']) {
                const box = await page.locator(selector).boundingBox();
                expect(box.y).toBeGreaterThanOrEqual(0);
                expect(box.y + box.height, `${language} ${height} ${selector}`).toBeLessThanOrEqual(height);
            }
            const cta = await page.locator('.hero-actions .btn-primary').boundingBox();
            expect(cta.height).toBeGreaterThanOrEqual(44);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`mobile-entry-${language}-${height}.png`) });
        }
    }
});

test('honest presence: illustrative scenes never present simulated attendance', async ({ page }) => {
    for (const language of ['ar', 'en']) {
        await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language); // canonical route follows the saved language
        await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
        await expect(page.locator('#live-count, #stat-live, .tile-chip .live-dot')).toHaveCount(0);
        await expect(page.locator('.study-tile--featured .tile-chip')).toHaveText(language === 'ar' ? 'معاينة الغرفة' : 'Room preview');
        expect((await page.request.get(page.url()).then((r) => r.text()))).not.toMatch(/tickLive|17264|17,264|>LIVE</);
    }
});

test('room shell: primary study controls stay visible and tools remain available', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await joinRoom(page);
    for (const selector of ['#btn-toggle', '#camera-toggle', '#room-pill']) {
        const box = await page.locator(selector).boundingBox();
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(900);
    }
    await page.screenshot({ path: testInfo.outputPath('room-desktop-en.png') });
    await page.locator('[data-lang-value=ar]').filter({ visible: true }).click();
    for (const width of [390, 844, 1440]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (width === 390) {
            await expect(page.locator('#shared-board-card')).toHaveJSProperty('open', false);
            const start = await page.locator('#btn-toggle').boundingBox();
            expect(start.y + start.height).toBeLessThanOrEqual(844);
            await expect(page.locator('#chat-input')).not.toBeFocused();
            await page.screenshot({ path: testInfo.outputPath('room-mobile-ar.png') });
            await page.locator('#shared-board-card > summary').click();
            await expect(page.locator('#new-task')).toBeVisible();
            await page.locator('#chat-room-card > summary').click();
            await expect(page.locator('#chat-input')).toBeVisible();
        }
    }
});

test('room draft: signup preserves choices, excludes passwords and expires safely', async ({ page }) => {
    test.setTimeout(90000);
    await gotoTestPage(page, `${server.baseUrl}/open`);
    await page.locator('#room-name').fill('My preserved room');
    await page.locator('#require-password').check();
    await page.locator('#room-password').fill('room-private-123');
    await page.locator('#enable-schedule').check();
    const draft = await page.evaluate(() => sessionStorage.getItem('halastudyRoomDraft:v1'));
    expect(draft).toContain('My preserved room');
    expect(draft).not.toContain('room-private-123');
    await page.locator('#schedule-gate-cta').click();
    await page.locator('#signup-nickname').fill('Draft student');
    await page.locator('#signup-email').fill(`draft-${Date.now()}@example.com`);
    await page.locator('#signup-password').fill('local-draft-account-123');
    await page.locator('#signup-form button[type=submit]').click();
    await waitForTestUrl(page, '**/open.html?schedule=1');
    await expect(page.locator('#room-name')).toHaveValue('My preserved room');
    await expect(page.locator('#require-password')).toBeChecked();
    await expect(page.locator('#room-password')).toHaveValue('');
    await expect(page.locator('#enable-schedule')).toBeChecked();
    await expect(page.locator('#draft-restored')).toBeVisible();
    await page.locator('#schedule-date').fill('2027-01-12');
    await page.locator('#schedule-time').fill('20:30');
    await page.locator('#schedule-cadence').selectOption('weekly');
    await page.locator('#schedule-focus').fill('50');
    await page.locator('#schedule-break').fill('10');
    await page.locator('#schedule-goal-template').fill('Review chapter four');
    await page.reload();
    for (const [id, value] of Object.entries({ 'room-name': 'My preserved room', 'schedule-date': '2027-01-12', 'schedule-time': '20:30', 'schedule-cadence': 'weekly', 'schedule-focus': '50', 'schedule-break': '10', 'schedule-goal-template': 'Review chapter four' })) {
        await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await page.locator('#enable-schedule').uncheck();
    await page.locator('#room-password').fill('room-private-123');
    await page.locator('#create-form button[type=submit]').click();
    await expect(page.locator('#create-result')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('halastudyRoomDraft:v1'))).toBeNull();
    await page.evaluate(() => sessionStorage.setItem('halastudyRoomDraft:v1', JSON.stringify({ version: 1, expiresAt: Date.now() - 1, values: { 'room-name': 'Expired room' } })));
    await page.reload();
    await expect(page.locator('#room-name')).toHaveValue('');
    expect(await page.evaluate(() => sessionStorage.getItem('halastudyRoomDraft:v1'))).toBeNull();
});

test('camera recovery: denied and missing devices have actionable bilingual guidance', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    await page.setViewportSize({ width: 390, height: 844 });
    await joinRoom(page);
    for (const kind of ['NotAllowedError', 'NotFoundError']) {
        await page.locator('[data-lang-value=en]').filter({ visible: true }).click();
        await page.evaluate((errorName) => {
            const scope = /** @type {any} */ (window);
            scope.cameraRequestCount = 0;
            navigator.mediaDevices.getUserMedia = async () => { scope.cameraRequestCount++; throw new DOMException('Synthetic camera failure', errorName); };
        }, kind);
        await page.locator('#camera-toggle').click();
        await expect(page.locator('#camera-help')).toBeVisible();
        await expect(page.locator('#camera-help-message')).toContainText(kind === 'NotAllowedError' ? 'browser site settings' : 'No camera was found');
        expect(await page.evaluate(() => (/** @type {any} */ (window)).cameraRequestCount)).toBe(1);
        await page.locator('#camera-retry').click();
        expect(await page.evaluate(() => (/** @type {any} */ (window)).cameraRequestCount)).toBe(2);
        await page.locator('[data-lang-value=ar]').filter({ visible: true }).click();
        await expect(page.locator('#camera-help-message')).toContainText(kind === 'NotAllowedError' ? 'إذن الكاميرا' : 'لم نعثر على كاميرا');
        await page.locator('#camera-continue').click();
        await expect(page.locator('#camera-help')).toBeHidden();
        await page.locator('#btn-toggle').click();
        await expect(page.locator('#btn-toggle')).toHaveAttribute('aria-label', 'أوقف التركيز مؤقتًا');
        await page.locator('#btn-toggle').click();
        expect(await page.evaluate(() => (/** @type {any} */ (window)).cameraRequestCount)).toBe(2);
    }
    expect(dialogs).toEqual([]);
});

test('stable hero: layout remains stable through ten seconds of idle', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
        const scope = /** @type {any} */ (window);
        scope.uxMetrics = { cls: 0, lcp: 0 };
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) { const shift = /** @type {any} */ (entry); if (!shift.hadRecentInput) scope.uxMetrics.cls += shift.value; } }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) scope.uxMetrics.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    const measurements = [];
    for (const language of ['ar', 'en']) {
        for (const reducedMotion of ['reduce', 'no-preference']) {
            await page.emulateMedia({ reducedMotion: /** @type {'reduce' | 'no-preference'} */ (reducedMotion) });
        await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language); // canonical route follows the saved language
            await gotoTestPage(page, `${server.baseUrl}/${language === 'en' ? 'en' : ''}`);
            await page.waitForTimeout(10000);
            const metrics = await page.evaluate(() => (/** @type {any} */ (window)).uxMetrics);
            measurements.push({ language, reducedMotion, ...metrics, environment: 'local unthrottled Chromium; external fonts blocked' });
            expect.soft(metrics.cls, `${language} ${reducedMotion} CLS`).toBeLessThanOrEqual(0.1);
            expect.soft(metrics.lcp, `${language} ${reducedMotion} LCP`).toBeGreaterThan(0);
            expect.soft(metrics.lcp, `${language} ${reducedMotion} LCP`).toBeLessThanOrEqual(2500);
        }
    }
    await testInfo.attach('lab-vitals.json', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
});
