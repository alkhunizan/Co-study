const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const { createCoStudyServer } = require('../../co-study-server');
const { extractCookies } = require('../helpers/auth-helpers');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

function deferred() {
    let resolve = () => {};
    let reject = () => {};
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = () => resolvePromise(undefined);
        reject = () => rejectPromise();
    });
    return { promise, resolve, reject };
}

function testUuid(index) {
    return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

async function waitFor(predicate, message, timeoutMs = 1000) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt >= timeoutMs) throw new Error(message);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

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
        VIDEO_PROVIDER: 'mesh',
        ENABLE_DEV_MESH: 'true'
    };
}

function snapshotRooms(rooms) {
    return Array.from(rooms.values()).map((room) => ({
        schemaVersion: room.schemaVersion,
        id: room.id,
        name: room.name,
        ownerUserId: room.ownerUserId || null,
        expiresAt: room.expiresAt,
        lifecycleEpoch: room.lifecycleEpoch,
        closedAt: room.closedAt,
        closureReason: room.closureReason,
        cleanupPending: room.cleanupPending,
        providerCleanupLastError: room.providerCleanupLastError,
        videoProviderMeetingId: room.videoProviderMeetingId,
        videoProviderMeetingCreatedAt: room.videoProviderMeetingCreatedAt,
        videoProviderStatus: room.videoProviderStatus,
        schedule: structuredClone(room.schedule),
        createdAt: room.createdAt,
        messages: structuredClone(room.messages || []),
        roomEventOutbox: structuredClone(room.roomEventOutbox || []),
        joinCompensationOutbox: structuredClone(room.joinCompensationOutbox || [])
    }));
}

function createMemoryRoomStore({ initialRooms = [] } = {}) {
    const writes = [];
    let failNextRequested = false;
    let blockedNext = null;
    return {
        filePath: 'memory-rooms.json',
        writes,
        failNext() { failNextRequested = true; },
        blockNext() {
            const started = deferred();
            const released = deferred();
            blockedNext = { started, released };
            return { started: started.promise, release: released.resolve };
        },
        loadRooms() { return structuredClone(initialRooms); },
        scheduleSave() { return Promise.resolve(); },
        async flush(rooms) {
            // Production serialization happens synchronously when flush is
            // invoked; only the queued write awaits. Preserve that ordering in
            // blocked-write interleaving tests.
            const snapshot = snapshotRooms(rooms);
            const shouldFail = failNextRequested;
            failNextRequested = false;
            const blocked = blockedNext;
            blockedNext = null;
            if (blocked) {
                blocked.started.resolve();
                await blocked.released.promise;
            }
            if (shouldFail) {
                throw new Error('injected room write failure');
            }
            writes.push(snapshot);
        }
    };
}

function createMemoryUserStore({ initialUsers = [] } = {}) {
    const persisted = new Map();
    for (const user of initialUsers) persisted.set(user.id, structuredClone(user));
    const deliveredRoomEvents = new Map();
    const roomEventAttempts = [];
    const saveUserAttempts = [];
    let failNextRequested = false;
    let failNextObserved = null;
    let blockedNext = null;
    let blockedNextRoomEvent = null;
    let blockedNextFlush = null;
    let roomEventFailure = false;
    return {
        filePath: 'memory-users.json',
        persisted,
        deliveredRoomEvents,
        roomEventAttempts,
        saveUserAttempts,
        failNext() {
            failNextRequested = true;
            failNextObserved = deferred();
            return failNextObserved.promise;
        },
        blockNext() {
            const started = deferred();
            const released = deferred();
            blockedNext = { started, released };
            return { started: started.promise, release: released.resolve };
        },
        blockNextRoomEvent() {
            const started = deferred();
            const released = deferred();
            blockedNextRoomEvent = { started, released };
            return { started: started.promise, release: released.resolve };
        },
        blockNextFlush() {
            const started = deferred();
            const released = deferred();
            blockedNextFlush = { started, released };
            return { started: started.promise, release: released.resolve };
        },
        failRoomEvents() { roomEventFailure = true; },
        allowRoomEvents() { roomEventFailure = false; },
        hydrate() { return Promise.resolve(Array.from(persisted.values()).map((user) => structuredClone(user))); },
        scheduleSave() { return Promise.resolve(); },
        async saveUser(user) {
            saveUserAttempts.push(structuredClone(user));
            const shouldFail = failNextRequested;
            failNextRequested = false;
            const failureObserved = failNextObserved;
            failNextObserved = null;
            const blocked = blockedNext;
            blockedNext = null;
            if (blocked) {
                blocked.started.resolve();
                await blocked.released.promise;
            }
            if (shouldFail) {
                failureObserved?.resolve();
                throw new Error('injected user write failure');
            }
            persisted.set(user.id, structuredClone(user));
        },
        async flush(users) {
            const blocked = blockedNextFlush;
            blockedNextFlush = null;
            if (blocked) {
                blocked.started.resolve();
                await blocked.released.promise;
            }
            persisted.clear();
            for (const [userId, user] of users.entries()) {
                persisted.set(userId, structuredClone(user));
            }
        },
        async logRoomEvent(event) {
            roomEventAttempts.push(structuredClone(event));
            const blocked = blockedNextRoomEvent;
            blockedNextRoomEvent = null;
            if (blocked) {
                blocked.started.resolve();
                await blocked.released.promise;
            }
            if (roomEventFailure) throw new Error('injected room event sink failure');
            deliveredRoomEvents.set(event.eventId, structuredClone(event));
        }
    };
}

