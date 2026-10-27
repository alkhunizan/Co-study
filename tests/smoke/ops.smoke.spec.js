const { test, expect } = require('@playwright/test');
const OTPAuth = require('otpauth');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser, extractCookies } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

const allSections = ['overview', 'rooms', 'users', 'reports', 'billing', 'access', 'audit', 'system'];
async function fixture(testInfo, env = {}) {
    const server = await startServer({ env: {
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', BILLING_PROVIDER: 'simulator',
        ROOM_STATE_BACKUP_DIR: testInfo.outputPath('backups'),
        ADMIN_PATH: '/ops-staff-test',
        ADMIN_PASSWORD_HASH: '5368261dff0e47c096a7f53dd6b12e59:3e6d92f21a9166c11cb9a46d04ac8043e67428d5b6c776128ac3c3d88db36bd6489cd46455dbcd57bc997587da6b36750cb995ae720b59a97f296dad71635e29',
        ...env
    } });
    const request = (cookie, route, method = 'GET', body = undefined) => server.request(`/api/platform${route}`, { method, headers: { Cookie: cookie }, body });
    const recovery = new Map();
    async function verify(account) {
        let data;
        if (recovery.has(account.user.id)) data = { code: recovery.get(account.user.id).shift() };
        else {
            const enrollment = await request(account.cookie, '/security/mfa/enroll', 'POST', { password: account.credentials.password });
            expect(enrollment.status).toBe(200);
            data = { code: new OTPAuth.TOTP({ secret: enrollment.body.secret }).generate(), activate: true };
        }
        const verified = await request(account.cookie, '/security/mfa/verify', 'POST', data);
        expect(verified.status).toBe(200);
        if (verified.body.recoveryCodes.length) recovery.set(account.user.id, verified.body.recoveryCodes);
        return `${account.cookie}; ${extractCookies(verified.headers['set-cookie'])}`;
    }
    const owner = await signupUser(server, { displayName: 'Operator test account' });
    const ownerCookie = await verify(owner);
    const legacyPage = await server.request(env.ADMIN_PATH || '/ops-staff-test');
    expect((await request(ownerCookie, '/staff/bootstrap', 'POST', { password: 'smoke-admin-password' })).status).toBe(200);
    return { server, request, owner, ownerCookie, verify, recovery, legacyPage };
}
async function cookies(context, value, baseUrl) {
    await context.addCookies(value.split(';').map(part => {
        const [name, ...rest] = part.trim().split('='); return { name, value: rest.join('='), url: baseUrl };
    }));
}
async function openPage(browser, baseUrl, cookie = '') {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    if (cookie) await cookies(context, cookie, baseUrl);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.addInitScript(() => { if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en'); });
    return { context, page };
}
async function loaded(page, section) {
    await expect(page.locator(`[data-ops-panel="${section}"]`)).toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
}

test('staff navigation matches every role, denies direct access and clears revoked sessions', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const f = await fixture(testInfo);
    const sessions = [];
    try {
        const guest = await openPage(browser, f.server.baseUrl); sessions.push(guest.context);
        const response = await guest.page.goto(`${f.server.baseUrl}/ops/audit`);
        expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
        expect(response.headers()['cache-control']).toBe('no-store');
        await expect(guest.page.locator('#ops-login')).toBeVisible();
        await expect(guest.page.locator('#ops-login')).toHaveAttribute('href', '/account?next=%2Fops%2Faudit');
        expect((await f.request('', '/staff/audit')).status).toBe(401);
        const member = await signupUser(f.server, { displayName: 'Permission test account' });
        const actor = await openPage(browser, f.server.baseUrl, member.cookie); sessions.push(actor.context);
        await actor.page.goto(`${f.server.baseUrl}/ops/overview`);
        await expect(actor.page.locator('#ops-gate-title')).toHaveText('This account has no staff permissions');
        await expect(actor.page.locator('#ops-content')).toBeHidden();
        await f.verify(member);
        const matrix = [
            ['support', ['overview', 'rooms', 'system'], '/staff/rooms', '/staff/cases'],
            ['moderator', ['overview', 'users', 'reports'], '/staff/cases', '/staff/rooms'],
            ['billing_operator', ['overview', 'billing'], '/staff/subscriptions', '/staff/audit'],
            ['admin', ['overview', 'rooms', 'access', 'system'], '/staff', '/staff/users']
        ];
        let previous = '';
        for (const [role, visible, permittedApi, deniedApi] of matrix) {
            if (previous) expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: member.user.id, role: previous, remove: true })).status).toBe(200);
            expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: member.user.id, role })).status).toBe(200);
            const cookie = await f.verify(member);
            await cookies(actor.context, cookie, f.server.baseUrl);
            await actor.page.goto(`${f.server.baseUrl}/ops/overview`); await loaded(actor.page, 'overview');
            expect(await actor.page.locator('#ops-nav a:visible').evaluateAll(links => links.map(a => a.getAttribute('data-section')))).toEqual(visible);
            expect((await f.request(cookie, permittedApi)).status).toBe(200);
            expect((await f.request(cookie, deniedApi)).status).toBe(403);
            expect((await f.request(cookie, '/staff/roles', 'POST', { userId: member.user.id, role: 'super_admin' })).status).toBe(403);
            const forbidden = allSections.find(section => !visible.includes(section));
            await actor.page.goto(`${f.server.baseUrl}/ops/${forbidden}`);
            await expect(actor.page.locator('#ops-gate-title')).toHaveText('This section is outside your permissions');
            await expect(actor.page.locator('#ops-content')).toBeHidden();
            if (role === 'support') {
                await actor.page.goto(`${f.server.baseUrl}/ops/system`); await loaded(actor.page, 'system');
                await expect(actor.page.locator('#video-gate')).toBeHidden();
                await expect(actor.page.locator('#platform-backup')).toBeHidden();
                expect((await f.request(cookie, '/staff/video', 'POST', { disabled: true })).status).toBe(403);
            }
            previous = String(role);
        }
        await actor.page.goto(`${f.server.baseUrl}/ops/access`); await loaded(actor.page, 'access');
        await expect(actor.page.locator('#staff-grant')).toBeHidden();
        expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: member.user.id, role: 'admin', remove: true })).status).toBe(200);
        await actor.page.locator('#ops-refresh').click();
        await expect(actor.page.locator('#ops-gate-title')).toHaveText('This account has no staff permissions');
        await expect(actor.page.locator('#staff-roles')).toBeEmpty();
        const owner = await openPage(browser, f.server.baseUrl, f.owner.cookie); sessions.push(owner.context);
        await owner.page.goto(`${f.server.baseUrl}/ops/audit`);
        await expect(owner.page.locator('#ops-mfa')).toBeVisible();
        await expect(owner.page.locator('#staff-audit')).toBeEmpty();
        expect((await f.request(f.owner.cookie, '/staff/audit')).status).toBe(403);
        await owner.page.locator('#ops-mfa input').fill(f.recovery.get(f.owner.user.id).shift());
        await owner.page.locator('#ops-mfa button').click(); await loaded(owner.page, 'audit');
        expect(await owner.page.locator('#ops-nav a:visible').count()).toBe(8);
        await owner.page.goto(`${f.server.baseUrl}/app#staff`);
        await expect(owner.page).toHaveURL(`${f.server.baseUrl}/ops/overview`); await loaded(owner.page, 'overview');
        await owner.page.locator('#ops-nav [data-section="system"]').focus();
        await owner.page.keyboard.press('Enter'); await loaded(owner.page, 'system');
        await expect(owner.page.locator('#ops-title')).toBeFocused();
        await owner.page.goBack(); await loaded(owner.page, 'overview');
        await owner.page.goForward(); await loaded(owner.page, 'system');
    } finally { await Promise.all(sessions.map(context => context.close())); await f.server.stop(); }
});

