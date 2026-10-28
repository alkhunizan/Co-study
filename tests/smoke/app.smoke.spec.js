const { createTestContext, gotoTestPage, test, expect } = require('../helpers/playwright-test');

const { startServer } = require('../helpers/server-control');

let smokeIpCounter = 10;

async function createSmokePage(browser) {
    const forwardedIp = `203.0.113.${smokeIpCounter}`;
    smokeIpCounter += 1;
    const context = await createTestContext(browser, {
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

async function createMeshLifecyclePage(browser) {
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const context = await createTestContext(browser, {
        baseURL: server.baseUrl,
        permissions: [],
        serviceWorkers: 'block'
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
        try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
        class FakePeerConnection {
            constructor() {
                this.connectionState = 'new';
                this.iceConnectionState = 'new';
                this.iceGatheringState = 'new';
                this.signalingState = 'stable';
                this.localDescription = null;
                this.remoteDescription = null;
                this.restartCount = 0;
                this.closeCount = 0;
                this.offerOptions = [];
                (/** @type {any} */ (window)).__meshFakePeers.push(this);
            }
            addTrack() {}
            getSenders() { return []; }
            async addIceCandidate() {}
            async createAnswer() { return { type: 'answer', sdp: 'fake-answer' }; }
            async createOffer(options) {
                this.offerOptions.push(options || null);
                return { type: 'offer', sdp: 'fake-offer' };
            }
            async setLocalDescription(description) { this.localDescription = description; }
            async setRemoteDescription(description) { this.remoteDescription = description; }
            restartIce() { this.restartCount += 1; }
            close() {
                this.closeCount += 1;
                this.connectionState = 'closed';
                this.iceConnectionState = 'closed';
            }
        }
        (/** @type {any} */ (window)).__meshFakePeers = [];
        if (typeof window.MediaStream !== 'function') {
            (/** @type {any} */ (window)).MediaStream = class FakeMediaStream {
                constructor(tracks = []) { this.tracks = [...tracks]; }
                getTracks() { return [...this.tracks]; }
                getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
            };
        }
        Object.defineProperty(window, 'RTCPeerConnection', {
            configurable: true,
            value: FakePeerConnection
        });
    });
    await signupViaApi(page, 'Mesh Smoke Member');
    return { server, context, page };
}

// Scheduled rooms require an account — sign up via the API using the page's
// own cookie jar so the browser (and its socket) is authenticated after.
async function signupViaApi(page, displayName = 'Smoke Owner') {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const response = await page.request.post('/api/auth/signup', {
        data: {
            email: `smoke-${unique}@example.com`,
            password: 'smoke-password-1',
            displayName
        }
    });
    expect(response.ok()).toBeTruthy();
}

async function createRoomFromLanding(page, options = {}) {
    const {
        roomName = `QA Room ${Date.now()}`,
        password = '',
        requirePassword = false,
        mediaMode = 'mesh',
        schedule = null
    } = options;

    // /open.html holds the create/join forms; / is editorial marketing only as of 2026-05-17.
    await gotoTestPage(page, '/open.html');
    await expect(page.locator('#create-form')).toBeVisible();

    await page.fill('#room-name', roomName);
    if (mediaMode === 'sfu') {
        await expect(page.locator('[data-media-mode="sfu"]')).toBeVisible();
        await page.click('[data-media-mode="sfu"]');
        await expect(page.locator('[data-media-mode="sfu"]')).toHaveClass(/active/);
    }
    if (requirePassword) {
        await page.check('#require-password');
        await page.fill('#room-password', password);
    }
    if (schedule) {
        await page.check('#enable-schedule');
        if (schedule.startDate) {
            await page.fill('#schedule-date', schedule.startDate);
        }
        if (schedule.startTime) {
            await page.fill('#schedule-time', schedule.startTime);
        }
        if (schedule.cadence) {
            await page.selectOption('#schedule-cadence', schedule.cadence);
        }
        if (schedule.focusMinutes) {
            await page.fill('#schedule-focus', String(schedule.focusMinutes));
        }
        if (schedule.breakMinutes) {
            await page.fill('#schedule-break', String(schedule.breakMinutes));
        }
        if (schedule.boardGoalTemplate) {
            await page.fill('#schedule-goal-template', schedule.boardGoalTemplate);
        }
    }

    await page.click('#create-form button[type="submit"]');
    await expect(page.locator('#create-result')).toBeVisible();

    const roomCode = (await page.locator('#result-code').textContent()).trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    return roomCode;
}

function buildFutureRiyadhSchedule(options = {}) {
    const minutesFromNow = Number.isInteger(options.minutesFromNow) ? options.minutesFromNow : 5;
    const future = new Date(Date.now() + (3 * 60 * 60 * 1000) + (minutesFromNow * 60 * 1000));
    return {
        startDate: `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}-${String(future.getUTCDate()).padStart(2, '0')}`,
        startTime: `${String(future.getUTCHours()).padStart(2, '0')}:${String(future.getUTCMinutes()).padStart(2, '0')}`,
        cadence: options.cadence || 'weekdays',
        focusMinutes: options.focusMinutes || 50,
        breakMinutes: options.breakMinutes || 10,
        boardGoalTemplate: options.boardGoalTemplate || 'Ship the Saudi launch checklist'
    };
}

async function joinRoom(page, options = {}) {
    const {
        name,
        roomCode = '',
        password = ''
    } = options;

    await expect(page.locator('#join-overlay')).toBeVisible();
    await page.fill('#join-name', name);
    if (roomCode) {
        await page.fill('#join-room', roomCode);
    }
    await page.fill('#join-password', password);
    await page.click('#join-form button[type="submit"]');
}

async function expectJoined(page) {
    await expect.poll(async () => {
        const overlayHidden = await page.locator('#join-overlay').evaluate((element) => {
            return element.classList.contains('hidden');
        });
        const chatEnabled = await page.locator('#chat-input').isEnabled();
        const boardEnabled = await page.locator('#new-task').isEnabled();
        const joinError = ((await page.locator('#join-error').textContent()) || '').trim();

        if (joinError) {
            return `error:${joinError}`;
        }
        if (overlayHidden && chatEnabled && boardEnabled) {
            return 'joined';
        }
        return 'pending';
    }, { timeout: 20000 }).toBe('joined');
}

async function addTask(page, text) {
    await page.fill('#new-task', text);
    await page.click('#add-task-btn');
    await expect(page.locator('#todo-list .todo-text', { hasText: text })).toBeVisible();
}

async function taskTexts(page) {
    return (await page.locator('#todo-list .todo-text').allTextContents()).map((entry) => entry.trim());
}

async function selfBadgeLayout(page) {
    return page.locator('#user-list .user-name-row').first().evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
            display: style.display,
            gap: style.gap,
            wrap: style.flexWrap
        };
    });
}