async function startMutationTestServer(options = {}) {
    const port = await getFreePort();
    const roomStore = createMemoryRoomStore({ initialRooms: options.initialRooms });
    const userStore = createMemoryUserStore({ initialUsers: options.initialUsers });
    const roomSaveQueueWaiters = [];
    const joinUserMutationWaiters = [];
    const appServer = createCoStudyServer({
        env: testEnvironment(port),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore,
        userStore,
        registerSignalHandlers: false,
        startupBackoffMs: [],
        roomSaveDebounceMs: options.roomSaveDebounceMs,
        onRoomSaveQueued: () => roomSaveQueueWaiters.shift()?.resolve(),
        onJoinUserMutationQueued: () => joinUserMutationWaiters.shift()?.resolve()
    });
    await appServer.initialize();
    await new Promise((resolve) => appServer.listen(resolve));
    return {
        appServer,
        baseUrl: `http://127.0.0.1:${port}`,
        roomStore,
        userStore,
        waitForNextRoomSaveQueue() {
            const waiter = deferred();
            roomSaveQueueWaiters.push(waiter);
            return waiter.promise;
        },
        waitForNextJoinUserMutation() {
            const waiter = deferred();
            joinUserMutationWaiters.push(waiter);
            return waiter.promise;
        }
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

function buildPreparedJoinSaga({
    userId,
    roomId,
    joinedAt,
    previousMyRooms = [],
    operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
}) {
    return {
        operationId,
        userId,
        roomId,
        joinedAt,
        preparedAt: joinedAt,
        previousMyRooms: structuredClone(previousMyRooms),
        events: [{
            eventId,
            roomCode: roomId,
            userId,
            nickname: 'Interrupted Join',
            eventType: 'join',
            roomSchemaVersion: 2,
            ownerUserId: null,
            roomExpiresAt: null,
            occurrenceId: null,
            lifecycleEpoch: 0,
            occurredAt: new Date(joinedAt).toISOString()
        }]
    };
}

function buildPersistedUser({ joinedAt, roomId }) {
    return {
        id: 'legacy:file-user-1',
        email: 'crash-retry@example.com',
        passwordHash: 'fixture:hash',
        passwordEnabled: true,
        googleSub: null,
        authProvider: 'password',
        displayName: 'Crash Retry',
        avatarColor: 'amber',
        bio: '',
        createdAt: joinedAt - 1000,
        banned: false,
        tokenEpoch: 1,
        focusStats: { days: {}, totalFocusMinutes: 0, totalSessions: 0, completions: [] },
        streak: { current: 0, best: 0, lastActiveDay: null },
        myRooms: [{ roomId, name: 'Crash Target', role: 'joined', lastJoinedAt: joinedAt }]
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

test('account deletion releases the user lock before room cascade and cannot deadlock an in-flight join', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'DeleteJoin');
    const creator = await connectSocket(server.baseUrl, { clientId: 'delete-join-creator' });
    const joiningSocket = await connectSocket(server.baseUrl, {
        clientId: 'delete-join-user',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [creator, joiningSocket]));

    const target = await emitAck(creator, 'create-room', { roomName: 'Delete Join Target' });
    const deletionWrite = server.userStore.blockNextFlush();
    const deleting = fetch(`${server.baseUrl}/api/me`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Cookie: account.cookie
        },
        body: JSON.stringify({ password: 'correct-horse-battery-staple' })
    });
    await deletionWrite.started;

    const joinQueuedOnUserLock = server.waitForNextJoinUserMutation();
    let joinedSuccessfully = false;
    const joiningSocketId = joiningSocket.id;
    joiningSocket.emit('join-room', {
        roomId: target.room.roomId,
        username: 'DeleteJoin'
    }, (result) => {
        joinedSuccessfully = result?.ok === true;
    });
    await joinQueuedOnUserLock;
    deletionWrite.release();
    const deleteResponse = await Promise.race([
        deleting,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error('delete and join deadlocked on room/user locks')),
            2000
        ))
    ]);
    await waitFor(
        () => !server.appServer.io.sockets.sockets.has(joiningSocketId),
        'account deletion cascade did not finish serialized socket cleanup'
    );

    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).ok, true);
    assert.equal(joinedSuccessfully, false);
    assert.equal(server.appServer.users.has(account.user.id), false);
    assert.equal(
        server.appServer.rooms.get(target.room.roomId).users.has(joiningSocketId),
        false
    );
    assert.equal(
        server.appServer.rooms.get('LOBBY').roomEventOutbox.some((event) => (
            event.roomCode === target.room.roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        )),
        false
    );
});

