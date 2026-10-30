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

async function enterRoom(page, language = 'en', theme = 'light') {
    const account = await signupUser(server, { displayName: 'Completion student' });
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
    await page.locator('#room-name').fill('Quiet completion room');
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

async function progress(account) {
    const response = await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } });
    expect(response.status).toBe(200);
    return response.body;
}

async function loseCompletion(page, account) {
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    const id = (await progress(account)).current.id;
    await page.route('**/api/platform/focus/*/complete', async (route) => {
        await route.fetch();
        await route.abort('failed');
    }, { times: 1 });
    await page.locator('#room-focus-finish').click();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    expect(await page.evaluate(() => (/** @type {any} */ (window)).HalaFocus.hasPendingCompletion())).toBe(true);
    const saved = await progress(account);
    expect(saved.current).toBeNull();
    expect(saved.sessions.map((session) => session.id)).toEqual([id]);
    expect(saved.sessions[0].state).toBe('completed');
    return saved;
}

for (const { language, width, theme } of [
    { language: 'en', width: 1440, theme: 'light' },
    { language: 'ar', width: 390, theme: 'light' },
    { language: 'en', width: 390, theme: 'dark' },
    { language: 'ar', width: 1440, theme: 'dark' },
]) {
    test(`Finish targets the new session after a lost older completion (${language}, ${width}px)`, async ({ page }, info) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 960 });
        const account = await enterRoom(page, language, theme);
        const first = await loseCompletion(page, account);
        await page.locator('.room-credit').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`lost-response-${language}-${width}.png`), fullPage: true });
        const completions = [];
        await page.route('**/api/platform/focus/*/complete', async (route) => {
            completions.push(new URL(route.request().url()).pathname);
            await route.continue();
        });
        await page.locator('#btn-toggle').click();
        await expect(page.locator('#room-focus-retry')).toBeHidden();
        await expect.poll(async () => (await progress(account)).current?.state).toBe('active');
        const secondId = (await progress(account)).current.id;
        expect(secondId).not.toBe(first.sessions[0].id);
        await page.locator('#room-focus-finish').focus();
        expect((await page.locator('#room-focus-finish').boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(page.locator('#room-session-recap')).toBeVisible();
        await expect(page.locator('#room-focus-finish')).toBeEnabled();
        const final = await progress(account);
        await info.attach('server-state', { body: JSON.stringify({ first, final, completions, serverPid: server.pid }, null, 2), contentType: 'application/json' });
        await page.locator('.room-credit').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath(`finished-new-${language}-${width}.png`), fullPage: true });
        expect(final.current).toBeNull();
        expect(final.sessions.map((session) => session.id).sort()).toEqual([first.sessions[0].id, secondId].sort());
        expect(final.sessions.every((session) => session.state === 'completed')).toBe(true);
        expect(final.sessions.find((session) => session.id === first.sessions[0].id)).toEqual(first.sessions[0]);
        expect(final.totals.sessions).toBe(2);
        expect(final.totals.xp).toBe(first.totals.xp + Number(final.sessions.find((session) => session.id === secondId).xp));
        expect(completions).toEqual([`/api/platform/focus/${secondId}/complete`]);
        await expect(page.locator('#room-focus-finish')).toBeHidden();
        await expect(page.locator('#room-focus-retry')).toBeHidden();
        await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(errors).toEqual([]);
    });
}

for (const failedStart of [false, true]) {
    test(`old completion Retry stays idempotent${failedStart ? ' after a failed new Start' : ' without a new Start'}`, async ({ page }) => {
        const account = await enterRoom(page);
        const saved = await loseCompletion(page, account);
        if (failedStart) {
            await page.route('**/api/platform/focus/start', (route) => route.fulfill({ status: 503, json: { error: 'PERSISTENCE_UNAVAILABLE' } }));
            const rejected = page.waitForResponse((response) => response.url().endsWith('/api/platform/focus/start') && response.status() === 503);
            await page.locator('#btn-toggle').click();
            await rejected;
            await expect(page.locator('#room-focus-retry')).toBeVisible();
            expect(await page.evaluate(() => (/** @type {any} */ (window)).HalaFocus.hasPendingCompletion())).toBe(true);
            await page.unroute('**/api/platform/focus/start');
        }
        const completions = [];
        await page.route('**/api/platform/focus/*/complete', async (route) => {
            completions.push(new URL(route.request().url()).pathname);
            await route.continue();
        });
        await page.locator('#room-focus-retry').click();
        await expect(page.locator('#room-focus-retry')).toBeHidden();
        await expect(page.locator('#room-session-recap')).toBeVisible();
        const retried = await progress(account);
        expect(retried.current).toBeNull();
        expect(retried.sessions).toEqual(saved.sessions);
        expect(retried.totals).toEqual(saved.totals);
        expect(completions).toEqual([`/api/platform/focus/${saved.sessions[0].id}/complete`]);
    });
}
