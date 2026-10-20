const { test, expect } = require('@playwright/test');

test('lobby query parameters cannot invent participants', async ({ page }) => {
    await page.goto('/lobby?demo=12');
    await page.evaluate(() => /** @type {any} */ (window).setParticipants([{ id: 'real-test-member', name: 'Real test member', cameraOn: false }]));
    await expect.poll(() => page.evaluate('state.participants.length')).toBe(1);
    await page.evaluate(() => /** @type {any} */ (window).setParticipants([]));
    expect(await page.evaluate('state.participants.length')).toBe(0);
});

test('lobby join and camera failures show feedback and allow retry', async ({ page }) => {
    await page.goto('/lobby');
    await page.evaluate(() => {
        document.documentElement.lang = 'en';
        const lobby = /** @type {any} */ (window);
        lobby.io = () => ({
            on(event, handler) { if (event === 'connect') queueMicrotask(handler); },
            emit(_event, _payload, callback) { callback({ ok: false, errorCode: 'SESSION_EXPIRED' }); },
            disconnect() {}
        });
        lobby.joinLobby('Synthetic user');
    });
    await expect(page.locator('.hala-toast__msg')).toContainText('Could not join');
    await expect(page.locator('#name-gate')).toBeVisible();
    await page.evaluate(async () => {
        document.getElementById('name-gate').hidden = true;
        document.getElementById('lobby-view').hidden = false;
        const lobby = /** @type {any} */ (window);
        lobby.connectRealtimeKit = async () => ({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE' });
        await lobby.startPublishing();
    });
    await expect(page.locator('.hala-toast__msg').last()).toContainText('Could not turn on');
    await expect(page.locator('#camera-cta')).toBeEnabled();
});
