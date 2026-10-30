const crypto = require('node:crypto');
const path = require('node:path');
const { test, expect, gotoTestPage, createTestContext, waitForTestUrl } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { sandboxEnv } = require('../helpers/digetpay-fixture');

test('DigetPay sandbox checkout is bilingual, returns to verification, and never shows the simulator', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const directory = path.resolve('docs/payments/2026-10-20-digetpay/evidence');
    const server = await startServer({
        roomStateFile: path.join(directory, 'smoke-rooms.json'),
        userStateFile: path.join(directory, 'smoke-users.json'),
        env: { ...sandboxEnv, PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' }
    });
    const context = await createTestContext(browser, { viewport: { width: 900, height: 1000 } });
    const errors = [];
    try {
        const alice = await signupUser(server);
        await context.addCookies(alice.cookie.split(';').map((part) => {
            const [name, ...value] = part.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }));
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
        const orderId = crypto.randomUUID();
        const sessionId = crypto.randomUUID();
        let created = false;
        let verified = false;
        let checkoutBody = {};
        const order = () => ({ id: orderId, provider: 'digetpay', mode: 'test', status: verified ? 'completed' : 'pending' });
        // UI-only fixture: no server or browser request reaches DigetPay.
        await page.route('**/api/platform/billing/checkout', async (route) => {
            checkoutBody = route.request().postDataJSON();
            created = true;
            await route.fulfill({ json: { ...order(), redirectUrl: `https://pay-staging.digetpay.com/pay/checkout?sessionId=${sessionId}` } });
        });
        await page.route('https://pay-staging.digetpay.com/**', (route) => route.fulfill({
            contentType: 'text/html',
            body: `<html><head><title>Test fixture</title></head><body><a href="${server.baseUrl}/plans?checkout=${orderId}">Return to Halastudy</a></body></html>`
        }));
        await page.route('**/api/platform/billing/latest', (route) => route.fulfill({ json: { order: created ? order() : null } }));
        await page.route('**/api/platform/billing/checkout/*/verify', (route) => route.fulfill({ json: order() }));
        await gotoTestPage(page, `${server.baseUrl}/plans`);
        await expect(page.locator('#test-notice')).toContainText('DigetPay sandbox');
        await page.locator('#checkout-start').click();
        await expect(page.locator('#test-checkout')).toBeHidden();
        await expect(page.locator('#digetpay-checkout')).toBeVisible();
        for (const [name, width, language, dark] of [
            ['desktop-en-checkout', 900, 'en', false],
            ['mobile-ar-checkout', 390, 'ar', false],
            ['mobile-en-checkout-dark', 390, 'en', true]
        ]) {
            await page.setViewportSize({ width: Number(width), height: 1000 });
            await page.locator(`[data-lang-value="${language}"]`).click();
            if (dark) await page.locator('#theme-toggle').click();
            await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            expect(accessibility.violations.map((item) => item.id)).toEqual([]);
            await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        }
        await page.locator('#digetpay-checkout input').fill('0501234567');
        await page.locator('#digetpay-checkout button').click();
        await waitForTestUrl(page, 'https://pay-staging.digetpay.com/**');
        expect(checkoutBody).toEqual({ phone: '0501234567' });
        await page.getByText('Return to Halastudy').click();
        await expect(page.locator('#payment-result-text')).toContainText('not verified yet');
        verified = true;
        await page.locator('#payment-verify').click();
        await expect(page.locator('#payment-result-text')).toContainText('Test payment verified');
        await expect(page.locator('#test-checkout')).toBeHidden();
        expect(errors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('unconfigured DigetPay keeps checkout disabled', async ({ browser }) => {
    // A fresh directory: a leftover runtime lock from an interrupted run must not block the server.
    const directory = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'halastudy-digetpay-disabled-'));
    const server = await startServer({
        roomStateFile: path.join(directory, 'disabled-rooms.json'),
        userStateFile: path.join(directory, 'disabled-users.json'),
        env: { PLATFORM_ENABLED: 'true', BILLING_PROVIDER: 'digetpay', DIGETPAY_API_KEY: '', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' }
    });
    const context = await createTestContext(browser);
    try {
        const alice = await signupUser(server);
        await context.addCookies(alice.cookie.split(';').map((part) => {
            const [name, ...value] = part.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }));
        const page = await context.newPage();
        await gotoTestPage(page, `${server.baseUrl}/plans`);
        await expect(page.locator('#checkout-start')).toBeDisabled();
        await expect(page.locator('#digetpay-checkout')).toBeHidden();
        const denied = await server.request('/api/platform/billing/checkout', {
            method: 'POST', headers: { Cookie: alice.cookie }, body: { phone: '0501234567', amount: 0.01, currency: 'SAR' }
        });
        expect(denied.status).toBe(503);
        const forged = await server.request('/api/platform/billing/digetpay/webhook', {
            method: 'POST', body: { orderId: crypto.randomUUID(), transactionId: crypto.randomUUID(), status: 'Approved' }
        });
        expect(forged.status).toBe(503);
    } finally { await context.close(); await server.stop(); }
});
