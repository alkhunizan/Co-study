const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test('an opted-in reminder retries after a transient refresh failure without exposing stale details', async ({
    browser,
}) => {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
    let context;
    try {
        const f = await fixture(browser, server);
        context = f.context;
        const prefs = await server.request('/api/platform/study/preferences', {
            method: 'PUT',
            headers: { Cookie: f.account.cookie },
            body: { version: 0, daily_target: 30, weekly_target: 150, reminders: true, reminder_minutes: 5 },
        });
        expect(prefs.status).toBe(200);
        let calls = 0;
        await f.page.route('**/api/platform/study/agenda', (route) => {
            calls++;
            return route.fulfill({
                status: calls === 2 ? 503 : 200,
                contentType: 'application/json',
                body: JSON.stringify(
                    calls === 2
                        ? { error: 'PERSISTENCE_UNAVAILABLE' }
                        : {
                              sessions: [
                                  {
                                      id: 'synthetic-session',
                                      title: 'Synthetic reminder recovery',
                                      cohort_name: 'Fixture circle',
                                      room_id: 'ABC123',
                                      starts_at: Date.now() + 240000,
                                      duration_minutes: 25,
                                      status: 'going',
                                  },
                              ],
                          },
                ),
            });
        });
        await f.page.reload();
        await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
        await expect(f.page.locator('#study-reminder-banner')).toBeHidden();
        await expect(f.page.locator('#study-reminder-banner')).toContainText('Synthetic reminder recovery', {
            timeout: 5000,
        });
        await expect(f.page.locator('#study-reminder-banner')).toBeVisible();
        expect(calls).toBeGreaterThanOrEqual(3);
    } finally {
        await context?.close();
        await server.stop();
    }
});

test('a routine closed before another surface pauses keeps its remaining time on return', async ({ browser }) => {
    test.setTimeout(60000);
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
    let context;
    try {
        const f = await fixture(browser, server);
        context = f.context;
        const { page, account } = f;
        await server.request('/api/platform/study/routines', {
            method: 'POST',
            headers: { Cookie: account.cookie },
            body: {
                name: 'Return gently',
                focus_minutes: 25,
                break_minutes: 5,
                long_break_minutes: 15,
                cycles: 2,
                long_every: 2,
                requestId: require('node:crypto').randomUUID(),
            },
        });
        await page.reload();
        await choose(page, 'routinesTab');
        await page.locator('#study-routine-list [data-lang=useRoutine]').click();
        await page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        const current = (await server.request('/api/platform/progress', { headers: { Cookie: account.cookie } })).body
            .current;
        await page.close();
        await server.request(`/api/platform/focus/${current.id}/pause`, {
            method: 'POST',
            headers: { Cookie: account.cookie },
            body: {},
        });
        const returned = await context.newPage();
        await returned.clock.install({ time: new Date(Date.now() + 3600000) });
        await returned.goto(`${server.baseUrl}/app#progress`);
        await expect(returned.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
        await expect(returned.locator('#study-guide-clock')).not.toHaveText('00:00');
        expect(await returned.evaluate(() => /** @type {any} */ (window).HalaFocus.current().state)).toBe('paused');
    } finally {
        await context?.close();
        await server.stop();
    }
});
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

async function fixture(browser, server, name = 'Planner') {
    const account = await signupUser(server, { displayName: name });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
    });
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
    await page.goto(`${server.baseUrl}/app#planner`);
    await expect(page.locator('#study-task')).toBeVisible();
    await expect(page.locator('#study-status')).toBeEmpty();
    return { account, context, page };
}
async function choose(page, key) {
    await page.locator(`.study-tabs [data-lang="${key}"]`).click();
    await expect(page.locator(`.study-tabs [data-lang="${key}"]`)).toBeEnabled();
}

