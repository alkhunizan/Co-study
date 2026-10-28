const { createTestContext, gotoTestPage, test, expect } = require('../helpers/playwright-test');

const { startServer } = require('../helpers/server-control');

async function installMembershipAck(page, membershipToken) {
    await page.route('**/socket.io/socket.io.js', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({
            response,
            body: `${source}\n;(() => {
                const originalIo = window.io;
                window.io = function wrappedIo(...args) {
                    const socket = originalIo(...args);
                    const originalEmit = socket.emit.bind(socket);
                    socket.emit = function wrappedEmit(eventName, ...eventArgs) {
                        if (eventName === 'join-room') {
                            const callbackIndex = eventArgs.length - 1;
                            const callback = eventArgs[callbackIndex];
                            if (typeof callback === 'function') {
                                eventArgs[callbackIndex] = (ack = {}) => callback(
                                    ack && ack.ok
                                        ? { ...ack, membershipToken: ${JSON.stringify(membershipToken)} }
                                        : ack
                                );
                            }
                        }
                        return originalEmit(eventName, ...eventArgs);
                    };
                    return socket;
                };
                Object.assign(window.io, originalIo);
            })();`
        });
    });
}

async function installFakeMediaClient(page) {
    await page.route('**/js/video/realtimekit-client.js', async (route) => {
        await route.fulfill({
            contentType: 'application/javascript',
            body: `
                window.__fakeMedia = { joins: 0, leaves: 0 };
                const buildMeeting = () => ({
                    self: {
                        videoEnabled: false,
                        on() {},
                        async disableAudio() {},
                        async enableVideo() { this.videoEnabled = true; },
                        async disableVideo() { this.videoEnabled = false; }
                    },
                    participants: {
                        joined: { toArray: () => [], on() {} },
                        on() {},
                        async setViewMode() {},
                        setPage() {}
                    }
                });
                const join = async ({ meetingElement } = {}) => {
                    window.__fakeMedia.joins += 1;
                    const meeting = buildMeeting();
                    if (meetingElement) meetingElement.meeting = meeting;
                    return {
                        meeting,
                        leave: async () => {
                            window.__fakeMedia.leaves += 1;
                            if (meetingElement) meetingElement.meeting = null;
                        }
                    };
                };
                window.HalastudyRealtimeKitClient = {
                    join,
                    joinHeadless: join
                };
            `
        });
    });
}

async function installVideoContract(page, videoSessionId) {
    const requests = [];
    const videoRequestPattern = /\/api\/rooms\/[^/]+\/video-(token|heartbeat|leave)$/;
    page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (!videoRequestPattern.test(pathname)) return;
        requests.push({
            pathname,
            body: request.postDataJSON(),
            headers: request.headers()
        });
    });
    await page.route(videoRequestPattern, async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const body = request.postDataJSON();
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(pathname.endsWith('/video-token')
                ? {
                    ok: true,
                    authToken: `auth-${videoSessionId}`,
                    videoSessionId,
                    role: body.role,
                    policy: {}
                }
                : { ok: true })
        });
    });
    return requests;
}

function expectLockedVideoRequest(request, membershipToken, expectedBody) {
    expect(request?.headers['x-halastudy-membership']).toBe(membershipToken);
    expect(request?.body).toEqual(expectedBody);
    expect(request?.body).not.toHaveProperty('clientSessionId');
}

function captureBrowserErrors(page) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    return errors;
}

