const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

async function planner(browser, language, width, steps) {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const account = await signupUser(server, { displayName: 'Synthetic planner' });
    const request = (path, method = 'GET', body = undefined) => server.request(`/api/platform/study${path}`, {
        method, headers: { Cookie: account.cookie }, body,
    });
    const created = await request('/tasks', 'POST', {
        title: 'مراجعة الفصل / Chapter review', note: '', priority: 'normal', recurrence: 'none',
        due_date: null, estimate_minutes: 25, steps, requestId: require('node:crypto').randomUUID(),
    });
    expect(created.status).toBe(200);
    const context = await createTestContext(browser, { viewport: { width, height: 960 } });
    await context.addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await context.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language);
    const page = await context.newPage();
    await gotoTestPage(page, `${server.baseUrl}/app#planner`);
    await expect(page.locator('#study-task-list .row')).toHaveCount(1);
    await expect(page.locator('#study-status')).toBeEmpty();
    const task = async () => (await request('/overview')).body.tasks[0];
    return { server, request, task, context, page, close: async () => { await context.close(); await server.stop(); } };
}

for (const { language, width } of [{ language: 'en', width: 1440 }, { language: 'ar', width: 390 }]) {
    test(`checklist edits preserve completed steps and repeated labels (${language}, ${width})`, async ({ browser }, info) => {
        const f = await planner(browser, language, width, [
            { id: 'read', text: 'Read / اقرأ', done: true },
            { id: 'repeat-a', text: 'Review / راجع', done: false },
            { id: 'repeat-b', text: 'Review / راجع', done: true },
            { id: 'notes', text: 'Notes / ملاحظات', done: true },
        ]);
        try {
            await f.page.locator('#study-task-list [data-lang=editItem]').click();
            await f.page.locator('#study-task-steps').fill('New / جديد\nReview / راجع\nRead / اقرأ\nReview / راجع\nChanged / معدّل');
            await f.page.locator('#study-task button[type=submit]').click();
            await expect(f.page.locator('#study-task button[type=submit]')).toBeEnabled();
            const saved = await f.task();
            expect(saved.steps.map((step) => step.done)).toEqual([false, false, true, true, false]);
            expect(saved.steps.filter((step) => ['read', 'repeat-a', 'repeat-b'].includes(step.id))).toHaveLength(3);
            expect(new Set(saved.steps.map((step) => step.id)).size).toBe(5);
            expect(saved.steps.some((step) => step.id === 'notes')).toBe(false);
            await f.page.reload();
            await expect(f.page.locator('#study-task-list input[type=checkbox]')).toHaveCount(5);
            await expect(f.page.locator('#study-task-list input[type=checkbox]').nth(2)).toBeChecked();
            await expect(f.page.locator('#study-task-list input[type=checkbox]').nth(3)).toBeChecked();
            expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            await f.page.screenshot({ path: info.outputPath(`checklist-${language}-${width}.png`), fullPage: true });
        } finally { await f.close(); }
    });

    test(`rejected checklist toggle restores confirmed state and retries (${language}, ${width})`, async ({ browser }, info) => {
        const f = await planner(browser, language, width, [{ id: 'read', text: 'Read / اقرأ', done: false }]);
        try {
            const task = await f.task();
            let rejectNext = true;
            await f.page.route(`**/api/platform/study/tasks/${task.id}`, (route) => {
                if (route.request().method() === 'PATCH' && rejectNext) {
                    rejectNext = false;
                    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PERSISTENCE_UNAVAILABLE' }) });
                }
                return route.continue();
            });
            const check = f.page.locator('#study-task-list input[type=checkbox]');
            await check.click();
            await expect(f.page.locator('#study-status')).toBeVisible();
            await expect(check).toBeEnabled();
            await expect(check).not.toBeChecked();
            expect((await f.task()).steps[0].done).toBe(false);
            await f.page.screenshot({ path: info.outputPath(`checklist-error-${language}-${width}.png`), fullPage: true });
            await check.check();
            await expect.poll(async () => (await f.task()).steps[0].done).toBe(true);
            await expect(check).toBeChecked();
            await expect(f.page.locator('#study-status')).toBeEmpty();
        } finally { await f.close(); }
    });
}
