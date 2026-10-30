const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(join) {
    const calls = [];
    const timers = new Map();
    let serial = 0;
    let heartbeatStatus = 200;
    const window = { HalastudyRealtimeKitClient: { joinHeadless: join || (async () => ({ meeting: {}, leave: async () => calls.push('sdk-leave') })) } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/video/video-client.js'), 'utf8'), {
        window, AbortController, setTimeout, clearTimeout,
        setInterval(callback, milliseconds) { const id = ++serial; timers.set(id, { callback, milliseconds }); return id; },
        clearInterval(id) { timers.delete(id); },
        fetch: async (url, options) => {
            calls.push(url.split('/').at(-1));
            const status = url.endsWith('video-heartbeat') ? heartbeatStatus : 200;
            return { ok: status === 200, status, json: async () => ({ ok: status === 200, authToken: 'synthetic', role: JSON.parse(options.body).role, errorCode: status === 403 ? 'ROOM_NOT_JOINED' : undefined }) };
        }
    });
    const client = (/** @type {any} */ (window)).HalastudyVideoClient.createVideoClient();
    return { client, calls, timers, rejectHeartbeat() { heartbeatStatus = 403; } };
}
const options = { roomId: 'LOBBY', clientSessionId: 'synthetic', displayName: 'Synthetic', role: 'viewer' };

test('headless lobby renews beyond the stale horizon and leaves on teardown', async () => {
    const h = harness();
    await h.client.joinHeadlessRoom(options);
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].milliseconds, 45000);
    for (let i = 0; i < 4; i++) await h.client.heartbeat();
    assert.equal(h.calls.filter(x => x === 'video-heartbeat').length, 4);
    await h.client.leave({ keepalive: true });
    assert.equal(h.timers.size, 0);
    assert.ok(h.calls.includes('video-leave'));
    assert.ok(h.calls.includes('sdk-leave'));
});

test('late headless join cannot resurrect after departure', async () => {
    /** @type {any} */
    let finish;
    const h = harness(() => new Promise(resolve => { finish = resolve; }));
    const joining = h.client.joinHeadlessRoom(options);
    const rejected = assert.rejects(joining, /canceled/i);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    const leaving = h.client.leave();
    assert.ok(h.calls.includes('video-leave'), 'departure must notify before the SDK join completes');
    finish({ meeting: {}, leave: async () => h.calls.push('sdk-leave') });
    await rejected;
    await leaving;
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.filter(x => x === 'sdk-leave').length, 1);
});

test('role replacement releases the old session before minting the next token', async () => {
    const h = harness();
    await h.client.joinHeadlessRoom(options);
    await h.client.joinHeadlessRoom({ ...options, role: 'publisher' });
    assert.deepEqual(h.calls.slice(0, 4), ['video-token', 'video-leave', 'sdk-leave', 'video-token']);
    assert.equal(h.timers.size, 1);
    await h.client.leave();
});

test('membership rejection ends media and stops renewal', async () => {
    const h = harness();
    await h.client.joinHeadlessRoom(options);
    h.rejectHeartbeat();
    await h.client.heartbeat();
    assert.equal(h.timers.size, 0);
    assert.ok(h.calls.includes('sdk-leave'));
});