test('super-admin sections operate on real records and recover from failed or stale reads', async ({ browser }, testInfo) => {
    test.setTimeout(240000);
    const f = await fixture(testInfo);
    const session = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    const { page } = session;
    const errors = []; const sockets = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        const member = await signupUser(f.server, { displayName: 'Report target account' });
        for (const { account, clientId } of [{ account: f.owner, clientId: 'ops-reporter' }, { account: member, clientId: 'ops-target' }]) {
            sockets.push(await connectSocket(f.server.baseUrl, { extraHeaders: { Cookie: account.cookie }, clientId }));
        }
        const created = await emitAck(sockets[0], 'create-room', { roomName: 'Quiet review room' });
        expect(created.ok).toBe(true);
        expect((await emitAck(sockets[0], 'join-room', { roomId: created.room.roomId, username: 'Operator test account', clientId: 'ops-reporter' })).ok).toBe(true);
        expect((await emitAck(sockets[1], 'join-room', { roomId: created.room.roomId, username: 'Report target account', clientId: 'ops-target' })).ok).toBe(true);
        expect((await emitAck(sockets[0], 'report-user', { targetId: sockets[1].id, reason: 'spam', detail: 'Synthetic report for the staff journey.' })).ok).toBe(true);
        await page.goto(`${f.server.baseUrl}/ops/overview`); await loaded(page, 'overview');
        await expect(page.getByRole('link', { name: 'Study workspace', exact: true })).toBeVisible();
        await expect(page.locator('#ops-attention')).toContainText('Recent reports needing attention');
        await page.locator('#ops-nav [data-section="reports"]').click(); await loaded(page, 'reports');
        const report = page.locator('#staff-cases .row');
        await report.locator('summary').click();
        await report.getByLabel('Status', { exact: true }).selectOption('investigating');
        await report.getByLabel('Decision reason', { exact: true }).fill('Investigating the synthetic report.');
        await report.getByRole('button', { name: 'Save review outcome' }).click();
        await expect(page.locator('#staff-cases .ops-status')).toHaveText('Investigating');
        const saved = (await f.request(f.ownerCookie, '/staff/cases')).body.cases[0];
        expect(saved.status).toBe('investigating'); expect(saved.assigned_to).toBe(f.owner.user.id);
        await report.locator('summary').click();
        await report.getByLabel('Status', { exact: true }).selectOption('resolved');
        await report.getByLabel('Decision reason', { exact: true }).fill('Resolved after review.');
        await report.getByRole('button', { name: 'Save review outcome' }).click();
        await expect(page.locator('#staff-cases .ops-status')).toHaveText('Resolved');
        await page.locator('#ops-case-status').selectOption('open');
        await expect(page.locator('#staff-cases')).toContainText('No matching reports.');
        await page.locator('#ops-case-status').selectOption('');
        await page.locator('#ops-nav [data-section="users"]').click(); await loaded(page, 'users');
        await page.locator('#staff-query').fill(member.user.id); await page.locator('#staff-user-search button').click();
        await expect(page.locator('#staff-users .row')).toHaveCount(1);
        await page.getByRole('button', { name: 'Ban account', exact: true }).click();
        await page.getByLabel('Reason for this action', { exact: true }).fill('Synthetic moderation check.');
        await page.getByRole('button', { name: 'Ban account', exact: true }).click();
        await expect(page.locator('#staff-users')).toContainText('Account banned');
        await page.getByRole('button', { name: 'Unban account', exact: true }).click();
        await page.getByLabel('Reason for this action', { exact: true }).fill('Synthetic check complete.');
        await page.getByRole('button', { name: 'Unban account', exact: true }).click();
        await expect(page.locator('#staff-users')).toContainText('Account available');
        await page.locator('#ops-nav [data-section="system"]').click(); await loaded(page, 'system');
        await page.locator('#video-gate').click(); await expect(page.locator('#video-gate')).toHaveText('Allow video entry');
        expect((await f.request(f.ownerCookie, '/staff/operations')).body.videoDisabled).toBe(true);
        await page.locator('#video-gate').click(); await expect(page.locator('#video-gate')).toHaveText('Disable video entry');
        await page.locator('#announcement-form [name="messageEn"]').fill('Local staff workspace test');
        await page.getByRole('button', { name: 'Show announcement', exact: true }).click();
        await expect(page.locator('#feedback')).toContainText('Saved');
        await page.locator('#clear-announcement').click();
        await expect(page.locator('#feedback')).toContainText('Saved');
        await page.locator('#platform-backup').click();
        await expect(page.locator('#feedback')).toContainText('Saved');
        expect((await f.request(f.ownerCookie, '/staff/operations')).body.backup.lastRunAt).toBeGreaterThan(0);
        // Exercise the real response contract, with one intentional transport failure.
        await page.route('**/api/platform/staff/audit', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
        await page.locator('#ops-nav [data-section="audit"]').click();
        await expect(page.locator('#ops-retry')).toBeVisible(); await expect(page.locator('#staff-audit')).toBeEmpty();
        await page.unroute('**/api/platform/staff/audit');
        await page.locator('#ops-retry').click(); await loaded(page, 'audit');
        await expect(page.locator('#staff-audit')).toContainText('case.updated');
        await page.locator('#ops-audit-query').fill('case.updated');
        await expect(page.locator('#staff-audit .row')).toHaveCount(2);
        await page.locator('#ops-audit-query').fill('');
        let release = () => {};
        let reached = () => {};
        const held = new Promise(resolve => { release = () => resolve(undefined); });
        const requested = new Promise(resolve => { reached = () => resolve(undefined); });
        await page.route('**/api/platform/staff/rooms', async route => { reached(); await held; await route.continue(); });
        await page.locator('#ops-nav [data-section="rooms"]').click(); await requested;
        await page.locator('#ops-nav [data-section="system"]').click(); await loaded(page, 'system');
        const releasedRead = page.waitForResponse('**/api/platform/staff/rooms');
        release(); await releasedRead; await page.unroute('**/api/platform/staff/rooms');
        await expect(page.locator('[data-ops-panel="rooms"]')).toBeHidden();
        // Real records, all eight routes, both reading directions, mobile and dark mode.
        for (const [width, language, theme] of [[1440, 'en', 'light'], [390, 'ar', 'dark']]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.locator(`[data-lang-value="${language}"]`).click();
            if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
            for (const section of allSections) {
                if (width === 390) await page.locator('#ops-section-select').selectOption(section);
                else await page.locator(`#ops-nav [data-section="${section}"]`).click();
                await loaded(page, section);
                await expect(page.locator('a[data-lang="opsBack"]')).toBeVisible();
                if (section === 'reports' && language === 'ar') await expect(page.locator('#staff-cases')).toContainText('رسائل مزعجة');
                await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
                expect(accessibility.violations.map(entry => ({ id: entry.id, targets: entry.nodes.map(n => n.target) }))).toEqual([]);
                await page.screenshot({ path: testInfo.outputPath(`${section}-${language}-${width}-${theme}.png`), fullPage: true });
            }
        }
        await page.locator('a[data-lang="opsBack"]').click();
        await expect(page).toHaveURL(`${f.server.baseUrl}/app`);
        await expect(page.locator('#loading')).toBeHidden();
        await page.locator('.platform-nav [data-view="account"]').click();
        await page.locator('#staff-nav').click();
        await expect(page).toHaveURL(`${f.server.baseUrl}/ops/overview`); await loaded(page, 'overview');
        expect(errors).toEqual([]);
    } finally { await Promise.all(sockets.map(closeSocket)); await session.context.close(); await f.server.stop(); }
});

