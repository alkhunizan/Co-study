const assert = require('node:assert/strict');
const test = require('node:test');
const { onClientEvent } = require('../../services/socket-boundary');
const { startServer } = require('../helpers/server-control');
const { connectSocket, closeSocket, emitAck } = require('../helpers/socket-client');

test('socket boundary catches sync throws and rejected async handlers, acknowledging once', async () => {
    for (const handler of [
        () => { throw new Error('private storage details'); },
        async () => { throw new Error('private storage details'); },
        async (_payload, ack) => { ack({ ok: true }); throw new Error('after acknowledgement'); }
    ]) {
        /** @type {Function} */
        let listener;
        const logs = [];
        onClientEvent({ on: (_event, fn) => { listener = fn; } }, 'test', handler, { error: (entry) => logs.push(entry) });
        const responses = [];
        listener({}, (response) => responses.push(response));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(responses.length, 1);
        assert.equal(logs.length, 1);
        assert.doesNotMatch(JSON.stringify({ logs, responses }), /private storage details/);
        if (!responses[0].ok) assert.equal(responses[0].errorCode, 'SERVICE_UNAVAILABLE');
        // Missing acknowledgement must also be safe.
        listener({});
        await new Promise((resolve) => setImmediate(resolve));
    }
});

test('malformed guest socket events cannot crash the server or mutate a room', async (t) => {
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh', BACKUP_INTERVAL_MINUTES: '0' } });
    t.after(() => server.stop());
    const socket = await connectSocket(server.baseUrl);
    t.after(() => closeSocket(socket));
    const events = [
        'create-room', 'join-room', 'send-message', 'board-set-goal', 'board-add-task',
        'board-toggle-task', 'board-delete-task', 'board-reorder-tasks', 'camera-status',
        'rtc-offer', 'rtc-answer', 'rtc-ice', 'user-status', 'report-user'
    ];
    for (const event of events) {
        for (const payload of [null, [], 'bad', 42, true]) {
            const response = await emitAck(socket, event, payload);
            assert.equal(response.errorCode, 'PAYLOAD_INVALID', `${event}: ${JSON.stringify(payload)}`);
        }
        const response = await new Promise((resolve) => socket.emit(event, {}, 'not-a-callback', resolve));
        assert.equal(response.errorCode, 'PAYLOAD_INVALID', event);
        socket.emit(event, null); // fire-and-forget malformed events are also contained
    }
    const missing = await new Promise((resolve) => socket.emit('create-room', resolve));
    assert.equal(missing.errorCode, 'ROOM_NAME_REQUIRED');
    const created = await emitAck(socket, 'create-room', { roomName: 'Boundary control', mediaMode: 'mesh' });
    assert.equal(created.ok, true);
    const joined = await emitAck(socket, 'join-room', { roomId: created.room.code, username: 'Guest' });
    assert.equal(joined.ok, true);
    assert.equal((await emitAck(socket, 'send-message', { text: 'Still working' })).ok, true);
    assert.equal((await emitAck(socket, 'board-add-task', { text: 'Safe task' })).ok, true);
    assert.equal((await server.request('/api/health')).status, 200);
    assert.equal(socket.connected, true);
    assert.doesNotMatch(server.logs().stderr, /TypeError|UnhandledPromiseRejection/);
});
