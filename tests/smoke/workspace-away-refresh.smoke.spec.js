const { test, expect, gotoTestPage } = require('../helpers/playwright-test');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

const evidence = path.resolve('docs/away/2026-10-26/A03');
let server;
let client = 10;

test.beforeAll(async () => {
    fs.mkdirSync(evidence, { recursive: true });
    server = await startServer({ env: {
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true',
        BILLING_MODE: 'test', BILLING_PROVIDER: 'simulator', TRUST_PROXY: '1',
    } });
    fs.writeFileSync(path.join(evidence, 'server.json'), JSON.stringify({ pid: server.pid, baseUrl: server.baseUrl, state: 'running' }));
});
test.afterAll(async () => {
    if (server) {
        await server.stop();
        fs.writeFileSync(path.join(evidence, 'server.json'), JSON.stringify({ pid: server.pid, baseUrl: server.baseUrl, state: 'stopped' }));
    }
});

async function member(page, language) {
    const address = `203.0.113.${client++}`;
    const account = await signupUser({ request: (url, options) => server.request(url, {
        ...options, headers: { ...options.headers, 'X-Forwarded-For': address },
    }) }, { displayName: 'Workspace fixture' });
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language);
    await gotoTestPage(page, `${server.baseUrl}/app#home`);
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('[data-panel=home]')).toBeVisible();
    await expect(page.locator('#study-status')).toBeHidden();
    return account;
}

async function settleRefreshes(page) {
    await page.evaluate(async () => {
        await Promise.all(/** @type {any} */ (window).workspaceRequests);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect(page.locator('#study-status')).toBeHidden();
}

async function observeRefreshes(page) {
    await page.evaluate(() => {
        const g = /** @type {any} */ (window);
        const request = g.HalaCore.requestJson;
        g.workspaceRequests = [];
        g.HalaCore.requestJson = (...args) => {
            const pending = request(...args);
            if (['/api/platform/me', '/api/platform/progress', '/api/platform/rooms', '/api/platform/dashboard'].includes(args[1])) {
                g.workspaceRequests.push(pending.catch(() => null));
            }
            return pending;
        };
    });
}

for (const [language, width, theme] of [['en', 1440, 'light'], ['ar', 390, 'light'], ['en', 390, 'dark'], ['ar', 1440, 'dark']]) {
    test(`navigation failure remains scoped to its original view and retries (${language}, ${width}, ${theme})`, async ({ page }, info) => {
        await page.setViewportSize({ width: Number(width), height: 1000 });
        await member(page, language);
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click();
        await observeRefreshes(page);
        let entered;
        const requested = new Promise((resolve) => { entered = resolve; });
        let release = () => {};
        const held = new Promise((resolve) => { release = () => resolve(undefined); });
        let fail = true;
        await page.route('**/api/platform/dashboard', async (route) => {
            if (!fail) return route.continue();
            entered();
            await held;
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PERSISTENCE_UNAVAILABLE' }) });
        });
        try {
            await page.locator('.platform-nav [data-view=circles]').click();
            await requested;
            await page.locator('.platform-nav [data-view=account]').click();
            release();
            await settleRefreshes(page);
            await page.screenshot({ path: info.outputPath('after-navigation.png'), fullPage: true });
            await expect(page.locator('[data-panel=account]')).toBeVisible();
            await expect(page.locator('#feedback')).toBeHidden();
            await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

            // Positive failure control: a failure on the active view must remain visible and localized.
            await page.locator('.platform-nav [data-view=circles]').click();
            await settleRefreshes(page);
            await expect(page.locator('#feedback')).toContainText(language === 'ar' ? 'تعذّر' : 'could not');
            await expect(page.locator('#feedback')).not.toContainText('PERSISTENCE_UNAVAILABLE');
            await page.screenshot({ path: info.outputPath('active-view-error.png'), fullPage: true });

            // Returning after recovery refreshes real data and clears the old notice.
            fail = false;
            await page.locator('.platform-nav [data-view=account]').click();
            await page.locator('.platform-nav [data-view=circles]').click();
            await settleRefreshes(page);
            await expect(page.locator('#feedback')).toBeHidden();
            await expect(page.locator('#circle-list .empty')).toBeVisible();
            await page.screenshot({ path: info.outputPath('recovered-view.png'), fullPage: true });
        } finally { release(); }
    });
}

test('an older workspace refresh cannot replace newer room data', async ({ page }, info) => {
    await member(page, 'en');
    await observeRefreshes(page);
    const staleRoom = { id: 'OLDER1', name: 'Older room response', exists: true, can_manage: false };
    const latestRoom = { id: 'NEWER1', name: 'Newer room response', exists: true, can_manage: false };
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    let release = () => {};
    const held = new Promise((resolve) => { release = () => resolve(undefined); });
    let calls = 0;
    await page.route('**/api/platform/rooms', async (route) => {
        const first = ++calls === 1;
        if (first) { entered(); await held; }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rooms: [first ? staleRoom : latestRoom] }) });
    });
    try {
        await page.locator('.platform-nav [data-view=circles]').click();
        await requested;
        await page.locator('.platform-nav [data-view=home]').click();
        await expect(page.locator('#owned-rooms')).toContainText(latestRoom.name);
        release();
        await settleRefreshes(page);
        await page.screenshot({ path: info.outputPath('latest-response.png'), fullPage: true });
        await expect(page.locator('#owned-rooms')).toContainText(latestRoom.name);
        await expect(page.locator('#owned-rooms')).not.toContainText(staleRoom.name);
        expect(calls).toBe(2);
    } finally { release(); }
});

