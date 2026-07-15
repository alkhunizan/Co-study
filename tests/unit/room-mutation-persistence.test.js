const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const { createCoStudyServer } = require('../../co-study-server');
const { extractCookies } = require('../helpers/auth-helpers');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

function getFreePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const port = /** @type {import('net').AddressInfo} */ (probe.address()).port;
            probe.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

function testEnvironment(port) {
    return {
        NODE_ENV: 'test',
        PORT: String(port),
        HOST: '127.0.0.1',
        SESSION_SECRET: 'room-mutation-session-secret-0123456789abcdef',
        ADMIN_SESSION_SECRET: 'room-mutation-admin-secret-0123456789abcdef',
        ROOM_STATE_FILE: `room-mutation-${port}.rooms.json`,
        USER_STATE_FILE: `room-mutation-${port}.users.json`,
        VIDEO_PROVIDER: 'mesh'
    };
}

function snapshotRooms(rooms) {
    return Array.from(rooms.values()).map((room) => ({
        id: room.id,
        name: room.name,
        ownerUserId: room.ownerUserId || null,
        schedule: structuredClone(room.schedule),
        createdAt: room.createdAt
    }));
}

function createMemoryRoomStore() {
    const writes = [];
    let failNextRequested = false;
    return {
        filePath: 'memory-rooms.json',
        writes,
        failNext() { failNextRequested = true; },
        loadRooms() { return []; },
        scheduleSave() { return Promise.resolve(); },
        async flush(rooms) {
            if (failNextRequested) {
                failNextRequested = false;
                throw new Error('injected room write failure');
            }
            writes.push(snapshotRooms(rooms));
        }
    };
}

function createMemoryUserStore() {
    const persisted = new Map();
    let failNextRequested = false;
    return {
        filePath: 'memory-users.json',
        persisted,
        failNext() { failNextRequested = true; },
        hydrate() { return Promise.resolve([]); },
        scheduleSave() { return Promise.resolve(); },
        async saveUser(user) {
            if (failNextRequested) {
                failNextRequested = false;
                throw new Error('injected user write failure');
            }
            persisted.set(user.id, structuredClone(user));
        },
        async flush(users) {
            persisted.clear();
            for (const [userId, user] of users.entries()) {
                persisted.set(userId, structuredClone(user));
            }
        }
    };
}

async function startMutationTestServer() {
    const port = await getFreePort();
    const roomStore = createMemoryRoomStore();
    const userStore = createMemoryUserStore();
    const appServer = createCoStudyServer({
        env: testEnvironment(port),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore,
        userStore,
        registerSignalHandlers: false,
        startupBackoffMs: []
    });
    await appServer.initialize();
    await new Promise((resolve) => appServer.listen(resolve));
    return {
        appServer,
        baseUrl: `http://127.0.0.1:${port}`,
        roomStore,
        userStore
    };
}

async function stopMutationTestServer(server, sockets = []) {
    await Promise.all(sockets.map((socket) => closeSocket(socket)));
    await new Promise((resolve) => server.appServer.io.close(resolve));
}

async function signup(baseUrl, displayName) {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: `${displayName.toLowerCase()}-${Date.now()}@example.com`,
            password: 'correct-horse-battery-staple',
            displayName
        })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : response.headers.get('set-cookie');
    return { user: body.user, cookie: extractCookies(setCookies) };
}

function buildOpenSchedule() {
    const future = new Date(Date.now() + (3 * 60 * 60 * 1000) + (5 * 60 * 1000));
    return {
        startDate: `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}-${String(future.getUTCDate()).padStart(2, '0')}`,
        startTime: `${String(future.getUTCHours()).padStart(2, '0')}:${String(future.getUTCMinutes()).padStart(2, '0')}`,
        cadence: 'once',
        focusMinutes: 25,
        breakMinutes: 5
    };
}

test('create-room fails closed without live room or user metadata when the immediate room write fails', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'Creator');
    const socket = await connectSocket(server.baseUrl, {
        clientId: 'atomic-create',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [socket]));

    const roomIdsBefore = Array.from(server.appServer.rooms.keys());
    const runtimeUserBefore = structuredClone(server.appServer.users.get(account.user.id));
    const persistedUserBefore = structuredClone(server.userStore.persisted.get(account.user.id));
    const writesBefore = server.roomStore.writes.length;
    server.roomStore.failNext();

    const created = await emitAck(socket, 'create-room', { roomName: 'Must Be Durable' });

    assert.equal(created.ok, false);
    assert.equal(created.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.deepEqual(Array.from(server.appServer.rooms.keys()), roomIdsBefore);
    assert.deepEqual(server.appServer.users.get(account.user.id), runtimeUserBefore);
    assert.deepEqual(server.userStore.persisted.get(account.user.id), persistedUserBefore);
    assert.equal(server.roomStore.writes.length, writesBefore);
});