test.describe.configure({ mode: 'serial' });

test('landing creates a protected room and join flow enforces passwords', async ({ browser }) => {
    const creator = await createSmokePage(browser);
    const guest = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(creator.page, {
            roomName: 'Protected Smoke Room',
            requirePassword: true,
            password: 'smoke123'
        });

        await gotoTestPage(guest.page, `/index.html?room=${roomCode}`);
        await expect(guest.page.locator('#join-room')).toHaveValue(roomCode);

        await joinRoom(guest.page, { name: 'Guest', roomCode });
        await expect(guest.page.locator('#join-error')).toContainText(/requires a password/i);

        await guest.page.fill('#join-password', 'wrongpass');
        await guest.page.click('#join-form button[type="submit"]');
        await expect(guest.page.locator('#join-error')).toContainText(/incorrect/i);

        await guest.page.fill('#join-password', 'smoke123');
        await guest.page.click('#join-form button[type="submit"]');
        await expectJoined(guest.page);
    } finally {
        await creator.context.close();
        await guest.context.close();
    }
});

test('chat and shared board stay in sync across two participants', async ({ browser }) => {
    const owner = await createSmokePage(browser);
    const peer = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Realtime Smoke Room'
        });

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);
        await expect(owner.page.locator('#user-list .user-self')).toContainText('Me');
        await expect.poll(() => selfBadgeLayout(owner.page)).toEqual({
            display: 'flex',
            gap: '8px',
            wrap: 'wrap'
        });

        await gotoTestPage(peer.page, `/index.html?room=${roomCode}`);
        await joinRoom(peer.page, {
            name: 'Peer',
            roomCode
        });
        await expectJoined(peer.page);

        await owner.page.fill('#chat-input', 'Smoke hello');
        await owner.page.click('#chat-send');
        await expect(peer.page.locator('#chat-msgs')).toContainText('Smoke hello');

        await owner.page.fill('#room-goal', 'Ship CI guardrails');
        await owner.page.locator('#room-goal').blur();
        await expect.poll(async () => peer.page.locator('#room-goal').inputValue()).toBe('Ship CI guardrails');

        await addTask(owner.page, 'First shared task');
        await addTask(owner.page, 'Second shared task');
        await expect.poll(() => taskTexts(peer.page)).toEqual(['First shared task', 'Second shared task']);

        // Drop on the target's top edge: at its exact midpoint the board treats the
        // drop as "after" it, and sub-pixel rounding made the reorder flaky.
        await owner.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })
            .dragTo(owner.page.locator('#todo-list .todo-item', { hasText: 'First shared task' }), {
                targetPosition: { x: 10, y: 2 }
            });
        await expect.poll(() => taskTexts(peer.page)).toEqual(['Second shared task', 'First shared task']);

        await peer.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })
            .locator('.check-circle')
            .click();
        await expect(owner.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })).toHaveClass(/done/);

        await owner.page.locator('#todo-list .todo-item', { hasText: 'First shared task' })
            .locator('.todo-delete')
            .click();
        await expect.poll(() => taskTexts(peer.page)).toEqual(['Second shared task']);
    } finally {
        await owner.context.close();
        await peer.context.close();
    }
});

