const { test, expect } = require('@playwright/test');

let openIpCounter = 60;

async function createOpenPage(browser) {
    const forwardedIp = `203.0.113.${openIpCounter}`;
    openIpCounter += 1;
    const context = await browser.newContext({
        permissions: [],
        extraHTTPHeaders: {
            'x-forwarded-for': forwardedIp
        }
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
        try {
            delete (/** @type {any} */ (window)).FaceDetector;
        } catch (_error) {}

        try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}

        const baseMediaDevices = navigator.mediaDevices || {};
        const stubbedMediaDevices = Object.create(baseMediaDevices);
        stubbedMediaDevices.getUserMedia = async () => {
            throw new Error('Camera access is disabled in smoke tests.');
        };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: stubbedMediaDevices
        });
    });

    return { context, page };
}

test('created room password hands off to the workspace without a re-prompt', async ({ browser }) => {
    const creator = await createOpenPage(browser);

    try {
        const { page } = creator;
        await page.goto('/open.html');
        await expect(page.locator('#create-form')).toBeVisible();

        await page.fill('#room-name', 'Handoff Smoke Room');
        await page.check('#require-password');
        await page.fill('#room-password', 'handoff123');
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#create-result')).toBeVisible();

        const roomCode = (await page.locator('#result-code').textContent()).trim();
        expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

        await page.click('#btn-enter-room');
        await page.waitForURL(/\/index\.html\?room=/);

        // The workspace reads the new halastudy* keys — the open page must
        // write them, or every protected-room creator gets re-prompted.
        const stored = await page.evaluate(() => ({
            code: sessionStorage.getItem('halastudyRoomCode'),
            password: sessionStorage.getItem('halastudyRoomPassword')
        }));
        expect(stored.code).toBe(roomCode);
        expect(stored.password).toBe('handoff123');

        await expect(page.locator('#join-overlay')).toBeVisible();
        await page.fill('#join-name', 'Creator');
        await page.click('#join-form button[type="submit"]');

        await expect.poll(async () => {
            const joinError = ((await page.locator('#join-error').textContent()) || '').trim();
            if (joinError) return `error:${joinError}`;
            const overlayHidden = await page.locator('#join-overlay').evaluate((element) => {
                return element.classList.contains('hidden');
            });
            return overlayHidden ? 'joined' : 'pending';
        }, { timeout: 20000 }).toBe('joined');
    } finally {
        await creator.context.close();
    }
});

test('join hash and ?room= deep link open the join form pre-filled', async ({ browser }) => {
    const visitor = await createOpenPage(browser);

    try {
        const { page } = visitor;
        await page.goto('/open.html#join');
        await expect(page.locator('#join-form')).toBeVisible();
        await expect(page.locator('#create-form')).toBeHidden();

        await page.goto('/open.html?room=ABC123');
        await expect(page.locator('#join-form')).toBeVisible();
        await expect(page.locator('#join-code')).toHaveValue('ABC123');
    } finally {
        await visitor.context.close();
    }
});
