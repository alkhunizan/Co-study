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
            return jsonResponse({ ok: true, authToken: `token-${requests.length}` });
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

test('rapid join, leave, and rejoin disposes the stale join and leaves the latest session active', async () => {
    const firstJoin = deferred();
    const firstJoinStarted = deferred();
    const mediaLeaves = { first: 0, second: 0 };

    const harness = createHarness({
        fetchImpl(request) {
            const pathname = requestPath(request);
            if (pathname.endsWith('/video-token')) {
                const roomId = pathname.split('/')[3];
                return jsonResponse({ ok: true, authToken: `token-${roomId}`, policy: {} });
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
        clientSessionId: 'client-1',
        meetingElement: {}
    });
    await firstJoinStarted.promise;

    const interveningLeave = harness.client.leave();
    const roomTwoJoin = harness.client.joinRealtimeKitRoom({
        roomId: 'ROOM2',
        displayName: 'Second',
        clientSessionId: 'client-1',
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

    await Promise.all([harness.client.leave(), harness.client.leave()]);

    assert.equal(mediaLeaves.second, 1);
    assert.equal(harness.timers.size, 0);
    assert.deepEqual(
        harness.requests.filter((request) => requestPath(request).endsWith('/video-leave')).map(requestPath),
        ['/api/rooms/ROOM1/video-leave', '/api/rooms/ROOM2/video-leave']
    );
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
            clientSessionId: 'client-failed',
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
});

test('a failed media join releases the server session and clears all lifecycle state', async () => {
    let mediaJoinAttempts = 0;
    const harness = createHarness({
        fetchImpl(request) {
            if (requestPath(request).endsWith('/video-token')) {
                return jsonResponse({ ok: true, authToken: 'broken-token', policy: {} });
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
            clientSessionId: 'client-broken',
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
                return jsonResponse({ ok: true, authToken: 'token', policy: {} });
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
        clientSessionId: 'client-leave',
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
});