test('review: a pending submission preserves a newer announcement draft', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const submitted = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/system`); await loaded(page, 'system');
        await page.route('**/api/platform/staff/announcement', async route => {
            const response = await route.fetch(); reached(); await held; await route.fulfill({ response });
        });
        await page.locator('#announcement-form [name="messageEn"]').fill('First announcement');
        await page.getByRole('button', { name: 'Show announcement', exact: true }).click(); await submitted;
        await page.locator('#ops-nav [data-section="overview"]').click(); await loaded(page, 'overview');
        await page.locator('#ops-nav [data-section="system"]').click(); await loaded(page, 'system');
        await page.locator('#announcement-form [name="messageEn"]').fill('New unsaved draft');
        release();
        await expect(page.getByRole('button', { name: 'Show announcement', exact: true })).toBeEnabled();
        await expect(page.locator('#announcement-form [name="messageEn"]')).toHaveValue('New unsaved draft');
        expect((await f.server.request('/api/announcement')).body.announcement.messageEn).toBe('First announcement');
        await expect(page.locator('#feedback')).toBeHidden();
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review: sign-in returns to the requested section and an account switch replaces staff identity', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const member = await signupUser(f.server, { displayName: 'Second account' });
    const { page, context } = await openPage(browser, f.server.baseUrl);
    try {
        await page.goto(`${f.server.baseUrl}/ops/audit`);
        await page.locator('#ops-login').click();
        await page.locator('#signin-email').fill(f.owner.credentials.email);
        await page.locator('#signin-password').fill(f.owner.credentials.password);
        await page.locator('#signin-form button[type="submit"]').click();
        await expect(page).toHaveURL(`${f.server.baseUrl}/ops/audit`);
        await expect(page.locator('#ops-mfa')).toBeVisible();
        await page.locator('#ops-mfa input').fill(f.recovery.get(f.owner.user.id).shift());
        await page.locator('#ops-mfa button').click(); await loaded(page, 'audit');
        await expect(page.locator('#staff-identity')).toContainText(f.owner.user.displayName);
        // Reproduce a login in another tab without navigating the old document.
        await cookies(context, member.cookie, f.server.baseUrl);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-gate-title')).toHaveText('This account has no staff permissions');
        await expect(page.locator('#staff-audit')).toBeEmpty();
        await expect(page.locator('#staff-identity')).toContainText(member.user.displayName);
        await expect(page.locator('#ops-nav')).toBeHidden();
    } finally { await context.close(); await f.server.stop(); }
});

test('review: Arabic report search matches the category displayed to the reviewer', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    const sockets = [];
    try {
        const member = await signupUser(f.server, { displayName: 'Search report target' });
        for (const { account, clientId } of [{ account: f.owner, clientId: 'review-reporter' }, { account: member, clientId: 'review-target' }]) {
            sockets.push(await connectSocket(f.server.baseUrl, { extraHeaders: { Cookie: account.cookie }, clientId }));
        }
        const created = await emitAck(sockets[0], 'create-room', { roomName: 'Localized report review' });
        expect(created.ok).toBe(true);
        for (const [index, socket] of sockets.entries()) {
            expect((await emitAck(socket, 'join-room', { roomId: created.room.roomId, username: `Reviewer ${index}`, clientId: index ? 'review-target' : 'review-reporter' })).ok).toBe(true);
        }
        expect((await emitAck(sockets[0], 'report-user', { targetId: sockets[1].id, reason: 'spam', detail: 'Localized category search fixture.' })).ok).toBe(true);
        await page.goto(`${f.server.baseUrl}/ops/reports`); await loaded(page, 'reports');
        await page.locator('[data-lang-value="ar"]').click();
        await expect(page.locator('#staff-cases')).toContainText('رسائل مزعجة');
        await page.locator('#ops-case-query').fill('رسائل');
        await expect(page.locator('#staff-cases .row')).toHaveCount(1);
        await page.locator('#ops-case-query').fill('spam');
        await expect(page.locator('#staff-cases .row')).toHaveCount(1);
    } finally { await Promise.all(sockets.map(closeSocket)); await context.close(); await f.server.stop(); }
});

test('review: a colliding legacy admin route hands over to named staff after bootstrap', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo, { ADMIN_PATH: '/ops/overview' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        expect(f.legacyPage.status).toBe(200);
        expect(f.legacyPage.text).toContain('Halastudy Ops');
        await page.goto(`${f.server.baseUrl}/ops/overview`); await loaded(page, 'overview');
        await page.reload(); await loaded(page, 'overview');
        const legacy = await f.server.request('/ops/overview/api/login', { method: 'POST', body: { password: 'smoke-admin-password' } });
        expect(legacy.status).toBe(403);
        expect(legacy.body.errorCode).toBe('NAMED_STAFF_REQUIRED');
    } finally { await context.close(); await f.server.stop(); }
});

test('review2: populated rooms stay readable across widths and moderation reaches the live room', async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    const sockets = [];
    try {
        const accounts = [f.owner];
        for (const displayName of ['Participant with a long name', 'Another participant long name']) accounts.push(await signupUser(f.server, { displayName }));
        for (const [index, account] of accounts.entries()) sockets.push(await connectSocket(f.server.baseUrl, { extraHeaders: { Cookie: account.cookie }, clientId: `review2-${index}` }));
        const created = await emitAck(sockets[0], 'create-room', { roomName: 'Populated operations room' });
        expect(created.ok).toBe(true);
        for (const [index, socket] of sockets.entries()) expect((await emitAck(socket, 'join-room', { roomId: created.room.roomId, username: accounts[index].user.displayName, clientId: `review2-${index}` })).ok).toBe(true);
        await page.goto(`${f.server.baseUrl}/ops/rooms`); await loaded(page, 'rooms');
        const room = page.locator('#staff-live-rooms .row').filter({ hasText: created.room.roomId });
        for (const language of ['en', 'ar']) {
            await page.locator(`[data-lang-value="${language}"]`).click(); await loaded(page, 'rooms');
            for (const width of [390, 768, 851, 1024]) {
                await page.setViewportSize({ width, height: 1000 });
                const layout = await room.evaluate(element => {
                    const title = element.querySelector('.row-main').getBoundingClientRect();
                    return { titleWidth: title.width, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth };
                });
                expect.soft(layout.titleWidth, `${language}/${width}: ${JSON.stringify(layout)}`).toBeGreaterThan(0);
                expect.soft(layout.documentWidth, `${language}/${width}`).toBeLessThanOrEqual(width + 1);
                await page.screenshot({ path: testInfo.outputPath(`populated-rooms-${language}-${width}.png`), fullPage: true });
            }
        }
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('[data-lang-value="en"]').click(); await loaded(page, 'rooms');
        const removeName = `Remove participant: ${accounts[1].user.displayName}`;
        await room.getByRole('button', { name: removeName, exact: true }).click();
        await room.getByLabel('Reason for this action', { exact: true }).fill('Confirmed room moderation check');
        await room.getByRole('button', { name: removeName, exact: true }).click();
        await expect(room.getByRole('button', { name: removeName, exact: true })).toHaveCount(0);
        await expect.poll(() => sockets[1].connected).toBe(false);
        const roomsAfterKick = (await f.request(f.ownerCookie, '/staff/rooms')).body.rooms;
        expect(roomsAfterKick.find(entry => entry.id === created.room.roomId).participants).toHaveLength(2);
        await room.getByRole('button', { name: 'Close room', exact: true }).click();
        await room.getByLabel('Reason for this action', { exact: true }).fill('Room review complete');
        await room.getByRole('button', { name: 'Close room', exact: true }).click();
        await expect(room).toHaveCount(0);
        await expect.poll(() => sockets[2].connected).toBe(false);
        expect((await f.request(f.ownerCookie, '/staff/rooms')).body.rooms.some(entry => entry.id === created.room.roomId)).toBe(false);
    } finally { await Promise.all(sockets.map(closeSocket)); await context.close(); await f.server.stop(); }
});

test('review2: submitted destructive actions cannot appear canceled while their response is pending', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const member = await signupUser(f.server, { displayName: 'Pending action target' });
    await f.verify(member);
    expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: member.user.id, role: 'moderator' })).status).toBe(200);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    async function holdReply(pattern) {
        let reached = () => {};
        const held = new Promise(resolve => { release = () => resolve(undefined); });
        const started = new Promise(resolve => { reached = () => resolve(undefined); });
        await page.route(pattern, async route => {
            const response = await route.fetch(); reached(); await held; await route.fulfill({ response });
        });
        return { started };
    }
    try {
        await page.goto(`${f.server.baseUrl}/ops/access`); await loaded(page, 'access');
        const assignment = page.locator('#staff-roles .row').filter({ hasText: member.user.id });
        await assignment.getByRole('button', { name: 'Revoke', exact: true }).click();
        const revoked = await holdReply('**/api/platform/staff/roles');
        await assignment.getByRole('button', { name: 'Confirm revocation', exact: true }).click(); await revoked.started;
        await expect.soft(assignment.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled({ timeout: 1000 });
        release(); await expect(assignment).toHaveCount(0); await page.unroute('**/api/platform/staff/roles');
        await page.locator('#ops-nav [data-section="users"]').click(); await loaded(page, 'users');
        await page.locator('#staff-query').fill(member.user.id); await page.locator('#staff-user-search button').click();
        const account = page.locator('#staff-users .row'); await expect(account).toHaveCount(1);
        await account.getByRole('button', { name: 'Ban account', exact: true }).click();
        await account.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect((await f.request(f.ownerCookie, `/staff/users?q=${member.user.id}`)).body.users[0].banned).toBe(false);
        await account.getByRole('button', { name: 'Ban account', exact: true }).click();
        await account.getByLabel('Reason for this action', { exact: true }).fill('Pending moderation review');
        const banned = await holdReply(`**/api/platform/staff/users/${member.user.id}/status`);
        await account.getByRole('button', { name: 'Ban account', exact: true }).click(); await banned.started;
        await expect.soft(account.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled({ timeout: 1000 });
        release(); await expect(account).toContainText('Account banned');
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === member.user.id)).toHaveLength(1);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review2: expired staff verification locks the workspace, renews with MFA and clears on logout', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.owner.cookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/audit`);
        await expect(page.locator('#ops-mfa')).toBeVisible();
        await page.locator('#ops-mfa input').fill('invalid-review-code');
        await page.locator('#ops-mfa button').click();
        await expect(page.locator('#feedback')).toContainText('Invalid or previously used code');
        await expect(page.locator('#staff-audit')).toBeEmpty();
        for (let renewal = 0; renewal < 2; renewal++) {
            await page.locator('#ops-mfa input').fill(f.recovery.get(f.owner.user.id).shift());
            await page.locator('#ops-mfa button').click(); await loaded(page, 'audit');
            await expect(page.locator('#staff-audit')).toContainText('staff.bootstrap');
            if (!renewal) {
                // Expired cookies are removed by the browser; reproduce that boundary without waiting 15 minutes.
                await context.clearCookies({ name: 'coStudyStaff' });
                await page.evaluate(() => window.dispatchEvent(new Event('focus')));
                await expect(page.locator('#ops-mfa')).toBeVisible();
                await expect(page.locator('#staff-audit')).toBeEmpty();
                expect((await page.request.get(`${f.server.baseUrl}/api/platform/staff/audit`)).status()).toBe(403);
            }
        }
        expect((await context.request.post(`${f.server.baseUrl}/api/auth/logout`)).status()).toBe(200);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-login')).toBeVisible();
        await expect(page.locator('#staff-audit')).toBeEmpty();
        await expect(page.locator('#staff-identity')).toBeEmpty();
        await expect(page.locator('#ops-nav')).toBeHidden();
    } finally { await context.close(); await f.server.stop(); }
});