test('prepared join events stay private and the durable commit completes before acknowledgement', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'PreparedJoin');
    const creator = await connectSocket(server.baseUrl, { clientId: 'prepared-creator' });
    const joiningSocket = await connectSocket(server.baseUrl, {
        clientId: 'prepared-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [creator, joiningSocket]));

    const created = await emitAck(creator, 'create-room', { roomName: 'Prepared Target' });
    assert.equal(created.ok, true);
    const roomId = created.room.roomId;
    assert.equal(
        Number.isFinite(server.roomStore.writes.at(-1).find((room) => room.id === roomId).expiresAt),
        true
    );
    const userWrite = server.userStore.blockNext();
    t.after(() => userWrite.release());
    let ackSettled = false;
    const joinResult = emitAck(joiningSocket, 'join-room', {
        roomId,
        username: 'PreparedJoin'
    }).finally(() => {
        ackSettled = true;
    });
    await userWrite.started;

    const preparedSnapshot = server.roomStore.writes.at(-1);
    const preparedLobby = preparedSnapshot.find((room) => room.id === 'LOBBY');
    assert.equal(preparedLobby.joinCompensationOutbox.length, 1);
    assert.equal(
        preparedLobby.roomEventOutbox.some((event) => event.roomCode === roomId && event.eventType === 'join'),
        false
    );
    const drainedWhilePrepared = await server.appServer.drainRoomEvents();
    assert.equal(drainedWhilePrepared.pending, 0);
    assert.equal(
        Array.from(server.userStore.deliveredRoomEvents.values())
            .some((event) => event.roomCode === roomId && event.eventType === 'join'),
        false
    );

    const commitWrite = server.roomStore.blockNext();
    t.after(() => commitWrite.release());
    userWrite.release();
    await commitWrite.started;
    assert.equal(ackSettled, false);
    const serverSocket = server.appServer.io.sockets.sockets.get(joiningSocket.id);
    assert.equal(serverSocket.data.roomId, roomId);
    assert.equal(server.appServer.rooms.get(roomId).users.has(joiningSocket.id), true);
    assert.equal(serverSocket.rooms.has(roomId), true);
    commitWrite.release();

    const joined = await joinResult;
    assert.equal(joined.ok, true);
    const committedLobby = server.roomStore.writes.at(-1).find((room) => room.id === 'LOBBY');
    assert.equal(committedLobby.joinCompensationOutbox.length, 0);
    assert.equal(
        committedLobby.roomEventOutbox.some((event) => event.roomCode === roomId && event.eventType === 'join'),
        true
    );
});

