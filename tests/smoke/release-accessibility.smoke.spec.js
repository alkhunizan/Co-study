const { test, expect, gotoTestPage, createTestContext } = require('../helpers/playwright-test');
const AxeBuilder = require('@axe-core/playwright').default;
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');

test('release branding, active account headings and footer contact pass responsive bilingual themes', async ({ browser }, info) => {
    test.setTimeout(600000);
    const server = await startServer();
    const context = await createTestContext(browser);
    const page = await context.newPage(), rows = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        for (const width of [320, 390, 768, 1440]) for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
            await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
            await page.addInitScript(({ language, theme }) => {
                localStorage.setItem('halastudyLang', language); localStorage.setItem('halastudyTheme', theme);
            }, { language, theme });
            for (const route of ['/account', '/open', '/study', '/lobby', '/missing-release-page',
                language === 'en' ? '/en' : '/', language === 'en' ? '/en/blog' : '/blog',
                language === 'en' ? '/en/privacy' : '/privacy', language === 'en' ? '/en/contact' : '/contact']) {
                await gotoTestPage(page, server.baseUrl + route);
                await page.evaluate(() => document.fonts.ready);
                const brand = page.locator('a.brand, a.logo, a.legal-brand').first();
                await expect(brand).toHaveAccessibleName(/Hala\s*study/i);
                const findings = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
                expect(findings.violations, `${route}/${width}/${language}/${theme}`).toEqual([]);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
                if (route === '/account') {
                    await expect(page.locator('h1:visible')).toHaveCount(1);
                    await page.locator('#tab-signup').click();
                    await expect(page.locator('h1:visible')).toHaveCount(1);
                    await expect(page.locator('#signup-form h1')).toBeVisible();
                    await page.locator('#tab-signin').click();
                }
                const footer = page.locator('footer');
                // Every footer reaches support: the shared shell links the contact page, public pages also carry the mailbox.
                if (await footer.count()) await expect(footer.locator('a[href="mailto:info@halastudy.com"], a[href="/contact"], a[href="/en/contact"]').first()).toBeVisible();
                rows.push({ route, width, language, theme, fontMode: process.env.CO_STUDY_OFFLINE === '1' ? 'outage/fallback' : 'verified real fonts', violations: findings.violations.length });
                if (width === 390 && ['/account', '/open', '/privacy', '/en/privacy'].includes(route)) {
                    await page.screenshot({ path: info.outputPath(`after-${route.replaceAll('/', '-')}-${language}-${theme}.png`), fullPage: true });
                }
            }
        }
        for (const route of ['/account.html', '/account?auth=google_failed', '/open.html', '/index.html', '/lobby.html',
            '/404.html', '/blog.html', '/blog-study-with-me.html', '/blog-best-study-rooms.html', '/terms', '/en/terms']) {
            await gotoTestPage(page, server.baseUrl + route);
            await page.evaluate(() => document.fonts.ready);
            const result = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
            expect(result.violations, route).toEqual([]);
        }
        await gotoTestPage(page, `${server.baseUrl}/account`);
        await page.addStyleTag({ content: 'html {font-size:200% !important}' });
        await expect(page.locator('#signin-email')).toBeVisible();
        await page.locator('.brand').focus(); await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`${server.baseUrl}/`);
        const account = await signupUser(server);
        await context.addCookies(account.cookie.split(';').map(part => {
            const [name, ...value] = part.trim().split('='); return { name, value: value.join('='), url: server.baseUrl };
        }));
        await gotoTestPage(page, `${server.baseUrl}/account`);
        await expect(page.locator('#account-view')).toBeVisible();
        await expect(page.locator('h1:visible')).toHaveCount(1);
        const wcag = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(wcag.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
        expect(errors).toEqual([]);
        await info.attach('release-branding-matrix', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
    } finally { await context.close(); await server.stop(); }
});