test('an older failure cannot replace a successful retry on the same view', async ({ page }) => {
    await member(page, 'en');
    await observeRefreshes(page);
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    let release = () => {};
    const held = new Promise((resolve) => { release = () => resolve(undefined); });
    let calls = 0;
    await page.route('**/api/platform/rooms', async (route) => {
        if (++calls !== 1) return route.continue();
        entered();
        await held;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PERSISTENCE_UNAVAILABLE' }) });
    });
    try {
        await page.locator('.platform-nav [data-view=home]').click();
        await requested;
        const retried = page.waitForResponse((response) => response.url().endsWith('/api/platform/rooms') && response.status() === 200);
        await page.locator('.platform-nav [data-view=home]').click();
        await retried;
        release();
        await settleRefreshes(page);
        await expect(page.locator('#feedback')).toBeHidden();
        expect(calls).toBe(2);
    } finally { release(); }
});

test('a pending workspace refresh cannot erase a newly started focus session', async ({ page }, info) => {
    const account = await member(page, 'en');
    await observeRefreshes(page);
    let entered;
    const requested = new Promise((resolve) => { entered = resolve; });
    let release = () => {};
    const held = new Promise((resolve) => { release = () => resolve(undefined); });
    let calls = 0;
    await page.route('**/api/platform/rooms', async (route) => {
        if (++calls !== 1) return route.continue();
        const response = await route.fetch();
        entered();
        await held;
        await route.fulfill({ response });
    });
    try {
        await page.locator('.platform-nav [data-view=home]').click();
        await requested;
        // The old progress response is complete; only the unrelated room request remains held.
        await page.evaluate(async () => {
            const requests = /** @type {any} */ (window).workspaceRequests;
            await Promise.all([requests[0], requests[1], requests[3]]);
        });
        await page.locator('.platform-nav [data-view=progress]').click();
        await page.locator('#focus-start').click();
        await expect(page.locator('#focus-state')).toHaveText('Focusing');
        release();
        await settleRefreshes(page);
        await page.screenshot({ path: info.outputPath('focus-after-late-refresh.png'), fullPage: true });
        const current = await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } });
        expect(current.body.current.state).toBe('active');
        await expect(page.locator('#focus-state')).toHaveText('Focusing');
        await expect(page.locator('#focus-start')).toBeHidden();
        await page.locator('#focus-pause').click();
        await expect(page.locator('#focus-state')).toHaveText('Paused');
        await page.locator('#focus-finish').click();
        await expect(page.locator('#focus-recap')).toBeVisible();
    } finally { release(); }
});

