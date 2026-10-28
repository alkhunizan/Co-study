const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const VIDEO_CLIENT_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'video', 'video-client.js'),
    'utf8'
);

function deferred() {
    /** @type {(value?: any) => void} */
    let resolve = () => {};
    /** @type {(reason?: any) => void} */
    let reject = () => {};
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function settleWithin(promise, timeoutMs, message) {
    let timeout = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
            })
        ]);
    } finally {
        if (timeout !== null) clearTimeout(timeout);
    }
}

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

/**
 * @param {{
 *   fetchImpl?: (request: { url: string, options: any }) => any,
 *   join?: (options: any) => Promise<any>,
 *   joinHeadless?: (options: any) => Promise<any>,
 *   AbortControllerImpl?: any,
 *   setTimeoutImpl?: (callback: (...args: any[]) => void, delay?: number) => any,
 *   clearTimeoutImpl?: (handle: any) => void
 * }} [options]
 */
function createHarness(options = {}) {
    const {
        fetchImpl,
        join,
        joinHeadless,
        AbortControllerImpl,
        setTimeoutImpl = setTimeout,
        clearTimeoutImpl = clearTimeout
    } = options;
    const requests = [];
    const timers = new Set();
    let nextTimerId = 1;

    const window = {
        AbortController: AbortControllerImpl,
        HalastudyRealtimeKitClient: {
            join: join || (async () => ({ leave: async () => {} })),
            joinHeadless: joinHeadless || (async () => ({ leave: async () => {} }))
        }
    };

    const context = {
        window,
        async fetch(url, options) {
            const request = { url: String(url), options };
            requests.push(request);
            if (fetchImpl) return fetchImpl(request);
            return jsonResponse({
                ok: true,
                authToken: `token-${requests.length}`,
                videoSessionId: `video-session-${requests.length}`
            });
        },
        setInterval(callback) {
            const timer = { id: nextTimerId, callback };
            nextTimerId += 1;
            timers.add(timer);
            return timer;
        },
        clearInterval(timer) {
            timers.delete(timer);
        },
        setTimeout: setTimeoutImpl,
        clearTimeout: clearTimeoutImpl
    };

    vm.runInNewContext(VIDEO_CLIENT_SOURCE, context, {
        filename: 'public/js/video/video-client.js'
    });

    return {
        api: window.HalastudyVideoClient,
        client: window.HalastudyVideoClient.createVideoClient(),
        requests,
        timers
    };
}

function createManualTimeoutScheduler() {
    let nextId = 1;
    const pending = new Map();
    return {
        set(callback, delay) {
            const id = nextId;
            nextId += 1;
            pending.set(id, { callback, delay });
            return id;
        },
        clear(id) {
            pending.delete(id);
        },
        delays() {
            return [...pending.values()].map(({ delay }) => delay);
        },
        async runNext() {
            const [id, timer] = pending.entries().next().value || [];
            assert.ok(timer, 'expected a pending timeout');
            pending.delete(id);
            await timer.callback();
        }
    };
}

function requestPath(request) {
    return new URL(request.url, 'https://halastudy.test').pathname;
}

function requestBody(request) {
    return JSON.parse(request.options.body);
}

function membershipHeader(request) {
    return request.options.headers['X-Halastudy-Membership'];
}

test('disconnected mesh ICE attempts one restart and waits ten seconds before teardown', async () => {
    const { api } = createHarness();
    const scheduler = createManualTimeoutScheduler();
    const peer = { connectionState: 'connected', iceConnectionState: 'disconnected' };
    let restarts = 0;
    let teardowns = 0;
    const controller = api.createMeshPeerRecoveryController({
        isCurrentPeer: () => true,
        restartPeer: () => { restarts += 1; },
        teardownPeer: () => { teardowns += 1; },
        setTimeout: scheduler.set,
        clearTimeout: scheduler.clear
    });

    controller.observe('peer-a', peer);
    controller.observe('peer-a', peer);

    assert.deepEqual(scheduler.delays(), [10_000]);
    assert.equal(restarts, 1);
    assert.equal(teardowns, 0);

    peer.connectionState = 'failed';
    peer.iceConnectionState = 'failed';
    controller.observe('peer-a', peer);

    assert.equal(restarts, 1);
    assert.equal(teardowns, 0);
    assert.deepEqual(scheduler.delays(), [10_000]);

    await scheduler.runNext();
    assert.equal(restarts, 1);
    assert.equal(teardowns, 1);
    assert.deepEqual(scheduler.delays(), []);
});

