const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const { signupUser } = require('../helpers/auth-helpers');

const storedLang = (page) => page.evaluate(() => localStorage.getItem('halastudyLang'));

test('a localized public route becomes the saved language that app pages follow', async ({ browser, baseURL }) => {
    const context = await createTestContext(browser, { baseURL });
    const page = await context.newPage();
    try {
        // Fresh English visitor: /en is never switched, only visited.
        await gotoTestPage(page, '/en');
        expect(await storedLang(page)).toBe('en');
        await page.locator('a[href="/open"]').filter({ visible: true }).first().click();
        await expect(page).toHaveURL(/\/open$/);
        await expect(page.locator('body')).toHaveAttribute('data-lang', 'en');

        // A saved choice is kept: later public routes never silently replace it.
        await gotoTestPage(page, '/');
        expect(await storedLang(page)).toBe('en');

        // Arabic-only articles have no alternate and must not overwrite a preference.
        await gotoTestPage(page, '/en');
        await gotoTestPage(page, '/blog/study-with-me-online-arabic');
        expect(await storedLang(page)).toBe('en');
    } finally { await context.close(); }
});

test('signing out from the account page lands on the home page in the saved language', async ({ browser, baseURL }) => {
    const context = await createTestContext(browser, { baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.231' } });
    const page = await context.newPage();
    try {
        const server = { request: async (pathname, options) => {
            const response = await context.request.fetch(pathname, { method: options.method, data: options.body });
            return { status: response.status(), body: await response.json(), headers: { 'set-cookie': response.headers()['set-cookie'] } };
        } };
        await signupUser(server);
        await gotoTestPage(page, '/en');
        await gotoTestPage(page, '/account');
        await page.locator('#btn-signout').click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    } finally { await context.close(); }
});
