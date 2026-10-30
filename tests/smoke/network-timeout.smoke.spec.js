const { test, expect, gotoTestPage } = require('../helpers/playwright-test');

test('stalled room lookup releases Join with a useful error and preserves the draft', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
    await gotoTestPage(page, '/open#join');
    await page.route('**/api/rooms/ABC123', () => {});
    await page.fill('#join-code', 'ABC123');
    await page.fill('#join-password', 'keep-my-draft');
    await page.click('#join-form button[type="submit"]');
    await expect(page.locator('#join-form button[type="submit"]')).toBeDisabled();
    await expect(page.locator('#join-form button[type="submit"]')).toBeEnabled({ timeout: 18000 });
    await expect(page.locator('#join-feedback')).toHaveClass(/error/);
    await expect(page.locator('#join-code')).toHaveValue('ABC123');
    await expect(page.locator('#join-password')).toHaveValue('keep-my-draft');
    await page.unroute('**/api/rooms/ABC123');
    await page.click('#join-form button[type="submit"]');
    await expect(page.locator('#join-feedback')).toHaveText('That room code does not exist.');
});

test('stalled room runtime configuration settles and releases RTC readiness', async ({ page }) => {
    await page.route('**/api/runtime-config', () => {});
    await gotoTestPage(page, '/study');
    const config = await page.evaluate(async () => {
        let timer;
        try {
            return await Promise.race([
                /** @type {any} */ (window).ensureRtcConfigurationReady(),
                new Promise((resolve) => {
                    timer = setTimeout(() => resolve(null), 18000);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    });
    expect(config).toHaveProperty('iceServers');
    await page.unroute('**/api/runtime-config');
    expect(await page.evaluate(() => /** @type {any} */ (window).loadRtcConfiguration())).toHaveProperty('iceServers');
});