test('mesh ICE recovery is cancelled on reconnect and resets for a later disconnect', async () => {
    const { api } = createHarness();
    const scheduler = createManualTimeoutScheduler();
    const peer = { connectionState: 'disconnected', iceConnectionState: 'disconnected' };
    let restarts = 0;
    let teardowns = 0;
    const controller = api.createMeshPeerRecoveryController({
        isCurrentPeer: () => true,
        restartPeer: () => { restarts += 1; },
        teardownPeer: () => { teardowns += 1; },
        setTimeout: scheduler.set,
        clearTimeout: scheduler.clear
    });

    controller.observe('peer-a', peer);
    peer.connectionState = 'connected';
    peer.iceConnectionState = 'connected';
    controller.observe('peer-a', peer);

    assert.deepEqual(scheduler.delays(), []);
    assert.equal(restarts, 1);
    assert.equal(teardowns, 0);

    peer.connectionState = 'disconnected';
    peer.iceConnectionState = 'disconnected';
    controller.observe('peer-a', peer);

    assert.equal(restarts, 2);
    assert.equal(teardowns, 0);
    assert.deepEqual(scheduler.delays(), [10_000]);
});

test('rapid join, leave, and rejoin disposes the stale join and leaves the latest session active', async () => {
    const firstJoin = deferred();
    const firstJoinStarted = deferred();
    const mediaLeaves = { first: 0, second: 0 };

    const harness = createHarness({
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async ({ authToken }) => {
            if (authToken === 'token-ROOM1') {
                firstJoinStarted.resolve();
                return firstJoin.promise;
            }
            return {
                leave: async () => {
                    mediaLeaves.second += 1;
                }
            };
        }
    });

    const roomOneJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'ROOM1',
        displayName: 'First',
        membershipToken: 'membership-room-1',
        clientSessionId: 'caller-picked-id-must-be-ignored',
        meetingElement: {}
    });
    await firstJoinStarted.promise;

    const interveningLeave = harness.client.leave();
    const roomTwoJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'ROOM2',
        displayName: 'Second',
        membershipToken: 'membership-room-2',
        meetingElement: {}
    });

    await new Promise((resolve) => setImmediate(resolve));
    firstJoin.resolve({
        leave: async () => {
            mediaLeaves.first += 1;
        }
    });

    await assert.rejects(
        roomOneJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    await interveningLeave;
    const latest = await roomTwoJoin;

    assert.equal(latest.authToken, 'token-ROOM2');
    assert.equal(mediaLeaves.first, 1);
    assert.equal(mediaLeaves.second, 0);
    assert.equal(harness.timers.size, 1);
    await harness.client.heartbeat();

    await Promise.all([harness.client.leave(), harness.client.leave()]);

    assert.equal(mediaLeaves.second, 1);
    assert.equal(harness.timers.size, 0);
    assert.deepEqual(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-leave')).map(requestPath),
        ['/api/rooms/ROOM1/video-leave', '/api/rooms/ROOM2/video-leave']
    );

    const roomOneToken = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/ROOM1/video-token'
    );
    const roomOneLeave = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/ROOM1/video-leave'
    );
    const roomTwoToken = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/ROOM2/video-token'
    );
    const roomTwoHeartbeat = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/ROOM2/video-heartbeat'
    );
    const roomTwoLeave = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/ROOM2/video-leave'
    );

    assert.equal(membershipHeader(roomOneToken), 'membership-room-1');
    assert.deepEqual(requestBody(roomOneToken), { displayName: 'First', role: 'student' });
    assert.equal(membershipHeader(roomOneLeave), 'membership-room-1');
    assert.deepEqual(requestBody(roomOneLeave), { videoSessionId: 'video-session-ROOM1' });
    assert.equal(membershipHeader(roomTwoToken), 'membership-room-2');
    assert.deepEqual(requestBody(roomTwoToken), { displayName: 'Second', role: 'student' });
    assert.equal(membershipHeader(roomTwoHeartbeat), 'membership-room-2');
    assert.deepEqual(requestBody(roomTwoHeartbeat), { videoSessionId: 'video-session-ROOM2' });
    assert.equal(membershipHeader(roomTwoLeave), 'membership-room-2');
    assert.deepEqual(requestBody(roomTwoLeave), { videoSessionId: 'video-session-ROOM2' });
});

