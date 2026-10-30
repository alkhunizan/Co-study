const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

async function fixture(browser, language, width) {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://', VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const account = await signupUser(server, { displayName: 'Synthetic feedback review' });
    const context = await createTestContext(browser, { viewport: { width, height: 960 } });
    await context.addCookies(account.cookie.split(';').map((part) => {
        const [name, ...value] = part.trim().split('=');
        return { name, value: value.join('='), url: server.baseUrl };
    }));
    await context.addInitScript((lang) => localStorage.setItem('halastudyLang', lang), language);
    const page = await context.newPage();
    await gotoTestPage(page, `${server.baseUrl}/app#planner`);
    await expect(page.locator('#study-task')).toBeVisible();
    await expect(page.locator('#study-status')).toBeEmpty();
    const overview = async () => (await server.request('/api/platform/study/overview', { headers: { Cookie: account.cookie } })).body;
    return { server, account, context, page, overview, close: async () => { await context.close(); await server.stop(); } };
}

for (const olderFails of [true, false]) {
    test(`superseded planner refresh cannot replace newer ${olderFails ? 'success' : 'failure'} feedback`, async ({ browser }) => {
        const f = await fixture(browser, 'en', 1440);
        let release = () => {};
        const held = new Promise((resolve) => { release = () => resolve(undefined); });
        let reads = 0;
        try {
            await f.page.route('**/api/platform/study/overview', async (route) => {
                const index = ++reads;
                if (index === 1) {
                    const response = olderFails ? null : await route.fetch();
                    await held;
                    return response ? route.fulfill({ response }) : route.fulfill({
                        status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
                    });
                }
                return olderFails ? route.continue() : route.fulfill({
                    status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
                });
            });
            await f.page.locator('#study-task-title').fill('First saved task');
            await f.page.locator('#study-task button[type=submit]').click();
            await expect.poll(() => reads).toBe(1);
            await f.page.locator('#study-project-name').fill('Newer saved project');
            await f.page.locator('#study-project button[type=submit]').click();
            await expect.poll(() => reads).toBe(2);
            await expect(f.page.locator('#study-project button[type=submit]')).toBeEnabled();
            const expected = olderFails ? 'Saved.' : 'Saved, but the latest list could not be loaded. Retry to refresh it.';
            await expect(f.page.locator('#study-status')).toHaveText(expected);
            release();
            await expect(f.page.locator('#study-task button[type=submit]')).toBeEnabled();
            await expect(f.page.locator('#study-status')).toHaveText(expected);
            const persisted = await f.overview();
            expect(persisted.tasks).toHaveLength(1);
            expect(persisted.projects).toHaveLength(1);
        } finally { release(); await f.close(); }
    });
}

for (const { language, width } of [{ language: 'en', width: 1440 }, { language: 'ar', width: 390 }]) {
    test(`confirmed save with failed refresh stays truthful and retries (${language}, ${width})`, async ({ browser }, info) => {
        const f = await fixture(browser, language, width);
        let failRefresh = false;
        try {
            await f.page.route('**/api/platform/study/overview', (route) => failRefresh
                ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}' })
                : route.continue());
            await f.page.route('**/api/platform/study/tasks', async (route) => {
                const response = await route.fetch();
                failRefresh = true;
                await route.fulfill({ response });
            });
            await f.page.locator('#study-task-title').fill('مهمة محفوظة / Saved task');
            await f.page.locator('#study-task button[type=submit]').click();
            await expect(f.page.locator('#study-task button[type=submit]')).toBeEnabled();
            expect((await f.overview()).tasks).toHaveLength(1);
            const status = f.page.locator('#study-status');
            await expect(status).toContainText(language === 'ar' ? 'تم الحفظ، لكن' : 'Saved, but');
            await expect(status).toHaveClass(/error/);
            await expect(f.page.locator('#study-task-title')).toHaveValue('');
            await f.page.screenshot({ path: info.outputPath(`saved-refresh-error-${language}-${width}.png`), fullPage: true });
            failRefresh = false;
            await f.page.locator('main > [data-lang=studyRetry]').click();
            await expect(f.page.locator('#study-task-list .row')).toHaveCount(1);
            await expect(status).toBeEmpty();
            expect((await f.overview()).tasks).toHaveLength(1);
            await expect(f.page.locator('main > [data-lang=studyRetry]')).toBeHidden();
        } finally { await f.close(); }
    });

    test(`planner failure and draft follow the language switch (${language}, ${width})`, async ({ browser }, info) => {
        const f = await fixture(browser, language, width);
        try {
            await f.page.route('**/api/platform/study/tasks', (route) => route.fulfill({
                status: 503, contentType: 'application/json', body: '{"errorCode":"SERVICE_UNAVAILABLE"}',
            }));
            await f.page.locator('#study-task-title').fill('مسودتي / My draft');
            await f.page.locator('#study-task button[type=submit]').click();
            const status = f.page.locator('#study-status');
            await expect(status).toHaveText(language === 'ar' ? 'الخدمة غير متاحة مؤقتًا.' : 'The service is temporarily unavailable.');
            const next = language === 'ar' ? 'en' : 'ar';
            await f.page.locator(`[data-lang-value=${next}]`).click();
            await expect(status).toHaveText(next === 'ar' ? 'الخدمة غير متاحة مؤقتًا.' : 'The service is temporarily unavailable.');
            await expect(f.page.locator('#study-task-title')).toHaveValue('مسودتي / My draft');
            await expect(f.page.locator('html')).toHaveAttribute('dir', next === 'ar' ? 'rtl' : 'ltr');
            expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            await f.page.screenshot({ path: info.outputPath(`translated-error-${next}-${width}.png`), fullPage: true });
        } finally { await f.close(); }
    });

    test(`journal search reports results without claiming a save (${language}, ${width})`, async ({ browser }) => {
        const f = await fixture(browser, language, width);
        try {
            await f.page.locator('.study-tabs [data-lang=insightsTab]').click();
            await expect(f.page.locator('.study-tabs [data-lang=insightsTab]')).toBeEnabled();
            await f.page.locator('#study-journal-q').fill('no matching session');
            await f.page.locator('#study-journal button[type=submit]').click();
            await expect(f.page.locator('#study-journal button[type=submit]')).toBeEnabled();
            await expect(f.page.locator('#study-journal-list .empty')).toBeVisible();
            await expect(f.page.locator('#study-status')).toBeEmpty();
        } finally { await f.close(); }
    });
}
