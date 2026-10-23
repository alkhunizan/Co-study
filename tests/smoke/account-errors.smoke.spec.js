const { test, expect } = require('@playwright/test');

for (const lang of ['ar', 'en']) {
    test(`provider discovery failures can be retried in ${lang} before revealing Google`, async ({ page }) => {
        await page.addInitScript((language) => localStorage.setItem('halastudyLang', language), lang);
        let unavailable = true;
        await page.route('**/api/runtime-config', (route) =>
            route.fulfill({
                status: unavailable ? 503 : 200,
                contentType: 'application/json',
                body: JSON.stringify(unavailable ? { errorCode: 'SERVICE_UNAVAILABLE' } : { googleAuthEnabled: true }),
            }),
        );
        await page.goto('/account');
        const retry = page.locator('#provider-unavailable [data-core-unavailable=retry]');
        await expect(retry).toBeVisible();
        await expect(page.locator('[data-google-auth]')).toBeHidden();
        unavailable = false;
        await retry.click();
        await expect(page.locator('[data-google-auth]')).toBeVisible();
        await expect(page.locator('#provider-unavailable')).toBeHidden();
    });

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