test('Lobby binds its shared video lifecycle to the socket membership and server session', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    // Playwright page.route cannot intercept requests from a controlling
    // service worker. This test intentionally mocks scripts and API calls, so
    // keep its context worker-free and test the real worker in its own spec.
    const context = await createTestContext(browser, { permissions: [], serviceWorkers: 'block' });
    const page = await context.newPage();
    const membershipToken = 'membership-lobby-smoke';
    const videoSessionId = 'video-session-lobby-smoke';

    try {
        await page.addInitScript(() => {
            try {
                localStorage.setItem('halastudyLang', 'en');
                localStorage.setItem('halastudyDisplayName', 'Lobby Smoke');
                localStorage.setItem('halastudyClientId', 'caller-picked-id-must-not-authorize-video');
            } catch (_error) {}
        });
        await installMembershipAck(page, membershipToken);
        await installFakeMediaClient(page);
        const videoRequests = await installVideoContract(page, videoSessionId);
        const browserErrors = captureBrowserErrors(page);

        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        await expect.poll(() => page.evaluate(
            () => (/** @type {any} */ (window)).__fakeMedia?.joins || 0
        )).toBe(1);

        const tokenRequest = videoRequests.find((request) => request.pathname.endsWith('/video-token'));
        expectLockedVideoRequest(tokenRequest, membershipToken, {
            displayName: 'Lobby Smoke',
            role: 'viewer'
        });

        await gotoTestPage(page, 'about:blank');
        await expect.poll(
            () => videoRequests.filter((request) => request.pathname.endsWith('/video-leave')).length
        ).toBe(1);
        const leaveRequest = videoRequests.find((request) => request.pathname.endsWith('/video-leave'));
        expectLockedVideoRequest(leaveRequest, membershipToken, { videoSessionId });
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('study room binds its shared video lifecycle to the socket membership and server session', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const context = await createTestContext(browser, { permissions: [], serviceWorkers: 'block' });
    const page = await context.newPage();
    const membershipToken = 'membership-room-smoke';
    const videoSessionId = 'video-session-room-smoke';

    try {
        await page.addInitScript(() => {
            try {
                localStorage.setItem('halastudyLang', 'en');
                localStorage.setItem('halastudyClientId', 'caller-picked-id-must-not-authorize-video');
            } catch (_error) {}
        });
        await installMembershipAck(page, membershipToken);
        await installFakeMediaClient(page);
        const videoRequests = await installVideoContract(page, videoSessionId);
        const browserErrors = captureBrowserErrors(page);

        await gotoTestPage(page, `${server.baseUrl}/open.html`);
        await page.fill('#room-name', 'Membership Video Smoke');
        await page.click('#create-form button[type="submit"]');
        await expect(page.locator('#create-result')).toBeVisible();
        const roomCode = ((await page.locator('#result-code').textContent()) || '').trim();
        expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

        await page.click('#btn-enter-room');
        await expect(page.locator('#join-overlay')).toBeVisible();
        await page.fill('#join-name', 'Room Smoke');
        await page.fill('#join-room', roomCode);
        await page.click('#join-form button[type="submit"]');
        await expect.poll(() => page.evaluate(
            () => (/** @type {any} */ (window)).__fakeMedia?.joins || 0
        )).toBe(1);

        const tokenRequest = videoRequests.find((request) => request.pathname.endsWith('/video-token'));
        expectLockedVideoRequest(tokenRequest, membershipToken, {
            displayName: 'Room Smoke',
            role: 'student'
        });

        await gotoTestPage(page, 'about:blank');
        await expect.poll(
            () => videoRequests.filter((request) => request.pathname.endsWith('/video-leave')).length
        ).toBe(1);
        const leaveRequest = videoRequests.find((request) => request.pathname.endsWith('/video-leave'));
        expectLockedVideoRequest(leaveRequest, membershipToken, { videoSessionId });
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('the join button stays disabled until the room script can handle the submit', async ({ browser }) => {
    const context = await createTestContext(browser, { permissions: [], serviceWorkers: 'block' });
    const page = await context.newPage();
    /** @type {() => void} */
    let releaseScript = () => {};
    const scriptGate = new Promise((resolve) => { releaseScript = () => resolve(undefined); });
    // Hold the room script back to recreate a slow connection.
    await page.route('**/js/index-app.js*', async (route) => {
        await scriptGate;
        await route.continue();
    });
    try {
        await gotoTestPage(page, '/index.html?room=ABC123', { waitUntil: 'commit' });
        const submit = page.locator('#join-form button[type="submit"]');
        await expect(page.locator('#join-overlay')).toBeVisible();
        await expect(submit).toBeDisabled();
        await page.fill('#join-name', 'Early Typist');
        await page.locator('#join-name').press('Enter');
        // No native submit happened: the typed name is still there.
        await expect(page.locator('#join-name')).toHaveValue('Early Typist');

        releaseScript();
        await expect(submit).toBeEnabled();
        await expect(page.locator('#join-name')).toHaveValue('Early Typist');
    } finally {
        releaseScript();
        await context.close();
    }
});

// ---- Lobby states (readiness Task 6) ----

// Wraps window.io so a test can fail the first join acknowledgements, attach a
// membership token, and reach the live socket to drop its transport.
async function installLobbySocketHarness(page, { membershipToken = 'membership-lobby-states', failJoinsWith = [], holdFirstJoin = false } = {}) {
    await page.route('**/socket.io/socket.io.js', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        await route.fulfill({
            response,
            body: `${source}\n;(() => {
                const originalIo = window.io;
                const failures = ${JSON.stringify(failJoinsWith)};
                let holdNext = ${JSON.stringify(holdFirstJoin)};
                window.__lobbyJoinAttempts = 0;
                window.io = function wrappedIo(...args) {
                    const socket = originalIo(...args);
                    window.__lobbySocket = socket;
                    const originalEmit = socket.emit.bind(socket);
                    socket.emit = function wrappedEmit(eventName, ...eventArgs) {
                        if (eventName === 'join-room') {
                            const attempt = window.__lobbyJoinAttempts++;
                            const callbackIndex = eventArgs.length - 1;
                            const callback = eventArgs[callbackIndex];
                            if (attempt < failures.length && typeof callback === 'function') {
                                setTimeout(() => callback({ ok: false, errorCode: failures[attempt] }), 0);
                                return socket;
                            }
                            if (typeof callback === 'function') {
                                const deliver = (ack = {}) => callback(
                                    ack && ack.ok ? { ...ack, membershipToken: ${JSON.stringify(membershipToken)} } : ack
                                );
                                if (holdNext) {
                                    holdNext = false;
                                    eventArgs[callbackIndex] = (ack) => { window.__releaseJoin = () => deliver(ack); };
                                } else {
                                    eventArgs[callbackIndex] = deliver;
                                }
                            }
                        }
                        return originalEmit(eventName, ...eventArgs);
                    };
                    return socket;
                };
                Object.assign(window.io, originalIo);
            })();`
        });
    });
}

async function signInAs(page, displayName) {
    await page.route('**/api/auth/me', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'user-lobby-states', displayName, email: 'lobby@example.test' } })
    }));
}