test('review2: direct section links and aliases retain routing and private response headers', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        for (const section of allSections) {
            const response = await page.goto(`${f.server.baseUrl}/ops/${section}/`);
            expect(response.status()).toBe(200);
            expect(response.headers()['cache-control']).toBe('no-store');
            expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
            await loaded(page, section);
            await expect(page.locator(`#ops-nav [data-section="${section}"]`)).toHaveAttribute('aria-current', 'page');
        }
        for (const alias of ['/ops', '/ops/']) {
            await page.goto(`${f.server.baseUrl}${alias}`); await loaded(page, 'overview');
            await expect(page).toHaveURL(`${f.server.baseUrl}/ops/overview`);
        }
        expect((await f.server.request('/ops/not-a-section')).status).toBe(404);
    } finally { await context.close(); await f.server.stop(); }
});

for (const failure of ['disconnected', 'server error']) test(`review2: a committed action with a ${failure} response refreshes records without replay`, async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const member = await signupUser(f.server, { displayName: 'Interrupted response target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let writes = 0;
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        await page.locator('#staff-query').fill(member.user.id); await page.locator('#staff-user-search button').click();
        const account = page.locator('#staff-users .row'); await expect(account).toHaveCount(1);
        await page.route(`**/api/platform/staff/users/${member.user.id}/status`, async route => {
            writes++;
            const response = await route.fetch(); expect(response.status()).toBe(200);
            if (failure === 'disconnected') await route.abort('connectionfailed');
            else await route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' });
        });
        await account.getByRole('button', { name: 'Ban account', exact: true }).click();
        await account.getByLabel('Reason for this action', { exact: true }).fill('Interrupted response review');
        await account.getByRole('button', { name: 'Ban account', exact: true }).click();
        await expect(account).toContainText('Account banned');
        await expect(page.locator('#feedback')).toContainText('could not be confirmed');
        expect(writes).toBe(1);
        expect((await f.request(f.ownerCookie, `/staff/users?q=${member.user.id}`)).body.users[0].banned).toBe(true);
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === member.user.id)).toHaveLength(1);
    } finally { await context.close(); await f.server.stop(); }
});

