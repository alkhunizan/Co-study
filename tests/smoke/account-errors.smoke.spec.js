const { test, expect } = require('@playwright/test');

for (const lang of ['ar', 'en']) {
    test(`account errors are useful in ${lang} and keep signup details for retry`, async ({ page }) => {
        await page.addInitScript((language) => localStorage.setItem('halastudyLang', language), lang);
        let code = 'PERSISTENCE_UNAVAILABLE';
        await page.route('**/api/auth/signup', (route) =>
            route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ errorCode: code }),
            }),
        );
        await page.goto('/account');
        await page.click('#tab-signup');
        await page.fill('#signup-nickname', 'Synthetic learner');
        await page.fill('#signup-email', 'retry@example.invalid');
        await page.fill('#signup-password', 'fixture-password-123');
        const submit = page.locator('#signup-form button[type="submit"]');
        await submit.click();
        await expect(page.locator('#signup-feedback')).toHaveText(
            lang === 'en'
                ? 'Your changes could not be saved. Try again shortly.'
                : 'تعذّر حفظ التغييرات. حاول مرة أخرى بعد قليل.',
        );
        await expect(page.locator('#signup-email')).toHaveValue('retry@example.invalid');
        code = 'UNRECOGNIZED_FAILURE';
        await submit.click();
        await expect(page.locator('#signup-feedback')).toHaveText(
            lang === 'en' ? 'Connection hiccup. Try again.' : 'النت تعثّر. جرّب مرة ثانية.',
        );
        await expect(page.locator('#signup-password')).toHaveValue('fixture-password-123');
    });
}
