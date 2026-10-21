const { test, expect } = require('@playwright/test');
const path = require('node:path');
const OTPAuth = require('otpauth');
const { startServer } = require('../helpers/server-control');
const { signupUser, extractCookies } = require('../helpers/auth-helpers');
const { sandboxEnv } = require('../helpers/digetpay-fixture');

test('payment review requires staff MFA, preserves billing-reader scope and shows verified outcomes', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const preload = path.resolve(__dirname, '../helpers/payment-review-preload.js').replace(/\\/g, '/');
    const server = await startServer({ env: {
        ...sandboxEnv, PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh',
        ADMIN_PATH: '/ops-payment-review-test',
        PAYMENT_REVIEW_FIXTURE: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require="${preload}"`,
        ADMIN_PASSWORD_HASH: '5368261dff0e47c096a7f53dd6b12e59:3e6d92f21a9166c11cb9a46d04ac8043e67428d5b6c776128ac3c3d88db36bd6489cd46455dbcd57bc997587da6b36750cb995ae720b59a97f296dad71635e29'
    } });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [];
    try {
        const owner = await signupUser(server);
        const reader = await signupUser(server);
        const request = (cookie, route, method = 'GET', body = undefined) => server.request(`/api/platform${route}`, { method, headers: { Cookie: cookie }, body });
        const checkout = await request(owner.cookie, '/billing/checkout', 'POST', { phone: '0501234567' });
        expect(checkout.status).toBe(200);
        const orderId = checkout.body.id;
        await request(owner.cookie, `/billing/checkout/${orderId}/verify`, 'POST', {});
        const route = `/staff/payment-orders/${orderId}/recheck`;
        const action = { reason: 'Investigate sandbox receipt', activateReview: false };
        expect((await request('', '/staff/payment-orders')).status).toBe(401);
        expect((await request(owner.cookie, route, 'POST', action)).status).toBe(403);
        const recovery = new Map();
        const verify = async (account) => {
            if (recovery.has(account.user.id)) {
                const renewed = await request(account.cookie, '/security/mfa/verify', 'POST', { code: recovery.get(account.user.id).shift() });
                expect(renewed.status).toBe(200);
                return `${account.cookie}; ${extractCookies(renewed.headers['set-cookie'])}`;
            }
            const enrollment = await request(account.cookie, '/security/mfa/enroll', 'POST', { password: account.credentials.password });
            expect(enrollment.status).toBe(200);
            const verified = await request(account.cookie, '/security/mfa/verify', 'POST', {
                code: new OTPAuth.TOTP({ secret: enrollment.body.secret }).generate(), activate: true
            });
            expect(verified.status).toBe(200);
            recovery.set(account.user.id, verified.body.recoveryCodes);
            return `${account.cookie}; ${extractCookies(verified.headers['set-cookie'])}`;
        };
        const ownerCookie = await verify(owner);
        expect((await request(ownerCookie, '/staff/bootstrap', 'POST', { password: 'smoke-admin-password' })).status).toBe(200);
        let readerCookie = await verify(reader);
        expect((await request(ownerCookie, '/staff/roles', 'POST', { userId: reader.user.id, role: 'billing_operator' })).status).toBe(200);
        expect((await request(readerCookie, '/staff/payment-orders')).status, 'role changes invalidate prior staff sessions').toBe(403);
        readerCookie = await verify(reader);
        const listing = await request(readerCookie, '/staff/payment-orders');
        expect(listing.status).toBe(200);
        expect(listing.body.orders).toHaveLength(1);
        expect((await request(readerCookie, route, 'POST', action)).status).toBe(403);
        expect((await request(owner.cookie, route, 'POST', action)).status).toBe(403);
        expect((await request(ownerCookie, route, 'POST', { ...action, reason: '' })).status).toBe(400);
        await context.addCookies(ownerCookie.split(';').map(part => {
            const [name, ...value] = part.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }));
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
        await page.goto(`${server.baseUrl}/app#staff`);
        await expect(page.locator('#payment-orders')).toContainText(orderId);
        await page.getByRole('button', { name: 'Recheck payment', exact: true }).click();
        await page.getByRole('textbox', { name: 'Reason for this action', exact: true }).fill(action.reason);
        await page.getByRole('button', { name: 'Recheck payment', exact: true }).click();
        await expect(page.locator('#feedback')).toContainText('Test payment verified');
        await expect(page.locator('#staff-billing')).toContainText(owner.user.id);
        await expect(page.locator('#staff-audit')).toContainText('payment.review.checked');
        await expect(page.locator('#payment-orders')).not.toContainText(orderId);
        expect((await request(ownerCookie, '/me')).body.benefits.plan.id).toBe('vip');
        const audit = (await request(ownerCookie, '/staff/audit')).body.events;
        expect(audit.some(e => e.action === 'payment.review.checked' && e.actor_id === owner.user.id)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('payment-review-mobile-en.png'), fullPage: true });
        await page.reload();
        await page.locator('[data-lang-value="ar"]').click();
        await expect(page.locator('#payment-review-section h3')).toHaveText('مدفوعات تجريبية تحتاج إلى مراجعة');
        await page.screenshot({ path: testInfo.outputPath('payment-review-mobile-ar.png'), fullPage: true });
        expect(errors).toEqual([]);
    } finally { await context.close(); await server.stop(); }
});
