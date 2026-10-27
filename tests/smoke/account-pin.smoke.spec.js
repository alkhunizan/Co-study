const { test, expect } = require('@playwright/test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test('an old page cannot start focus for a different cookie account', async ({ page }) => {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', BILLING_MODE: 'test' } });
    try {
        const alice = await signupUser(server, { displayName: 'AliceLocal' });
        const bob = await signupUser(server, { displayName: 'BobLocal' });
        await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
        await page.request.post(`${server.baseUrl}/api/auth/login`, { data: alice.credentials });
        await page.goto(`${server.baseUrl}/app#progress`);
        await expect(page.locator('#greeting')).toContainText('AliceLocal');
        await page.request.post(`${server.baseUrl}/api/auth/login`, { data: bob.credentials });
        const [denied] = await Promise.all([
            page.waitForResponse((response) => response.url().endsWith('/api/platform/focus/start')),
            page.click('#focus-start')
        ]);
        expect(denied.status()).toBe(401);
        expect((await denied.json()).errorCode).toBe('AUTH_ACCOUNT_CHANGED');
        expect(denied.request().headers()['x-halastudy-account']).toBe(alice.user.id);
        expect((await (await page.request.get(`${server.baseUrl}/api/platform/progress`)).json()).current).toBeNull();
        await expect(page.locator('#feedback')).toBeVisible();
        await page.reload();
        await expect(page.locator('#greeting')).toContainText('BobLocal');
        const [started] = await Promise.all([
            page.waitForResponse((response) => response.url().endsWith('/api/platform/focus/start')),
            page.click('#focus-start')
        ]);
        expect(started.status()).toBe(200);
        expect(started.request().headers()['x-halastudy-account']).toBe(bob.user.id);
        const session = await started.json();
        expect((await server.request(`/api/platform/focus/${session.id}/pause`, { method: 'POST', headers: { Cookie: alice.cookie }, body: {} })).status).toBe(404);
    } finally { await server.stop(); }
});