test('leave aborts a pending provider join so a later join is not trapped behind the operation queue', async () => {
    const firstJoinStarted = deferred();
    let firstJoinAborted = false;
    const harness = createHarness({
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async ({ authToken, signal }) => {
            if (authToken !== 'token-STUCK') {
                return { leave: async () => {} };
            }
            firstJoinStarted.resolve();
            return new Promise((_, reject) => {
                const missingCancellationGuard = setTimeout(() => {
                    reject(new Error('provider join did not receive a usable cancellation signal'));
                }, 25);
                signal?.addEventListener('abort', () => {
                    clearTimeout(missingCancellationGuard);
                    firstJoinAborted = true;
                    const error = /** @type {Error & { code?: string }} */ (new Error('join cancelled'));
                    error.code = 'VIDEO_JOIN_CANCELLED';
                    reject(error);
                }, { once: true });
            });
        }
    });

    const firstJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'STUCK',
        displayName: 'First',
        membershipToken: 'membership-stuck',
        meetingElement: {}
    });
    await firstJoinStarted.promise;

    const leave = harness.client.leave();
    const secondJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'NEXT',
        displayName: 'Second',
        membershipToken: 'membership-next',
        meetingElement: {}
    });

    await assert.rejects(
        firstJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    await leave;
    const next = await settleWithin(secondJoin, 500, 'later join remained queued');

    assert.equal(firstJoinAborted, true);
    assert.equal(next.authToken, 'token-NEXT');
    await harness.client.leave();
});

test('a newer join aborts a never-settling token request and reaches the provider', async () => {
    const staleTokenStarted = deferred();
    /** @type {AbortSignal | null} */
    let staleRequestSignal = null;
    const harness = createHarness({
        AbortControllerImpl: AbortController,
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname === '/api/rooms/STALE/video-token') {
                staleRequestSignal = request.options.signal || null;
                staleTokenStarted.resolve();
                return new Promise(() => {});
            }
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        }
    });
    const staleJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'STALE',
        displayName: 'First',
        membershipToken: 'membership-stale',
        meetingElement: {}
    });
    await staleTokenStarted.promise;

    const latestJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'LATEST',
        displayName: 'Second',
        membershipToken: 'membership-latest',
        meetingElement: {}
    });

    await assert.rejects(
        settleWithin(staleJoin, 500, 'superseded token request did not settle'),
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    const latest = await settleWithin(latestJoin, 500, 'latest join remained queued behind token fetch');

    assert.equal(staleRequestSignal?.aborted, true);
    assert.equal(latest.authToken, 'token-LATEST');
    await harness.client.leave();
});

