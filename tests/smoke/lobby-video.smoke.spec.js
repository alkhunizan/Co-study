const { test, expect } = require('@playwright/test');

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
    const context = await browser.newContext({ permissions: [] });
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

        await page.goto(`${server.baseUrl}/lobby`);
        await expect.poll(() => page.evaluate(
            () => (/** @type {any} */ (window)).__fakeMedia?.joins || 0
        )).toBe(1);

        const tokenRequest = videoRequests.find((request) => request.pathname.endsWith('/video-token'));
        expectLockedVideoRequest(tokenRequest, membershipToken, {
            displayName: 'Lobby Smoke',
            role: 'viewer'
        });

        await page.goto('about:blank');
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
    const context = await browser.newContext({ permissions: [] });
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

        await page.goto(`${server.baseUrl}/open.html`);
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

        await page.goto('about:blank');
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