test('review3: independent pending actions both reconcile after the first refresh', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const slow = await signupUser(f.server, { displayName: 'Slow action target' });
    const fast = await signupUser(f.server, { displayName: 'Fast action target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        await page.route(`**/api/platform/staff/users/${slow.user.id}/status`, async route => {
            reached(); await held; const response = await route.fetch(); expect(response.status()).toBe(200); await route.fulfill({ response });
        });
        for (const account of [slow, fast]) {
            const row = page.locator('#staff-users .row').filter({ hasText: account.user.id });
            await row.getByRole('button', { name: 'Ban account', exact: true }).click();
            await row.getByLabel('Reason for this action', { exact: true }).fill('Independent pending action review');
            await row.getByRole('button', { name: 'Ban account', exact: true }).click();
            if (account === slow) await started;
        }
        await expect(page.locator('#staff-users .row').filter({ hasText: fast.user.id })).toContainText('Account banned');
        const finished = page.waitForResponse(`**/api/platform/staff/users/${slow.user.id}/status`);
        release(); await finished;
        expect((await f.request(f.ownerCookie, `/staff/users?q=${slow.user.id}`)).body.users[0].banned).toBe(true);
        await expect(page.locator('#staff-users .row').filter({ hasText: slow.user.id })).toContainText('Account banned');
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        for (const account of [slow, fast]) expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === account.user.id)).toHaveLength(1);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review3: refreshing does not allow a duplicate request while the first write is pending', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Duplicate request target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    let writes = 0;
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await page.route(`**/api/platform/staff/users/${target.user.id}/status`, async route => {
            writes++; reached(); await held; const response = await route.fetch(); await route.fulfill({ response });
        });
        for (const reason of ['First pending request', 'New form after refresh']) {
            await row.getByRole('button', { name: 'Ban account', exact: true }).click();
            await row.getByLabel('Reason for this action', { exact: true }).fill(reason);
            await row.getByRole('button', { name: 'Ban account', exact: true }).click();
            if (reason === 'First pending request') {
                await started; await page.locator('#ops-refresh').click(); await loaded(page, 'users');
            }
        }
        await expect.soft(page.locator('#feedback')).toContainText('already pending', { timeout: 1000 });
        expect.soft(writes).toBe(1);
        release();
        await expect(row).toContainText('Account banned');
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === target.user.id)).toHaveLength(1);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review3: revocation during a pending action keeps the staff gate closed after its response', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const moderator = await signupUser(f.server, { displayName: 'Revoked moderator' });
    const target = await signupUser(f.server, { displayName: 'Moderation review target' });
    await f.verify(moderator);
    expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: moderator.user.id, role: 'moderator' })).status).toBe(200);
    const cookie = await f.verify(moderator);
    const { page, context } = await openPage(browser, f.server.baseUrl, cookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await page.route(`**/api/platform/staff/users/${target.user.id}/status`, async route => {
            const response = await route.fetch(); expect(response.status()).toBe(200); reached(); await held; await route.fulfill({ response });
        });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Revocation transition review');
        await row.getByRole('button', { name: 'Ban account', exact: true }).click(); await started;
        expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: moderator.user.id, role: 'moderator', remove: true })).status).toBe(200);
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-gate-title')).toHaveText('This account has no staff permissions');
        const finished = page.waitForResponse(`**/api/platform/staff/users/${target.user.id}/status`);
        release(); await finished;
        await expect(page.locator('#loading')).toBeHidden();
        await expect(page.locator('#ops-content')).toBeHidden();
        await expect(page.locator('#staff-users')).toBeEmpty();
        await expect(page.locator('#feedback')).toBeHidden();
        expect((await f.request(cookie, '/staff/users')).status).toBe(403);
    } finally { release(); await context.close(); await f.server.stop(); }
});