test('timer preset chips apply durations and session goal syncs to peers', async ({ browser }) => {
    const owner = await createSmokePage(browser);
    const peer = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Preset Smoke Room'
        });

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, { name: 'Owner', roomCode });
        await expectJoined(owner.page);

        // Default 25/5 chip is active on load.
        await expect(owner.page.locator('.timer-preset-chip[data-focus="25"]')).toHaveClass(/active/);

        // Clicking 50/10 updates inputs + display and moves the active state.
        await owner.page.click('.timer-preset-chip[data-focus="50"]');
        await expect(owner.page.locator('#cfg-f')).toHaveValue('50');
        await expect(owner.page.locator('#cfg-b')).toHaveValue('10');
        await expect(owner.page.locator('#timer-disp')).toHaveText('50:00');
        await expect(owner.page.locator('.timer-preset-chip[data-focus="50"]')).toHaveClass(/active/);
        await expect(owner.page.locator('.timer-preset-chip[data-focus="25"]')).not.toHaveClass(/active/);

        // Manual edit clears the active chip.
        await owner.page.fill('#cfg-f', '42');
        await expect(owner.page.locator('.timer-preset-chip.active')).toHaveCount(0);

        // Chip click while the timer is running resets it to the preset.
        await owner.page.click('#btn-toggle');
        await owner.page.click('.timer-preset-chip[data-focus="90"]');
        await expect(owner.page.locator('#timer-disp')).toHaveText('90:00');
        await expect(owner.page.locator('#btn-toggle')).toHaveText('▶');

        // Session goal propagates to the peer's participant list.
        await gotoTestPage(peer.page, `/index.html?room=${roomCode}`);
        await joinRoom(peer.page, { name: 'Peer', roomCode });
        await expectJoined(peer.page);

        await owner.page.fill('#status-goal', 'Solve 25 quant questions');
        await expect(peer.page.locator('#user-list .user-goal-text')).toContainText('Solve 25 quant questions');
    } finally {
        await owner.context.close();
        await peer.context.close();
    }
});

test('Pomodoro reconciles elapsed time after background timer throttling', async ({ browser }) => {
    const visitor = await createSmokePage(browser);

    try {
        await visitor.page.clock.install({ time: new Date('2026-07-15T03:00:00Z') });
        await gotoTestPage(visitor.page, '/study');
        await visitor.page.fill('#cfg-f', '1');
        await visitor.page.fill('#cfg-b', '1');
        await visitor.page.evaluate(() => (/** @type {any} */ (window)).resetTimer());
        await expect(visitor.page.locator('#timer-disp')).toHaveText('01:00');

        await visitor.page.evaluate(() => (/** @type {any} */ (window)).toggleTimer());
        await visitor.page.clock.fastForward(55_000);
        await expect(visitor.page.locator('#timer-disp')).toHaveText('00:05');

        // Cross the absolute deadline first, then advance inside the new
        // phase. Playwright intentionally coalesces throttled interval ticks,
        // and engines differ in which tick they retain for one large jump.
        await visitor.page.clock.fastForward(5_000);
        await expect(visitor.page.locator('#tab-break')).toHaveClass(/active/);
        await visitor.page.clock.fastForward(2_000);
        await expect(visitor.page.locator('#timer-disp')).toHaveText('00:58');

        await visitor.page.clock.fastForward(10 * 60 * 1000);
        await expect(visitor.page.locator('#tab-focus')).toHaveClass(/active/);
        await expect(visitor.page.locator('#timer-disp')).toHaveText('01:00');
    } finally {
        await visitor.context.close();
    }
});

