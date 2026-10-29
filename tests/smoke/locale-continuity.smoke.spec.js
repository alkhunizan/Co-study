const { test, expect } = require('@playwright/test');
const { signupUser } = require('../helpers/auth-helpers');

const storedLang = (page) => page.evaluate(() => localStorage.getItem('halastudyLang'));

test('a localized public route becomes the saved language that app pages follow', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
        // Fresh English visitor: /en is never switched, only visited.
        await page.goto('/en');
        expect(await storedLang(page)).toBe('en');
        await page.locator('a[href="/open"]').first().click();
        await expect(page).toHaveURL(/\/open$/);
        await expect(page.locator('body')).toHaveAttribute('data-lang', 'en');

        // The Arabic home route wins over an earlier English preference.
        await page.goto('/');
        expect(await storedLang(page)).toBe('ar');
        await page.goto('/open');
        await expect(page.locator('body')).toHaveAttribute('data-lang', 'ar');

        // Arabic-only articles have no alternate and must not overwrite a preference.
        await page.goto('/en');
        await page.goto('/blog/study-with-me-online-arabic');
        expect(await storedLang(page)).toBe('en');
    } finally { await context.close(); }
});

test('app-page home, privacy and terms links follow the saved language', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
        await page.goto('/en');
        for (const route of ['/open', '/account', '/recover', '/lobby', '/no-such-page-xyz']) {
            await page.goto(route);
            const homes = page.locator('a.brand, a.logo, footer a:has(.back-arrow)');
            const count = await homes.count();
            expect(count, route).toBeGreaterThan(0);
            for (let index = 0; index < count; index++) await expect(homes.nth(index), route).toHaveAttribute('href', '/en');
            const legal = page.locator('a[href$="/privacy"], a[href$="/terms"]');
            for (let index = 0; index < await legal.count(); index++) {
                await expect(legal.nth(index), route).toHaveAttribute('href', /^\/en\/(privacy|terms)$/);
            }
        }
        await page.goto('/open');
        await expect(page.locator('footer a[href="/en/privacy"]')).toHaveCount(1);
        await expect(page.locator('footer a[href="/en/terms"]')).toHaveCount(1);
        // Switching back to Arabic in place relocalizes the links.
        await page.locator('[data-lang-value="ar"]').first().click();
        await expect(page.locator('a.brand')).toHaveAttribute('href', '/');
        await expect(page.locator('footer a[href="/privacy"]')).toHaveCount(1);
    } finally { await context.close(); }
});

test('signing out from the account page lands on the localized home', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.231' } });
    const page = await context.newPage();
    try {
        const server = { request: async (pathname, options) => {
            const response = await context.request.fetch(pathname, { method: options.method, data: options.body });
            return { status: response.status(), body: await response.json(), headers: { 'set-cookie': response.headers()['set-cookie'] } };
        } };
        await signupUser(server);
        await page.goto('/en');
        await page.goto('/account');
        await page.locator('#btn-signout').click();
        await expect(page).toHaveURL(/\/en$/);
    } finally { await context.close(); }
});
