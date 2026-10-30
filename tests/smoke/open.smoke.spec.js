const { createTestContext, gotoTestPage, test, expect, waitForTestUrl } = require('../helpers/playwright-test');

let openIpCounter = 60;

async function createOpenPage(browser, lang = 'en') {
    const forwardedIp = `203.0.113.${openIpCounter}`;
    openIpCounter += 1;
    const context = await createTestContext(browser, {
        permissions: [],
        extraHTTPHeaders: {
            'x-forwarded-for': forwardedIp
        }
    });
    const page = await context.newPage();

    await page.addInitScript(lang => {
        try {
            delete (/** @type {any} */ (window)).FaceDetector;
        } catch (_error) {}

        try { localStorage.setItem('halastudyLang', lang); } catch (_error) {}

        const baseMediaDevices = navigator.mediaDevices || {};
        const stubbedMediaDevices = Object.create(baseMediaDevices);
        stubbedMediaDevices.getUserMedia = async () => {
            throw new Error('Camera access is disabled in smoke tests.');
        };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: stubbedMediaDevices
        });
    }, lang);

    return { context, page };
}

for (const lang of ['en', 'ar']) for (const signedIn of [false, true]) {
test(`protected room create, invite, refresh and leave: ${lang}, ${signedIn ? 'account' : 'guest'}`, async ({ browser }) => {
    const creator = await createOpenPage(browser, lang);

    try {
        const { page } = creator;
        if (signedIn) {
            const response = await page.request.post('/api/auth/signup', { data: {
                email: `handoff-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
                password: 'handoff-account-123', displayName: 'Creator'
            } });
            expect(response.ok()).toBeTruthy();
        }
        await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
            configurable: true, value: { writeText: async value => { (/** @type {any} */ (window)).__copied = value; } }
        }));
        await gotoTestPage(page, '/open.html');
        await expect(page.locator('#create-form')).toBeVisible();

        await page.fill('#room-name', 'Handoff Smoke Room');
        await page.check('#require-password');
        await page.fill('#room-password', 'handoff123');
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#create-result')).toBeVisible();

        const roomCode = (await page.locator('#result-code').textContent()).trim();
        expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
        expect(await page.evaluate(() => sessionStorage.getItem('halastudyRoomDraft:v1'))).toBeNull();

        await page.click('#btn-enter-room');
        await waitForTestUrl(page, /\/index\.html\?room=/);

        // The workspace reads the new halastudy* keys — the open page must
        // write them, or every protected-room creator gets re-prompted.
        const stored = await page.evaluate(() => ({
            code: sessionStorage.getItem('halastudyRoomCode'),
            password: sessionStorage.getItem('halastudyRoomPassword')
        }));
        expect(stored.code).toBe(roomCode);
        expect(stored.password).toBe('handoff123');

        await expect(page.locator('#join-overlay')).toBeVisible();
        if (signedIn) await expect(page.locator('#join-name')).toHaveValue('Creator');
        else await page.fill('#join-name', 'Creator');
        await page.click('#join-form button[type="submit"]');

        await expect.poll(async () => {
            const joinError = ((await page.locator('#join-error').textContent()) || '').trim();
            if (joinError) return `error:${joinError}`;
            const overlayHidden = await page.locator('#join-overlay').evaluate((element) => {
                return element.classList.contains('hidden');
            });
            return overlayHidden ? 'joined' : 'pending';
        }, { timeout: 20000 }).toBe('joined');
        await expect(page.locator('#room-join-status')).toContainText(roomCode);
        await expect(page.locator('#room-join-status')).toHaveAttribute('role', 'status');
        await page.click('#share-room-btn');
        const invite = await page.evaluate(() => (/** @type {any} */ (window)).__copied);
        expect(new URL(invite).search).toBe(`?room=${roomCode}`);
        expect(invite).not.toContain('handoff123');
        expect(await page.locator('#join-room').evaluate(e => getComputedStyle(e).direction)).toBe('ltr');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#join-overlay')).toHaveClass(/hidden/);
        await expect(page.locator('#join-overlay')).toBeHidden();
        await expect(page.locator('#chat-input')).toBeEnabled();
        await expect(page.locator('#join-name')).toHaveValue('Creator');
        await page.locator('header a.logo').click();
        await expect.poll(async () => {
            const response = await page.request.get(`/api/rooms/${roomCode}`);
            return (await response.json()).room.participantCount;
        }).toBe(0);
    } finally {
        await creator.context.close();
    }
});

}

test('optional protection is collapsed and validation is associated with its field', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    try {
        const { page } = visitor;
        await gotoTestPage(page, '/open');
        await expect(page.locator('#room-password')).toBeHidden();
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#room-name')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.locator('#room-name-error')).toBeVisible();
        await expect(page.locator('#create-feedback')).toHaveAttribute('role', 'status');
        await page.fill('#room-name', 'Keep my input');
        await page.check('#require-password');
        await expect(page.locator('#room-password')).toBeVisible();
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#room-password')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.locator('#room-name')).toHaveValue('Keep my input');
    } finally { await visitor.context.close(); }
});

test('schedule signup returns to the same draft and refresh preserves it', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    try {
        const { page } = visitor;
        await gotoTestPage(page, '/open');
        await page.fill('#room-name', 'My planned session');
        await page.check('#require-password');
        await page.fill('#room-password', 'draft-room-password');
        await page.check('#enable-schedule');
        await page.click('#schedule-gate-cta');
        await expect(page).toHaveURL(/\/account\.html\?signup=1&next=/);
        await page.fill('#signup-nickname', 'Planner');
        await page.fill('#signup-email', `plan-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`);
        await page.fill('#signup-password', 'planner-password-123');
        await page.click('#signup-form button[type="submit"]');
        await expect(page).toHaveURL(/\/open\.html\?schedule=1/);
        await expect(page.locator('#room-name')).toHaveValue('My planned session');
        await expect(page.locator('#require-password')).toBeChecked();
        // Secrets never enter the draft: the restored form asks for the password again.
        await expect(page.locator('#room-password')).toHaveValue('');
        await expect(page.locator('#draft-restored')).toBeVisible();
        await expect(page.locator('#schedule-fields-inner')).toBeVisible();
        await page.fill('#schedule-goal-template', 'Finish chapter two');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#room-name')).toHaveValue('My planned session');
        await expect(page.locator('#schedule-goal-template')).toHaveValue('Finish chapter two');
        await expect(page.locator('#enable-schedule')).toBeChecked();
    } finally { await visitor.context.close(); }
});

test('a stalled join lookup releases the form and can retry without retyping', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    /** @type {(value?: any) => void} */
    let release = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    try {
        const { page } = visitor;
        await page.route('**/api/rooms/**', async route => {
            await gate;
            await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }).catch(() => {});
        });
        await gotoTestPage(page, '/open#join');
        await page.fill('#join-code', 'WAIT12');
        await page.click('#join-form button[type="submit"]');
        await expect(page.locator('#join-feedback')).toHaveClass(/error/, { timeout: 12000 });
        await expect(page.locator('#join-form button[type="submit"]')).toBeEnabled();
        await expect(page.locator('#join-code')).toHaveValue('WAIT12');
        release();
        await page.click('#join-form button[type="submit"]');
        await expect(page.locator('#join-feedback')).toContainText(/does not exist/i);
    } finally { release(); await visitor.context.close(); }
});

test('created codes have a manual copy fallback in both languages', async ({ browser }) => {
    for (const lang of ['en', 'ar']) {
        const visitor = await createOpenPage(browser, lang);
        try {
            const { page } = visitor;
            await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
                configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied'); } }
            }));
            await gotoTestPage(page, '/open');
            await page.fill('#room-name', 'Copy room');
            await page.click('#create-form button[type="submit"]');
            await expect(page.locator('#create-result')).toBeVisible();
            const code = await page.locator('#result-code').textContent();
            const dialogPromise = new Promise(resolve => page.once('dialog', async dialog => {
                const details = { type: dialog.type(), value: dialog.defaultValue(), message: dialog.message() };
                await dialog.dismiss();
                resolve(details);
            }));
            await page.locator('#result-code').focus();
            await page.keyboard.press('Enter');
            const dialog = await dialogPromise;
            expect(dialog.type).toBe('prompt');
            expect(dialog.value).toBe(code);
            expect(dialog.message).toMatch(lang === 'en' ? /copy/i : /انسخ/);
            expect(await page.locator('#result-code').evaluate(e => getComputedStyle(e).direction)).toBe('ltr');
        } finally { await visitor.context.close(); }
    }
});

test('join hash and ?room= deep link open the join form pre-filled', async ({ browser }) => {
    const visitor = await createOpenPage(browser);

    try {
        const { page } = visitor;
        await gotoTestPage(page, '/open.html#join');
        await expect(page.locator('#join-form')).toBeVisible();
        await expect(page.locator('#create-form')).toBeHidden();

        await gotoTestPage(page, '/open.html?room=ABC123');
        await expect(page.locator('#join-form')).toBeVisible();
        await expect(page.locator('#join-code')).toHaveValue('ABC123');
    } finally {
        await visitor.context.close();
    }
});

test('a stale room lookup cannot replace the latest join preview', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    /** @type {(value?: any) => void} */
    let releaseFirstLookup = () => {};
    /** @type {(value?: any) => void} */
    let markFirstLookupStarted = () => {};
    /** @type {(value?: any) => void} */
    let markFirstLookupSettled = () => {};
    const firstLookupGate = new Promise((resolve) => { releaseFirstLookup = resolve; });
    const firstLookupStarted = new Promise((resolve) => { markFirstLookupStarted = resolve; });
    const firstLookupSettled = new Promise((resolve) => { markFirstLookupSettled = resolve; });

    try {
        const { page } = visitor;
        await page.route('**/api/rooms/**', async (route) => {
            const code = new URL(route.request().url()).pathname.split('/').pop();
            const room = {
                roomId: code,
                name: code === 'FIRST1' ? 'First response' : 'Second response',
                mediaMode: 'mesh',
                participantCount: 1,
                participantLimit: 4,
                requirePassword: false
            };

            if (code === 'FIRST1') {
                markFirstLookupStarted();
                await firstLookupGate;
            }

            try {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(room) });
            } catch (_error) {
                // The fixed client aborts the superseded route before it is released.
            } finally {
                if (code === 'FIRST1') markFirstLookupSettled();
            }
        });

        await gotoTestPage(page, '/open.html#join');
        await page.fill('#join-code', 'FIRST1');
        await firstLookupStarted;

        await page.fill('#join-code', 'SECOND2');
        await expect(page.locator('#join-room-preview-name')).toHaveText('Second response');

        releaseFirstLookup();
        await firstLookupSettled;
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        await expect(page.locator('#join-room-preview-name')).toHaveText('Second response');
    } finally {
        releaseFirstLookup();
        await visitor.context.close();
    }
});

test('create rejects duplicate submits and retries the preserved draft after a failed ack', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    try {
        const { page } = visitor;
        await page.route('**/socket.io/socket.io.js', async route => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\n;(() => {
                const originalIo = window.io;
                window.__createCalls = 0;
                window.io = (...args) => {
                    const socket = originalIo(...args), emit = socket.emit.bind(socket);
                    socket.emit = (event, ...values) => {
                        if (event === 'create-room' && ++window.__createCalls === 1) {
                            window.__rejectCreate = () => values[values.length - 1](null, { ok: false, errorCode: 'RATE_LIMITED' });
                            return socket;
                        }
                        return emit(event, ...values);
                    };
                    return socket;
                };
            })();` });
        });
        await gotoTestPage(page, '/open');
        await page.fill('#room-name', 'Retry this draft');
        await page.click('#create-form button[type="submit"]');
        await page.locator('#create-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        expect(await page.evaluate(() => (/** @type {any} */ (window)).__createCalls)).toBe(1);
        await page.evaluate(() => (/** @type {any} */ (window)).__rejectCreate());
        await expect(page.locator('#create-feedback')).toHaveClass(/error/);
        await expect(page.locator('#room-name')).toHaveValue('Retry this draft');
        await expect(page.locator('#create-form button[type="submit"]')).toBeEnabled();
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#create-result')).toBeVisible();
        expect(await page.evaluate(() => (/** @type {any} */ (window)).__createCalls)).toBe(2);
    } finally { await visitor.context.close(); }
});

test('lookup failures and mesh capacity preserve the code until a successful retry', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    try {
        const { page } = visitor;
        let status = 500;
        let full = false;
        await page.route('**/api/rooms/RETRY1', route => route.fulfill({ status,
            contentType: 'application/json', body: JSON.stringify({ roomId: 'RETRY1', name: 'Retry room',
                videoProvider: 'mesh', mediaMode: 'mesh', participantCount: full ? 4 : 0, participantLimit: 4 }) }));
        await gotoTestPage(page, '/open#join');
        await page.fill('#join-code', 'RETRY1');
        for (const failure of [500, 429, 404, 200]) {
            status = failure;
            full = failure === 200;
            await page.click('#join-form button[type="submit"]');
            await expect(page.locator('#join-feedback')).toHaveClass(/error/);
            await expect(page.locator('#join-form button[type="submit"]')).toBeEnabled();
            await expect(page.locator('#join-code')).toHaveValue('RETRY1');
        }
        full = false;
        await page.click('#join-form button[type="submit"]');
        await expect(page).toHaveURL(/index\.html\?room=RETRY1/);
    } finally { await visitor.context.close(); }
});

test('expired form drafts are discarded', async ({ browser }) => {
    const visitor = await createOpenPage(browser);
    try {
        const { page } = visitor;
        await page.addInitScript(() => sessionStorage.setItem('halastudyRoomDraft:v1', JSON.stringify({
            version: 1, expiresAt: Date.now() - 1, values: { 'room-name': 'Expired draft', 'room-password': 'old-password' }
        })));
        await gotoTestPage(page, '/open');
        await expect(page.locator('#room-name')).toHaveValue('');
        await expect(page.locator('#room-password')).toHaveValue('');
        expect(await page.evaluate(() => sessionStorage.getItem('halastudyRoomDraft:v1'))).toBeNull();
    } finally { await visitor.context.close(); }
});

for (const lang of ['en', 'ar']) {
    test(`protected lookup uses the private preview contract in ${lang}`, async ({ browser }) => {
        const visitor = await createOpenPage(browser, lang);
        try {
            const { page } = visitor;
            await gotoTestPage(page, '/open');
            await page.fill('#room-name', 'Private preview');
            await page.check('#require-password');
            await page.fill('#room-password', 'preview-secret');
            await page.click('#create-form button[type=submit]');
            await expect(page.locator('#create-result')).toBeVisible();
            const code = (await page.locator('#result-code').textContent()).trim();
            await gotoTestPage(page, `/open?room=${code}`);
            await expect(page.locator('#join-room-preview-name')).toHaveText('Private preview');
            await expect(page.locator('#join-room-preview-mode')).toBeHidden();
            await expect(page.locator('#join-room-preview-count')).toBeHidden();
            await expect(page.locator('#join-room-preview-access')).toContainText(lang === 'en' ? /password/i : /كلمة مرور/);
            await page.click('#join-form button[type=submit]');
            await expect(page.locator('#join-password')).toHaveAttribute('aria-invalid', 'true');
            await expect(page.locator('#join-code')).toHaveValue(code);
            await page.fill('#join-password', 'preview-secret');
            await page.click('#join-form button[type=submit]');
            await expect(page).toHaveURL(/index\.html\?room=/);
            await page.fill('#join-name', 'Private visitor');
            await page.click('#join-form button[type=submit]');
            await expect(page.locator('#join-overlay')).toHaveClass(/hidden/);
            await expect(page.locator('#chat-input')).toBeEnabled();
        } finally { await visitor.context.close(); }
    });
}