test('mesh signaling and late tracks from peers outside the room snapshot are ignored', async ({ browser }) => {
    const visitor = await createMeshLifecyclePage(browser);

    try {
        const roomCode = await createRoomFromLanding(visitor.page, { roomName: 'Mesh Peer Guard Room' });
        await visitor.page.click('#btn-enter-room');
        await joinRoom(visitor.page, { name: 'Guarded', roomCode });
        await expectJoined(visitor.page);

        const outcome = await visitor.page.evaluate(async () => {
            const app = /** @type {any} */ (window);
            const beforeSignals = app.__meshFakePeers.length;
            await app.handleIncomingOffer({
                from: 'unknown-offerer',
                sdp: { type: 'offer', sdp: 'forged-offer' }
            });
            await app.handleIncomingAnswer({
                from: 'unknown-answerer',
                sdp: { type: 'answer', sdp: 'forged-answer' }
            });
            await app.handleIncomingIce({
                from: 'unknown-ice',
                candidate: {
                    candidate: 'candidate:0 1 UDP 2122252543 192.0.2.1 3478 typ host',
                    sdpMid: '0',
                    sdpMLineIndex: 0,
                    usernameFragment: 'forged'
                }
            });

            const knownPeerId = 'zzzz-known-peer';
            app.updatePresenceList([{ id: knownPeerId, name: 'Known peer' }]);
            const knownConnection = app.ensurePeerConnection(knownPeerId);
            app.updatePresenceList([]);
            let stoppedTracks = 0;
            const lateTrack = {
                enabled: true,
                kind: 'video',
                readyState: 'live',
                stop() { stoppedTracks += 1; }
            };
            knownConnection.ontrack({ track: lateTrack, streams: [new MediaStream()] });

            return {
                peerConnectionsCreatedByUnknownSignals: app.__meshFakePeers.length - beforeSignals - 1,
                stoppedTracks,
                lateTiles: document.querySelectorAll(`[data-peer-id="${knownPeerId}"]`).length
            };
        });

        expect(outcome.peerConnectionsCreatedByUnknownSignals).toBe(0);
        expect(outcome.stoppedTracks).toBe(1);
        expect(outcome.lateTiles).toBe(0);
    } finally {
        await visitor.context.close();
        await visitor.server.stop();
    }
});

test('mesh disconnect restarts ICE once and waits ten seconds before teardown', async ({ browser }) => {
    const visitor = await createMeshLifecyclePage(browser);

    try {
        const roomCode = await createRoomFromLanding(visitor.page, { roomName: 'Mesh Recovery Room' });
        await visitor.page.click('#btn-enter-room');
        await joinRoom(visitor.page, { name: 'Recovering', roomCode });
        await expectJoined(visitor.page);

        const outcome = await visitor.page.evaluate(async () => {
            const app = /** @type {any} */ (window);
            const originalSetTimeout = window.setTimeout;
            const originalClearTimeout = window.clearTimeout;
            const timers = new Map();
            app.setTimeout = (callback, delay, ...args) => {
                if (delay !== 10_000) return originalSetTimeout(callback, delay, ...args);
                const token = {};
                timers.set(token, { callback, delay });
                return /** @type {any} */ (token);
            };
            app.clearTimeout = (id) => {
                if (!timers.delete(id)) originalClearTimeout(id);
            };

            try {
                const peerId = 'zzzz-recovery-peer';
                app.updatePresenceList([{ id: peerId, name: 'Recovering peer' }]);
                const peer = app.ensurePeerConnection(peerId);
                peer.connectionState = 'disconnected';
                peer.iceConnectionState = 'disconnected';
                peer.onconnectionstatechange();
                peer.oniceconnectionstatechange();

                const first = timers.entries().next().value;
                const firstDelay = first?.[1]?.delay ?? null;
                peer.onconnectionstatechange();
                if (first) {
                    timers.delete(first[0]);
                    await first[1].callback();
                    await Promise.resolve();
                }
                return {
                    firstDelay,
                    restartCount: peer.restartCount,
                    closeCount: peer.closeCount
                };
            } finally {
                app.setTimeout = originalSetTimeout;
                app.clearTimeout = originalClearTimeout;
            }
        });

        expect(outcome).toEqual({
            firstDelay: 10_000,
            restartCount: 1,
            closeCount: 1
        });
    } finally {
        await visitor.context.close();
        await visitor.server.stop();
    }
});

