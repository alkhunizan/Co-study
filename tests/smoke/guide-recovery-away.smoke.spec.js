const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

async function guideFixture(browser, language, width) {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh' } });
    const account = await signupUser(server, { displayName: 'Synthetic guide recovery' });
    const request = (path, method = 'GET', body = undefined) => server.request(`/api/platform${path}`, {
        method, body, headers: { Cookie: account.cookie },
    });
    const task = (await request('/study/tasks', 'POST', {
        title: 'Review chapter / مراجعة الفصل', priority: 'normal', recurrence: 'none',
        steps: [], estimate_minutes: 25, requestId: randomUUID(),
    })).body;
    const routine = await request('/study/routines', 'POST', {
        name: 'Gentle pair / جولتان', focus_minutes: 5, break_minutes: 5, long_break_minutes: 10,
        cycles: 2, long_every: 2, requestId: randomUUID(),
    });
    expect(routine.status).toBe(200);
    const context = await browser.newContext({ viewport: { width, height: 960 } });
    await context.addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await context.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language);
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(`${server.baseUrl}/app#planner`);
    await expect(page.locator('#study-task-list .row')).toHaveCount(1);
    await page.locator('.study-tabs [data-lang=routinesTab]').click();
    await page.locator('#study-routine-list [data-lang=useRoutine]').click();
    await page.locator('#study-focus-task').selectOption(task.id);
    const current = async () => (await request('/progress')).body.current;
    return { server, page, context, request, current, task,
        close: async () => { await context.close(); await server.stop(); } };
}

for (const { language, width } of [{ language: 'en', width: 1440 }, { language: 'ar', width: 390 }]) {
    test(`guide retains started session when attachment fails (${language}, ${width})`, async ({ browser }, info) => {
        const f = await guideFixture(browser, language, width);
        let reject = true;
        let starts = 0;
        f.page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/focus/start')) starts++; });
        try {
            await f.page.route('**/api/platform/study/focus/*/task', route => {
                if (reject) { reject = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"PERSISTENCE_UNAVAILABLE"}' }); }
                return route.continue();
            });
            await f.page.locator('#study-guide [data-lang=routineBegin]').click();
            await expect(f.page.locator('#study-status')).toBeVisible();
            const session = await f.current();
            expect(session.state).toBe('active');
            await expect(f.page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
            expect((await f.request('/study/overview')).body.focusLink).toBeNull();
            await f.page.screenshot({ path: info.outputPath(`guide-link-error-${language}-${width}.png`), fullPage: true });
            await f.page.locator('[data-lang=attachTask]').click();
            await expect(f.page.locator('#study-focus-task')).toBeDisabled();
            const linked = (await f.request('/study/overview')).body.focusLink;
            expect(linked.task_id).toBe(f.task.id);
            expect(linked.session_id).toBe(session.id);
            await f.page.locator('#study-guide [data-lang=routinePause]').click();
            await expect(f.page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
            expect((await f.current()).state).toBe('paused');
            await f.page.reload();
            await expect(f.page.locator('#study-guide [data-lang=routineResume]')).toBeVisible();
            await expect(f.page.locator('#study-focus-task')).toHaveValue(f.task.id);
            expect((await f.current()).id).toBe(session.id);
            expect(starts).toBe(1);
            expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            await f.page.screenshot({ path: info.outputPath(`guide-link-recovered-${language}-${width}.png`), fullPage: true });
        } finally { await f.close(); }
    });
}

test('next guided round retains its started session after attachment failure', async ({ browser }) => {
    const f = await guideFixture(browser, 'en', 1440);
    try {
        await f.page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(f.page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        const first = await f.current();
        await f.page.clock.fastForward(5 * 60000 + 1000);
        await expect(f.page.locator('#study-guide [data-lang=routineNext]')).toBeVisible();
        await f.page.locator('#study-guide [data-lang=routineNext]').click();
        await expect(f.page.locator('#study-guide')).toContainText('Short break');
        await f.page.clock.fastForward(5 * 60000 + 1000);
        await expect(f.page.locator('#study-guide [data-lang=routineNextRound]')).toBeVisible();
        await f.page.route('**/api/platform/study/focus/*/task', route => route.fulfill({
            status: 503, contentType: 'application/json', body: '{"error":"PERSISTENCE_UNAVAILABLE"}',
        }));
        await f.page.locator('#study-guide [data-lang=routineNextRound]').click();
        await expect(f.page.locator('#study-status')).toBeVisible();
        const second = await f.current();
        expect(second.id).not.toBe(first.id);
        expect(second.state).toBe('active');
        await expect(f.page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        await f.page.locator('#study-guide [data-lang=routineStop]').click();
        await expect(f.page.locator('#study-guide')).toBeHidden();
        expect((await f.current()).id).toBe(second.id);
        expect((await f.current()).state).toBe('paused');
        const journal = (await f.request('/study/journal')).body.sessions;
        expect(journal.filter(item => item.state === 'completed')).toHaveLength(1);
        expect(Number(journal.find(item => item.id === first.id).credited_ms)).toBeLessThan(60000);
    } finally { await f.close(); }
});

test('failed focus start keeps guide ready and allows one successful retry', async ({ browser }) => {
    const f = await guideFixture(browser, 'ar', 390);
    try {
        let reject = true;
        await f.page.route('**/api/platform/focus/start', route => {
            if (reject) { reject = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"PERSISTENCE_UNAVAILABLE"}' }); }
            return route.continue();
        });
        await f.page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(f.page.locator('#study-status')).toBeVisible();
        await expect(f.page.locator('#study-guide [data-lang=routineBegin]')).toBeEnabled();
        expect(await f.current()).toBeNull();
        await f.page.locator('#study-guide [data-lang=routineBegin]').click();
        await expect(f.page.locator('#study-guide [data-lang=routinePause]')).toBeVisible();
        expect((await f.current()).state).toBe('active');
    } finally { await f.close(); }
});
