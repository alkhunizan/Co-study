const { test, expect } = require('@playwright/test');

// Third-party font fetches are the only legitimate network-dependent
// resources on the landing page; don't let an offline runner turn them
// into failures.
const IGNORED_CONSOLE_PATTERNS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

function collectPageErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(`pageerror: ${error.message}`);
    });
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return;
        errors.push(`console: ${text}`);
    });
    return errors;
}

test('landing page renders the hero and routes to the create form', async ({ page }) => {
    const errors = collectPageErrors(page);

    await page.goto('/');
    await expect(page.locator('.hero-title')).toBeVisible();
    await expect(page.locator('.live-pill')).toBeVisible();

    await page.locator('.hero-actions a.btn-primary').click();
    await expect(page).toHaveURL(/\/open\.html$/);
    await expect(page.locator('#create-form')).toBeVisible();

    expect(errors).toEqual([]);
});