test('F01-F14 private planning, lost response, routines, task-linked focus, reflection and journal work end to end', async ({
    browser,
}, info) => {
    test.setTimeout(180000);
    const server = await startServer({
        env: {
            PLATFORM_ENABLED: 'true',
            PLATFORM_DATA_DIR: 'memory://',
            VIDEO_PROVIDER: 'mesh',
        },
    });
    let context;
    const errors = [];
    try {
        const fixtureA = await fixture(browser, server);
        context = fixtureA.context;
        const { page, account } = fixtureA;
        page.on('pageerror', (e) => errors.push(e.message));
        await page.locator('#study-project-name').fill('Biology');
        await page.locator('#study-project button[type=submit]').click();
        await expect(page.locator('#study-task-project_id option')).toHaveCount(2);
        await expect(page.locator('#study-task-estimate_minutes')).toHaveValue('25');
        await page.locator('#study-task-title').fill('Read cell biology');
        await page.locator('#study-task-details summary').click();
        await page.locator('#study-task-project_id').selectOption({ label: 'Biology' });
        await page.locator('#study-task-priority').selectOption('high');
        const overview = await server.request('/api/platform/study/overview', {
            headers: { Cookie: account.cookie },
        });
        await page.locator('#study-task-due_date').fill(overview.body.today);
        await page.locator('#study-task-recurrence').selectOption('daily');
        await page.locator('#study-task-steps').fill('Read chapter\nWrite summary');
        await page.locator('#study-task-note').fill('Private learning note');
        await page.route(
            '**/api/platform/study/tasks',
            async (route) => {
                await route.fetch();
                await route.abort('failed');
            },
            { times: 1 },
        );
        await page.locator('#study-task button[type=submit]').click();
        await expect(page.locator('#study-status')).toContainText('draft is still here');
        await expect(page.locator('#study-task-title')).toHaveValue('Read cell biology');
        await page.locator('#study-task button[type=submit]').click();
        await expect(page.locator('#study-task-list .row')).toHaveCount(1);
        await page.locator('#study-task-list input[type=checkbox]').first().check();
        await expect(page.locator('#study-task-list input[type=checkbox]').first()).toBeChecked();
        await page.locator('#study-filter-filter').selectOption('today');
        await expect(page.locator('#study-task-list')).toContainText('Read cell biology');
        await page.locator('#study-task-list [data-lang=editItem]').click();
        await page.locator('#study-task-title').fill('Read cells carefully');
        await page.locator('#study-task button[type=submit]').click();
        await expect(page.locator('#study-task-list')).toContainText('Read cells carefully');
        await page.locator('#study-thought-text').fill('Ask tutor about cells');
        await page.locator('#study-thought button[type=submit]').click();
        await page.locator('#study-thought-list [data-lang=toTask]').click();
        await page.locator('#study-filter-filter').selectOption('open');
        await expect(page.locator('#study-task-list .row')).toHaveCount(2);
        await choose(page, 'routinesTab');
        await page.locator('#study-routine-name').fill('A gentle pair');
        await page.locator('#study-routine-focus_minutes').fill('5');
        await page.locator('#study-routine-cycles').fill('2');
        await page.locator('#study-routine button[type=submit]').click();
        await expect(page.locator('#study-routine-list')).toContainText('A gentle pair');
        await page.locator('#study-routine-list [data-lang=useRoutine]').click();
        await expect(page).toHaveURL(/#progress$/);
        await page.locator('#study-focus-task').selectOption({ label: 'Read cells carefully' });
        await page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(page.locator('#study-guide-clock')).toHaveText('05:00');
        await page.locator('#focus-pause').click();
        await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
        await page.clock.install();
        await page.reload();
        await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
        await expect(page.locator('#study-focus-task option:checked')).toHaveText('Read cells carefully');
        await page.locator('#study-guide [data-lang=routineResume]').click();
        await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        await page.clock.fastForward(5 * 60000 + 1000);
        await expect(page.locator('#study-guide [data-lang=routineNext]')).toBeVisible();
        await page.locator('#study-guide [data-lang=routineNext]').click();
        await expect(page.locator('#study-guide')).toContainText('Short break');
        await page.locator('#study-guide [data-lang=routineStop]').click();
        await expect(page.locator('#focus-start')).toBeEnabled();
        const current = (
            await server.request('/api/platform/study/journal', {
                headers: { Cookie: account.cookie },
            })
        ).body.sessions[0];
        expect(Number(current.credited_ms), 'a fast client clock cannot create credited minutes').toBeLessThan(60000);
        await expect(page.locator('#study-reflection')).toBeVisible();
        await page.locator('#study-reflect-note').fill('Review the cell membrane');
        await page.locator('#study-reflect button[type=submit]').click();
        await page.goto(`${server.baseUrl}/app#planner`);
        await choose(page, 'insightsTab');
        await page.locator('#study-targets-daily_target').fill('30');
        await page.locator('#study-targets-weekly_target').fill('120');
        await page.locator('#study-targets button[type=submit]').click();
        await page.locator('#study-journal-q').fill('membrane');
        await page.locator('#study-journal button[type=submit]').click();
        await expect(page.locator('#study-journal-list .row')).toHaveCount(1);
        await expect(page.locator('#study-journal-list')).toContainText('Review the cell membrane');
        await expect(page.locator('.study-day')).toHaveCount(28);
        await choose(page, 'tasksTab');
        await page
            .locator('#study-task-list .row')
            .filter({ hasText: 'Read cells carefully' })
            .locator('[data-lang=completeTask]')
            .click();
        await page.locator('#study-filter-filter').selectOption('completed');
        await expect(page.locator('#study-task-list')).toContainText('Read cells carefully');
        const latest = (
            await server.request('/api/platform/study/overview', {
                headers: { Cookie: account.cookie },
            })
        ).body;
        expect(latest.tasks.filter((t) => t.recurrence === 'daily')).toHaveLength(2);
        const b = await signupUser(server);
        const hidden = await server.request('/api/platform/study/overview', {
            headers: { Cookie: b.cookie },
        });
        expect(hidden.body.tasks).toEqual([]);
        const denied = await server.request(`/api/platform/study/tasks/${latest.tasks[0].id}`, {
            method: 'PATCH',
            headers: { Cookie: b.cookie },
            body: { title: 'Stolen', version: latest.tasks[0].version },
        });
        expect(denied.status).toBe(404);
        await page.screenshot({
            path: info.outputPath('planner-with-tasks.png'),
            fullPage: true,
        });
        expect(errors).toEqual([]);
    } finally {
        await context?.close();
        await server.stop();
    }
});

test('F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members', async ({
    browser,
}, info) => {
    test.setTimeout(150000);
    const server = await startServer({
        env: {
            PLATFORM_ENABLED: 'true',
            PLATFORM_DATA_DIR: 'memory://',
            VIDEO_PROVIDER: 'mesh',
        },
    });
    const contexts = [],
        sockets = [];
    let stage = 'setup';
    try {
        const a = await fixture(browser, server, 'Circle owner'),
            b = await fixture(browser, server, 'Circle member');
        contexts.push(a.context, b.context);
        const request = (path, method = 'GET', body, account = a.account) =>
            server.request(`/api/platform${path}`, {
                method,
                body,
                headers: { Cookie: account.cookie },
            });
        const checkout = (await request('/billing/checkout', 'POST', {})).body;
        await request(`/billing/checkout/${checkout.id}/complete`, 'POST', {
            token: checkout.token,
            outcome: 'success',
        });
        const circle = (await request('/cohorts', 'POST', { name: 'A quiet circle' })).body;
        const invitation = (await request(`/cohorts/${circle.id}/invitations`, 'POST', {})).body;
        expect((await request('/cohorts/accept', 'POST', { token: invitation.token }, b.account)).status).toBe(200);
        const socket = await connectSocket(server.baseUrl, {
            extraHeaders: { Cookie: a.account.cookie },
            clientId: 'study-feature-owner',
        });
        sockets.push(socket);
        const room = await emitAck(socket, 'create-room', {
            roomName: 'The reading table',
        });
        expect(room.ok).toBe(true);
        const roomId = room.room.roomId;
        const session = (
            await request(`/cohorts/${circle.id}/sessions`, 'POST', {
                roomId,
                title: 'Read together soon',
                startsAt: Date.now() + 4 * 60000,
                durationMinutes: 25,
            })
        ).body;
        await b.page.reload();
        await expect(b.page.locator('#study-status')).toBeEmpty();
        stage = 'favorite';
        await choose(b.page, 'libraryTab');
        await b.page.locator('#study-bookmark-roomId').fill(roomId);
        await b.page.locator('#study-bookmark button[type=submit]').click();
        await expect(b.page.locator('#study-favorites')).toContainText('The reading table');
        await expect(b.page.locator('#study-favorites a')).toHaveAttribute('href', `/study?room=${roomId}`);
        stage = 'agenda';
        await choose(b.page, 'agendaTab');
        await expect(b.page.locator('#study-agenda')).toContainText('Read together soon');
        await b.page.locator('#study-agenda select').selectOption('going');
        await expect(b.page.locator('#study-agenda select')).toHaveValue('going');
        const calendar = await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`);
        expect(calendar.ok()).toBe(true);
        expect(await calendar.text()).toContain(`UID:${session.id}@halastudy`);
        stage = 'reminders';
        await b.page.locator('#study-reminders-reminders').check();
        await b.page.locator('#study-reminders button[type=submit]').click();
        await b.page.goto(`${server.baseUrl}/app#progress`);
        await expect(b.page.locator('#study-reminder-banner')).toContainText('Read together soon');
        await b.page.locator('#study-reminder-banner button').click();
        await b.page.reload();
        await expect(b.page.locator('#study-reminder-banner')).toBeHidden();
        stage = 'owner resources';
        await a.page.goto(`${server.baseUrl}/app#circles`);
        await a.page.locator('#circle-list button').click();
        await expect(a.page.locator('#study-resource')).toBeVisible();
        await a.page.locator('#study-resource-title').fill('Read chapter 3');
        await a.page.locator('#study-resource-url').fill('https://example.com/chapter-3');
        await a.page.locator('#study-resource-note').fill('Our shared reading');
        await a.page.locator('[data-lang-value=ar]').click();
        await expect(a.page.locator('#study-resource-title')).toHaveValue('Read chapter 3');
        await expect(a.page.locator('#study-resource-url')).toHaveValue('https://example.com/chapter-3');
        await a.page.locator('#study-resource button[type=submit]').click();
        await expect(a.page.locator('#study-resource-list')).toContainText('Read chapter 3');
        stage = 'member resources';
        await b.page.goto(`${server.baseUrl}/app#circles`);
        await b.page.locator('#circle-list button').click();
        await expect(b.page.locator('#study-resource-list')).toContainText('Our shared reading');
        await expect(b.page.locator('#study-resource')).toHaveCount(0);
        await b.page.screenshot({
            path: info.outputPath('circle-resource-member.png'),
            fullPage: true,
        });
        stage = 'cached reminder revocation';
        await request(`/cohorts/${circle.id}/sessions`, 'POST', {
            roomId,
            title: 'Private later appointment',
            startsAt: Date.now() + 10 * 60000,
            durationMinutes: 25,
        });
        await b.page.addInitScript(() => {
            const scope = /** @type {any} */ (window);
            scope.studyNotices = [];
            scope.Notification = class {
                static permission = 'granted';
                constructor(title) {
                    scope.studyNotices.push(title);
                }
            };
        });
        await b.page.goto(`${server.baseUrl}/app#planner`);
        await b.page.clock.install();
        await b.page.reload();
        await expect(b.page.locator('#study-agenda')).toContainText('Private later appointment');
        stage = 'membership removal';
        await request(`/cohorts/${circle.id}/members/${b.account.user.id}`, 'PATCH', { role: 'remove' });
        const rechecked = b.page.waitForResponse(
            (response) => new URL(response.url()).pathname === '/api/platform/study/agenda',
        );
        await b.page.clock.fastForward(6 * 60000);
        expect((await rechecked).status()).toBe(200);
        await expect(b.page.locator('#study-reminder-banner')).toBeHidden();
        expect(await b.page.evaluate(() => /** @type {any} */ (window).studyNotices)).toEqual([]);
        await b.page.goto(`${server.baseUrl}/app#planner`);
        await choose(b.page, 'libraryTab');
        await expect(b.page.locator('#study-favorites')).toContainText('Room unavailable');
        await expect(b.page.locator('#study-favorites a')).toHaveCount(0);
        await choose(b.page, 'agendaTab');
        await expect(b.page.locator('#study-agenda')).toContainText('No upcoming circle sessions');
        expect((await request(`/study/circles/${circle.id}/resources`, 'GET', undefined, b.account)).status).toBe(404);
        expect(
            await (await b.context.request.get(`${server.baseUrl}/api/platform/study/calendar.ics`)).text(),
        ).not.toContain('BEGIN:VEVENT');
    } catch (error) {
        await info.attach('feature-stage', {
            body: stage,
            contentType: 'text/plain',
        });
        throw error;
    } finally {
        for (const socket of sockets) await closeSocket(socket);
        for (const c of contexts) await c.close().catch(() => {});
        await server.stop();
    }
});

test('planner supports Arabic/English, both themes, keyboard, narrow widths, zoom, drafts, history and recovery', async ({
    browser,
}, info) => {
    test.setTimeout(150000);
    const server = await startServer({
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' },
    });
    let context;
    try {
        const f = await fixture(browser, server);
        context = f.context;
        const { page } = f;
        for (const lang of ['ar', 'en'])
            for (const theme of ['light', 'dark']) {
                await page.evaluate(
                    ({ lang, theme }) => {
                        localStorage.setItem('halastudyLang', lang);
                        localStorage.setItem('halastudyTheme', theme);
                    },
                    { lang, theme },
                );
                await page.reload();
                await expect(page.locator('html')).toHaveAttribute('lang', lang);
                await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                for (const width of [320, 390, 768, 1440]) {
                    await page.setViewportSize({ width, height: 1000 });
                    for (const key of ['tasksTab', 'routinesTab', 'libraryTab', 'agendaTab', 'insightsTab']) {
                        await choose(page, key);
                        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
                            true,
                        );
                    }
                    await page.screenshot({
                        path: info.outputPath(`planner-${lang}-${theme}-${width}.png`),
                        fullPage: true,
                    });
                }
                expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
            }
        await choose(page, 'tasksTab');
        await page.locator('#study-task-title').fill('Draft survives language');
        await page.locator('[data-lang-value=ar]').click();
        await expect(page.locator('#study-task-title')).toHaveValue('Draft survives language');
        await page.locator('#study-task-title').focus();
        await page.keyboard.press('Tab');
        await expect(page.locator('#study-task-details summary')).toBeFocused();
        await page.locator('[data-view=progress]').first().click();
        await page.goBack();
        await expect(page.locator('[data-panel=planner]')).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addStyleTag({ content: 'html {font-size:200% !important}' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.route(
            '**/api/platform/study/overview',
            (route) =>
                route.fulfill({
                    status: 503,
                    json: { errorCode: 'SERVICE_UNAVAILABLE' },
                }),
            { times: 1 },
        );
        await page.reload();
        await expect(page.locator('#study-status')).not.toBeEmpty();
        await page.locator('[data-lang=studyRetry]').first().click();
        await expect(page.locator('#study-status')).toBeEmpty();
    } finally {
        await context?.close();
        await server.stop();
    }
});

test('task attachment, routine pause across tabs and stale-account drafts keep the right identity', async ({
    browser,
}) => {
    test.setTimeout(90000);
    const server = await startServer({
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' },
    });
    let context;
    try {
        const f = await fixture(browser, server);
        context = f.context;
        const { page, account } = f;
        const request = (path, body, method = 'POST') =>
            server.request(`/api/platform${path}`, {
                method,
                body,
                headers: { Cookie: account.cookie },
            });
        const task = (
            await request('/study/tasks', {
                title: 'Link this task',
                priority: 'normal',
                recurrence: 'none',
                steps: [],
                estimate_minutes: 25,
                requestId: require('node:crypto').randomUUID(),
            })
        ).body;
        await page.reload();
        await page.locator('[data-view=progress]').first().click();
        await page.locator('#focus-start').click();
        await expect(page.locator('#study-focus-task')).toBeEnabled();
        await page.locator('#study-focus-task').selectOption(task.id);
        await page.locator('[data-lang=attachTask]').click();
        await expect(page.locator('#study-focus-task')).toBeDisabled();
        await page.reload();
        await expect(page.locator('#study-focus-task')).toHaveValue(task.id);
        await page.locator('#focus-finish').click();
        await expect(page.locator('#focus-start')).toBeVisible();
        const routine = (
            await request('/study/routines', {
                name: 'Across tabs',
                focus_minutes: 5,
                break_minutes: 5,
                long_break_minutes: 10,
                cycles: 2,
                long_every: 2,
                requestId: require('node:crypto').randomUUID(),
            })
        ).body;
        await page.goto(`${server.baseUrl}/app#planner`);
        await choose(page, 'routinesTab');
        await page.locator('#study-routine-list [data-lang=useRoutine]').click();
        await page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        const second = await context.newPage();
        await second.goto(`${server.baseUrl}/app#progress`);
        await second.locator('#focus-pause').click();
        await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
        await page.reload();
        await expect(page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
        const current = (
            await server.request('/api/platform/progress', {
                headers: { Cookie: account.cookie },
            })
        ).body.current;
        await request(`/focus/${current.id}/complete`, {});
        const replacement = (await request('/focus/start', {})).body;
        await page.evaluate(() => /** @type {any} */ (window).HalaFocus.reconcile());
        await page.locator('#study-guide [data-lang=routineStop]').click();
        expect(
            (
                await server.request('/api/platform/progress', {
                    headers: { Cookie: account.cookie },
                })
            ).body.current.id,
        ).toBe(replacement.id);
        expect(routine.id).toBeTruthy();
        await second.close();
        await page.goto(`${server.baseUrl}/app#account`);
        await expect(page.locator('#insights-title')).toHaveText('Optional on-device usage counters');
        await page.goto(`${server.baseUrl}/app#planner`);
        await choose(page, 'tasksTab');
        await page.locator('#study-task-title').fill('A private draft');
        const b = await signupUser(server, { displayName: 'Different account' });
        const denied = await server.request('/api/platform/study/overview', {
            headers: { Cookie: b.cookie, 'X-Halastudy-Account': account.user.id },
        });
        expect(denied.status).toBe(401);
        expect(denied.body.errorCode).toBe('AUTH_ACCOUNT_CHANGED');
        await context.addCookies(
            b.cookie.split(';').map((s) => {
                const [name, ...v] = s.trim().split('=');
                return { name, value: v.join('='), url: server.baseUrl };
            }),
        );
        await page.locator('#study-task button[type=submit]').click();
        await expect(page.locator('#account-id')).toHaveText(b.user.id);
        await expect(page.locator('#study-task-title')).toHaveValue('');
        expect(
            (
                await server.request('/api/platform/study/overview', {
                    headers: { Cookie: b.cookie },
                })
            ).body.tasks,
        ).toEqual([]);
    } finally {
        await context?.close();
        await server.stop();
    }
});

test('a delayed background journal response cannot overwrite a newer search', async ({ browser }) => {
    test.setTimeout(60000);
    const server = await startServer({
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' },
    });
    let context,
        release = () => {};
    try {
        const f = await fixture(browser, server);
        context = f.context;
        const { page, account } = f;
        const request = (path, body, method = 'POST') =>
            server.request(`/api/platform${path}`, {
                method,
                body,
                headers: { Cookie: account.cookie },
            });
        for (const note of ['slow needle', 'fast needle']) {
            const focus = (await request('/focus/start', {})).body;
            await request(`/focus/${focus.id}/complete`, {});
            await request(`/study/focus/${focus.id}/reflection`, { outcome: 'partial', note, version: 0 }, 'PUT');
        }
        await choose(page, 'insightsTab');
        await page.locator('#study-journal-q').fill('slow');
        const blocked = new Promise((resolve) => {
            release = () => resolve(undefined);
        });
        let seen = () => {};
        const intercepted = new Promise((resolve) => {
            seen = () => resolve(undefined);
        });
        await page.route('**/api/platform/study/journal?*', async (route) => {
            if (new URL(route.request().url()).searchParams.get('q') === 'slow') {
                const response = await route.fetch();
                seen();
                await blocked;
                await route.fulfill({ response });
            } else await route.continue();
        });
        await page.evaluate(() => /** @type {any} */ (window).HalaPlatform.refresh());
        await intercepted;
        await page.locator('#study-journal-q').fill('fast');
        await page.locator('#study-journal button[type=submit]').click();
        await expect(page.locator('#study-journal-list')).toContainText('fast needle');
        const finished = page.waitForResponse((response) => new URL(response.url()).searchParams.get('q') === 'slow');
        release();
        await finished;
        await expect(page.locator('#study-journal-list')).toContainText('fast needle');
        await expect(page.locator('#study-journal-list')).not.toContainText('slow needle');
    } finally {
        release();
        await context?.close();
        await server.stop();
    }
});
