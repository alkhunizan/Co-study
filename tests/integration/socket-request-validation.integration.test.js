const assert = require('node:assert/strict');
const test = require('node:test');

const { signupUser } = require('../helpers/auth-helpers');
const { delay, startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

const malformedRequests = [
    ['create-room', { roomName: ['Room'] }],
    ['join-room', { roomId: ['ABC123'], username: 'Student' }],
    ['send-message', { text: { nested: true } }],
    ['board-set-goal', { goal: ['Goal'] }],
    ['board-add-task', { text: 'Task', priority: 'urgent' }],
    ['board-toggle-task', { taskId: 'task-id', done: 'yes' }],
    ['board-delete-task', { taskId: ['task-id'] }],
    ['board-reorder-tasks', { taskIds: ['same', 'same'] }],
    ['camera-status', { camera: 'true' }],
    ['rtc-offer', { targetId: 'peer', sdp: { type: 'offer', sdp: 7 } }],
    ['rtc-answer', { targetId: 'peer', sdp: { type: 'offer', sdp: 'v=0' } }],
    ['rtc-ice', { targetId: 'peer', candidate: 'candidate' }],
    ['user-status', { status: ['private status'] }],
    ['report-user', { targetId: 'peer', reason: 'invented' }]
];

function onceWithTimeout(socket, eventName, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            socket.off(eventName, handleEvent);
            reject(new Error(`Timed out waiting for ${eventName}.`));
        }, timeoutMs);
        const handleEvent = (payload) => {
            clearTimeout(timeoutId);
            resolve(payload);
        };
        socket.once(eventName, handleEvent);
    });
}

function emitWithoutAckForError(socket, eventName, payload, timeoutMs = 1000) {
    const errorPromise = onceWithTimeout(socket, 'request-error', timeoutMs);
    socket.emit(eventName, payload);
    return errorPromise;
}

test('every malformed event returns REQUEST_INVALID with and without an acknowledgement', async (t) => {
    const server = await startServer();
    const socket = await connectSocket(server.baseUrl);
    t.after(async () => {
        await closeSocket(socket);
        await server.stop();
    });

    for (const [eventName, payload] of malformedRequests) {
        assert.deepEqual(
            await emitAck(socket, eventName, payload, 1000),
            { ok: false, errorCode: 'REQUEST_INVALID' },
            `${eventName} with ack`
        );
    }

    for (const [eventName, payload] of malformedRequests) {
        assert.deepEqual(
            await emitWithoutAckForError(socket, eventName, payload),
            { ok: false, errorCode: 'REQUEST_INVALID' },
            `${eventName} without ack`
        );
    }

    const health = await server.request('/api/health');
    assert.equal(health.status, 200);
});

test('malformed SDP and ICE requests never reach the selected peer', async (t) => {
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const sender = await connectSocket(server.baseUrl);
    const peer = await connectSocket(server.baseUrl);
    t.after(async () => {
        await closeSocket(sender);
        await closeSocket(peer);
        await server.stop();
    });

    const created = await emitAck(sender, 'create-room', { roomName: 'RTC validation', mediaMode: 'mesh' });
    const roomId = created.room.roomId;
    assert.equal((await emitAck(sender, 'join-room', { roomId, username: 'Sender' })).ok, true);
    assert.equal((await emitAck(peer, 'join-room', { roomId, username: 'Peer' })).ok, true);

    const received = [];
    for (const eventName of ['rtc-offer', 'rtc-answer', 'rtc-ice']) {
        peer.on(eventName, (payload) => received.push([eventName, payload]));
    }

    const invalidRtcRequests = [
        ['rtc-offer', { targetId: peer.id, sdp: { type: 'offer', sdp: 7 } }],
        ['rtc-answer', { targetId: peer.id, sdp: { type: 'offer', sdp: 'v=0' } }],
        ['rtc-ice', { targetId: peer.id, candidate: 'candidate' }]
    ];
    for (const [eventName, payload] of invalidRtcRequests) {
        assert.deepEqual(
            await emitAck(sender, eventName, payload, 1000),
            { ok: false, errorCode: 'REQUEST_INVALID' },
            String(eventName)
        );
    }
    await delay(100);
    assert.deepEqual(received, []);
});