// Deterministic camera probe across engines: 'ok' resolves a stoppable track,
// any other value rejects with that DOMException name.
async function stubCamera(page, outcome) {
    await page.addInitScript((initialOutcome) => {
        const w = /** @type {any} */ (window);
        w.__cameraOutcome = initialOutcome;
        w.__probeStops = 0;
        if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
        navigator.mediaDevices.getUserMedia = async () => {
            if (w.__cameraOutcome !== 'ok') throw new DOMException('stubbed camera outcome', w.__cameraOutcome);
            return /** @type {any} */ ({ getTracks: () => [{ stop() { w.__probeStops += 1; } }] });
        };
    }, outcome);
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ setup?: (page: import('@playwright/test').Page) => Promise<void> }} [options]
 */
async function openLobbyPage(browser, options = {}) {
    const { setup } = options;
    const context = await createTestContext(browser, { permissions: [], serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => {
        try {
            localStorage.setItem('halastudyLang', 'en');
            localStorage.setItem('halastudyDisplayName', 'Lobby States');
        } catch (_error) {}
    });
    await installFakeMediaClient(page);
    const videoRequests = await installVideoContract(page, 'video-session-lobby-states');
    if (setup) await setup(page);
    const browserErrors = captureBrowserErrors(page);
    return { context, page, videoRequests, browserErrors };
}

const fakeMedia = (page, key) => page.evaluate((name) => (/** @type {any} */ (window)).__fakeMedia[name], key);

test('Lobby shows connecting instead of an empty room until the join is acknowledged', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const { context, page, browserErrors } = await openLobbyPage(browser, {
        setup: (target) => installLobbySocketHarness(target, { holdFirstJoin: true })
    });
    try {
        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        await expect.poll(() => page.evaluate(() => typeof (/** @type {any} */ (window)).__releaseJoin)).toBe('function');
        await expect(page.locator('#lobby-status')).toContainText('Connecting to the Lobby');
        await expect(page.locator('#empty')).toBeHidden();
        await expect(page.locator('#present-n')).toHaveText('—');

        await page.evaluate(() => (/** @type {any} */ (window)).__releaseJoin());
        await expect(page.locator('#lobby-status')).toBeHidden();
        await expect(page.locator('#present-n')).not.toHaveText('—');
        // A guest is sent to sign in, and back to the Lobby afterwards.
        await expect(page.locator('#camera-cta')).toHaveText('Sign in to turn on your camera');
        await page.click('#camera-cta');
        await expect(page).toHaveURL(/\/account\.html\?next=%2Flobby$/);
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('a full Lobby offers retry and your own room, and retry joins', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const { context, page, browserErrors } = await openLobbyPage(browser, {
        setup: (target) => installLobbySocketHarness(target, { failJoinsWith: ['ROOM_FULL'] })
    });
    try {
        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        const status = page.locator('#lobby-status');
        await expect(status).toContainText('The Lobby is full right now');
        await expect(page.locator('#lobby-return')).toHaveAttribute('href', '/open');
        await expect(page.locator('#lobby-return')).toHaveText('Open your own room');
        await expect(page.locator('#empty')).toBeHidden();
        expect(await fakeMedia(page, 'joins')).toBe(0);

        await page.click('#lobby-retry');
        await expect(status).toBeHidden();
        await expect.poll(() => fakeMedia(page, 'joins')).toBe(1);
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('a dropped Lobby connection releases media and rejoins on its own', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const { context, page, browserErrors } = await openLobbyPage(browser, {
        setup: (target) => installLobbySocketHarness(target)
    });
    try {
        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        await expect.poll(() => fakeMedia(page, 'joins')).toBe(1);
        await expect(page.locator('#lobby-status')).toBeHidden();

        // Close the transport the way a network drop does; Socket.IO stays active.
        await page.evaluate(() => (/** @type {any} */ (window)).__lobbySocket.io.engine.close());
        await expect.poll(() => fakeMedia(page, 'leaves')).toBeGreaterThanOrEqual(1);
        await expect.poll(() => page.evaluate(() => (/** @type {any} */ (window)).__lobbyJoinAttempts)).toBe(2);
        await expect(page.locator('#lobby-status')).toBeHidden();
        await expect.poll(() => fakeMedia(page, 'joins')).toBe(2);
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('a blocked or missing camera is reported without requesting a publisher seat', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const { context, page, videoRequests, browserErrors } = await openLobbyPage(browser, {
        setup: async (target) => {
            await installLobbySocketHarness(target);
            await signInAs(target, 'Lobby States');
            await stubCamera(target, 'NotAllowedError');
        }
    });
    const publisherRequests = () => videoRequests.filter(
        (request) => request.pathname.endsWith('/video-token') && request.body?.role === 'publisher'
    );
    try {
        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        const cta = page.locator('#camera-cta');
        await expect(cta).toHaveText('Turn on my camera');
        await expect(cta).toBeEnabled();
        await expect(cta).toHaveAttribute('aria-pressed', 'false');

        await cta.click();
        await expect(page.locator('#camera-note')).toContainText('Camera access is blocked');
        await expect(cta).toHaveAttribute('aria-pressed', 'false');

        await page.evaluate(() => { (/** @type {any} */ (window)).__cameraOutcome = 'NotFoundError'; });
        await cta.click();
        await expect(page.locator('#camera-note')).toContainText('No camera found');
        expect(publisherRequests()).toHaveLength(0);
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});

test('the Lobby camera button reflects the real camera state and releases the probe', async ({ browser }) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    const { context, page, videoRequests, browserErrors } = await openLobbyPage(browser, {
        setup: async (target) => {
            await installLobbySocketHarness(target);
            await signInAs(target, 'Lobby States');
            await stubCamera(target, 'ok');
        }
    });
    try {
        await gotoTestPage(page, `${server.baseUrl}/lobby`);
        const cta = page.locator('#camera-cta');
        await expect(cta).toBeEnabled();
        await cta.click();
        await expect(cta).toHaveText('Turn off my camera');
        await expect(cta).toHaveAttribute('aria-pressed', 'true');
        expect(await page.evaluate(() => (/** @type {any} */ (window)).__probeStops)).toBe(1);
        expect(videoRequests.some(
            (request) => request.pathname.endsWith('/video-token') && request.body?.role === 'publisher'
        )).toBe(true);
        await expect(page.locator('#camera-note')).toBeHidden();

        await cta.click();
        await expect(cta).toHaveText('Turn on my camera');
        await expect(cta).toHaveAttribute('aria-pressed', 'false');

        // The language switch rewrites script-set strings too.
        await page.evaluate(() => {
            const button = /** @type {HTMLElement} */ (document.querySelector('[data-lang-value="ar"]'));
            button.click();
        });
        await expect(cta).toHaveText('افتح كاميرتي');
        expect(browserErrors).toEqual([]);
    } finally {
        await context.close();
        await server.stop();
    }
});
