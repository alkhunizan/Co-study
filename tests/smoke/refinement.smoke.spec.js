const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

let server;
let sequence = 100;
test.beforeAll(async () => {
    server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://',
        PLATFORM_DATABASE_URL: '', BILLING_PROVIDER: 'simulator', BILLING_MODE: 'test', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true', TRUST_PROXY: '1' } });
});
test.afterAll(async () => { await server?.stop(); });
test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${sequence++}` });
    await page.addInitScript(() => { if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en'); });
});
async function signIn(page) {
    const account = await signupUser(server);
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    return account;
}
async function roomFor(cookie = '') {
    const socket = await connectSocket(server.baseUrl, { clientId: `refine-${sequence++}`, extraHeaders: cookie ? { Cookie: cookie } : {} });
    try { return (await emitAck(socket, 'create-room', { roomName: 'Quiet local room' })).room.roomId; }
    finally { await closeSocket(socket); }
}
async function enterRoom(page, code, name) {
    await gotoTestPage(page, `${server.baseUrl}/study?room=${code}`);
    if (await page.locator('#join-overlay').isVisible()) {
        await page.locator('#join-name').fill(name);
        await page.locator('#join-form button[type=submit]').click();
    }
    await expect(page.locator('#join-overlay')).toBeHidden();
    await expect(page.locator('#chat-input')).toBeEnabled();
}

test('refinement: password return URLs stay local and retain the intended destination', async ({ page }) => {
    for (const next of ['/\\example.invalid', '/app#progress']) {
        await page.context().clearCookies();
        await gotoTestPage(page, `${server.baseUrl}/account?signup=1&next=${encodeURIComponent(next)}`);
        await page.locator('#tab-signup').click();
        await page.locator('#signup-nickname').fill('Local return');
        await page.locator('#signup-email').fill(`return-${Date.now()}@example.invalid`);
        await page.locator('#signup-password').fill('local-review-pass-123');
        await page.locator('#signup-form button[type=submit]').click();
        await expect(page).toHaveURL(next.includes('example.invalid') ? `${server.baseUrl}/open.html` : `${server.baseUrl}${next}`);
    }
    await gotoTestPage(page, `${server.baseUrl}/study?room=ZZZZZZ`);
    await expect(page.locator('.join-exit')).toBeVisible();
    await page.locator('.join-exit').click();
    await expect(page).toHaveURL(`${server.baseUrl}/open`);
});

test('refinement: circle links survive signup and a lost acceptance response', async ({ page }) => {
    const owner = await signupUser(server);
    const request = (route, method = 'POST', body = {}) => server.request(`/api/platform${route}`, { method, body, headers: { Cookie: owner.cookie } });
    const checkout = (await request('/billing/checkout')).body;
    await request(`/billing/checkout/${checkout.id}/complete`, 'POST', { token: checkout.token, outcome: 'success' });
    const circle = (await request('/cohorts', 'POST', { name: 'Return here together' })).body;
    const invite = (await request(`/cohorts/${circle.id}/invitations`)).body;
    await gotoTestPage(page, `${server.baseUrl}/app#circles`);
    await page.evaluate((token) => { location.hash = `circles?invite=${token}`; }, invite.token);
    await expect(page.locator('#guest .primary')).toHaveAttribute('href', `/account?next=${encodeURIComponent(`/app#circles?invite=${invite.token}`)}`);
    await gotoTestPage(page, `${server.baseUrl}/app#circles?invite=${invite.token}`);
    await page.locator('#guest .primary').click();
    await page.locator('#tab-signup').click();
    await page.locator('#signup-nickname').fill('Invited student');
    await page.locator('#signup-email').fill(`invite-${Date.now()}@example.invalid`);
    await page.locator('#signup-password').fill('local-review-pass-123');
    await page.locator('#signup-form button[type=submit]').click();
    await expect(page.locator('#invite-token')).toHaveValue(invite.token);
    await page.route('**/api/platform/cohorts/accept', async (route) => { await route.fetch(); await route.abort('failed'); });
    await page.locator('#invite-accept button').click();
    await expect(page.locator('#feedback')).toBeVisible();
    await expect(page.locator('#invite-token')).toHaveValue(invite.token);
    await page.unroute('**/api/platform/cohorts/accept');
    await page.locator('#invite-accept button').click();
    await expect(page.locator('#circle-title')).toHaveText('Return here together');
    await expect(page).toHaveURL(`${server.baseUrl}/app#circles`);
    await expect(page.locator('#create-invite')).toBeHidden();
    await expect(page.locator('#revoke-invites')).toBeHidden();
    expect((await request(`/cohorts/${circle.id}/members`, 'GET', undefined)).body.members).toHaveLength(2);
});