test('bounded current client payloads still flow through every event handler', async (t) => {
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
    const ownerAccount = await signupUser(server, { displayName: 'RTC Owner' });
    const peerAccount = await signupUser(server, { displayName: 'RTC Peer' });
    const owner = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: ownerAccount.cookie } });
    const peer = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: peerAccount.cookie } });
    t.after(async () => {
        await closeSocket(owner);
        await closeSocket(peer);
        await server.stop();
    });

    const password = 'p'.repeat(64);
    const created = await emitAck(owner, 'create-room', {
        roomName: 'R'.repeat(48),
        password,
        requirePassword: true,
        mediaMode: 'mesh',
        schedule: null
    });
    assert.equal(created.ok, true);
    const roomId = created.room.roomId;

    assert.equal((await emitAck(owner, 'join-room', {
        roomId,
        username: 'O'.repeat(20),
        clientId: 'c'.repeat(64),
        password
    })).ok, true);
    assert.equal((await emitAck(peer, 'join-room', {
        roomId,
        username: 'Peer',
        clientId: 'legacy-peer-client',
        password
    })).ok, true);

    assert.equal((await emitAck(owner, 'send-message', {
        roomId,
        text: 'm'.repeat(500)
    })).ok, true);
    assert.equal((await emitAck(owner, 'board-set-goal', { goal: 'g'.repeat(80) })).ok, true);
    const added = await emitAck(owner, 'board-add-task', { text: 't'.repeat(500), priority: 3 });
    assert.equal(added.ok, true);
    const taskId = added.board.tasks[0].id;
    assert.equal((await emitAck(owner, 'board-toggle-task', { taskId, done: true })).ok, true);
    assert.equal((await emitAck(owner, 'board-reorder-tasks', { taskIds: [taskId] })).ok, true);
    assert.equal((await emitAck(owner, 'board-delete-task', { taskId })).ok, true);

    const cameraStatus = onceWithTimeout(peer, 'camera-status');
    owner.emit('camera-status', { camera: true });
    assert.equal((await cameraStatus).camera, true);

    const offerReceived = onceWithTimeout(peer, 'rtc-offer');
    owner.emit('rtc-offer', {
        targetId: peer.id,
        sdp: { type: 'offer', sdp: 'v=0\r\n' }
    });
    assert.deepEqual((await offerReceived).sdp, { type: 'offer', sdp: 'v=0\r\n' });

    const answerReceived = onceWithTimeout(owner, 'rtc-answer');
    peer.emit('rtc-answer', {
        targetId: owner.id,
        sdp: { type: 'answer', sdp: 'v=0\r\n' }
    });
    assert.deepEqual((await answerReceived).sdp, { type: 'answer', sdp: 'v=0\r\n' });

    const iceReceived = onceWithTimeout(peer, 'rtc-ice');
    owner.emit('rtc-ice', {
        targetId: peer.id,
        candidate: {
            candidate: 'candidate:1 1 UDP 1 127.0.0.1 12345 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0,
            usernameFragment: 'fragment'
        }
    });
    assert.equal((await iceReceived).candidate.sdpMLineIndex, 0);

    assert.equal((await emitAck(owner, 'user-status', {
        status: {
            text: 's'.repeat(80),
            visible: true,
            goal: 'g'.repeat(80),
            manual: 'm'.repeat(40),
            manualPreset: 'studying',
            autoSync: true,
            ambientType: 'ocean',
            timerMode: 'focus',
            updatedAt: Date.now()
        }
    })).ok, true);

    assert.equal((await emitAck(owner, 'report-user', {
        targetId: peer.id,
        reason: 'spam',
        detail: 'd'.repeat(200)
    })).ok, true);
});
