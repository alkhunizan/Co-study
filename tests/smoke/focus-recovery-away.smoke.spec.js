const { test, expect, gotoTestPage, waitForTestUrl } = require('../helpers/playwright-test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

let server;
test.beforeEach(async () => {
    server = await startServer({ env: {
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true',
    } });
});
test.afterEach(async () => { await server?.stop(); });

async function enterRoom(page, language, theme = 'light') {
    const account = await signupUser(server, { displayName: 'Focus student' });
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await page.addInitScript(({ lang, color }) => {
        localStorage.setItem('halastudyLang', lang);
        localStorage.setItem('halastudyTheme', color);
        const devices = Object.create(navigator.mediaDevices || {});
        devices.getUserMedia = async () => { throw new DOMException('Fixture camera denied', 'NotAllowedError'); };
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices });
    }, { lang: language, color: theme });
    await gotoTestPage(page, `${server.baseUrl}/open`);
    await page.locator('#room-name').fill('Quiet recovery room');
    await page.locator('#create-form button[type=submit]').click();
    await expect(page.locator('#create-result')).toBeVisible();
    await page.locator('#btn-enter-room').click();
    await waitForTestUrl(page, /\/index\.html\?room=/);
    await page.waitForLoadState('load');
    if (await page.locator('#join-overlay').isVisible()) {
        await page.locator('#join-name').fill(account.user.displayName);
        await page.locator('#join-form button[type=submit]').click();
    }
    await expect(page.locator('#join-overlay')).toBeHidden();
    await expect(page.locator('#room-progress-link')).toBeVisible();
    await expect(page.locator('#room-focus-retry')).toBeHidden();
    return account;
}

test('a background refresh does not dismiss an unapplied pause; Retry leaves a newer session alone', async ({ page }) => {
    const account = await enterRoom(page, 'en');
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    const id = (await progress(account)).current.id;
    await page.route('**/api/platform/focus/*/pause', (route) => route.fulfill({
        status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' },
    }));
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    await page.evaluate(() => (/** @type {any} */ (window)).HalaFocus.reconcile());
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    await page.unroute('**/api/platform/focus/*/pause');
    const finished = await server.request(`/api/platform/focus/${id}/complete`, {
        method: 'POST', headers: { Cookie: account.cookie }, body: {},
    });
    expect(finished.status).toBe(200);
    const newer = await server.request('/api/platform/focus/start', {
        method: 'POST', headers: { Cookie: account.cookie }, body: {},
    });
    expect(newer.status).toBe(200);
    expect(newer.body.id).not.toBe(id);
    await page.locator('#room-focus-retry').click();
    await expect(page.locator('#room-focus-retry')).toBeHidden();
    expect((await progress(account)).current.id).toBe(newer.body.id);
    expect((await progress(account)).current.state).toBe('active');
});

async function progress(account) {
    const response = await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } });
    expect(response.status).toBe(200);
    return response.body;
}

for (const { language, width, theme } of [
    { language: 'en', width: 1440, theme: 'light' },
    { language: 'ar', width: 390, theme: 'light' },
    { language: 'en', width: 390, theme: 'dark' },
    { language: 'ar', width: 1440, theme: 'dark' },
]) {
    test(`room Retry reapplies failed start and pause (${language}, ${width}px)`, async ({ page }, info) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 960 });
        const account = await enterRoom(page, language, theme);
        await page.route('**/api/platform/focus/start', (route) => route.fulfill({
            status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' },
        }));
        await page.locator('#btn-toggle').click();
        await expect(page.locator('#room-focus-retry')).toBeVisible();
        expect((await progress(account)).current).toBeNull();
        await page.locator('.room-credit').scrollIntoViewIfNeeded();
        expect((await page.locator('#room-focus-retry').boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: info.outputPath(`start-failed-${language}-${width}.png`), fullPage: true });
        await page.unroute('**/api/platform/focus/start');
        await page.locator('#room-focus-retry').focus();
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await progress(account)).current?.state).toBe('active');
        await expect(page.locator('#room-focus-retry')).toBeHidden();
        const sessionId = (await progress(account)).current.id;
        await page.route('**/api/platform/focus/*/pause', (route) => route.fulfill({
            status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' },
        }));
        await page.locator('#btn-toggle').click();
        await expect(page.locator('#room-focus-retry')).toBeVisible();
        expect((await progress(account)).current.state).toBe('active');
        await page.unroute('**/api/platform/focus/*/pause');
        await page.locator('#room-focus-retry').click();
        await expect.poll(async () => (await progress(account)).current?.state).toBe('paused');
        expect((await progress(account)).current.id).toBe(sessionId);
        await expect(page.locator('#room-focus-retry')).toBeHidden();
        await expect(page.locator('#room-focus-message')).toContainText(language === 'ar' ? 'متوقفة مؤقت' : 'Session paused');
        await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.locator('.room-credit').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`pause-recovered-${language}-${width}.png`), fullPage: true });
        expect(errors).toEqual([]);
    });
}