test('a full prepared-saga journal rejects a join before user or room persistence mutates', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'SagaCapacity');
    const creator = await connectSocket(server.baseUrl, { clientId: 'saga-capacity-creator' });
    const joiner = await connectSocket(server.baseUrl, {
        clientId: 'saga-capacity-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [creator, joiner]));

    const target = await emitAck(creator, 'create-room', { roomName: 'Saga Capacity Target' });
    const lobby = server.appServer.rooms.get('LOBBY');
    lobby.joinCompensationOutbox.push(...Array.from({ length: 1000 }, (_, index) => (
        buildPreparedJoinSaga({
            userId: null,
            roomId: target.room.roomId,
            joinedAt: Date.now() - index - 1,
            operationId: testUuid(index + 1),
            eventId: testUuid(index + 2001)
        })
    )));
    const myRoomsBefore = structuredClone(server.appServer.users.get(account.user.id).myRooms);
    const saveAttemptsBefore = server.userStore.saveUserAttempts.length;
    const roomWritesBefore = server.roomStore.writes.length;

    const joined = await emitAck(joiner, 'join-room', {
        roomId: target.room.roomId,
        username: 'SagaCapacity'
    });

    assert.equal(joined.ok, false);
    assert.equal(joined.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.deepEqual(server.appServer.users.get(account.user.id).myRooms, myRoomsBefore);
    assert.equal(server.userStore.saveUserAttempts.length, saveAttemptsBefore);
    assert.equal(server.roomStore.writes.length, roomWritesBefore);
    assert.equal(server.appServer.rooms.get(target.room.roomId).users.has(joiner.id), false);
});

test('a queued debounced snapshot cannot capture tentative saga state before a failed immediate write', async (t) => {
    const server = await startMutationTestServer({ roomSaveDebounceMs: 5 });
    const account = await signup(server.baseUrl, 'QueuedSaga');
    const owner = await connectSocket(server.baseUrl, { clientId: 'queued-owner' });
    const joiner = await connectSocket(server.baseUrl, {
        clientId: 'queued-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [owner, joiner]));

    const target = await emitAck(owner, 'create-room', { roomName: 'Queued Target' });
    assert.equal(target.ok, true);
    assert.equal((await emitAck(owner, 'join-room', {
        roomId: target.room.roomId,
        username: 'QueueOwner'
    })).ok, true);

    const userWrite = server.userStore.blockNext();
    const joining = emitAck(joiner, 'join-room', {
        roomId: target.room.roomId,
        username: 'QueuedSaga'
    });
    await userWrite.started;
    const preparedLobby = server.roomStore.writes.at(-1).find((room) => room.id === 'LOBBY');
    assert.equal(preparedLobby.joinCompensationOutbox.length, 1);

    const blockingCreateWrite = server.roomStore.blockNext();
    const unrelatedCreate = emitAck(owner, 'create-room', { roomName: 'Snapshot Gate Holder' });
    await blockingCreateWrite.started;

    const queuedDebouncedWrite = server.roomStore.blockNext();
    const debouncedWriteQueued = server.waitForNextRoomSaveQueue();
    assert.equal((await emitAck(owner, 'send-message', { text: 'queue a generic snapshot' })).ok, true);
    await debouncedWriteQueued;

    // The join commit now waits behind event transaction A while generic
    // debounced snapshot B is already queued on the snapshot coordinator.
    userWrite.release();
    blockingCreateWrite.release();
    assert.equal((await unrelatedCreate).ok, true);
    await queuedDebouncedWrite.started;
    const queuedWriteIndex = server.roomStore.writes.length;

    // B already captured the still-private prepared saga. Fail following
    // commit C and prove B never observed tentative deliverable events.
    server.roomStore.failNext();
    queuedDebouncedWrite.release();
    const joined = await joining;
    assert.equal(joined.ok, false);
    assert.equal(joined.errorCode, 'PERSISTENCE_UNAVAILABLE');

    const queuedSnapshot = server.roomStore.writes[queuedWriteIndex];
    const lobby = queuedSnapshot.find((room) => room.id === 'LOBBY');
    assert.equal(lobby.joinCompensationOutbox.length, 1);
    assert.equal(
        lobby.roomEventOutbox.some((event) => (
            event.roomCode === target.room.roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        )),
        false
    );
    assert.equal(
        server.roomStore.writes.slice(queuedWriteIndex).some((snapshot) => {
            const snapshotLobby = snapshot.find((room) => room.id === 'LOBBY');
            return snapshotLobby.roomEventOutbox.some((event) => (
                event.roomCode === target.room.roomId
                && event.userId === account.user.id
                && event.eventType === 'join'
            )) && snapshotLobby.joinCompensationOutbox.length === 0;
        }),
        false
    );
});

test('a stalled lifecycle sink does not block a private prepared join or its durable commit', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'StalledSink');
    const owner = await connectSocket(server.baseUrl, { clientId: 'stalled-sink-owner' });
    const joiner = await connectSocket(server.baseUrl, {
        clientId: 'stalled-sink-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [owner, joiner]));

    const target = await emitAck(owner, 'create-room', { roomName: 'Stalled Sink Target' });
    const roomId = target.room.roomId;
    const sinkWrite = server.userStore.blockNextRoomEvent();
    t.after(() => sinkWrite.release());
    const draining = server.appServer.drainRoomEvents();
    await sinkWrite.started;

    const userWrite = server.userStore.blockNext();
    t.after(() => userWrite.release());
    const joining = emitAck(joiner, 'join-room', { roomId, username: 'StalledSink' });
    await userWrite.started;

    const lobby = server.appServer.rooms.get('LOBBY');
    assert.equal(lobby.joinCompensationOutbox.length, 1);
    assert.equal(
        lobby.roomEventOutbox.some((event) => (
            event.roomCode === roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        )),
        false
    );

    userWrite.release();
    const joined = await Promise.race([
        joining,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error('join was blocked by the stalled lifecycle sink')),
            1000
        ))
    ]);
    assert.equal(joined.ok, true);
    assert.equal(lobby.joinCompensationOutbox.length, 0);
    assert.equal(
        lobby.roomEventOutbox.some((event) => (
            event.roomCode === roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        )),
        true
    );

    sinkWrite.release();
    const drained = await draining;
    assert.equal(drained.pending, 0);
});

