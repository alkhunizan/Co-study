const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

// Regression coverage for audit-2026-10-29 rows A-07 to A-12.

async function fixture(browser, server) {
    const account = await signupUser(server, { displayName: 'Audit planner' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(
        account.cookie.split(';').map((s) => {
            const [name, ...value] = s.trim().split('=');
            return { name, value: value.join('='), url: server.baseUrl };
        }),
    );
    await context.addInitScript(() => {
        if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const call = (path, method = 'GET', body) =>
        server.request(`/api/platform/study${path}`, { method, body, headers: { Cookie: account.cookie } });
    return { account, context, page, call };
}
async function open(page, server) {
    await page.goto(`${server.baseUrl}/app#planner`);
    await expect(page.locator('#study-task')).toBeVisible();
    await expect(page.locator('#study-status')).toBeEmpty();
}
const copy = (page, key, lang = 'en') =>
    page.evaluate(([k, l]) => /** @type {any} */ (window).HalaPlatformCopy[l][k], [key, lang]);
const task = (title, steps = []) => ({
    title,
    estimate_minutes: 25,
    priority: 'normal',
    recurrence: 'none',
    steps: steps.map((text, i) => ({ id: `s${i}`, text, done: false })),
    requestId: randomUUID(),
});
async function boot(browser) {
    const server = await startServer({
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh' },
    });
    const f = await fixture(browser, server);
    return { server, ...f };
}

test('A-07 an open edit still saves after its own step was ticked', async ({ browser }) => {
    const { server, context, page, call } = await boot(browser);
    try {
        expect((await call('/tasks', 'POST', task('Edit me', ['First', 'Second']))).status).toBe(200);
        await open(page, server);
        await page.locator('#study-task-list [data-lang=editItem]').click();
        await page.locator('#study-task-title').fill('Edited after a tick');
        const ticked = page.waitForResponse((r) => r.request().method() === 'PATCH');
        await page.locator('#study-task-list input[type=checkbox]').first().check();
        expect((await ticked).status()).toBe(200);
        await expect(page.locator('#study-status')).toBeEmpty();
        await expect(page.locator('#study-task-title')).toHaveValue('Edited after a tick');
        const saved = page.waitForResponse((r) => r.request().method() === 'PATCH');
        await page.locator('#study-task button[type=submit]').click();
        expect((await saved).status()).toBe(200);
        await expect(page.locator('#study-status')).toHaveText(await copy(page, 'studySaved'));
        const [stored] = (await call('/overview')).body.tasks;
        expect(stored.title).toBe('Edited after a tick');
        expect(stored.steps.map((s) => s.done)).toEqual([true, false]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('A-08 two quick actions on one row use the latest version', async ({ browser }) => {
    const { server, context, page, call } = await boot(browser);
    let release = () => {};
    try {
        expect((await call('/tasks', 'POST', task('Quick ticks', ['One', 'Two']))).status).toBe(200);
        await open(page, server);
        let hold = null;
        await page.route('**/api/platform/study/overview', async (route) => {
            const response = await route.fetch();
            if (hold) await hold;
            await route.fulfill({ response });
        });
        hold = new Promise((resolve) => {
            release = () => resolve(undefined);
        });
        const boxes = page.locator('#study-task-list input[type=checkbox]');
        const first = page.waitForResponse((r) => r.request().method() === 'PATCH');
        await boxes.nth(0).check();
        expect((await first).status()).toBe(200);
        // The refresh is still held, so the row has not re-rendered yet.
        const second = page.waitForResponse((r) => r.request().method() === 'PATCH');
        await boxes.nth(1).check();
        expect((await second).status()).toBe(200);
        const complete = page.waitForResponse((r) => r.url().endsWith('/complete'));
        await page.locator('#study-task-list [data-lang=completeTask]').click();
        expect((await complete).status()).toBe(200);
        page.once('dialog', (d) => void d.accept());
        const archive = page.waitForResponse((r) => r.request().method() === 'PATCH');
        await page.locator('#study-task-list [data-lang=archiveItem]').click();
        expect((await archive).status()).toBe(200);
        release();
        hold = null;
        await expect(page.locator('#study-status')).toBeEmpty();
        expect((await call('/overview')).body.tasks).toEqual([]);
    } finally {
        release();
        await context.close();
        await server.stop();
    }
});

test('A-09 archive and remove ask first and do nothing when declined', async ({ browser }) => {
    const { server, context, page, call, account } = await boot(browser);
    let socket;
    try {
        socket = await connectSocket(server.baseUrl, {
            extraHeaders: { Cookie: account.cookie },
            clientId: 'audit-a09-owner',
        });
        const room = await emitAck(socket, 'create-room', { roomName: 'Archive check room' });
        expect(room.ok).toBe(true);
        expect((await call('/tasks', 'POST', task('Keep me'))).status).toBe(200);
        expect((await call('/projects', 'POST', { name: 'Keep project', requestId: randomUUID() })).status).toBe(200);
        expect((await call('/distractions', 'POST', { text: 'Keep thought', requestId: randomUUID() })).status).toBe(
            200,
        );
        const routine = {
            name: 'Keep routine',
            focus_minutes: 25,
            break_minutes: 5,
            long_break_minutes: 15,
            cycles: 2,
            long_every: 2,
            requestId: randomUUID(),
        };
        expect((await call('/routines', 'POST', routine)).status).toBe(200);
        expect((await call('/bookmarks', 'POST', { roomId: room.room.roomId })).status).toBe(200);
        await open(page, server);
        /** @type {Array<[string, string, string, ((o: any) => any[]) | null]>} */
        const cases = [
            ['tasksTab', '#study-task-list [data-lang=archiveItem]', 'archiveItemConfirm', (o) => o.tasks],
            ['tasksTab', '[data-lang=archiveProject]', 'archiveProjectConfirm', (o) => o.projects],
            ['tasksTab', '#study-thought-list [data-lang=archiveItem]', 'archiveItemConfirm', (o) => o.distractions],
            ['routinesTab', '#study-routine-list [data-lang=archiveItem]', 'archiveItemConfirm', (o) => o.routines],
            ['libraryTab', '#study-favorites [data-lang=removeSaved]', 'removeSavedConfirm', null],
        ];
        for (const [tab, selector, key, pick] of cases) {
            const count = async () =>
                pick ? pick((await call('/overview')).body).length : (await call('/bookmarks')).body.bookmarks.length;
            await page.locator(`.study-tabs [data-lang="${tab}"]`).click();
            await expect(page.locator('#study-status')).toBeEmpty();
            const expected = await copy(page, key);
            expect(expected, `${key} has copy`).toBeTruthy();
            /** @type {string[]} */
            const seen = [];
            page.once('dialog', (d) => {
                seen.push(`${d.type()}:${d.message()}`);
                void d.dismiss();
            });
            await page.locator(selector).click();
            await expect.poll(() => seen, { timeout: 3000 }).toEqual([`confirm:${expected}`]);
            await expect(page.locator(selector)).toBeEnabled();
            expect(await count(), `${selector} kept after decline`).toBe(1);
            page.once('dialog', (d) => void d.accept());
            await page.locator(selector).click();
            await expect.poll(count).toBe(0);
        }
        for (const key of ['archiveItemConfirm', 'archiveProjectConfirm', 'archiveResourceConfirm', 'removeSavedConfirm'])
            expect(await copy(page, key, 'ar'), `${key} ar`).toBeTruthy();
    } finally {
        if (socket) await closeSocket(socket);
        await context.close();
        await server.stop();
    }
});

test('A-10 a signed-out save and a background account change keep drafts without reloading', async ({
    browser,
}) => {
    const { server, context, page, call } = await boot(browser);
    try {
        const prefs = await call('/preferences', 'PUT', {
            version: 0,
            daily_target: 30,
            weekly_target: 150,
            reminders: true,
            reminder_minutes: 5,
        });
        expect(prefs.status).toBe(200);
        await open(page, server);
        await page.evaluate(() => {
            /** @type {any} */ (window).__noReload = true;
        });
        await page.locator('#study-task-title').fill('Unsaved draft survives');
        await page.route('**/api/platform/study/tasks', (route) =>
            route.fulfill({ status: 401, contentType: 'application/json', body: '{"errorCode":"AUTH_REQUIRED"}' }),
        );
        await page.locator('#study-task button[type=submit]').click();
        await expect(page.locator('#study-status')).toHaveText(await copy(page, 'studySignedOut'));
        expect(await page.evaluate(() => /** @type {any} */ (window).__noReload)).toBe(true);
        await expect(page.locator('#study-task-title')).toHaveValue('Unsaved draft survives');
        await expect(page.locator('#study-task')).toBeVisible();

        // Background reminder path: the timer must never reload the page.
        let agendaCalls = 0;
        await page.route('**/api/platform/study/agenda', (route) => {
            agendaCalls++;
            if (agendaCalls === 1)
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        sessions: [
                            {
                                id: 'audit-session',
                                title: 'Due soon',
                                circle_name: 'Fixture',
                                room_id: 'ABC123',
                                starts_at: Date.now() + 120000,
                                duration_minutes: 25,
                                going: 1,
                                status: 'going',
                            },
                        ],
                    }),
                });
            return route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: '{"errorCode":"AUTH_ACCOUNT_CHANGED"}',
            });
        });
        agendaCalls = 0;
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('halastudyrefresh')));
        await expect.poll(() => agendaCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => /** @type {any} */ (window).__noReload)).toBe(true);
        await expect(page.locator('#study-task-title')).toHaveValue('Unsaved draft survives');
        await expect(page.locator('#study-reminder-banner')).toBeHidden();
    } finally {
        await context.close();
        await server.stop();
    }
});

