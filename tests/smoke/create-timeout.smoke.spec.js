const { test, expect } = require('@playwright/test');

const { startServer } = require('../helpers/server-control');

// Boots its own server (not the shared global-setup app) because the
// scenario under test is killing the backend mid-create.
test('create form surfaces a retryable error when the server dies mid-create', async ({ browser }) => {
    const server = await startServer();
    const context = await browser.newContext({
        extraHTTPHeaders: {
            'x-forwarded-for': '203.0.113.90'
        }
    });
    const page = await context.newPage();

    try {
        await page.addInitScript(() => {
            try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
        });

        await page.goto(`${server.baseUrl}/open.html`);
        await expect(page.locator('#create-form')).toBeVisible();
        await page.fill('#room-name', 'Timeout Smoke Room');

        await server.stop();

        await page.click('#create-form button[type="submit"]');

        // Without an ack timeout the feedback line sticks on "Creating room..."
        // forever; the 8s socket timeout must flip it to a visible error.
        const feedback = page.locator('#create-feedback');
        await expect(feedback).toHaveClass(/error/, { timeout: 12000 });
        await expect(feedback).not.toHaveText('');
    } finally {
        await context.close();
        await server.stop();
    }
});