test('disconnect during a successful commit yields one durable target join and one normal leave', async (t) => {
    const server = await startMutationTestServer();
    server.userStore.failRoomEvents();
    const account = await signup(server.baseUrl, 'CommitSuccess');
    const owner = await connectSocket(server.baseUrl, { clientId: 'commit-success-owner' });
    const joiner = await connectSocket(server.baseUrl, {
        clientId: 'commit-success-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [owner, joiner]));

    const target = await emitAck(owner, 'create-room', { roomName: 'Commit Success Target' });
    const roomId = target.room.roomId;
    const userWrite = server.userStore.blockNext();
    let acknowledgement = null;
    joiner.emit('join-room', { roomId, username: 'CommitSuccess' }, (result) => {
        acknowledgement = result;
    });
    await userWrite.started;
    const commitWrite = server.roomStore.blockNext();
    userWrite.release();
    await commitWrite.started;

    const socketId = joiner.id;
    joiner.disconnect();
    await waitFor(
        () => !server.appServer.io.sockets.sockets.has(socketId),
        'server did not observe the mid-commit disconnect'
    );
    commitWrite.release();
    await waitFor(
        () => !server.appServer.rooms.get(roomId).users.has(socketId)
            && server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length === 0,
        'serialized disconnect cleanup did not run after the successful commit'
    );
    await new Promise((resolve) => setTimeout(resolve, 3200));

    const targetEvents = server.appServer.rooms.get('LOBBY').roomEventOutbox.filter(
        (event) => event.roomCode === roomId && ['join', 'leave'].includes(event.eventType)
    );
    assert.deepEqual(targetEvents.map((event) => event.eventType), ['join', 'leave']);
    assert.equal(new Set(targetEvents.map((event) => event.eventId)).size, 2);
    assert.equal(acknowledgement, null);
    assert.equal(
        server.userStore.persisted.get(account.user.id).myRooms.some((entry) => entry.roomId === roomId),
        true
    );
});

test('disconnect during a failed source-to-target commit produces one source leave and zero target events', async (t) => {
    const server = await startMutationTestServer();
    server.userStore.failRoomEvents();
    const account = await signup(server.baseUrl, 'CommitFailure');
    const owner = await connectSocket(server.baseUrl, { clientId: 'commit-failure-owner' });
    const mover = await connectSocket(server.baseUrl, {
        clientId: 'commit-failure-mover',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [owner, mover]));

    const source = await emitAck(owner, 'create-room', { roomName: 'Commit Failure Source' });
    const target = await emitAck(owner, 'create-room', { roomName: 'Commit Failure Target' });
    assert.equal((await emitAck(mover, 'join-room', {
        roomId: source.room.roomId,
        username: 'CommitFailure'
    })).ok, true);
    const persistedBeforeSwitch = structuredClone(
        server.userStore.persisted.get(account.user.id).myRooms
    );

    const userWrite = server.userStore.blockNext();
    let acknowledgement = null;
    mover.emit('join-room', {
        roomId: target.room.roomId,
        username: 'CommitFailure'
    }, (result) => {
        acknowledgement = result;
    });
    await userWrite.started;
    server.roomStore.failNext();
    const commitWrite = server.roomStore.blockNext();
    userWrite.release();
    await commitWrite.started;

    const socketId = mover.id;
    mover.disconnect();
    await waitFor(
        () => !server.appServer.io.sockets.sockets.has(socketId),
        'server did not observe the failed-switch disconnect'
    );
    commitWrite.release();
    await waitFor(
        () => !server.appServer.rooms.get(source.room.roomId).users.has(socketId)
            && !server.appServer.rooms.get(target.room.roomId).users.has(socketId)
            && server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length === 0,
        'failed switch did not restore then serialize source cleanup'
    );
    await new Promise((resolve) => setTimeout(resolve, 3200));

    const lifecycleEvents = server.appServer.rooms.get('LOBBY').roomEventOutbox;
    const sourceEvents = lifecycleEvents.filter((event) => (
        event.roomCode === source.room.roomId && ['join', 'leave'].includes(event.eventType)
    ));
    const targetEvents = lifecycleEvents.filter((event) => (
        event.roomCode === target.room.roomId && ['join', 'leave'].includes(event.eventType)
    ));
    assert.deepEqual(sourceEvents.map((event) => event.eventType), ['join', 'leave']);
    assert.deepEqual(targetEvents, []);
    assert.equal(acknowledgement, null);
    assert.deepEqual(server.userStore.persisted.get(account.user.id).myRooms, persistedBeforeSwitch);
    assert.equal(Number.isFinite(server.appServer.rooms.get(source.room.roomId).expiresAt), true);
    const lastSnapshotSource = server.roomStore.writes.at(-1)
        .find((room) => room.id === source.room.roomId);
    assert.equal(Number.isFinite(lastSnapshotSource.expiresAt), true);
});

test('owner attendance shares the successful join snapshot and rolls back exactly on commit failure', async (t) => {
    const server = await startMutationTestServer();
    server.userStore.failRoomEvents();
    const account = await signup(server.baseUrl, 'AttendanceOwner');
    const owner = await connectSocket(server.baseUrl, {
        clientId: 'attendance-owner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [owner]));

    const successfulRoom = await emitAck(owner, 'create-room', {
        roomName: 'Attendance Success',
        schedule: buildOpenSchedule()
    });
    const failedRoom = await emitAck(owner, 'create-room', {
        roomName: 'Attendance Failure',
        schedule: buildOpenSchedule()
    });
    const successfulJoin = await emitAck(owner, 'join-room', {
        roomId: successfulRoom.room.roomId,
        username: 'AttendanceOwner'
    });
    assert.equal(successfulJoin.ok, true);

    const successfulCommitSnapshot = [...server.roomStore.writes].reverse().find((snapshot) => {
        const lobby = snapshot.find((room) => room.id === 'LOBBY');
        return lobby.roomEventOutbox.some((event) => (
            event.roomCode === successfulRoom.room.roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        ));
    });
    const successfulPersistedRoom = successfulCommitSnapshot.find(
        (room) => room.id === successfulRoom.room.roomId
    );
    const successfulJoinEvent = successfulCommitSnapshot.find((room) => room.id === 'LOBBY')
        .roomEventOutbox.find((event) => (
            event.roomCode === successfulRoom.room.roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        ));
    assert.equal(successfulPersistedRoom.schedule.attendance.length, 1);
    assert.equal(
        successfulPersistedRoom.schedule.attendance[0].occurrenceId,
        successfulJoinEvent.occurrenceId
    );

    const failedRuntimeRoom = server.appServer.rooms.get(failedRoom.room.roomId);
    const scheduleBeforeFailure = structuredClone(failedRuntimeRoom.schedule);
    const userWrite = server.userStore.blockNext();
    const switching = emitAck(owner, 'join-room', {
        roomId: failedRoom.room.roomId,
        username: 'AttendanceOwner'
    });
    await userWrite.started;
    server.roomStore.failNext();
    userWrite.release();
    const failedJoin = await switching;
    assert.equal(failedJoin.ok, false);
    assert.equal(failedJoin.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.deepEqual(failedRuntimeRoom.schedule, scheduleBeforeFailure);
    assert.deepEqual(
        server.roomStore.writes.at(-1).find((room) => room.id === failedRoom.room.roomId).schedule,
        scheduleBeforeFailure
    );
    assert.equal(
        server.appServer.rooms.get('LOBBY').roomEventOutbox.some((event) => (
            event.roomCode === failedRoom.room.roomId
            && event.userId === account.user.id
            && event.eventType === 'join'
        )),
        false
    );
});

test('a disconnected join survives user and room compensation failures and retries without event replay', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'RetryJoin');
    const creator = await connectSocket(server.baseUrl, { clientId: 'retry-creator' });
    const joiningSocket = await connectSocket(server.baseUrl, {
        clientId: 'retry-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [creator, joiningSocket]));

    const created = await emitAck(creator, 'create-room', { roomName: 'Retry Target' });
    assert.equal(created.ok, true);
    const roomId = created.room.roomId;
    const userWrite = server.userStore.blockNext();
    joiningSocket.emit('join-room', { roomId, username: 'RetryJoin' }, () => {});
    await userWrite.started;
    const joiningSocketId = joiningSocket.id;
    joiningSocket.disconnect();
    await waitFor(
        () => !server.appServer.io.sockets.sockets.has(joiningSocketId),
        'server did not observe the joining socket disconnect'
    );
    const rollbackFailureObserved = server.userStore.failNext();
    userWrite.release();
    await Promise.race([
        rollbackFailureObserved,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error('timed out waiting for injected rollback failure')),
            1000
        ))
    ]);
    await waitFor(
        () => server.appServer.rooms.get('LOBBY').joinCompensationOutbox?.length === 1,
        'prepared compensation was not retained after the failed user rollback'
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(
        server.userStore.persisted.get(account.user.id).myRooms.some((entry) => entry.roomId === roomId),
        true
    );
    server.roomStore.failNext();
    await assert.rejects(
        server.appServer.drainJoinCompensations({ drainAll: true }),
        /injected room write failure/
    );
    assert.equal(
        server.userStore.persisted.get(account.user.id).myRooms.some((entry) => entry.roomId === roomId),
        false
    );
    assert.equal(server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length, 1);

    await server.appServer.drainRoomEvents();
    assert.equal(
        Array.from(server.userStore.deliveredRoomEvents.values())
            .some((event) => event.roomCode === roomId && event.eventType === 'join'),
        false
    );
    await server.appServer.drainJoinCompensations({ drainAll: true });
    assert.equal(server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length, 0);
    assert.equal(
        server.roomStore.writes.at(-1)
            .find((room) => room.id === 'LOBBY')
            .joinCompensationOutbox.length,
        0
    );
});

test('an older prepared rollback cannot overwrite a newer legitimate room entry', async (t) => {
    const server = await startMutationTestServer();
    const account = await signup(server.baseUrl, 'NewerJoin');
    const creator = await connectSocket(server.baseUrl, { clientId: 'newer-creator' });
    const joiningSocket = await connectSocket(server.baseUrl, {
        clientId: 'newer-joiner',
        extraHeaders: { Cookie: account.cookie }
    });
    t.after(() => stopMutationTestServer(server, [creator, joiningSocket]));

    const created = await emitAck(creator, 'create-room', { roomName: 'Newer Target' });
    const roomId = created.room.roomId;
    const runtimeUser = server.appServer.users.get(account.user.id);
    const previousMyRooms = structuredClone(runtimeUser.myRooms);
    const staleJoinedAt = Date.now() - 5000;
    runtimeUser.myRooms.push({ roomId, name: 'Stale Target', role: 'joined', lastJoinedAt: staleJoinedAt });
    await server.userStore.saveUser(runtimeUser);
    const lobby = server.appServer.rooms.get('LOBBY');
    lobby.joinCompensationOutbox.push(buildPreparedJoinSaga({
        userId: account.user.id,
        roomId,
        joinedAt: staleJoinedAt,
        previousMyRooms
    }));
    await server.roomStore.flush(server.appServer.rooms);

    const joined = await emitAck(joiningSocket, 'join-room', { roomId, username: 'NewerJoin' });
    assert.equal(joined.ok, true);
    const newerEntry = server.userStore.persisted.get(account.user.id).myRooms
        .find((entry) => entry.roomId === roomId);
    assert.ok(newerEntry.lastJoinedAt > staleJoinedAt);

    await server.appServer.drainJoinCompensations({ drainAll: true });
    assert.deepEqual(
        server.userStore.persisted.get(account.user.id).myRooms.find((entry) => entry.roomId === roomId),
        newerEntry
    );
    assert.equal(lobby.joinCompensationOutbox.length, 0);
});

test('targeted handoff compensates its exact saga beyond a concurrent 25-item batch', async (t) => {
    const server = await startMutationTestServer();
    t.after(() => stopMutationTestServer(server));
    const roomId = 'HAND01';
    const joinedAt = Date.now() - 1000;
    const user = buildPersistedUser({ joinedAt, roomId });
    server.appServer.users.set(user.id, user);
    server.userStore.persisted.set(user.id, structuredClone(user));

    const backlog = Array.from({ length: 29 }, (_, index) => buildPreparedJoinSaga({
        userId: null,
        roomId: `B${String(index).padStart(5, '0')}`,
        joinedAt: joinedAt - index - 1,
        operationId: testUuid(index + 1),
        eventId: testUuid(index + 1001)
    }));
    const exactIntent = buildPreparedJoinSaga({
        userId: user.id,
        roomId,
        joinedAt,
        operationId: testUuid(5000),
        eventId: testUuid(6000)
    });
    const lobby = server.appServer.rooms.get('LOBBY');
    lobby.joinCompensationOutbox.push(...backlog, exactIntent);
    await server.roomStore.flush(server.appServer.rooms);
    const writesBeforeHandoff = server.roomStore.writes.length;

    const firstBatchWrite = server.roomStore.blockNext();
    const normalBatch = server.appServer.drainJoinCompensations();
    await firstBatchWrite.started;
    const exactHandoff = server.appServer.handOffJoinCompensation(exactIntent);
    firstBatchWrite.release();

    const exactResult = await exactHandoff;
    assert.equal(exactResult.processed, 1);
    assert.equal(
        server.userStore.persisted.get(user.id).myRooms.some((entry) => entry.roomId === roomId),
        false
    );
    assert.equal(
        lobby.joinCompensationOutbox.some((intent) => intent.operationId === exactIntent.operationId),
        false
    );
    assert.equal(
        server.roomStore.writes.slice(writesBeforeHandoff).some((snapshot) => (
            snapshot.find((room) => room.id === 'LOBBY')
                .joinCompensationOutbox.every((intent) => intent.operationId !== exactIntent.operationId)
        )),
        true
    );

    const batchResult = await normalBatch;
    assert.equal(batchResult.processed, 25);
    assert.equal(lobby.joinCompensationOutbox.length, 4);
});

test('startup compensates a prepared crash snapshot before lifecycle events can replay', async (t) => {
    const joinedAt = Date.parse('2026-07-15T07:00:00.000Z');
    const roomId = 'CRASH1';
    const user = buildPersistedUser({ joinedAt, roomId });
    const saga = buildPreparedJoinSaga({
        userId: user.id,
        roomId,
        joinedAt,
        previousMyRooms: []
    });
    const server = await startMutationTestServer({
        initialUsers: [user],
        initialRooms: [{
            schemaVersion: 2,
            id: 'LOBBY',
            name: 'The Lobby',
            roomEventOutbox: [],
            joinCompensationOutbox: [saga]
        }]
    });
    t.after(() => stopMutationTestServer(server));

    assert.equal(server.userStore.persisted.get(user.id).myRooms.length, 0);
    assert.equal(server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length, 0);
    assert.equal(
        server.roomStore.writes.at(-1)
            .find((room) => room.id === 'LOBBY')
            .joinCompensationOutbox.length,
        0
    );
    await server.appServer.drainRoomEvents();
    assert.equal(server.userStore.deliveredRoomEvents.size, 0);
});

test('shutdown persistence drain resolves prepared join compensation before final snapshots', async (t) => {
    const server = await startMutationTestServer();
    t.after(() => stopMutationTestServer(server));
    const joinedAt = Date.now() - 1000;
    const roomId = 'DRAIN1';
    const user = buildPersistedUser({ joinedAt, roomId });
    server.appServer.users.set(user.id, user);
    server.userStore.persisted.set(user.id, structuredClone(user));
    server.appServer.rooms.get('LOBBY').joinCompensationOutbox.push(buildPreparedJoinSaga({
        userId: user.id,
        roomId,
        joinedAt,
        previousMyRooms: []
    }));
    await server.roomStore.flush(server.appServer.rooms);

    await server.appServer.drainPersistenceWork();

    assert.equal(server.userStore.persisted.get(user.id).myRooms.length, 0);
    assert.equal(server.appServer.rooms.get('LOBBY').joinCompensationOutbox.length, 0);
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