test('a newer join aborts never-settling token response parsing', async () => {
    const staleBodyStarted = deferred();
    /** @type {AbortSignal | null} */
    let staleRequestSignal = null;
    const harness = createHarness({
        AbortControllerImpl: AbortController,
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname === '/api/rooms/STALEBODY/video-token') {
                staleRequestSignal = request.options.signal || null;
                return {
                    ok: true,
                    status: 200,
                    json() {
                        staleBodyStarted.resolve();
                        return new Promise(() => {});
                    }
                };
            }
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        }
    });
    const staleJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'STALEBODY',
        displayName: 'First',
        membershipToken: 'membership-stale-body',
        meetingElement: {}
    });
    await staleBodyStarted.promise;

    const latestJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'AFTERBODY',
        displayName: 'Second',
        membershipToken: 'membership-after-body',
        meetingElement: {}
    });

    await assert.rejects(
        settleWithin(staleJoin, 500, 'superseded response parser did not settle'),
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    const latest = await settleWithin(latestJoin, 500, 'latest join remained queued behind response parsing');

    assert.equal(staleRequestSignal?.aborted, true);
    assert.equal(latest.authToken, 'token-AFTERBODY');
    await harness.client.leave();
});

test('a token request deadline releases the queue for a later retry', async () => {
    const scheduler = createManualTimeoutScheduler();
    const staleTokenStarted = deferred();
    const harness = createHarness({
        AbortControllerImpl: AbortController,
        setTimeoutImpl: scheduler.set,
        clearTimeoutImpl: scheduler.clear,
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname === '/api/rooms/TIMEOUT/video-token') {
                staleTokenStarted.resolve();
                return new Promise(() => {});
            }
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        }
    });
    const timedOutJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'TIMEOUT',
        displayName: 'First',
        membershipToken: 'membership-timeout',
        meetingElement: {}
    });
    await staleTokenStarted.promise;

    assert.equal(scheduler.delays().length, 1);
    await scheduler.runNext();
    await assert.rejects(
        timedOutJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_REQUEST_TIMEOUT'
    );

    const retry = await harness.client.joinRealtimeKitRoom({
        roomId: 'RETRY',
        displayName: 'Second',
        membershipToken: 'membership-retry',
        meetingElement: {}
    });
    assert.equal(retry.authToken, 'token-RETRY');
    await harness.client.leave();
});

test('a hung keepalive leave is bounded without dropping keepalive or blocking the next join', async () => {
    const scheduler = createManualTimeoutScheduler();
    const providerJoinStarted = deferred();
    const leaveRequestStarted = deferred();
    /** @type {{ url: string, options: any } | null} */
    let staleLeaveRequest = null;
    const harness = createHarness({
        AbortControllerImpl: AbortController,
        setTimeoutImpl: scheduler.set,
        clearTimeoutImpl: scheduler.clear,
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            if (pathname === '/api/rooms/STUCKLEAVE/video-leave') {
                staleLeaveRequest = request;
                leaveRequestStarted.resolve();
                return new Promise(() => {});
            }
            return jsonResponse({ ok: true });
        },
        join: async ({ authToken, signal }) => {
            if (authToken !== 'token-STUCKLEAVE') return { leave: async () => {} };
            providerJoinStarted.resolve();
            return new Promise((_, reject) => {
                signal.addEventListener('abort', () => {
                    const error = /** @type {Error & { code?: string }} */ (new Error('join cancelled'));
                    error.code = 'VIDEO_JOIN_CANCELLED';
                    reject(error);
                }, { once: true });
            });
        }
    });
    const staleJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'STUCKLEAVE',
        displayName: 'First',
        membershipToken: 'membership-stuck-leave',
        meetingElement: {}
    });
    await providerJoinStarted.promise;

    const leave = harness.client.leave({ keepalive: true });
    const latestJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'AFTERLEAVE',
        displayName: 'Second',
        membershipToken: 'membership-after-leave',
        meetingElement: {}
    });
    await leaveRequestStarted.promise;

    assert.equal(staleLeaveRequest?.options.keepalive, true);
    assert.equal(scheduler.delays().length, 1);
    await scheduler.runNext();
    await assert.rejects(
        staleJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    await leave;
    const latest = await settleWithin(latestJoin, 500, 'latest join remained queued behind leave request');

    assert.equal(staleLeaveRequest?.options.signal.aborted, true);
    assert.equal(latest.authToken, 'token-AFTERLEAVE');
    await harness.client.leave();
});