test('refinement: duplicate tabs reconcile pause, resume and completion; room reload recovers its session', async ({ page }) => {
    const account = await signIn(page);
    await gotoTestPage(page, `${server.baseUrl}/app`);
    await page.locator('.study-start a[href="/app#progress"]').click();
    await expect(page.locator('[data-panel=progress]')).toBeVisible();
    const second = await page.context().newPage();
    await gotoTestPage(second, `${server.baseUrl}/app#progress`);
    await expect(second.locator('#focus-start')).toBeVisible();
    await page.locator('#focus-start').click();
    await expect(second.locator('#focus-finish')).toBeVisible();
    await page.locator('#focus-pause').click();
    await expect(second.locator('#focus-state')).toHaveText('Paused');
    await second.locator('#focus-pause').click();
    await expect(page.locator('#focus-state')).toHaveText('Focusing');
    await second.locator('#focus-finish').click();
    await expect(page.locator('#focus-start')).toBeVisible();
    const code = await roomFor(account.cookie);
    await enterRoom(page, code, 'Room member');
    await page.locator('#btn-toggle').click();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    const id = await page.evaluate(() => (/** @type {any} */ (window)).HalaFocus.current().id);
    await page.reload();
    await expect(page.locator('#room-focus-finish')).toBeVisible();
    expect(await page.evaluate(() => (/** @type {any} */ (window)).HalaFocus.current().id)).toBe(id);
    await page.route('**/api/platform/focus/*/complete', async (route) => { await route.fetch(); await route.abort('failed'); });
    await page.locator('#room-focus-finish').click();
    await expect(page.locator('#room-focus-retry')).toBeVisible();
    await page.unroute('**/api/platform/focus/*/complete');
    await page.locator('#room-focus-retry').click();
    await expect(page.locator('#room-session-recap')).toBeVisible();
    await expect(page.locator('#room-recap-values')).toContainText('no points');
    await second.close();
});


test('refinement: real companionship, shared intention and quiet participation work in separate contexts', async ({ page, browser }) => {
    const code = await roomFor();
    await enterRoom(page, code, 'First student');
    await expect(page.locator('#room-company')).toContainText('first here');
    await expect(page.locator('#shared-intent')).toBeHidden();
    const context = await createTestContext(browser);
    await context.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
    const peer = await context.newPage();
    try {
        await enterRoom(peer, code, 'Second student');
        await expect(page.locator('#room-company')).toContainText('2');
        await page.locator('#shared-board-card').evaluate((element) => { (/** @type {HTMLDetailsElement} */ (element)).open = true; });
        await page.locator('#room-goal').fill('One chapter together');
        await page.locator('#room-goal').press('Tab');
        await expect(peer.locator('#shared-intent-text')).toHaveText('One chapter together');
        await page.locator('#quiet-ready').click();
        await expect(page.locator('#quiet-ready')).toHaveAttribute('aria-pressed', 'true');
        await page.locator('#status-share').uncheck();
        await expect(page.locator('#status-preview')).toHaveText('Hidden');
        await expect(peer.locator('#room-focus-message')).toContainText('this device');
        await expect(peer.locator('#room-focus-finish')).toBeHidden();
    } finally { await context.close(); }
    await expect(page.locator('#room-company')).toContainText('first here');
});


test('refinement: responsive bilingual themes, keyboard focus and accessible member surfaces', async ({ page }, info) => {
    test.setTimeout(300000);
    await signIn(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const matrix = [];
    for (const width of [320, 390, 768, 1440]) for (const lang of ['ar', 'en']) for (const theme of ['light', 'dark']) {
        await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
        await gotoTestPage(page, `${server.baseUrl}/app`);
        await page.locator(`[data-lang-value=${lang}]`).click();
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
        for (const view of ['home', 'progress', 'circles', 'account']) {
            await gotoTestPage(page, `${server.baseUrl}/app#${view}`);
            await expect(page.locator(`[data-panel=${view}]`)).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('lang', lang);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${lang}/${theme}/${view} overflow`).toBe(true);
            const findings = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
            expect(findings.violations.filter((entry) => ['serious', 'critical'].includes(entry.impact))).toEqual([]);
            await page.screenshot({ path: info.outputPath(`workspace-${view}-${width}-${lang}-${theme}.png`), fullPage: true });
            matrix.push({ width, lang, theme, view, violations: findings.violations.map((entry) => entry.id) });
        }
    }
    await gotoTestPage(page, `${server.baseUrl}/app`);
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    expect(errors).toEqual([]);
    await info.attach('matrix', { body: JSON.stringify(matrix, null, 2), contentType: 'application/json' });
});
