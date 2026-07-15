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
        createdAt: room.createdAt,
        roomEventOutbox: structuredClone(room.roomEventOutbox || [])
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
    const deliveredRoomEvents = new Map();
    const roomEventAttempts = [];
    let failNextRequested = false;
    let roomEventFailure = false;
    return {
        filePath: 'memory-users.json',
        persisted,
        deliveredRoomEvents,
        roomEventAttempts,
        failNext() { failNextRequested = true; },
        failRoomEvents() { roomEventFailure = true; },
        allowRoomEvents() { roomEventFailure = false; },
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
        },
        async logRoomEvent(event) {
            roomEventAttempts.push(structuredClone(event));
            if (roomEventFailure) throw new Error('injected room event sink failure');
            deliveredRoomEvents.set(event.eventId, structuredClone(event));
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

test('room lifecycle events are durable before ack, private, and replay idempotently', async (t) => {
    const server = await startMutationTestServer();
    server.userStore.failRoomEvents();
    const account = await signup(server.baseUrl, 'EventOwner');
    const socket = await connectSocket(server.baseUrl, {
        clientId: 'event-owner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [socket]));

    const source = await emitAck(socket, 'create-room', { roomName: 'Event Source' });
    const target = await emitAck(socket, 'create-room', {
        roomName: 'Event Target',
        schedule: buildOpenSchedule()
    });
    assert.equal(source.ok, true);
    assert.equal(target.ok, true);
    assert.equal(source.room.roomEventOutbox, undefined);
    assert.equal(target.room.roomEventOutbox, undefined);

    const sourceJoin = await emitAck(socket, 'join-room', {
        roomId: source.room.roomId,
        username: 'EventOwner'
    });
    const targetJoin = await emitAck(socket, 'join-room', {
        roomId: target.room.roomId,
        username: 'EventOwner'
    });
    assert.equal(sourceJoin.ok, true);
    assert.equal(targetJoin.ok, true);
    assert.equal(targetJoin.room.roomEventOutbox, undefined);

    const deleted = await fetch(`${server.baseUrl}/api/rooms/${target.room.roomId}`, {
        method: 'DELETE',
        headers: { Cookie: account.cookie }
    });
    assert.equal(deleted.status, 200);

    const lobby = server.appServer.rooms.get('LOBBY');
    assert.deepEqual(lobby.roomEventOutbox.map((event) => event.eventType), [
        'create',
        'create',
        'join',
        'leave',
        'join',
        'close'
    ]);
    assert.equal(new Set(lobby.roomEventOutbox.map((event) => event.eventId)).size, 6);
    assert.equal(lobby.roomEventOutbox.every((event) => event.roomSchemaVersion === 2), true);
    assert.equal(lobby.roomEventOutbox.at(-1).lifecycleEpoch, 1);
    assert.match(
        lobby.roomEventOutbox.find((event) => event.roomCode === target.room.roomId && event.eventType === 'join').occurrenceId,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );

    await assert.rejects(server.appServer.drainRoomEvents(), /injected room event sink failure/);
    assert.equal(lobby.roomEventOutbox.length, 6);

    server.userStore.allowRoomEvents();
    server.roomStore.failNext();
    await assert.rejects(server.appServer.drainRoomEvents(), /injected room write failure/);
    assert.equal(lobby.roomEventOutbox.length, 6);
    const replayedEventId = lobby.roomEventOutbox[0].eventId;

    const drained = await server.appServer.drainRoomEvents();
    assert.deepEqual(drained, { delivered: 6, pending: 0 });
    assert.equal(lobby.roomEventOutbox.length, 0);
    assert.equal(server.userStore.deliveredRoomEvents.size, 6);
    assert.equal(
        server.userStore.roomEventAttempts.filter((event) => event.eventId === replayedEventId).length,
        3
    );
});

test('a final disconnect durably queues one leave event after the reconnect grace window', async (t) => {
    const server = await startMutationTestServer();
    server.userStore.failRoomEvents();
    const account = await signup(server.baseUrl, 'LeavingOwner');
    const socket = await connectSocket(server.baseUrl, {
        clientId: 'leaving-owner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server));

    const created = await emitAck(socket, 'create-room', { roomName: 'Leave Event Room' });
    assert.equal(created.ok, true);
    assert.equal((await emitAck(socket, 'join-room', {
        roomId: created.room.roomId,
        username: 'LeavingOwner'
    })).ok, true);
    await closeSocket(socket);
    await new Promise((resolve) => setTimeout(resolve, 3200));

    const events = server.appServer.rooms.get('LOBBY').roomEventOutbox;
    assert.deepEqual(events.map((event) => event.eventType), ['create', 'join', 'leave']);
    assert.equal(events[2].userId, account.user.id);
    assert.equal(events[2].nickname, 'LeavingOwner');
});
