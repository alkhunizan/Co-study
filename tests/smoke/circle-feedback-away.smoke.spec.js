const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

const evidence = path.resolve('docs/away/2026-10-26/A13');
let server, account, circle, otherCircle, socket;

test.beforeAll(async () => {
    fs.mkdirSync(evidence, { recursive: true });
    server = await startServer({ env: {
        PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh',
        BILLING_MODE: 'test', BILLING_PROVIDER: 'simulator',
    } });
    fs.writeFileSync(path.join(evidence, 'server.json'), JSON.stringify({ pid: server.pid, baseUrl: server.baseUrl, state: 'running' }));
    account = await signupUser(server, { displayName: 'Circle feedback fixture' });
    const headers = { Cookie: account.cookie };
    const checkout = await server.request('/api/platform/billing/checkout', { method: 'POST', headers, body: {} });
    expect(checkout.status).toBe(200);
    const activated = await server.request(`/api/platform/billing/checkout/${checkout.body.id}/complete`, {
        method: 'POST', headers, body: { token: checkout.body.token, outcome: 'success' },
    });
    expect(activated.status).toBe(200);
    for (const name of ['Circle recovery fixture', 'Other circle fixture']) {
        const result = await server.request('/api/platform/cohorts', { method: 'POST', headers, body: { name } });
        expect(result.status).toBe(200);
        if (!circle) circle = result.body;
        else otherCircle = result.body;
    }
    socket = await connectSocket(server.baseUrl, { extraHeaders: headers, clientId: `circle-away-${Date.now()}` });
    for (const roomName of ['First fixture room', 'Chosen fixture room']) {
        const room = await emitAck(socket, 'create-room', { roomName });
        expect(room.ok).toBe(true);
    }
});

test.afterAll(async () => {
    if (socket) await closeSocket(socket);
    if (server) {
        await server.stop();
        fs.writeFileSync(path.join(evidence, 'server.json'), JSON.stringify({ pid: server.pid, baseUrl: server.baseUrl, state: 'stopped' }));
    }
});

async function openCircle(page, language, width) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.context().addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await page.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language);
    await page.goto(`${server.baseUrl}/app#circles`);
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#circle-list .row').filter({ hasText: circle.name }).getByRole('button').click();
    await expect(page.locator('#circle-detail')).toBeVisible();
    await expect(page.locator('#session-room option')).toHaveCount(2);
    await expect(page.locator('#study-status')).toBeHidden();
    await page.evaluate(() => {
        const g = /** @type {any} */ (window);
        const request = g.HalaCore.requestJson;
        g.circleAwayRequests = [];
        g.HalaCore.requestJson = (...args) => {
            const pending = request(...args);
            if (String(args[1]).includes('/cohorts/')) g.circleAwayRequests.push(pending.catch(() => null));
            return pending;
        };
    });
}

