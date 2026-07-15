const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const { createCoStudyServer } = require('../../co-study-server');
const { extractCookies } = require('../helpers/auth-helpers');
const {
    closeSocket,
    connectSocket,
    cookieForMembershipToken,
    emitAck
} = require('../helpers/socket-client');

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
        SESSION_SECRET: 'video-persistence-session-secret-0123456789abcdef',
        ADMIN_SESSION_SECRET: 'video-persistence-admin-secret-0123456789abcdef',
        ROOM_STATE_FILE: `video-persistence-${port}.rooms.json`,
        USER_STATE_FILE: `video-persistence-${port}.users.json`,
        VIDEO_PROVIDER: 'realtimekit',
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'test-app',
        CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'test-token',
        CLOUDFLARE_REALTIMEKIT_API_BASE_URL: 'http://127.0.0.1:9',
        CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: 'http://127.0.0.1:9/webhook-key'
    };
}

function createMemoryRoomStore(options = {}) {
    let meetingWriteFailed = false;
    let failNextRequested = false;
    return {
        filePath: 'memory-rooms.json',
        failNext() { failNextRequested = true; },
        loadRooms() { return []; },
        scheduleSave() { return Promise.resolve(); },
        async flush(rooms) {
            if (failNextRequested) {
                failNextRequested = false;
                throw new Error('injected next room write failure');
            }
            const includesMeeting = Array.from(rooms.values()).some((room) => room.videoProviderMeetingId);
            if (options.failMeetingWrite && includesMeeting && !meetingWriteFailed) {
                meetingWriteFailed = true;
                throw new Error('injected meeting write failure');
            }
        }
    };
}

