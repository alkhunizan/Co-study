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
 *   joinHeadless?: (options: any) => Promise<any>
 * }} [options]
 */
function createHarness(options = {}) {
    const { fetchImpl, join, joinHeadless } = options;
    const requests = [];
    const timers = new Set();
    let nextTimerId = 1;

    const window = {
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
        }
    };

    vm.runInNewContext(VIDEO_CLIENT_SOURCE, context, {
        filename: 'public/js/video/video-client.js'
    });

    return {
        client: window.HalastudyVideoClient.createVideoClient(),
        requests,
        timers
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