test('a heartbeat request deadline aborts a hung request without tearing down the session', async () => {
    const scheduler = createManualTimeoutScheduler();
    const heartbeatStarted = deferred();
    /** @type {AbortSignal | null} */
    let heartbeatSignal = null;
    const harness = createHarness({
        AbortControllerImpl: AbortController,
        setTimeoutImpl: scheduler.set,
        clearTimeoutImpl: scheduler.clear,
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'heartbeat-token',
                    videoSessionId: 'heartbeat-session',
                    policy: {}
                });
            }
            if (pathname.endsWith('/video-heartbeat')) {
                heartbeatSignal = request.options.signal || null;
                heartbeatStarted.resolve();
                return new Promise(() => {});
            }
            return jsonResponse({ ok: true });
        }
    });
    await harness.client.joinRealtimeKitRoom({
        roomId: 'HEARTBEAT',
        displayName: 'Student',
        membershipToken: 'membership-heartbeat',
        meetingElement: {}
    });

    const heartbeat = harness.client.heartbeat();
    await heartbeatStarted.promise;
    assert.equal(scheduler.delays().length, 1);
    await scheduler.runNext();
    await settleWithin(heartbeat, 500, 'heartbeat request did not settle at its deadline');

    assert.equal(heartbeatSignal?.aborted, true);
    assert.equal(harness.timers.size, 1);
    await harness.client.leave();
});

test('pagehide leave keeps its keepalive option while an in-flight provider join is superseded', async () => {
    const providerJoin = deferred();
    const providerJoinStarted = deferred();
    let mediaLeaves = 0;
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'pagehide-token',
                    videoSessionId: 'video-session-pagehide',
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async () => {
            providerJoinStarted.resolve();
            return providerJoin.promise;
        }
    });

    const join = harness.client.joinRealtimeKitRoom({
        roomId: 'PAGEHIDE',
        displayName: 'Student',
        membershipToken: 'membership-pagehide',
        meetingElement: {}
    });
    await providerJoinStarted.promise;

    const pagehideLeave = harness.client.leave({ keepalive: true });
    const leaveRequestsBeforeProviderResolution = harness.requests.filter(
        (request) => requestPath(request) === '/api/rooms/PAGEHIDE/video-leave'
    );
    assert.equal(leaveRequestsBeforeProviderResolution.length, 1);
    assert.equal(leaveRequestsBeforeProviderResolution[0].options.keepalive, true);
    providerJoin.resolve({
        leave: async () => {
            mediaLeaves += 1;
        }
    });

    await assert.rejects(
        join,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    await pagehideLeave;

    const leaveRequests = harness.requests.filter(
        (request) => requestPath(request) === '/api/rooms/PAGEHIDE/video-leave'
    );
    assert.equal(leaveRequests.length, 1);
    assert.equal(leaveRequests[0].options.keepalive, true);
    assert.equal(membershipHeader(leaveRequests[0]), 'membership-pagehide');
    assert.deepEqual(requestBody(leaveRequests[0]), { videoSessionId: 'video-session-pagehide' });
    assert.equal(mediaLeaves, 1);
    assert.equal(harness.timers.size, 0);
});