for (const outcome of ['confirmed', 'response lost']) test(`review4: returning to a section reconciles a pending action when ${outcome}`, async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Returning view target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    let writes = 0;
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        const pattern = `**/api/platform/staff/users/${target.user.id}/status`;
        await page.route(pattern, async route => {
            writes++; reached(); await held;
            const response = await route.fetch(); expect(response.status()).toBe(200);
            if (outcome === 'response lost') await route.abort('connectionfailed');
            else await route.fulfill({ response });
        });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Navigation reconciliation review');
        await row.getByRole('button', { name: 'Ban account', exact: true }).click(); await started;
        await page.locator('#ops-nav [data-section="system"]').click(); await loaded(page, 'system');
        await page.goBack(); await loaded(page, 'users');
        await page.locator('#staff-query').fill(target.user.id); await page.locator('#staff-user-search button').click();
        await expect(page.locator('#staff-users .row')).toHaveCount(1);
        await page.locator('[data-lang-value="ar"]').click(); await loaded(page, 'users');
        await expect(row).toContainText('الحساب متاح');
        release();
        await expect.poll(async () => (await f.request(f.ownerCookie, `/staff/users?q=${target.user.id}`)).body.users[0].banned).toBe(true);
        await expect(row).toContainText('الحساب محظور', { timeout: 5000 });
        await expect(page.locator('#staff-query')).toHaveValue(target.user.id);
        await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
        await expect(page).toHaveURL(`${f.server.baseUrl}/ops/users`);
        expect(writes).toBe(1);
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === target.user.id)).toHaveLength(1);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review4: a late action does not interrupt an unrelated section or its newer draft', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Other view target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        const pattern = `**/api/platform/staff/users/${target.user.id}/status`;
        await page.route(pattern, async route => {
            reached(); await held; const response = await route.fetch(); await route.fulfill({ response });
        });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Other view review');
        await row.getByRole('button', { name: 'Ban account', exact: true }).click(); await started;
        await page.locator('#ops-nav [data-section="system"]').click(); await loaded(page, 'system');
        const draft = page.locator('#announcement-form [name="messageEn"]');
        await draft.fill('New draft on a different section');
        const response = page.waitForResponse(pattern);
        release(); await response;
        expect((await f.request(f.ownerCookie, `/staff/users?q=${target.user.id}`)).body.users[0].banned).toBe(true);
        await loaded(page, 'system');
        await expect(page).toHaveURL(`${f.server.baseUrl}/ops/system`);
        await expect(draft).toHaveValue('New draft on a different section');
        await expect(page.locator('#feedback')).toBeHidden();
        await page.locator('#ops-nav [data-section="users"]').click(); await loaded(page, 'users');
        await expect(row).toContainText('Account banned');
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review4: a rejected action followed by an unavailable session read stays private and recovers', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Protected owner target' });
    await f.verify(target);
    expect((await f.request(f.ownerCookie, '/staff/roles', 'POST', { userId: target.user.id, role: 'super_admin' })).status).toBe(200);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let writes = 0;
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await page.route(`**/api/platform/staff/users/${target.user.id}/status`, async route => {
            writes++; const response = await route.fetch(); expect(response.status()).toBe(403); await route.fulfill({ response });
        });
        await page.route('**/api/auth/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Protected account review');
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await expect(page.locator('#ops-retry')).toBeVisible();
        await expect(page.locator('#ops-content')).toBeHidden();
        await expect(page.locator('#staff-users')).toBeEmpty();
        await page.unroute('**/api/auth/me');
        await page.locator('#ops-retry').click(); await loaded(page, 'users');
        await expect(row).toContainText('Account available');
        expect(writes).toBe(1);
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === target.user.id)).toHaveLength(0);
    } finally { await context.close(); await f.server.stop(); }
});

