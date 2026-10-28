const assert = require('node:assert/strict');
const test = require('node:test');

const { signupUser } = require('../helpers/auth-helpers');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { delay, startServer } = require('../helpers/server-control');
const { makeTempStateFile, resetStateFile } = require('../helpers/test-env');
const { DEFAULT_ICE_SERVERS } = require('../../co-study-server');

const MESH_ENV = {
    VIDEO_PROVIDER: 'mesh',
    ENABLE_DEV_MESH: 'true'
};

function collectSignals(socket) {
    const received = [];
    for (const eventName of ['camera-status', 'rtc-offer', 'rtc-answer', 'rtc-ice']) {
        socket.on(eventName, (payload) => received.push([eventName, payload]));
    }
    return received;
}

async function createAndJoinMeshRoom(owner, peer) {
    const created = await emitAck(owner, 'create-room', {
        roomName: 'Authenticated development mesh',
        mediaMode: 'mesh'
    });
    assert.equal(created.ok, true);
    const roomId = created.room.roomId;
    assert.equal((await emitAck(owner, 'join-room', { roomId, username: 'Owner' })).ok, true);
    assert.equal((await emitAck(peer, 'join-room', { roomId, username: 'Peer' })).ok, true);
    return roomId;
}

test('flagless development refuses to start the mesh provider', async () => {
    await assert.rejects(
        async () => {
            const unexpectedServer = await startServer({ env: { VIDEO_PROVIDER: 'mesh' } });
            await unexpectedServer.stop();
        },
        /ENABLE_DEV_MESH=true/
    );
});

test('explicit development mesh refuses anonymous camera and RTC signaling', async (t) => {
    const server = await startServer({ env: MESH_ENV });
    const owner = await connectSocket(server.baseUrl);
    const peer = await connectSocket(server.baseUrl);
    t.after(async () => {
        await closeSocket(owner);
        await closeSocket(peer);
        await server.stop();
    });

    await createAndJoinMeshRoom(owner, peer);
    const runtime = await server.request('/api/runtime-config');
    assert.equal(runtime.body.devMeshEnabled, true);
    assert.deepEqual(runtime.body.iceServers, DEFAULT_ICE_SERVERS);
    const received = collectSignals(peer);

    assert.deepEqual(
        await emitAck(owner, 'camera-status', { camera: true }, 1000),
        { ok: false, errorCode: 'AUTH_REQUIRED' }
    );
    assert.deepEqual(
        await emitAck(owner, 'rtc-offer', {
            targetId: peer.id,
            sdp: { type: 'offer', sdp: 'v=0\r\n' }
        }, 1000),
        { ok: false, errorCode: 'AUTH_REQUIRED' }
    );
    await delay(100);
    assert.deepEqual(received, []);
});

test('explicit development mesh relays camera and RTC only between authenticated sockets', async (t) => {
    const server = await startServer({ env: MESH_ENV });
    const ownerAccount = await signupUser(server, { displayName: 'Mesh Owner' });
    const peerAccount = await signupUser(server, { displayName: 'Mesh Peer' });
    const owner = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: ownerAccount.cookie } });
    const peer = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: peerAccount.cookie } });
    const anonymousTarget = await connectSocket(server.baseUrl);
    t.after(async () => {
        await closeSocket(owner);
        await closeSocket(peer);
        await closeSocket(anonymousTarget);
        await server.stop();
    });

    const roomId = await createAndJoinMeshRoom(owner, peer);
    assert.equal((await emitAck(anonymousTarget, 'join-room', {
        roomId,
        username: 'Anonymous target'
    })).ok, true);
    const peerSignals = collectSignals(peer);
    const ownerSignals = collectSignals(owner);
    const anonymousSignals = collectSignals(anonymousTarget);

    assert.deepEqual(await emitAck(owner, 'camera-status', { camera: true }), { ok: true });
    assert.deepEqual(await emitAck(owner, 'rtc-offer', {
        targetId: peer.id,
        sdp: { type: 'offer', sdp: 'v=0\r\n' }
    }), { ok: true });
    assert.deepEqual(await emitAck(peer, 'rtc-answer', {
        targetId: owner.id,
        sdp: { type: 'answer', sdp: 'v=0\r\n' }
    }), { ok: true });
    assert.deepEqual(await emitAck(owner, 'rtc-ice', {
        targetId: peer.id,
        candidate: {
            candidate: 'candidate:1 1 UDP 1 127.0.0.1 12345 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0,
            usernameFragment: 'fragment'
        }
    }), { ok: true });
    assert.deepEqual(await emitAck(owner, 'rtc-offer', {
        targetId: anonymousTarget.id,
        sdp: { type: 'offer', sdp: 'v=0\r\n' }
    }), { ok: false, errorCode: 'RTC_TARGET_INVALID' });

    await delay(100);
    assert.deepEqual(peerSignals.map(([eventName]) => eventName), [
        'camera-status',
        'rtc-offer',
        'rtc-ice'
    ]);
    assert.deepEqual(ownerSignals.map(([eventName]) => eventName), [
        'camera-status',
        'rtc-answer'
    ]);
    assert.equal(peerSignals[1][1].from, owner.id);
    assert.equal(ownerSignals[1][1].from, peer.id);
    assert.deepEqual(anonymousSignals, []);
});

test('the RealtimeKit production path ignores signaling for persisted legacy mesh rooms', async (t) => {
    const roomStateFile = makeTempStateFile('legacy-mesh-room');
    const userStateFile = makeTempStateFile('legacy-mesh-users');
    let server = await startServer({ env: MESH_ENV, roomStateFile, userStateFile });
    let owner;
    let peer;
    t.after(async () => {
        await closeSocket(owner);
        await closeSocket(peer);
        await server.stop();
        resetStateFile(roomStateFile);
        resetStateFile(userStateFile);
    });

    const ownerAccount = await signupUser(server, { displayName: 'Legacy Owner' });
    const peerAccount = await signupUser(server, { displayName: 'Legacy Peer' });
    owner = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: ownerAccount.cookie } });
    peer = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: peerAccount.cookie } });
    const roomId = await createAndJoinMeshRoom(owner, peer);
    await delay(350);
    await server.stop();
    await closeSocket(owner);
    await closeSocket(peer);
    owner = null;
    peer = null;

    server = await startServer({
        roomStateFile,
        userStateFile,
        resetStateFileOnStart: false
    });
    owner = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: ownerAccount.cookie } });
    peer = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: peerAccount.cookie } });
    const ownerJoin = await emitAck(owner, 'join-room', { roomId, username: 'Owner' });
    assert.equal(ownerJoin.ok, true, JSON.stringify(ownerJoin));
    assert.equal(ownerJoin.room.mediaMode, 'mesh');
    assert.equal(ownerJoin.room.videoProvider, 'mesh');
    assert.equal((await emitAck(peer, 'join-room', { roomId, username: 'Peer' })).ok, true);

    const received = collectSignals(peer);
    assert.deepEqual(
        await emitAck(owner, 'camera-status', { camera: true }, 1000),
        { ok: false, errorCode: 'MESH_SIGNALING_DISABLED' }
    );
    assert.deepEqual(
        await emitAck(owner, 'rtc-offer', {
            targetId: peer.id,
            sdp: { type: 'offer', sdp: 'v=0\r\n' }
        }, 1000),
        { ok: false, errorCode: 'MESH_SIGNALING_DISABLED' }
    );
    await delay(100);
    assert.deepEqual(received, []);

    const runtime = await server.request('/api/runtime-config');
    assert.equal(runtime.status, 200);
    assert.equal(runtime.body.devMeshEnabled, false);
});
