const { test, expect, gotoTestPage } = require('../helpers/playwright-test');

const pages = ['/', '/open', '/account.html', '/lobby', '/blog', '/privacy', '/terms', '/missing-page'];

for (const route of ['/privacy', '/terms']) {
    test(`${route} respects saved language and theme and retains both legal texts`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.addInitScript(() => {
            if (!localStorage.getItem('halastudyLang')) localStorage.setItem('halastudyLang', 'en');
            localStorage.setItem('halastudyTheme', 'dark');
        });
        await gotoTestPage(page, route);
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('main section[lang="en"][dir="ltr"]')).toBeVisible();
        await expect(page.locator('main section[lang="ar"][dir="rtl"]')).toHaveCount(1);
        await page.locator('#nav-burger').click();
        await page.locator('[data-lang-value="ar"]').click();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await expect(page.locator('main section[lang="ar"]')).toBeVisible();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    });
}

for (const route of pages) {
    test(`${route} provides phone navigation, preferences and a keyboard exit`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoTestPage(page, route);
        const burger = page.locator('#nav-burger');
        await expect(burger).toBeVisible();
        await burger.click();
        const menu = page.locator('#mobile-menu');
        await expect(menu).toBeVisible();
        for (const href of ['/open', '/lobby', '/blog', '/account.html', 'mailto:info@halastudy.com']) {
            await expect(menu.locator(`a[href="${href}"]`)).toBeVisible();
        }
        if (['/open', '/lobby', '/blog', '/account.html'].includes(route)) {
            await expect(menu.locator(`a[href="${route}"]`)).toHaveAttribute('aria-current', 'page');
        }
        const smallTargets = await menu.locator('a,button').evaluateAll(elements => elements.filter(element => {
            const bounds = element.getBoundingClientRect();
            return bounds.width < 44 || bounds.height < 44;
        }).map(element => element.textContent));
        expect(smallTargets).toEqual([]);
        await expect(menu.locator('[data-lang-value="en"]')).toBeVisible();
        await menu.locator('[data-lang-value="en"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await menu.locator('#theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(burger).toBeFocused();
        await expect(page.locator('footer a[href="/privacy"]')).toBeVisible();
        await expect(page.locator('footer a[href="/terms"]')).toBeVisible();
        await expect(page.locator('footer a[href="mailto:info@halastudy.com"]')).toBeVisible();
        await gotoTestPage(page, '/privacy');
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
}

test('navigation preserves visible keyboard focus across layout changes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoTestPage(page, '/');
    const burger = page.locator('#nav-burger');
    const menu = page.locator('#mobile-menu');
    await burger.focus();
    await page.keyboard.press('Enter');
    await expect(menu.locator('a').first()).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.public-nav a').first()).toBeFocused();
    await page.locator('#theme-toggle').focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(burger).toBeFocused();
    await page.keyboard.press('Enter');
    await menu.locator('#theme-toggle').focus();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('#theme-toggle')).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await burger.click();
    await menu.locator('#theme-toggle').focus();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
});
