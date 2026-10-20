const { test, expect } = require('@playwright/test');
const OTPAuth = require('otpauth');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

test('member, VIP, supervisor and named staff journeys work in the browser', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const server = await startServer({ env: {
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh',
        ADMIN_PATH: '/ops-platform-browser-test',
        ADMIN_PASSWORD_HASH: '5368261dff0e47c096a7f53dd6b12e59:3e6d92f21a9166c11cb9a46d04ac8043e67428d5b6c776128ac3c3d88db36bd6489cd46455dbcd57bc997587da6b36750cb995ae720b59a97f296dad71635e29'
    } });
    const contexts = [];
    const sockets = [];
    const errors = [];
    const createPage = async (cookie = '') => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        contexts.push(context);
        if (cookie) {
            await context.addCookies(cookie.split(';').map((part) => {
                const [name, ...value] = part.trim().split('=');
                return { name, value: value.join('='), url: server.baseUrl };
            }));
        }
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => { if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en'); });
        return page;
    };
    try {
        const guest = await createPage();
        await guest.goto(`${server.baseUrl}/plans`);
        await expect(guest.locator('#test-notice')).toBeVisible();
        await expect(guest.locator('.plan')).toHaveCount(2);
        await expect(guest.locator('.plan.featured .price')).toContainText('US$4.99');
        await guest.locator('#checkout-start').click();
        await guest.waitForURL('**/account?next=**');
        await guest.locator('#tab-signup').click();
        await guest.locator('#signup-nickname').fill('Study owner');
        await guest.locator('#signup-email').fill(`owner-${Date.now()}@platform.test`);
        await guest.locator('#signup-password').fill('browser-pass-123');
        await guest.locator('#signup-form button[type="submit"]').click();
        await guest.waitForURL('**/plans');
        const page = guest;
        await page.locator('#checkout-start').click();
        await page.locator('[data-checkout-outcome="declined"]').click();
        await expect(page.locator('#feedback')).toContainText('Declined payment simulated');
        await expect(page.locator('#billing-management')).toBeHidden();
        await page.locator('#checkout-start').click();
        await page.locator('[data-checkout-outcome="success"]').click();
        await expect(page.locator('#billing-management')).toBeVisible();
        await page.locator('#billing-cancel').click();
        await expect(page.locator('#billing-status')).toContainText('Membership ends');
        await page.locator('#billing-cancel').click();
        await expect(page.locator('#billing-status')).toContainText('active until');
        await page.locator('[data-view="circles"]').click();
        await page.locator('#circle-name').fill('Quiet mornings');
        await page.locator('#circle-create button').click();
        await expect(page.locator('#circle-list')).toContainText('Quiet mornings');
        await page.locator('#circle-list button').click();
        await page.locator('#create-invite').click();
        await expect(page.locator('#invite-result')).toBeVisible();
        const token = await page.locator('#invite-code').innerText();
        const bob = await signupUser(server, { email: `supervisor-${Date.now()}@platform.test`, displayName: 'Circle supervisor' });
        const supervisor = await createPage(bob.cookie);
        await supervisor.goto(`${server.baseUrl}/supervisor`);
        await supervisor.locator('#invite-token').fill(token);
        await supervisor.locator('#invite-accept button').click();
        await expect(supervisor.locator('#circle-list')).toContainText('Quiet mornings');
        await page.reload();
        await page.locator('#circle-list button').click();
        const bobRow = page.locator('#circle-members .row').filter({ hasText: 'Circle supervisor' });
        await bobRow.getByRole('button', { name: 'Assign supervisor', exact: true }).click();
        await expect(bobRow).toContainText('Circle supervisor');
        const cookies = await page.context().cookies();
        const authCookie = cookies.find((cookie) => cookie.name === 'coStudyAuth');
        const socket = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: `coStudyAuth=${authCookie.value}` }, clientId: 'browser-owner' });
        sockets.push(socket);
        const room = await emitAck(socket, 'create-room', { roomName: 'Morning room' });
        expect(room.ok).toBe(true);
        await page.reload();
        await page.locator('#circle-list button').click();
        await page.locator('#session-create [name="title"]').fill('Tomorrow together');
        await page.locator('#session-room').selectOption(room.room.roomId);
        const future = new Date(Date.now() + 86400000);
        const localDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T10:00`;
        await page.locator('#session-create [name="startsAt"]').fill(localDate);
        await page.locator('#session-create button').click();
        await expect(page.locator('#circle-sessions')).toContainText('Tomorrow together');
        await supervisor.reload();
        await supervisor.locator('#circle-list button').click();
        await expect(supervisor.locator('#session-create')).toBeVisible();
        await expect(supervisor.locator('#staff-nav')).toBeHidden();
        await supervisor.locator('#circle-sessions').getByRole('button', { name: 'Attendance', exact: true }).click();
        await expect(supervisor.locator('#attendance .row')).toHaveCount(2);
        await page.locator('[data-view="progress"]').click();
        await page.locator('#focus-start').click();
        await expect(page.locator('#focus-state')).toHaveText('Focusing');
        await page.locator('#focus-pause').click();
        await expect(page.locator('#focus-state')).toHaveText('Paused');
        await page.locator('#focus-finish').click();
        await expect(page.locator('#session-history')).toContainText('Completed');
        await page.locator('[data-view="security"]').click();
        await page.locator('#mfa-password').fill('browser-pass-123');
        await page.locator('#mfa-enroll button').click();
        await expect(page.locator('#mfa-key')).not.toBeEmpty();
        const secret = await page.locator('#mfa-key').innerText();
        await page.locator('#mfa-verify [name="code"]').fill(new OTPAuth.TOTP({ secret }).generate());
        await page.locator('#mfa-verify button').click();
        await expect(page.locator('#recovery')).toBeVisible();
        await page.locator('#bootstrap [name="password"]').fill('smoke-admin-password');
        await page.locator('#bootstrap button').click();
        await expect(page.locator('#staff-nav')).toBeVisible();
        await page.locator('#staff-nav').click();
        await expect(page.locator('#staff-roles')).toContainText('Super admin');
        await page.locator('#video-gate').click();
        await expect(page.locator('#video-gate')).toHaveText('Allow video entry');
        await page.locator('#video-gate').click();
        await page.locator('#staff-roles button').click();
        await expect(page.locator('#feedback')).toContainText('last super admin');
        const legacy = await page.request.post(`${server.baseUrl}/ops-platform-browser-test/api/login`, { data: { password: 'smoke-admin-password' } });
        expect(legacy.status()).toBe(403);
        // Deliberately exclude enrollment secrets and recovery codes from screenshots.
        for (const [name, width, language, theme, view] of [
            ['desktop-en-home', 1440, 'en', 'light', 'home'],
            ['tablet-ar-vip', 900, 'ar', 'light', 'vip'],
            ['mobile-ar-circles', 390, 'ar', 'light', 'circles'],
            ['mobile-en-progress-dark', 390, 'en', 'dark', 'progress']
        ]) {
            await page.setViewportSize({ width: Number(width), height: 1000 });
            await page.goto(`${server.baseUrl}/app#${view}`);
            await page.locator(`[data-lang-value="${language}"]`).click();
            if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
            await page.reload();
            await expect(page.locator('#loading')).toBeHidden();
            await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
            const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            expect(accessibility.violations.map((entry) => ({ id: entry.id, nodes: entry.nodes.map((item) => item.target) }))).toEqual([]);
            await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        }
        expect(errors).toEqual([]);
    } finally {
        await Promise.allSettled(sockets.map(closeSocket));
        await Promise.allSettled(contexts.map((context) => context.close()));
        await server.stop();
    }
});
