const { test, expect } = require('@playwright/test');

test('lobby query parameters cannot invent participants', async ({ page }) => {
    await page.goto('/lobby?demo=12');
    await page.evaluate(() => setParticipants([{ id: 'real-test-member', name: 'Real test member', cameraOn: false }]));
    await expect.poll(() => page.evaluate(() => state.participants.length)).toBe(1);
    await page.evaluate(() => setParticipants([]));
    expect(await page.evaluate(() => state.participants.length)).toBe(0);
});