test('review4: a late response preserves a newer MFA entry and does not reopen the workspace', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'MFA transition target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        const pattern = `**/api/platform/staff/users/${target.user.id}/status`;
        await page.route(pattern, async route => {
            const response = await route.fetch(); expect(response.status()).toBe(200); reached(); await held; await route.fulfill({ response });
        });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('MFA transition review');
        await row.getByRole('button', { name: 'Ban account', exact: true }).click(); await started;
        await context.clearCookies({ name: 'coStudyStaff' });
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-mfa')).toBeVisible();
        await page.locator('#ops-mfa input').fill('123');
        const response = page.waitForResponse(pattern);
        release(); await response;
        expect((await f.request(f.ownerCookie, `/staff/users?q=${target.user.id}`)).body.users[0].banned).toBe(true);
        await expect(page.locator('#ops-mfa input')).toHaveValue('123');
        await expect(page.locator('#ops-content')).toBeHidden();
        await expect(page.locator('#staff-users')).toBeEmpty();
        await expect(page.locator('#feedback')).toBeHidden();
        expect((await page.request.get(`${f.server.baseUrl}/api/platform/staff/users`)).status()).toBe(403);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review5: keyboard focus survives rejected and completed actions, refresh and retry', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Keyboard review target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await row.getByRole('button', { name: 'Ban account', exact: true }).focus();
        await page.keyboard.press('Enter');
        const reason = row.getByLabel('Reason for this action', { exact: true });
        await expect(reason).toBeFocused();
        await page.keyboard.type('   '); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
        await expect(page.locator('#feedback')).toHaveText('Check the account and reason.');
        await expect.soft(row.getByRole('button', { name: 'Ban account', exact: true })).toBeFocused({ timeout: 1000 });
        await expect(reason).toHaveValue('   ');
        expect((await f.request(f.ownerCookie, `/staff/users?q=${target.user.id}`)).body.users[0].banned).toBe(false);
        await reason.focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Keyboard moderation review');
        await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
        await expect(row).toContainText('Account banned');
        await expect.soft(page.locator('#ops-title')).toBeFocused({ timeout: 1000 });
        await page.locator('#ops-refresh').focus(); await page.keyboard.press('Enter'); await loaded(page, 'users');
        await expect.soft(page.locator('#ops-refresh')).toBeFocused({ timeout: 1000 });
        await page.route('**/api/platform/staff/users?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
        await page.locator('#ops-refresh').focus(); await page.keyboard.press('Enter');
        await expect(page.locator('#ops-retry')).toBeVisible();
        await expect.soft(page.locator('#ops-retry')).toBeFocused({ timeout: 1000 });
        await page.unroute('**/api/platform/staff/users?*');
        await page.locator('#ops-retry').focus(); await page.keyboard.press('Enter'); await loaded(page, 'users');
        await expect.soft(page.locator('#ops-title')).toBeFocused({ timeout: 1000 });
        const audit = (await f.request(f.ownerCookie, '/staff/audit')).body.events;
        expect(audit.filter(entry => entry.action === 'account.ban.requested' && entry.resource_id === target.user.id)).toHaveLength(1);
    } finally { await context.close(); await f.server.stop(); }
});

test('review5: a pending refresh respects focus moved to a different control', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.goto(`${f.server.baseUrl}/ops/system`); await loaded(page, 'system');
        await page.route('**/api/platform/staff/operations', async route => {
            const response = await route.fetch(); reached(); await held; await route.fulfill({ response });
        });
        await page.locator('#video-gate').focus(); await page.keyboard.press('Enter'); await started;
        await page.locator('#theme-toggle').focus();
        release(); await loaded(page, 'system');
        await expect(page.locator('#video-gate')).toHaveText('Allow video entry');
        await expect(page.locator('#feedback')).toHaveText('Saved.');
        await expect(page.locator('#theme-toggle')).toBeFocused();
        expect((await f.request(f.ownerCookie, '/staff/operations')).body.videoDisabled).toBe(true);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review5: temporary access-check failures are reported as unavailable in both languages', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/audit`); await loaded(page, 'audit');
        for (const [language, message] of [['en', 'This section could not be loaded.'], ['ar', 'تعذّر تحميل هذا القسم.']]) {
            await page.locator(`[data-lang-value="${language}"]`).click(); await loaded(page, 'audit');
            await page.route('**/api/platform/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
            await page.locator('#ops-audit-query').focus();
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await expect(page.locator('#ops-retry')).toBeVisible();
            await expect.soft(page.locator('#feedback')).toContainText(message, { timeout: 1000 });
            await expect.soft(page.locator('#ops-retry')).toBeFocused({ timeout: 1000 });
            await expect(page.locator('#ops-content')).toBeHidden();
            await expect(page.locator('#staff-audit')).toBeEmpty();
            expect((await f.request(f.ownerCookie, '/me')).body.staffVerified).toBe(true);
            await page.unroute('**/api/platform/me');
            await page.locator('#ops-retry').click(); await loaded(page, 'audit');
            await expect(page.locator('#staff-audit')).toContainText('staff.bootstrap');
            expect(await page.locator('#ops-nav a:visible').count()).toBe(8);
        }
    } finally { await context.close(); await f.server.stop(); }
});

