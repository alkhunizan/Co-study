const { test, expect } = require('@playwright/test');

test('admin request failures are visible and search can be retried by click or Enter', async ({ page }) => {
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/ops-smoke-test-1234');
    await page.fill('#admin-password', 'smoke-admin-password');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#ops-shell')).toBeVisible();
    await page.click('#tabs button[data-panel="users"]');
    await expect(page.locator('#users-total')).toContainText('account');
    await page.fill('#user-search', 'preserved-search');
    for (const viaEnter of [false, true]) {
        await page.route('**/api/users?**', (route) => route.fulfill({
            status: 503, contentType: 'application/json', body: '{"errorCode":"UNAVAILABLE"}'
        }));
        if (viaEnter) await page.locator('#user-search').press('Enter');
        else await page.click('#user-search-btn');
        await expect(page.locator('#request-feedback')).toContainText('then retry');
        await page.locator('#user-search').press('ArrowLeft');
        expect(await page.locator('#request-feedback').textContent()).toContain('then retry');
        await page.click('[data-panel="video"]'); await page.click('#kill-switch-toggle');
        await page.click('#confirm-no');
        expect(await page.locator('#request-feedback').textContent()).toContain('then retry');
        await page.click('[data-panel="users"]');
        await expect(page.locator('#user-search')).toHaveValue('preserved-search');
        await page.unroute('**/api/users?**');
        await page.click('#btn-refresh');
        await expect(page.locator('#request-feedback')).toBeEmpty();
        await expect(page.locator('#users-total')).toContainText('account');
    }
    expect(errors).toEqual([]);
});
