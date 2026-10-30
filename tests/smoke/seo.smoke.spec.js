const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;

test('public locale links work without JavaScript and retain English content despite Arabic preferences', async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(90000);
    const plain = await createTestContext(browser, { javaScriptEnabled: false, baseURL });
    try {
        const page = await plain.newPage();
        await gotoTestPage(page, '/en');
        await expect(page.locator('h1')).toContainText('Drop in.');
        // Without JavaScript the shell's switch is inert; the footer carries the crawlable alternate link.
        await page.locator('footer a.locale-alternate[lang="ar"]').click();
        await expect(page).toHaveURL(`${baseURL}/`);
        await expect(page.locator('h1')).toContainText('ادخل.');
        await gotoTestPage(page, '/en/blog');
        await expect(page.locator('h1')).toHaveText('From the Halastudy desk');
        await gotoTestPage(page, '/en/contact');
        await expect(page.locator('h1')).toHaveText('Contact Halastudy');
    } finally { await plain.close(); }
    const context = await createTestContext(browser, { baseURL });
    try {
        await context.addInitScript(() => localStorage.setItem('halastudyLang', 'ar'));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        /** @type {Array<[string, number, string]>} */
        const views = [
            ['/en', 1440, 'light'], ['/', 390, 'light'],
            ['/en/blog', 390, 'dark'], ['/contact', 390, 'light'], ['/en/contact', 900, 'dark'],
            ['/blog/best-online-group-study-rooms-saudi', 390, 'light'],
            ['/blog/study-with-me-online-arabic', 900, 'dark']
        ];
        for (const [route, width, theme] of views) {
            await page.setViewportSize({ width, height: 1000 });
            await gotoTestPage(page, route);
            await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
            await expect(page.locator('html')).toHaveAttribute('lang', route.startsWith('/en') ? 'en' : 'ar');
            await expect(page.locator('a[data-lang-value][aria-pressed]')).toHaveCount(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
            expect(audit.violations.map((issue) => ({ id: issue.id, nodes: issue.nodes.map((node) => node.target) }))).toEqual([]);
            await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll('/', '-') || 'home'}-${width}-${theme}-viewport.png`) });
            await page.screenshot({ path: testInfo.outputPath(`${route.replaceAll('/', '-') || 'home'}-${width}-${theme}.png`), fullPage: true });
        }
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
