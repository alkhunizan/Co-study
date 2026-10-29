const { test, expect } = require('@playwright/test');

// Production Resend mode reports `mode: 'email'`; the page must not claim no email was sent.
for (const [lang, expected, forbidden] of [
    ['en', 'If an account exists for that email, a reset link has been sent', 'No email was sent'],
    ['ar', 'إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة التعيين', 'لم يُرسل بريد إلكتروني']
]) {
    test(`recovery request in email mode confirms a sent link (${lang})`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL });
        await context.addInitScript((value) => localStorage.setItem('halastudyLang', value), lang);
        await context.route('**/api/auth/recovery/config', (route) => route.fulfill({ json: { enabled: true, mode: 'email' } }));
        await context.route('**/api/auth/recovery/request', (route) => route.fulfill({ json: { ok: true } }));
        const page = await context.newPage();
        try {
            await page.goto('/recover');
            await page.locator('#recovery-email').fill('someone@example.com');
            await page.locator('#recovery-submit').click();
            await expect(page.locator('#recovery-status')).toHaveText(`${expected}.`);
            await expect(page.locator('#recovery-status')).not.toContainText(forbidden);
        } finally { await context.close(); }
    });
}
