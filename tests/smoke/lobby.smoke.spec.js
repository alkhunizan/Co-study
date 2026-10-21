const { test, expect } = require('@playwright/test');

test('lobby camera control announces actual state across languages', async ({ page }) => {
    await page.goto('/lobby');
    await page.locator('#name-input').fill('Camera control fixture');
    await page.locator('#name-go').click();
    await expect(page.locator('#lobby-view')).toBeVisible();
    await page.evaluate(() => (/** @type {any} */ (window)).HalaAuth.getUser());
    await page.locator('[data-lang-value=en]').filter({ visible: true }).click();
    await page.evaluate(`rtk.meeting = {self: {videoEnabled:true, disableVideo(){this.videoEnabled=false;}}}; rtk.connected=true; rtk.role='publisher'; refreshCameraCta({id:'synthetic-member'});`);
    await expect(page.locator('#camera-cta')).toHaveText('Turn off my camera');
    await expect(page.locator('#camera-cta')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#camera-cta').click();
    await expect(page.locator('#camera-cta')).toHaveText('Turn on my camera');
    await expect(page.locator('#camera-cta')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-lang-value=ar]').filter({ visible: true }).click();
    await expect(page.locator('#camera-cta')).toHaveText('افتح كاميرتي');
});

test('lobby renews its media session and page exit tears it down', async ({ page }) => {
    await page.goto('/lobby');
    await page.clock.install();
    await page.evaluate(async () => {
        const w = /** @type {any} */ (window);
        w.__mediaCalls = []; w.__mediaLeaves = 0;
        w.fetch = async (url) => {
            w.__mediaCalls.push(url);
            return new Response(JSON.stringify({ ok: true, authToken: 'synthetic', role: 'viewer' }));
        };
        w.HalastudyRealtimeKitClient = { joinHeadless: async () => ({ meeting: { self: {}, participants: {} }, leave: async () => { w.__mediaLeaves++; } }) };
        await w.connectRealtimeKit('viewer');
    });
    await page.clock.runFor(180000);
    expect(await page.evaluate(() => /** @type {any} */ (window).__mediaCalls.filter(url => url.endsWith('video-heartbeat')).length)).toBe(4);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__mediaLeaves)).toBe(1);
    expect(await page.evaluate(() => /** @type {any} */ (window).__mediaCalls.some(url => url.endsWith('video-leave')))).toBe(true);
    await page.clock.runFor(90000);
    expect(await page.evaluate(() => /** @type {any} */ (window).__mediaCalls.filter(url => url.endsWith('video-heartbeat')).length)).toBe(4);
});

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