test('privacy blur sends a canvas track by default and tears the camera down cleanly', async ({ playwright }) => {
    // Boots its own server: the shared smoke app defaults to the RealtimeKit
    // video provider, and the blur pipeline is mesh-only. Also launches a
    // dedicated Chromium with a fake camera instead of the shared fixture
    // whose getUserMedia stub always throws.
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const browser = await playwright.chromium.launch({
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });
    const context = await createTestContext(browser, {
        baseURL: server.baseUrl,
        permissions: ['camera']
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
        // Third-party font/CDN noise is irrelevant to the blur pipeline.
        if (message.type() === 'error' && !/fonts\.gstatic|net::ERR_FAILED/.test(message.text())) {
            consoleErrors.push(message.text());
        }
    });
    await page.addInitScript(() => {
        try { delete (/** @type {any} */ (window)).FaceDetector; } catch (_error) {}
        try { localStorage.setItem('halastudyLang', 'en'); } catch (_error) {}
    });
    await signupViaApi(page, 'Blur Smoke Member');

    try {
        const roomCode = await createRoomFromLanding(page, { roomName: 'Blur Smoke Room' });
        await page.click('#btn-enter-room');
        await joinRoom(page, { name: 'Blurred', roomCode });
        await expectJoined(page);

        const videoCountBefore = await page.locator('video').count();

        const localTrackLabel = () => page.evaluate(() => {
            const video = /** @type {HTMLVideoElement} */ (document.getElementById('local-video'));
            const stream = /** @type {MediaStream|null} */ (video.srcObject);
            const track = stream?.getVideoTracks()[0];
            return track ? { label: track.label, state: track.readyState } : null;
        });

        // Enable camera: blur defaults ON, so the outgoing track is
        // canvas-sourced, not the fake capture device.
        await page.click('#camera-toggle');
        await expect(page.locator('#blur-toggle')).toBeVisible();
        await expect(page.locator('#blur-toggle')).toHaveText('Blur: on');
        await expect.poll(async () => (await localTrackLabel())?.state).toBe('live');
        const blurredTrack = await localTrackLabel();
        expect(blurredTrack.label).not.toMatch(/fake/i);
        // The pipeline adds its hidden raw <video> to the DOM.
        await expect(page.locator('video')).toHaveCount(videoCountBefore + 1);

        // Blur off mid-call: the raw fake-device track takes over.
        await page.click('#blur-toggle');
        await expect(page.locator('#blur-toggle')).toHaveText('Blur: off');
        await expect.poll(async () => (await localTrackLabel())?.label).toMatch(/fake/i);
        await expect(page.locator('video')).toHaveCount(videoCountBefore);

        // Blur back on: canvas track again, no errors accumulated.
        await page.click('#blur-toggle');
        await expect(page.locator('#blur-toggle')).toHaveText('Blur: on');
        await expect.poll(async () => (await localTrackLabel())?.label).not.toMatch(/fake/i);

        // Disable camera: preview cleared AND the hidden raw video is gone
        // (the raw tracks are stopped by the same teardown — a leak here
        // means the camera light stays on).
        await page.click('#camera-toggle');
        await expect.poll(() => page.evaluate(() => {
            const video = /** @type {HTMLVideoElement} */ (document.getElementById('local-video'));
            return video.srcObject === null;
        })).toBe(true);
        await expect(page.locator('video')).toHaveCount(videoCountBefore);

        expect(consoleErrors).toEqual([]);
    } finally {
        await context.close();
        await browser.close();
        await server.stop();
    }
});