test('review5: keyboard users can follow an expired-verification gate and return to their section', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/audit`); await loaded(page, 'audit');
        await page.locator('#ops-audit-query').focus();
        await context.clearCookies({ name: 'coStudyStaff' });
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-mfa')).toBeVisible();
        await expect(page.locator('#staff-audit')).toBeEmpty();
        await expect.soft(page.locator('#ops-gate-title')).toBeFocused({ timeout: 1000 });
        await page.locator('#ops-mfa input').focus();
        await page.keyboard.type(f.recovery.get(f.owner.user.id).shift());
        await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await loaded(page, 'audit');
        await expect(page.locator('#staff-audit')).toContainText('staff.bootstrap');
        await expect.soft(page.locator('#ops-title')).toBeFocused({ timeout: 1000 });
    } finally { await context.close(); await f.server.stop(); }
});

test('review6: saving one report preserves the unsaved outcome of another report', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    const sockets = [];
    let release = () => {};
    try {
        const target = await signupUser(f.server, { displayName: 'Draft report target' });
        for (const [index, account] of [f.owner, target].entries()) sockets.push(await connectSocket(f.server.baseUrl, { extraHeaders: { Cookie: account.cookie }, clientId: `review6-report-${index}` }));
        const created = await emitAck(sockets[0], 'create-room', { roomName: 'Report draft review' });
        expect(created.ok).toBe(true);
        for (const [index, socket] of sockets.entries()) expect((await emitAck(socket, 'join-room', { roomId: created.room.roomId, username: `Draft reviewer ${index}`, clientId: `review6-report-${index}` })).ok).toBe(true);
        for (const [reason, detail] of [['spam', 'First draft report'], ['harassment', 'Second saved report']]) expect((await emitAck(sockets[0], 'report-user', { targetId: sockets[1].id, reason, detail })).ok).toBe(true);
        await page.goto(`${f.server.baseUrl}/ops/reports`); await loaded(page, 'reports');
        const draft = page.locator('#staff-cases .row').filter({ hasText: 'First draft report' });
        const saved = page.locator('#staff-cases .row').filter({ hasText: 'Second saved report' });
        await draft.locator('summary').click();
        await draft.getByLabel('Status', { exact: true }).selectOption('dismissed');
        await draft.getByLabel('Decision reason', { exact: true }).fill('Unsaved reasoning that must remain attached to the first report');
        await saved.locator('summary').click();
        await saved.getByLabel('Status', { exact: true }).selectOption('resolved');
        await saved.getByLabel('Decision reason', { exact: true }).fill('Completed second report');
        await saved.getByRole('button', { name: 'Save review outcome' }).click();
        await expect(saved.locator('.ops-status')).toHaveText('Resolved');
        await expect.soft(draft.locator('details')).toHaveAttribute('open', '', { timeout: 1000 });
        await expect.soft(draft.getByLabel('Decision reason', { exact: true })).toHaveValue('Unsaved reasoning that must remain attached to the first report', { timeout: 1000 });
        await expect.soft(draft.getByLabel('Status', { exact: true })).toHaveValue('dismissed', { timeout: 1000 });
        const cases = (await f.request(f.ownerCookie, '/staff/cases')).body.cases;
        expect(cases.find(entry => entry.detail === 'First draft report').status).toBe('open');
        expect(cases.find(entry => entry.detail === 'Second saved report').status).toBe('resolved');
        let reached = () => {};
        const held = new Promise(resolve => { release = () => resolve(undefined); });
        const submitted = new Promise(resolve => { reached = () => resolve(undefined); });
        const caseId = cases.find(entry => entry.detail === 'First draft report').id;
        await page.route(`**/api/platform/staff/cases/${caseId}`, async route => {
            const response = await route.fetch(); expect(response.status()).toBe(200); reached(); await held; await route.fulfill({ response });
        });
        await draft.getByRole('button', { name: 'Save review outcome' }).click(); await submitted;
        await draft.getByLabel('Decision reason', { exact: true }).fill('Newer unsaved reasoning entered while the save was pending');
        release(); await expect(draft.locator('.ops-status')).toHaveText('Dismissed');
        await expect(draft.getByLabel('Decision reason', { exact: true })).toHaveValue('Newer unsaved reasoning entered while the save was pending');
        await page.locator('[data-lang-value="ar"]').click(); await loaded(page, 'reports');
        await expect(draft.locator('form input')).toHaveValue('Newer unsaved reasoning entered while the save was pending');
        await expect(draft).toContainText('استُعيدت تغييراتك غير المحفوظة.');
        await page.setViewportSize({ width: 390, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('restored-report-ar-390.png'), fullPage: true });
        const stored = (await f.request(f.ownerCookie, '/staff/cases')).body.cases.find(entry => entry.id === caseId);
        expect(stored.disposition).toBe('Unsaved reasoning that must remain attached to the first report');
    } finally { release(); await Promise.all(sockets.map(closeSocket)); await context.close(); await f.server.stop(); }
});

test('review6: unsent moderation reasons survive a failed read and remain attached to their account', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Unsent reason target' });
    const other = await signupUser(f.server, { displayName: 'Other reason target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Unsent moderation reasoning');
        await page.route('**/api/platform/staff/users?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
        await page.locator('#ops-refresh').click();
        await expect(page.locator('#ops-retry')).toBeVisible(); await expect(page.locator('#staff-users')).toBeEmpty();
        await page.unroute('**/api/platform/staff/users?*');
        await page.locator('#ops-retry').click(); await loaded(page, 'users');
        await expect(row.getByLabel('Reason for this action', { exact: true })).toHaveValue('Unsent moderation reasoning', { timeout: 2000 });
        await expect(page.locator('#staff-users .row').filter({ hasText: other.user.id }).locator('form')).toHaveCount(0);
        expect((await f.request(f.ownerCookie, `/staff/users?q=${target.user.id}`)).body.users[0].banned).toBe(false);
        await page.setViewportSize({ width: 390, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('restored-reason-en-390.png'), fullPage: true });
        await row.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.locator('#ops-refresh').click(); await loaded(page, 'users');
        await expect(row.locator('form')).toHaveCount(0);
    } finally { await context.close(); await f.server.stop(); }
});

test('review6: a late successful sibling read cannot repaint a failed overview', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    let release = () => {};
    let reached = () => {};
    const held = new Promise(resolve => { release = () => resolve(undefined); });
    const started = new Promise(resolve => { reached = () => resolve(undefined); });
    try {
        await page.route('**/api/platform/staff/cases', async route => {
            const response = await route.fetch(); reached(); await held; await route.fulfill({ response });
        });
        await page.route('**/api/platform/staff/operations', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' }));
        await page.goto(`${f.server.baseUrl}/ops/overview`); await started;
        await expect(page.locator('#ops-retry')).toBeVisible();
        const finished = page.waitForResponse('**/api/platform/staff/cases'); release(); await finished;
        await expect(page.locator('#ops-content')).toBeHidden();
        await expect(page.locator('#staff-overview')).toBeEmpty();
        await expect(page.locator('#ops-attention')).toBeEmpty();
        await expect(page.locator('#ops-retry')).toBeVisible();
        await page.unroute('**/api/platform/staff/cases'); await page.unroute('**/api/platform/staff/operations');
        await page.locator('#ops-retry').click(); await loaded(page, 'overview');
        await expect(page.locator('#staff-overview .metric')).toHaveCount(3);
    } finally { release(); await context.close(); await f.server.stop(); }
});

test('review6: an access gate discards inline drafts before staff verification is renewed', async ({ browser }, testInfo) => {
    const f = await fixture(testInfo);
    const target = await signupUser(f.server, { displayName: 'Private draft target' });
    const { page, context } = await openPage(browser, f.server.baseUrl, f.ownerCookie);
    try {
        await page.goto(`${f.server.baseUrl}/ops/users`); await loaded(page, 'users');
        const row = page.locator('#staff-users .row').filter({ hasText: target.user.id });
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await row.getByLabel('Reason for this action', { exact: true }).fill('Private unsent staff draft');
        await context.clearCookies({ name: 'coStudyStaff' });
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.locator('#ops-mfa')).toBeVisible(); await expect(page.locator('#staff-users')).toBeEmpty();
        await page.locator('#ops-mfa input').fill(f.recovery.get(f.owner.user.id).shift());
        await page.locator('#ops-mfa button').click(); await loaded(page, 'users');
        await expect(row.locator('form')).toHaveCount(0);
        await row.getByRole('button', { name: 'Ban account', exact: true }).click();
        await expect(row.getByLabel('Reason for this action', { exact: true })).toHaveValue('');
        const current = await page.request.get(`${f.server.baseUrl}/api/platform/staff/users?q=${target.user.id}`);
        expect(current.status()).toBe(200);
        expect((await current.json()).users[0].banned).toBe(false);
    } finally { await context.close(); await f.server.stop(); }
});