test('A-11 a missing room or session shows specific copy in both languages', async ({ browser }) => {
    const { server, context, page } = await boot(browser);
    try {
        await open(page, server);
        for (const key of ['ROOM_NOT_FOUND', 'SESSION_NOT_FOUND']) {
            const en = await copy(page, key);
            const ar = await copy(page, key, 'ar');
            expect(en, `${key} en`).toBeTruthy();
            expect(ar, `${key} ar`).toBeTruthy();
            expect(ar).not.toBe(en);
        }
        await page.locator('.study-tabs [data-lang="libraryTab"]').click();
        await page.locator('#study-bookmark-roomId').fill('NOPE99');
        await page.locator('#study-bookmark button[type=submit]').click();
        await expect(page.locator('#study-status')).toHaveText(await copy(page, 'ROOM_NOT_FOUND'));
        await expect(page.locator('#study-bookmark-roomId')).toHaveValue('NOPE99');

        await page.route('**/api/platform/study/agenda', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sessions: [
                        {
                            id: 'ended-session',
                            title: 'Already ended',
                            circle_name: 'Fixture',
                            room_id: 'ABC123',
                            starts_at: Date.now() + 3600000,
                            duration_minutes: 25,
                            going: 0,
                            status: null,
                        },
                    ],
                }),
            }),
        );
        await page.route('**/api/platform/study/agenda/*/rsvp', (route) =>
            route.fulfill({ status: 404, contentType: 'application/json', body: '{"errorCode":"SESSION_NOT_FOUND"}' }),
        );
        await page.locator('.study-tabs [data-lang="agendaTab"]').click();
        await expect(page.locator('#study-agenda')).toContainText('Already ended');
        await page.locator('#study-agenda select').selectOption('going');
        await expect(page.locator('#study-status')).toHaveText(await copy(page, 'SESSION_NOT_FOUND'));
    } finally {
        await context.close();
        await server.stop();
    }
});

test('A-12 a refresh requested during a load runs after it finishes', async ({ browser }) => {
    const { server, context, page, call } = await boot(browser);
    let release = () => {};
    try {
        await open(page, server);
        const held = new Promise((resolve) => {
            release = () => resolve(undefined);
        });
        let arrived = () => {};
        const fetched = new Promise((resolve) => {
            arrived = () => resolve(undefined);
        });
        await page.route(
            '**/api/platform/study/overview',
            async (route) => {
                const response = await route.fetch();
                arrived();
                await held;
                await route.fulfill({ response });
            },
            { times: 1 },
        );
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('halastudyrefresh')));
        await fetched;
        expect((await call('/tasks', 'POST', task('Created mid-load'))).status).toBe(200);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('halastudyrefresh')));
        release();
        await expect(page.locator('#study-task-list')).toContainText('Created mid-load');
        await expect(page.locator('#study-status')).toBeEmpty();
    } finally {
        release();
        await context.close();
        await server.stop();
    }
});