test('failed authenticated switch preserves source membership, target schedule, token, and user rooms exactly', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'Mover');
    const mover = await connectSocket(server.baseUrl, {
        clientId: 'atomic-mover',
        extraHeaders: { Cookie: account.cookie }
    });
    const guest = await connectSocket(server.baseUrl, { clientId: 'atomic-guest' });
    t.after(() => stopMutationTestServer(server, [mover, guest]));

    const sourceCreated = await emitAck(guest, 'create-room', { roomName: 'Atomic Source' });
    const targetCreated = await emitAck(mover, 'create-room', {
        roomName: 'Atomic Scheduled Target',
        schedule: buildOpenSchedule()
    });
    assert.equal(sourceCreated.ok, true);
    assert.equal(targetCreated.ok, true);
    const sourceRoomId = sourceCreated.room.roomId;
    const targetRoomId = targetCreated.room.roomId;
    const sourceJoin = await emitAck(mover, 'join-room', {
        roomId: sourceRoomId,
        username: 'Mover',
        clientId: 'atomic-mover'
    });
    assert.equal(sourceJoin.ok, true);

    const sourceRoom = server.appServer.rooms.get(sourceRoomId);
    const targetRoom = server.appServer.rooms.get(targetRoomId);
    const serverSocket = server.appServer.io.sockets.sockets.get(mover.id);
    const sourceUserBefore = structuredClone(sourceRoom.users.get(mover.id));
    const sourceIdentitiesBefore = Array.from(sourceRoom.identities.entries());
    const sourceExpiresAtBefore = sourceRoom.expiresAt;
    const sourceCleanupTimerBefore = sourceRoom.cleanupTimer;
    const targetScheduleBefore = structuredClone(targetRoom.schedule);
    const targetUsersBefore = Array.from(targetRoom.users.entries());
    const targetIdentitiesBefore = Array.from(targetRoom.identities.entries());
    const targetCleanupTimerBefore = targetRoom.cleanupTimer;
    const socketRoomsBefore = Array.from(serverSocket.rooms).sort();
    const runtimeMyRoomsBefore = structuredClone(server.appServer.users.get(account.user.id).myRooms);
    const persistedMyRoomsBefore = structuredClone(server.userStore.persisted.get(account.user.id).myRooms);
    server.userStore.failNext();

    const switched = await emitAck(mover, 'join-room', {
        roomId: targetRoomId,
        username: 'Mover',
        clientId: 'atomic-mover'
    });

    assert.equal(switched.ok, false);
    assert.equal(switched.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.deepEqual(sourceRoom.users.get(mover.id), sourceUserBefore);
    assert.deepEqual(Array.from(sourceRoom.identities.entries()), sourceIdentitiesBefore);
    assert.equal(sourceRoom.expiresAt, sourceExpiresAtBefore);
    assert.equal(sourceRoom.cleanupTimer, sourceCleanupTimerBefore);
    assert.deepEqual(targetRoom.schedule, targetScheduleBefore);
    assert.deepEqual(Array.from(targetRoom.users.entries()), targetUsersBefore);
    assert.deepEqual(Array.from(targetRoom.identities.entries()), targetIdentitiesBefore);
    assert.equal(targetRoom.cleanupTimer, targetCleanupTimerBefore);
    assert.equal(serverSocket.data.roomId, sourceRoomId);
    assert.equal(serverSocket.data.membershipToken, sourceJoin.membershipToken);
    assert.deepEqual(Array.from(serverSocket.rooms).sort(), socketRoomsBefore);
    assert.deepEqual(server.appServer.users.get(account.user.id).myRooms, runtimeMyRoomsBefore);
    assert.deepEqual(server.userStore.persisted.get(account.user.id).myRooms, persistedMyRoomsBefore);

    const membershipProbe = await fetch(`${server.baseUrl}/api/rooms/${sourceRoomId}/video-heartbeat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: account.cookie,
            'X-Halastudy-Membership': sourceJoin.membershipToken
        },
        body: JSON.stringify({ videoSessionId: 'v'.repeat(32) })
    });
    assert.equal(membershipProbe.status, 403);
    assert.equal((await membershipProbe.json()).errorCode, 'VIDEO_SESSION_FORBIDDEN');
});