async function settleCircle(page) {
    await page.evaluate(async () => {
        await Promise.all(/** @type {any} */ (window).circleAwayRequests);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
}

async function draft(page, title, days = 2) {
    const room = await page.locator('#session-room option').nth(1).getAttribute('value');
    await page.locator('#session-room').selectOption(room);
    await page.locator('#session-create [name=title]').fill(title);
    const start = await page.evaluate((offset) => {
        const date = new Date(Date.now() + offset * 86400000);
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }, days);
    await page.locator('#session-create [name=startsAt]').fill(start);
    await page.locator('#session-create').evaluate((form) => form.setAttribute('data-away-mounted', 'retained'));
    return { room, start, title };
}

async function expectDraft(page, saved) {
    await expect(page.locator('#session-create')).toHaveAttribute('data-away-mounted', 'retained');
    await expect(page.locator('#session-room')).toHaveValue(saved.room);
    await expect(page.locator('#session-create [name=title]')).toHaveValue(saved.title);
    await expect(page.locator('#session-create [name=startsAt]')).toHaveValue(saved.start);
}

for (const [language, width] of [['en', 1440], ['ar', 390], ['en', 390], ['ar', 1440]]) {
    test(`translated circle failure retains draft and retries (${language}, ${width})`, async ({ page }, info) => {
        await openCircle(page, language === 'ar' ? 'en' : 'ar', width);
        const saved = await draft(page, 'مراجعة المجموعة · Circle draft');
        let unavailable = true;
        let failures = 0;
        await page.route(`**/api/platform/cohorts/${circle.id}/members`, async (route) => {
            if (!unavailable) return route.continue();
            failures++;
            return route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' });
        });
        await page.locator(`[data-lang-value=${language}]`).click();
        await settleCircle(page);
        await page.screenshot({ path: info.outputPath('circle-refresh-error.png'), fullPage: true });
        const retry = page.locator('#circle-unavailable [data-core-unavailable=retry]');
        await expect(retry).toBeVisible();
        await expect(retry).toHaveText(language === 'ar' ? 'إعادة المحاولة' : 'Retry');
        await expect(page.locator('#circle-unavailable [data-core-unavailable=message]')).toHaveText(
            language === 'ar' ? 'تعذّر تحميل البيانات. حاول مرة أخرى.' : 'Data is unavailable. Please try again.',
        );
        await expectDraft(page, saved);
        await retry.focus();
        await page.keyboard.press('Enter');
        await expect.poll(() => failures).toBe(2);
        await settleCircle(page);
        await expect(retry).toBeVisible();
        await expect(retry).toBeEnabled();
        unavailable = false;
        await retry.click();
        await settleCircle(page);
        await expect(page.locator('#circle-detail')).toBeVisible();
        await expect(page.locator('#circle-unavailable')).toBeHidden();
        await expectDraft(page, saved);
        await page.screenshot({ path: info.outputPath('circle-refresh-recovered.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const result = await server.request(`/api/platform/cohorts/${circle.id}/sessions`, { headers: { Cookie: account.cookie } });
        expect(result.status).toBe(200);
        expect(result.body.sessions.filter((session) => session.title === saved.title)).toHaveLength(0);
    });
}

for (const [language, width] of [['en', 1440], ['ar', 390]]) {
    test(`schedule save feedback follows its originating view (${language}, ${width})`, async ({ page }, info) => {
        await openCircle(page, language, width);
        const saved = await draft(page, `Delayed ${language} schedule`);
        let release = () => {};
        const held = new Promise((resolve) => { release = () => resolve(undefined); });
        let committed = false;
        const routePattern = `**/api/platform/cohorts/${circle.id}/sessions`;
        await page.route(routePattern, async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            committed = true;
            await held;
            await route.fulfill({ response });
        });
        try {
            await page.locator('#session-create button').click();
            await expect.poll(() => committed).toBe(true);
            await page.locator('.platform-nav [data-view=account]').click();
            await expect(page.locator('[data-panel=account]')).toBeVisible();
            release();
            await expect(page.locator('#session-create button')).toBeEnabled();
            await settleCircle(page);
            await page.screenshot({ path: info.outputPath('account-after-circle-save.png'), fullPage: true });
            await expect(page.locator('#feedback')).toBeHidden();
            const persisted = await server.request(`/api/platform/cohorts/${circle.id}/sessions`, { headers: { Cookie: account.cookie } });
            const matches = persisted.body.sessions.filter((session) => session.title === saved.title);
            expect(matches).toHaveLength(1);
            expect(matches[0].room_id).toBe(saved.room);
            await page.unroute(routePattern);
            await page.locator('.platform-nav [data-view=circles]').click();
            await expect(page.locator('#circle-sessions')).toContainText(saved.title);
            const sameView = await draft(page, `Current ${language} schedule`, 3);
            await page.locator('#session-create button').click();
            await expect(page.locator('#feedback')).toHaveText(language === 'ar' ? 'تم الحفظ.' : 'Saved.');
            await expect(page.locator('#circle-sessions')).toContainText(sameView.title);
            await page.screenshot({ path: info.outputPath('circle-save-confirmed.png'), fullPage: true });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        } finally { release(); }
    });
}

test('an obsolete circle failure cannot replace a newly selected circle with retry', async ({ page }) => {
    await openCircle(page, 'en', 1440);
    let release = () => {};
    const held = new Promise((resolve) => { release = () => resolve(undefined); });
    let requested = false;
    await page.route(`**/api/platform/cohorts/${circle.id}/members`, async (route) => {
        requested = true;
        await held;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' });
    });
    try {
        await page.locator('[data-lang-value=ar]').click();
        await expect.poll(() => requested).toBe(true);
        await page.locator('#circle-list .row').filter({ hasText: otherCircle.name }).getByRole('button').click();
        await expect(page.locator('#circle-title')).toHaveText(otherCircle.name);
        release();
        await settleCircle(page);
        await expect(page.locator('#circle-detail')).toBeVisible();
        await expect(page.locator('#circle-title')).toHaveText(otherCircle.name);
        await expect(page.locator('#circle-unavailable')).toBeHidden();
    } finally { release(); }
});

for (const [language, width] of [['en', 1440], ['ar', 390]]) {
    test(`normal View retry clears its failed-read feedback after recovery (${language}, ${width})`, async ({ page }, info) => {
        await openCircle(page, language, width);
        let unavailable = true;
        await page.route(`**/api/platform/cohorts/${circle.id}/members`, (route) => unavailable
            ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' })
            : route.continue());
        await page.locator('#circle-list .row').filter({ hasText: circle.name }).getByRole('button').click();
        await expect(page.locator('#feedback')).toBeVisible();
        await expect(page.locator('#feedback')).toHaveClass(/error/);
        await expect(page.locator('#circle-unavailable')).toBeVisible();
        unavailable = false;
        await page.locator('#circle-unavailable [data-core-unavailable=retry]').click();
        await settleCircle(page);
        await expect(page.locator('#circle-detail')).toBeVisible();
        await page.screenshot({ path: info.outputPath('view-retry-recovered.png'), fullPage: true });
        await expect(page.locator('#feedback')).toBeHidden();
        await expect(page.locator('#circle-unavailable')).toBeHidden();
    });
}

for (const view of ['circles', 'progress']) {
    test(`circle retry preserves newer feedback on ${view}`, async ({ page }) => {
        await openCircle(page, 'en', 1440);
        let reads = 0;
        let release = () => {};
        const held = new Promise((resolve) => { release = () => resolve(undefined); });
        await page.route(`**/api/platform/cohorts/${circle.id}/members`, async (route) => {
            if (++reads === 1) return route.fulfill({
                status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
            });
            const response = await route.fetch();
            await held;
            return route.fulfill({ response });
        });
        try {
            await page.locator('#circle-list .row').filter({ hasText: circle.name }).getByRole('button').click();
            await expect(page.locator('#feedback')).toHaveClass(/error/);
            await page.locator('#circle-unavailable [data-core-unavailable=retry]').click();
            await expect.poll(() => reads).toBe(2);
            if (view === 'progress') {
                await page.locator('.platform-nav [data-view=progress]').click();
                await page.route('**/api/platform/focus/start', (route) => route.fulfill({
                    status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
                }));
                await page.locator('#focus-start').click();
                await expect(page.locator('#focus-start')).toBeEnabled();
            } else {
                await page.route('**/api/platform/cohorts', (route) => route.fulfill({
                    status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
                }));
                await page.locator('#circle-name').fill('Newer failed action');
                await page.locator('#circle-create button').click();
                await expect(page.locator('#circle-create button')).toBeEnabled();
            }
            await expect(page.locator('#feedback')).toBeVisible();
            await expect(page.locator('#feedback')).toHaveClass(/error/);
            release();
            await settleCircle(page);
            await expect(page.locator(`[data-panel=${view}]`)).toBeVisible();
            await expect(page.locator('#feedback')).toBeVisible();
            await expect(page.locator('#feedback')).toHaveClass(/error/);
        } finally { release(); }
    });
}

test('a rejected circle retry keeps feedback in its originating view after navigation', async ({ page }) => {
    await openCircle(page, 'en', 1440);
    let reads = 0;
    let release = () => {};
    const held = new Promise((resolve) => { release = () => resolve(undefined); });
    await page.route(`**/api/platform/cohorts/${circle.id}/members`, async (route) => {
        if (++reads > 1) await held;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' });
    });
    try {
        await page.locator('#circle-list .row').filter({ hasText: circle.name }).getByRole('button').click();
        await expect(page.locator('#feedback')).toHaveClass(/error/);
        await page.locator('#circle-unavailable [data-core-unavailable=retry]').click();
        await expect.poll(() => reads).toBe(2);
        await page.locator('.platform-nav [data-view=progress]').click();
        await expect(page.locator('#feedback')).toBeHidden();
        release();
        await settleCircle(page);
        await expect(page.locator('[data-panel=progress]')).toBeVisible();
        await expect(page.locator('#feedback')).toBeHidden();
        await expect(page.locator('#circle-unavailable')).toBeHidden();
        await page.locator('.platform-nav [data-view=circles]').click();
        await expect(page.locator('#circle-unavailable [data-core-unavailable=retry]')).toBeVisible();
        await expect(page.locator('#circle-unavailable [data-core-unavailable=retry]')).toBeEnabled();
    } finally { release(); }
});
