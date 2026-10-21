const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function sdkClient(meeting) {
    const window = { RealtimeKitClient: { init: async () => meeting } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/video/realtimekit-client.js'), 'utf8'), {
        window, setTimeout, clearTimeout, customElements: { get: () => true },
        document: { querySelector: () => ({ dataset: { loaded: 'true' }, addEventListener() {} }) }
    });
    return (/** @type {any} */ (window)).HalastudyRealtimeKitClient;
}

test('both video join variants release a partially joined meeting on failure', async () => {
    for (const method of ['join', 'joinHeadless']) {
        let leaves = 0;
        const client = sdkClient({ join: async () => { throw new Error('join failed'); },
            leaveRoom: async () => { leaves += 1; } });
        const element = { meeting: null };
        await assert.rejects(client[method]({ authToken: 'synthetic', meetingElement: element }), /join failed/);
        assert.equal(leaves, 1, `${method} must release the partially joined meeting`);
        assert.equal(element.meeting, null);
    }
});

test('successful headless join retains the meeting until explicit leave', async () => {
    let leaves = 0;
    let muted = 0;
    const meeting = { join: async () => {}, leaveRoom: async () => { leaves += 1; },
        self: { disableAudio: async () => { muted += 1; } } };
    const joined = await sdkClient(meeting).joinHeadless({ authToken: 'synthetic' });
    assert.equal(joined.meeting, meeting);
    assert.equal(leaves, 0);
    assert.equal(muted, 1);
    await joined.leave();
    assert.equal(leaves, 1);
});

test('a stalled video-token request aborts instead of trapping the join flow', async () => {
    const window = {};
    let aborted = false;
    const deadlines = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/js/video/video-client.js'), 'utf8'), {
        window, AbortController, clearTimeout, setInterval, clearInterval,
        setTimeout(callback, milliseconds) { deadlines.push(milliseconds); return setTimeout(callback, 10); },
        fetch: (_url, options) => new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => {
                aborted = true;
                reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            });
        })
    });
    const client = (/** @type {any} */ (window)).HalastudyVideoClient.createVideoClient();
    let guard;
    const result = await Promise.race([
        client.joinRealtimeKitRoom({ roomId: 'test', clientSessionId: 'test' }).then(() => 'unexpected success', () => 'rejected'),
        new Promise((resolve) => { guard = setTimeout(() => resolve('hung'), 200); })
    ]);
    clearTimeout(guard);
    assert.equal(result, 'rejected');
    assert.equal(aborted, true);
    assert.ok(deadlines.some((ms) => ms > 0 && ms <= 30000));
});