test('pagehide keepalive reaches an older provider join after a newer join supersedes it', async () => {
    const staleProviderJoin = deferred();
    const staleProviderJoinStarted = deferred();
    let staleMediaLeaves = 0;
    const harness = createHarness({
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({
                    ok: true,
                    authToken: `token-${roomId}`,
                    videoSessionId: `video-session-${roomId}`,
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async ({ authToken }) => {
            assert.equal(authToken, 'token-STALE');
            staleProviderJoinStarted.resolve();
            return staleProviderJoin.promise;
        }
    });

    const staleJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'STALE',
        displayName: 'First',
        membershipToken: 'membership-stale',
        meetingElement: {}
    });
    await staleProviderJoinStarted.promise;

    const newerJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'NEWER',
        displayName: 'Second',
        membershipToken: 'membership-newer',
        meetingElement: {}
    });
    const pagehideLeave = harness.client.leave({ keepalive: true });
    const staleRejection = assert.rejects(
        staleJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );
    const newerRejection = assert.rejects(
        newerJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_SUPERSEDED'
    );

    staleProviderJoin.resolve({
        leave: async () => {
            staleMediaLeaves += 1;
        }
    });
    await Promise.all([staleRejection, newerRejection, pagehideLeave]);

    const staleLeave = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/STALE/video-leave'
    );
    assert.ok(staleLeave);
    assert.equal(staleLeave.options.keepalive, true);
    assert.equal(staleMediaLeaves, 1);
    assert.equal(
        harness.requests.some((request) => requestPath(request) === '/api/rooms/NEWER/video-token'),
        false
    );
    assert.equal(harness.timers.size, 0);
});

test('ordinary lifecycle teardown starts a keepalive advisory leave synchronously', async () => {
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'disconnect-token',
                    videoSessionId: 'video-session-disconnect',
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        }
    });

    await harness.client.joinRealtimeKitRoom({
        roomId: 'DISCONNECT',
        displayName: 'Student',
        membershipToken: 'membership-disconnect',
        meetingElement: {}
    });
    const disconnectLeave = harness.client.leave();
    const leaveRequest = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/DISCONNECT/video-leave'
    );

    assert.ok(leaveRequest);
    assert.equal(leaveRequest.options.keepalive, true);
    await disconnectLeave;
    assert.equal(harness.timers.size, 0);
});

test('a video join without a room membership token fails before making a request', async () => {
    const harness = createHarness();

    await assert.rejects(
        harness.client.joinRealtimeKitRoom({
            roomId: 'NOAUTH',
            displayName: 'Student',
            clientSessionId: 'caller-picked-id',
            meetingElement: {}
        }),
        (error) => (/** @type {any} */ (error)).code === 'ROOM_MEMBERSHIP_REQUIRED'
    );

    assert.equal(harness.requests.length, 0);
    assert.equal(harness.timers.size, 0);
});

test('a failed token request clears identity so heartbeat and repeated leave are no-ops', async () => {
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({ ok: false, errorCode: 'VIDEO_PROVIDER_UNAVAILABLE' }, 503);
            }
            return jsonResponse({ ok: true });
        }
    });

    await assert.rejects(
        harness.client.joinRealtimeKitRoom({
            roomId: 'FAILED',
            displayName: 'Student',
            membershipToken: 'membership-failed',
            meetingElement: {}
        }),
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_PROVIDER_UNAVAILABLE'
    );

    const requestCountAfterFailure = harness.requests.length;
    await harness.client.heartbeat();
    await Promise.all([harness.client.leave(), harness.client.leave()]);

    assert.equal(harness.timers.size, 0);
    assert.equal(harness.requests.length, requestCountAfterFailure);
    assert.equal(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-heartbeat')).length,
        0
    );
    assert.equal(membershipHeader(harness.requests[0]), 'membership-failed');
    assert.deepEqual(requestBody(harness.requests[0]), { displayName: 'Student', role: 'student' });
});

test('a token response without a server video session id fails closed and retains no membership state', async () => {
    let mediaJoinAttempts = 0;
    const harness = createHarness({
        fetchImpl() {
            return jsonResponse({ ok: true, authToken: 'token-without-session', policy: {} });
        },
        join: async () => {
            mediaJoinAttempts += 1;
            return { leave: async () => {} };
        }
    });

    await assert.rejects(
        harness.client.joinRealtimeKitRoom({
            roomId: 'INVALID',
            displayName: 'Student',
            membershipToken: 'membership-invalid',
            meetingElement: {}
        }),
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_SESSION_INVALID'
    );

    const requestCountAfterFailure = harness.requests.length;
    await harness.client.heartbeat();
    await harness.client.leave();

    assert.equal(mediaJoinAttempts, 0);
    assert.equal(harness.timers.size, 0);
    assert.equal(harness.requests.length, requestCountAfterFailure);
});