test('translating a circle schedule draft preserves its selected room through save', async ({ page }, info) => {
    const account = await member(page, 'en');
    const headers = { Cookie: account.cookie };
    const checkout = await server.request('/api/platform/billing/checkout', { method: 'POST', headers, body: {} });
    expect(checkout.status).toBe(200);
    const activated = await server.request(`/api/platform/billing/checkout/${checkout.body.id}/complete`, {
        method: 'POST', headers, body: { token: checkout.body.token, outcome: 'success' },
    });
    expect(activated.status).toBe(200);
    const circle = await server.request('/api/platform/cohorts', { method: 'POST', headers, body: { name: 'Study schedule fixture' } });
    expect(circle.status).toBe(200);
    const socket = await connectSocket(server.baseUrl, { extraHeaders: headers, clientId: `workspace-away-${Date.now()}` });
    try {
        for (const roomName of ['First focus room', 'Chosen focus room']) {
            const room = await emitAck(socket, 'create-room', { roomName });
            expect(room.ok).toBe(true);
        }
        await gotoTestPage(page, `${server.baseUrl}/app#circles`);
        await page.locator('#circle-list button').click();
        await expect(page.locator('#session-room option')).toHaveCount(2);
        const chosenRoom = await page.locator('#session-room option').nth(1).getAttribute('value');
        await page.locator('#session-room').selectOption(chosenRoom);
        await page.locator('#session-create [name=title]').fill('مراجعة كيمياء');
        const start = await page.evaluate(() => {
            const date = new Date(Date.now() + 86400000);
            const pad = (n) => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        });
        await page.locator('#session-create [name=startsAt]').fill(start);
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.locator('[data-lang-value=ar]').click();
        await expect(page.locator('#circle-detail')).toBeVisible();
        await expect(page.locator('#study-status')).toBeHidden();
        await page.screenshot({ path: info.outputPath('schedule-draft-ar.png'), fullPage: true });
        await expect(page.locator('#session-room')).toHaveValue(chosenRoom);
        await expect(page.locator('#session-create [name=title]')).toHaveValue('مراجعة كيمياء');
        await expect(page.locator('#session-create [name=startsAt]')).toHaveValue(start);
        await page.locator('[data-lang-value=en]').click();
        await expect(page.locator('#circle-detail')).toBeVisible();
        await expect(page.locator('#session-room')).toHaveValue(chosenRoom);

        // If a previously chosen room is no longer available, never silently schedule in another one.
        await page.route('**/api/platform/rooms', async (route) => {
            const response = await route.fetch();
            const data = await response.json();
            await route.fulfill({ response, json: { rooms: data.rooms.filter((room) => room.id !== chosenRoom) } });
        });
        await page.evaluate(() => /** @type {any} */ (window).HalaPlatform.refresh());
        await page.locator('[data-lang-value=ar]').click();
        await expect(page.locator('#circle-detail')).toBeVisible();
        await expect(page.locator('#session-room')).toHaveValue('');
        expect(await page.locator('#session-room').evaluate((select) => /** @type {HTMLSelectElement} */ (select).validity.valueMissing)).toBe(true);
        await expect(page.locator('#session-create [name=title]')).toHaveValue('مراجعة كيمياء');
        await page.unroute('**/api/platform/rooms');
        await page.evaluate(() => /** @type {any} */ (window).HalaPlatform.refresh());
        await page.locator('[data-lang-value=en]').click();
        await expect(page.locator('#session-room option')).toHaveCount(2);
        await page.locator('#session-room').selectOption(chosenRoom);
        await page.locator('#session-create button').click();
        await expect(page.locator('#circle-sessions')).toContainText('مراجعة كيمياء');
        const saved = await server.request(`/api/platform/cohorts/${circle.body.id}/sessions`, { headers });
        expect(saved.status).toBe(200);
        expect(saved.body.sessions).toHaveLength(1);
        expect(saved.body.sessions[0].room_id).toBe(chosenRoom);
    } finally { await closeSocket(socket); }
});
