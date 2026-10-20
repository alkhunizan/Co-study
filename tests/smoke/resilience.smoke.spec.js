const { test, expect } = require('@playwright/test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test.beforeEach(async ({ context, page }) => {
    await context.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname;
        return ['127.0.0.1', 'localhost'].includes(host) ? route.continue() : route.abort();
    });
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
});

test('identity outages and malformed responses show retry instead of guest forms', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 503, json: { errorCode: 'SERVICE_UNAVAILABLE' } }));
    await page.goto('/account');
    await expect(page.locator('#session-unavailable')).toContainText('Data is unavailable');
    await expect(page.locator('#auth-view')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#lang-ar').click();
    await expect(page.locator('#session-unavailable button')).toHaveText('إعادة المحاولة');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('mobile-ar-auth-unavailable.png'), fullPage: true });
    await page.locator('#lang-en').click();
    await page.unroute('**/api/auth/me');
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: {} }));
    await page.locator('#session-unavailable button').click();
    await expect(page.locator('#session-unavailable')).toBeVisible();
    await expect(page.locator('#auth-view')).toBeHidden();
    await page.unroute('**/api/auth/me');
    await page.locator('#session-unavailable button').click();
    await expect(page.locator('#auth-view')).toBeVisible();
    expect(errors).toEqual([]);
});

test('account read failures stay unavailable until a successful independent retry', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: {
        user: { id: 'read-test', displayName: 'Reader', avatarColor: 'amber', bio: '', authProvider: 'password' }
    } }));
    await page.route('**/api/me/stats', (route) => route.fulfill({ status: 503, json: { errorCode: 'SERVICE_UNAVAILABLE' } }));
    await page.route('**/api/me/rooms', (route) => route.fulfill({ status: 503, json: { errorCode: 'SERVICE_UNAVAILABLE' } }));
    await page.goto('/account');
    await expect(page.locator('#stats-unavailable')).toBeVisible();
    await expect(page.locator('#rooms-unavailable')).toBeVisible();
    await expect(page.locator('#stat-hours')).toHaveText('—');
    await expect(page.locator('#rooms-list')).toBeEmpty();
    await page.unroute('**/api/me/stats');
    await page.route('**/api/me/stats', (route) => route.fulfill({ json: {
        focusStats: { totalFocusMinutes: 120, totalSessions: 4, days: {} }, streak: { current: 2, best: 3 }
    } }));
    await page.locator('#stats-unavailable button').click();
    await expect(page.locator('#stats-unavailable')).toBeHidden();
    await expect(page.locator('#stat-hours')).not.toHaveText('—');
    await expect(page.locator('#rooms-unavailable')).toBeVisible();
    await page.unroute('**/api/me/rooms');
    await page.route('**/api/me/rooms', (route) => route.fulfill({ json: { rooms: [] } }));
    await page.locator('#rooms-unavailable button').click();
    await expect(page.locator('#rooms-unavailable')).toBeHidden();
    await expect(page.locator('#rooms-empty')).toBeVisible();
});

test('a stalled request times out and an older auth failure cannot evict a newer session', async ({ page }) => {
    await page.goto('/account');
    await page.clock.install();
    await page.route('**/stall-test', () => {});
    const request = page.evaluate(() => (/** @type {any} */ (window)).HalaCore.requestJson('GET', '/stall-test')
        .then(() => 'unexpected', () => 'rejected'));
    await page.clock.fastForward(16000);
    expect(await request).toBe('rejected');
    const result = await page.evaluate(async () => {
        const original = window.fetch;
        const auth = (/** @type {any} */ (window)).HalaAuth;
        let rejectFirst = (_error) => {};
        let calls = 0;
        window.fetch = () => {
            calls++;
            if (calls === 1) return new Promise((_resolve, reject) => { rejectFirst = reject; });
            return Promise.resolve(new Response(JSON.stringify({ user: { id: 'new', displayName: 'New session' } }), {
                headers: { 'Content-Type': 'application/json' }
            }));
        };
        try {
            const old = auth.refreshUser().catch(() => null);
            await auth.refreshUser();
            rejectFirst(new Error('stale request'));
            await old;
            const current = await auth.getUser();
            return { id: current.id, calls };
        } finally { window.fetch = original; }
    });
    expect(result).toEqual({ id: 'new', calls: 2 });
});

test('circle selection and destructive action targets remain consistent under reordered responses', async ({ page, context }) => {
    test.setTimeout(120000);
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh' } });
    try {
        const owner = await signupUser(server, { email: 'circle-race@example.invalid', displayName: 'Owner' });
        const api = (path, body) => server.request(`/api/platform${path}`, {
            method: 'POST', headers: { Cookie: owner.cookie }, body
        });
        const checkout = (await api('/billing/checkout', {})).body;
        await api(`/billing/checkout/${checkout.id}/complete`, { token: checkout.token, outcome: 'success' });
        const a = (await api('/cohorts', { name: 'Circle A' })).body;
        const b = (await api('/cohorts', { name: 'Circle B' })).body;
        await context.addCookies(owner.cookie.split(';').map((part) => {
            const [name, ...value] = part.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }));
        await page.goto(`${server.baseUrl}/app#circles`);
        await page.locator('#circle-list .row').filter({ hasText: 'Circle A' }).getByRole('button').click();
        await expect(page.locator('#circle-title')).toHaveText('Circle A');
        const pending = [];
        await page.route(`**/cohorts/${b.id}/*`, (route) => { pending.push(route); });
        await page.locator('#circle-list .row').filter({ hasText: 'Circle B' }).getByRole('button').click();
        await expect(page.locator('#circle-detail')).toBeHidden();
        await expect.poll(() => pending.length).toBe(2);
        await page.locator('#circle-list .row').filter({ hasText: 'Circle A' }).getByRole('button').click();
        await expect(page.locator('#circle-title')).toHaveText('Circle A');
        await Promise.all(pending.map((route) => route.continue()));
        await page.unroute(`**/cohorts/${b.id}/*`);
        await expect(page.locator('#circle-title')).toHaveText('Circle A');
        page.once('dialog', (dialog) => dialog.accept());
        const mutation = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/archive'));
        await page.locator('#circle-exit').click();
        expect((await mutation).url()).toContain(`/cohorts/${a.id}/archive`);
        await expect(page.locator('#circle-list')).toContainText('Circle B');
        await expect(page.locator('#circle-list')).not.toContainText('Circle A');
    } finally { await server.stop(); }
});