test('room completion retries a lost response without duplicating a saved session', async ({ page }, info) => {
    const account = await enterRoom(page, 'en');
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    const id = (await progress(account)).current.id;
    await page.route('**/api/platform/focus/*/complete', async (route) => {
        await route.fetch();
        await route.abort('failed');
    }, { times: 1 });
    await page.locator('#room-focus-finish').click();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    await page.locator('#room-focus-retry').click();
    await expect(page.locator('#room-session-recap')).toBeVisible();
    await expect(page.locator('#room-recap-values')).toContainText('Session saved');
    const saved = await progress(account);
    expect(saved.current).toBeNull();
    expect(saved.sessions.map((session) => session.id)).toEqual([id]);
    expect(saved.sessions[0].state).toBe('completed');
    expect(saved.totals.xp).toBe(0);
    await page.screenshot({ path: info.outputPath('completion-recovered.png'), fullPage: true });
});

test('room Retry after a saved completion and failed summary only refreshes the saved result', async ({ page }) => {
    const account = await enterRoom(page, 'en');
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    let completions = 0;
    await page.route('**/api/platform/focus/*/complete', async (route) => {
        completions++;
        await route.continue();
    });
    await page.route('**/api/platform/progress', (route) => route.fulfill({
        status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' },
    }));
    await page.locator('#room-focus-finish').click();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    await expect(page.locator('#room-session-recap')).toBeVisible();
    expect((await progress(account)).sessions[0].state).toBe('completed');
    await page.unroute('**/api/platform/progress');
    await page.locator('#room-focus-retry').click();
    await expect(page.locator('#room-focus-retry')).toBeHidden();
    expect(completions).toBe(1);
    expect((await progress(account)).sessions).toHaveLength(1);
});

test('a pause queued behind a delayed first start retries the session that its request actually targeted', async ({ page }) => {
    const account = await enterRoom(page, 'en');
    /** @type {() => void} */
    let releaseStart;
    /** @type {() => void} */
    let markStart;
    const startGate = new Promise((resolve) => { releaseStart = () => resolve(undefined); });
    const startRequested = new Promise((resolve) => { markStart = () => resolve(undefined); });
    await page.route('**/api/platform/focus/start', async (route) => {
        markStart();
        await startGate;
        await route.continue();
    }, { times: 1 });
    await page.route('**/api/platform/focus/*/pause', (route) => route.fulfill({
        status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' },
    }));
    await page.locator('#btn-toggle').click();
    await startRequested;
    await page.locator('#btn-toggle').click();
    releaseStart();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    const started = (await progress(account)).current;
    expect(started.state).toBe('active');
    await page.unroute('**/api/platform/focus/*/pause');
    await page.locator('#room-focus-retry').click();
    await expect.poll(async () => (await progress(account)).current?.state).toBe('paused');
    expect((await progress(account)).current.id).toBe(started.id);
    await expect(page.locator('#room-focus-retry')).toBeHidden();
});