function createMemoryUserStore() {
    return {
        filePath: 'memory-users.json',
        hydrate() { return Promise.resolve([]); },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
}

function createMemoryVideoSessionStore(options = {}) {
    const writes = [];
    let failed = false;
    let failNextRequested = false;
    return {
        filePath: 'memory-video-sessions.json',
        writes,
        failNext() { failNextRequested = true; },
        initialize() { return Promise.resolve({ schemaVersion: 1, sessions: [] }); },
        async flush(state) {
            if (failNextRequested) {
                failNextRequested = false;
                throw new Error('injected next video session write failure');
            }
            if (options.failFirstIssuedWrite && state.sessions.length > 0 && !failed) {
                failed = true;
                throw new Error('injected video session write failure');
            }
            writes.push(structuredClone(state));
        }
    };
}

function createFakeProvider() {
    const calls = {
        meetings: 0,
        participants: 0,
        closed: [],
        kicked: [],
        deleted: []
    };
    return {
        calls,
        getProviderName() { return 'realtimekit'; },
        isConfigured() { return true; },
        initialize() { return Promise.resolve({ configured: true, webhookVerificationReady: true }); },
        getWebhookPublicKey() { return null; },
        ensureRoomMeeting() {
            calls.meetings += 1;
            return Promise.resolve({ provider: 'realtimekit', meetingId: 'meeting-1', reused: false });
        },
        createParticipantToken({ meetingId }) {
            calls.participants += 1;
            return Promise.resolve({
                provider: 'realtimekit',
                meetingId,
                participantId: 'participant-1',
                authToken: 'provider-auth-token'
            });
        },
        getActiveMeetingSession({ meetingId }) {
            return Promise.resolve({
                active: false,
                meetingId,
                sessionId: null,
                liveParticipants: 0,
                participants: []
            });
        },
        kickParticipant(payload) {
            calls.kicked.push(payload);
            return Promise.resolve({ ok: true });
        },
        deleteParticipant(payload) {
            calls.deleted.push(payload);
            return Promise.resolve({ ok: true });
        },
        closeRoomMeeting({ meetingId }) {
            calls.closed.push(meetingId);
            return Promise.resolve({ ok: true });
        },
        close() { return Promise.resolve(); }
    };
}

async function startPersistenceTestServer(options = {}) {
    const port = await getFreePort();
    const videoProvider = createFakeProvider();
    const roomStore = createMemoryRoomStore(options.roomStore);
    const videoSessionStore = createMemoryVideoSessionStore(options.videoSessionStore);
    const appServer = createCoStudyServer({
        env: testEnvironment(port),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore,
        userStore: createMemoryUserStore(),
        videoSessionStore,
        videoProvider,
        registerSignalHandlers: false,
        startupBackoffMs: []
    });
    await appServer.initialize();
    await new Promise((resolve) => appServer.listen(resolve));
    return {
        appServer,
        baseUrl: `http://127.0.0.1:${port}`,
        roomStore,
        videoProvider,
        videoSessionStore
    };
}

async function closePersistenceTestServer(server, socket) {
    await closeSocket(socket);
    await new Promise((resolve) => server.appServer.io.close(resolve));
}

async function createJoinedRoom(server) {
    const socket = await connectSocket(server.baseUrl, { clientId: 'video-persistence-client' });
    const created = await emitAck(socket, 'create-room', { roomName: 'Persistence Room' });
    const joined = await emitAck(socket, 'join-room', {
        roomId: created.room.roomId,
        username: 'Persistence user',
        clientId: 'video-persistence-client'
    });
    return { socket, roomId: created.room.roomId, membershipToken: joined.membershipToken };
}

async function requestVideoToken(server, joined, displayName = 'Persistence user') {
    return fetch(`${server.baseUrl}/api/rooms/${joined.roomId}/video-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookieForMembershipToken(joined.membershipToken),
            'X-Halastudy-Membership': joined.membershipToken
        },
        body: JSON.stringify({ displayName, role: 'student' })
    });
}

test('meeting metadata write failure returns 503 before participant creation', async (t) => {
    const server = await startPersistenceTestServer({ roomStore: { failMeetingWrite: true } });
    const joined = await createJoinedRoom(server);
    t.after(() => closePersistenceTestServer(server, joined.socket));

    const response = await requestVideoToken(server, joined);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(server.videoProvider.calls.meetings, 1);
    assert.equal(server.videoProvider.calls.participants, 0);
    assert.deepEqual(server.videoProvider.calls.closed, ['meeting-1']);
});

test('issued participant write failure returns 503 and revokes the unacknowledged token', async (t) => {
    const server = await startPersistenceTestServer({
        videoSessionStore: { failFirstIssuedWrite: true }
    });
    const joined = await createJoinedRoom(server);
    t.after(() => closePersistenceTestServer(server, joined.socket));

    const response = await requestVideoToken(server, joined);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(server.videoProvider.calls.participants, 1);
    assert.deepEqual(server.videoProvider.calls.kicked, [{
        meetingId: 'meeting-1',
        customParticipantId: server.videoProvider.calls.kicked[0].customParticipantId
    }]);
    assert.deepEqual(server.videoProvider.calls.deleted, [{
        meetingId: 'meeting-1',
        participantId: 'participant-1'
    }]);
    assert.equal(server.videoSessionStore.writes.at(-1).sessions.length, 0);
});

test('a switch is not acknowledged after its revocation tombstone write fails', async (t) => {
    const server = await startPersistenceTestServer();
    const joined = await createJoinedRoom(server);
    t.after(() => closePersistenceTestServer(server, joined.socket));
    const target = await emitAck(joined.socket, 'create-room', { roomName: 'Switch Target' });
    const tokenResponse = await requestVideoToken(server, joined);
    assert.equal(tokenResponse.status, 200);
    await tokenResponse.json();

    server.videoSessionStore.failNext();
    const switched = await emitAck(joined.socket, 'join-room', {
        roomId: target.room.roomId,
        username: 'Persistence user',
        clientId: 'video-persistence-client'
    });
    assert.equal(switched.ok, false);
    assert.equal(switched.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(server.appServer.rooms.get(joined.roomId).users.size, 1);
    assert.equal(server.appServer.rooms.get(target.room.roomId).users.size, 0);
    assert.equal(server.videoProvider.calls.deleted.length, 1);

    const tokenAfterUncertainRevocation = await requestVideoToken(server, joined);
    assert.equal(tokenAfterUncertainRevocation.status, 503);
    assert.equal(
        (await tokenAfterUncertainRevocation.json()).errorCode,
        'VIDEO_PROVIDER_UNAVAILABLE'
    );
});

test('account deletion revokes live membership when video revocation persistence fails', async (t) => {
    const server = await startPersistenceTestServer();
    const guest = await createJoinedRoom(server);

    const signupResponse = await fetch(`${server.baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'video-delete@example.com',
            password: 'delete-password-123',
            displayName: 'Deleted video user'
        })
    });
    assert.equal(signupResponse.status, 200);
    const setCookie = typeof signupResponse.headers.getSetCookie === 'function'
        ? signupResponse.headers.getSetCookie()
        : signupResponse.headers.get('set-cookie');
    const authCookie = extractCookies(setCookie);
    const authenticatedSocket = await connectSocket(server.baseUrl, {
        extraHeaders: { Cookie: authCookie }
    });
    t.after(async () => {
        await closeSocket(authenticatedSocket);
        await closePersistenceTestServer(server, guest.socket);
    });

    const joined = await emitAck(authenticatedSocket, 'join-room', {
        roomId: guest.roomId,
        username: 'Deleted video user'
    });
    assert.equal(joined.ok, true);
    const tokenResponse = await requestVideoToken(server, {
        roomId: guest.roomId,
        membershipToken: joined.membershipToken
    }, 'Deleted video user');
    const tokenBody = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200, JSON.stringify(tokenBody));

    const disconnected = new Promise((resolve) => authenticatedSocket.once('disconnect', resolve));
    server.videoSessionStore.failNext();
    const deleteResponse = await fetch(`${server.baseUrl}/api/me`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Cookie: authCookie
        },
        body: JSON.stringify({ password: 'delete-password-123' })
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).cleanupPending, true);
    await Promise.race([
        disconnected,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error('deleted account socket stayed connected')),
            1000
        ))
    ]);

    const staleMembership = await fetch(`${server.baseUrl}/api/rooms/${guest.roomId}/video-token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: authCookie,
            'X-Halastudy-Membership': joined.membershipToken
        },
        body: JSON.stringify({ displayName: 'Deleted video user', role: 'student' })
    });
    assert.equal(staleMembership.status, 403);
    assert.equal((await staleMembership.json()).errorCode, 'ROOM_MEMBERSHIP_REQUIRED');

    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { Cookie: authCookie }
    });
    assert.equal(meResponse.status, 200);
    assert.equal((await meResponse.json()).user, null);

    const tokenAfterFailedWrite = await requestVideoToken(server, guest);
    assert.equal(tokenAfterFailedWrite.status, 503);
    assert.equal((await tokenAfterFailedWrite.json()).errorCode, 'VIDEO_PROVIDER_UNAVAILABLE');
});

test('account deletion revokes owned-room video when durable room closure fails', async (t) => {
    const server = await startPersistenceTestServer();
    const signupResponse = await fetch(`${server.baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'owned-room-delete@example.com',
            password: 'delete-password-456',
            displayName: 'Deleted room owner'
        })
    });
    assert.equal(signupResponse.status, 200);
    const setCookie = typeof signupResponse.headers.getSetCookie === 'function'
        ? signupResponse.headers.getSetCookie()
        : signupResponse.headers.get('set-cookie');
    const authCookie = extractCookies(setCookie);
    const ownerSocket = await connectSocket(server.baseUrl, {
        extraHeaders: { Cookie: authCookie }
    });
    t.after(() => closePersistenceTestServer(server, ownerSocket));

    const created = await emitAck(ownerSocket, 'create-room', { roomName: 'Failed closure room' });
    assert.equal(created.ok, true);
    const joined = await emitAck(ownerSocket, 'join-room', {
        roomId: created.room.roomId,
        username: 'Deleted room owner'
    });
    assert.equal(joined.ok, true);
    const tokenResponse = await requestVideoToken(server, {
        roomId: created.room.roomId,
        membershipToken: joined.membershipToken
    }, 'Deleted room owner');
    assert.equal(tokenResponse.status, 200);

    server.roomStore.failNext();
    const deleteResponse = await fetch(`${server.baseUrl}/api/me`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Cookie: authCookie
        },
        body: JSON.stringify({ password: 'delete-password-456' })
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).cleanupPending, true);

    const cleanupDeadline = Date.now() + 1000;
    while (server.videoProvider.calls.deleted.length === 0 && Date.now() < cleanupDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(server.videoProvider.calls.deleted.length, 1);
    assert.equal(server.videoProvider.calls.kicked.length, 1);

    const staleMembership = await fetch(
        `${server.baseUrl}/api/rooms/${created.room.roomId}/video-token`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: authCookie,
                'X-Halastudy-Membership': joined.membershipToken
            },
            body: JSON.stringify({ displayName: 'Deleted room owner', role: 'student' })
        }
    );
    assert.equal(staleMembership.status, 403);
    assert.equal((await staleMembership.json()).errorCode, 'ROOM_MEMBERSHIP_REQUIRED');
});