test('a failed media join releases the server session and clears all lifecycle state', async () => {
    let mediaJoinAttempts = 0;
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'broken-token',
                    videoSessionId: 'video-session-broken',
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async () => {
            mediaJoinAttempts += 1;
            throw new Error('RealtimeKit failed to initialize');
        }
    });

    await assert.rejects(
        harness.client.joinRealtimeKitRoom({
            roomId: 'BROKEN',
            displayName: 'Student',
            membershipToken: 'membership-broken',
            meetingElement: {}
        }),
        /RealtimeKit failed to initialize/
    );

    await harness.client.heartbeat();
    await harness.client.leave();

    assert.equal(mediaJoinAttempts, 1);
    assert.equal(harness.timers.size, 0);
    assert.deepEqual(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-leave')).map(requestPath),
        ['/api/rooms/BROKEN/video-leave']
    );
    const leaveRequest = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/BROKEN/video-leave'
    );
    assert.equal(membershipHeader(leaveRequest), 'membership-broken');
    assert.deepEqual(requestBody(leaveRequest), { videoSessionId: 'video-session-broken' });
    assert.equal(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-heartbeat')).length,
        0
    );
});

test('media leave failure still clears heartbeat and prevents duplicate teardown', async () => {
    let mediaLeaveAttempts = 0;
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'token',
                    videoSessionId: 'video-session-leave-fail',
                    policy: {}
                });
            }
            return jsonResponse({ ok: true });
        },
        join: async () => ({
            leave: () => {
                mediaLeaveAttempts += 1;
                throw new Error('media leave failed');
            }
        })
    });

    await harness.client.joinRealtimeKitRoom({
        roomId: 'LEAVEFAIL',
        displayName: 'Student',
        membershipToken: 'membership-leave-fail',
        meetingElement: {}
    });
    await Promise.all([harness.client.leave(), harness.client.leave()]);
    await harness.client.heartbeat();

    assert.equal(mediaLeaveAttempts, 1);
    assert.equal(harness.timers.size, 0);
    assert.equal(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-heartbeat')).length,
        0
    );
    const leaveRequest = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/LEAVEFAIL/video-leave'
    );
    assert.equal(membershipHeader(leaveRequest), 'membership-leave-fail');
    assert.deepEqual(requestBody(leaveRequest), { videoSessionId: 'video-session-leave-fail' });
});

test('a fatal heartbeat response tears down media and clears membership and session state', async () => {
    let mediaLeaves = 0;
    const harness = createHarness({
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                return jsonResponse({
                    ok: true,
                    authToken: 'fatal-heartbeat-token',
                    videoSessionId: 'video-session-fatal',
                    policy: {}
                });
            }
            if (pathname.endsWith('/video-heartbeat')) {
                return jsonResponse({ ok: false, errorCode: 'VIDEO_SESSION_FORBIDDEN' }, 403);
            }
            return jsonResponse({ ok: true });
        },
        join: async () => ({
            leave: async () => {
                mediaLeaves += 1;
            }
        })
    });

    await harness.client.joinRealtimeKitRoom({
        roomId: 'FATAL',
        displayName: 'Student',
        membershipToken: 'membership-fatal',
        meetingElement: {}
    });
    await harness.client.heartbeat();

    const requestCountAfterFatal = harness.requests.length;
    await harness.client.heartbeat();
    await harness.client.leave();

    assert.equal(mediaLeaves, 1);
    assert.equal(harness.timers.size, 0);
    assert.equal(harness.requests.length, requestCountAfterFatal);
    assert.equal(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-leave')).length,
        0
    );
    const heartbeatRequest = harness.requests.find(
        (request) => requestPath(request) === '/api/rooms/FATAL/video-heartbeat'
    );
    assert.equal(membershipHeader(heartbeatRequest), 'membership-fatal');
    assert.deepEqual(requestBody(heartbeatRequest), { videoSessionId: 'video-session-fatal' });
});