test('scheduled rooms expose timer defaults and invite actions', async ({ browser }) => {
    const owner = await createSmokePage(browser);

    try {
        await signupViaApi(owner.page, 'Owner');
        const schedule = buildFutureRiyadhSchedule();
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Scheduled Smoke Room',
            schedule
        });

        await expect(owner.page.locator('#result-schedule')).toBeVisible();
        await expect(owner.page.locator('#result-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
        await expect(owner.page.locator('#result-calendar-btn')).toBeVisible();

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);

        await expect(owner.page.locator('#schedule-card')).toBeVisible();
        await expect(owner.page.locator('#schedule-meta')).toContainText(/timer/i);
        await expect(owner.page.locator('#cfg-f')).toHaveValue('50');
        await expect(owner.page.locator('#cfg-b')).toHaveValue('10');
        await expect(owner.page.locator('#room-goal')).toHaveValue('Ship the Saudi launch checklist');
        await expect(owner.page.locator('#schedule-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
    } finally {
        await owner.context.close();
    }
});

test('schedule helpers recalculate recurring sessions after stale snapshot data', async ({ browser }) => {
    const probe = await createSmokePage(browser);

    try {
        await probe.page.addInitScript(() => {
            const realNow = Date.now.bind(Date);
            let offsetMs = 0;
            Date.now = () => realNow() + offsetMs;
            (/** @type {any} */ (window)).__setTestNowOffset = (nextOffsetMs) => {
                offsetMs = Number(nextOffsetMs) || 0;
            };
        });

        await signupViaApi(probe.page, 'Owner');
        const roomCode = await createRoomFromLanding(probe.page, {
            roomName: 'Scheduled Roll Forward Room',
            schedule: buildFutureRiyadhSchedule({
                // Scheduled rooms open 15 minutes before an occurrence. Keep
                // the fixture inside that window so this test can exercise the
                // client-side roll-forward behavior after joining.
                minutesFromNow: 5,
                cadence: 'daily',
                focusMinutes: 50,
                breakMinutes: 10,
                boardGoalTemplate: 'Keep the next session accurate'
            })
        });

        await probe.page.click('#btn-enter-room');
        await joinRoom(probe.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(probe.page);

        await expect(probe.page.locator('#schedule-meta')).toContainText(/Next session/i);

        const initialMeta = await probe.page.locator('#schedule-meta').textContent();

        await probe.page.evaluate(() => {
            (/** @type {any} */ (window)).__setTestNowOffset(2 * 60 * 60 * 1000);
        });

        await expect.poll(async () => probe.page.locator('#schedule-countdown').textContent()).not.toEqual('');
        await expect.poll(async () => probe.page.locator('#schedule-meta').textContent()).not.toBe(initialMeta);
        await expect(probe.page.locator('#schedule-meta')).toContainText(/Next session/i);
        await expect(probe.page.locator('#schedule-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
    } finally {
        await probe.context.close();
    }
});

test('large-mode rooms use the RealtimeKit provider by default', async ({ browser }) => {
    const owner = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'RealtimeKit Room Smoke'
        });
        await expect(owner.page.locator('[data-media-mode="sfu"]')).toBeHidden();

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);

        await expect(owner.page.locator('#media-mode-value')).toContainText(/study camera room/i);
        await expect(owner.page.locator('.video-box')).toHaveClass(/realtimekit-mode/);
        await expect(owner.page.locator('#media-state-text')).toContainText(/camera room/i);
    } finally {
        await owner.context.close();
    }
});

test('five participants can join a default RealtimeKit room shell', async ({ browser }) => {
    // Five live room pages share one browser on a GPU-less CI runner, and each
    // joined page keeps rendering its privacy-blur canvas, so every join is
    // slower than the last (WebKit desktop: 2.4s, 4.8s, 8.3s, 12.1s per join).
    // The whole flow measured 37.8s and >45s on the same commit, so the
    // default 45s budget sits inside run-to-run noise for this one test.
    test.setTimeout(90_000);
    const users =await Promise.all(Array.from({ length: 5 }, () => createSmokePage(browser)));

    try {
        const roomCode = await createRoomFromLanding(users[0].page, {
            roomName: 'Mesh Cap Smoke'
        });

        for (let index = 0; index < 4; index += 1) {
            const actor = users[index];
            if (index === 0) {
                await actor.page.click('#btn-enter-room');
            } else {
                await gotoTestPage(actor.page, `/index.html?room=${roomCode}`);
            }
            await joinRoom(actor.page, {
                name: `User ${index + 1}`,
                roomCode
            });
            await expectJoined(actor.page);
        }

        await gotoTestPage(users[4].page, `/index.html?room=${roomCode}`);
        await joinRoom(users[4].page, {
            name: 'User 5',
            roomCode
        });
        await expectJoined(users[4].page);
        await expect(users[4].page.locator('#presence-count')).toContainText('5');
        await expect(users[4].page.locator('#media-mode-value')).toContainText(/study camera room/i);
    } finally {
        await Promise.all(users.map(({ context }) => context.close()));
    }
});
