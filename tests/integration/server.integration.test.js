const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { repoRoot, resetStateFile, makeTempStateFile } = require('../helpers/test-env');
const { delay, startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { signupUser } = require('../helpers/auth-helpers');

const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

function buildFutureRiyadhSchedule(options = {}) {
    const minutesFromNow = Number.isInteger(options.minutesFromNow) ? options.minutesFromNow : 5;
    const cadence = options.cadence || 'weekdays';
    const focusMinutes = options.focusMinutes || 50;
    const breakMinutes = options.breakMinutes || 10;
    const goal = options.boardGoalTemplate || 'Launch hardening sprint';
    const future = new Date(Date.now() + (3 * 60 * 60 * 1000) + (minutesFromNow * 60 * 1000));
    const startDate = `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}-${String(future.getUTCDate()).padStart(2, '0')}`;
    const startTime = `${String(future.getUTCHours()).padStart(2, '0')}:${String(future.getUTCMinutes()).padStart(2, '0')}`;

    return {
        startDate,
        startTime,
        cadence,
        focusMinutes,
        breakMinutes,
        boardGoalTemplate: goal
    };
}

async function cleanupServer(t, server, extraFiles = []) {
    t.after(async () => {
        if (server) {
            await server.stop();
            resetStateFile(server.roomStateFile);
        }
        for (const filePath of extraFiles) resetStateFile(filePath);
    });
}

function runNodeScript(scriptRelativePath, args = [], options = {}) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, scriptRelativePath), ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            ...options.env
        }
    });

    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
    };
}

async function expectStartFailure(startOptions, pattern) {
    await assert.rejects(
        async () => {
            await startServer(startOptions);
        },
        (/** @type {any} */ error) => {
            assert.match(String(error.message), pattern);
            return true;
        }
    );
}

async function issueVideoToken(server, roomId, body) {
    return server.request(`/api/rooms/${roomId}/video-token`, {
        method: 'POST',
        body
    });
}

test('health and readiness endpoints report a healthy HTTP app', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const health = await server.request('/api/health');
    const ready = await server.request('/api/ready');

    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.mode, 'http');
    assert.equal(typeof health.body.uptimeSeconds, 'number');

    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, 'ready');
    assert.deepEqual(ready.body.checks, {
        roomStore: true,
        userStore: true,
        socket: true,
        config: true
    });
});

test('HTTP responses include baseline browser security headers', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const response = await server.request('/');

    assert.equal(response.status, 200);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(response.headers['content-security-policy'], /default-src 'self'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net/);
    assert.match(response.headers['content-security-policy'], /connect-src 'self' https:\/\/\*\.cloudflare\.com wss:\/\/\*\.cloudflare\.com/);
    assert.match(response.headers['content-security-policy'], /frame-src 'self'; object-src/);
    assert.equal(response.headers['permissions-policy'], 'camera=(self), microphone=(self), display-capture=()');
});

test('security headers allow-list the SFU origin when SFU_BASE_URL is configured', async (t) => {
    const sfuOrigin = 'http://127.0.0.1:4567';
    const server = await startServer({ env: { SFU_BASE_URL: sfuOrigin } });
    await cleanupServer(t, server);

    const response = await server.request('/');

    assert.equal(response.status, 200);
    assert.match(
        response.headers['content-security-policy'],
        /frame-src 'self' http:\/\/127\.0\.0\.1:4567; object-src/
    );
    assert.equal(
        response.headers['permissions-policy'],
        `camera=(self "${sfuOrigin}"), microphone=(self "${sfuOrigin}"), display-capture=()`
    );
});

test('runtime config falls back to the default ICE servers', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const response = await server.request('/api/runtime-config');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.iceServers, DEFAULT_ICE_SERVERS);
    assert.equal(response.body.sfuBaseUrl, '');
    assert.equal(response.body.sfuAvailable, false);
    assert.deepEqual(response.body.supportedMediaModes, ['mesh']);
    assert.equal(response.body.meshParticipantLimit, 4);
    assert.doesNotMatch(JSON.stringify(response.body), /CLOUDFLARE|fake-secret-token|apiToken/);
});

test('runtime config exposes SFU availability when configured', async (t) => {
    const server = await startServer({ withFakeSfu: true });
    await cleanupServer(t, server);

    const response = await server.request('/api/runtime-config');

    assert.equal(response.status, 200);
    assert.equal(response.body.sfuAvailable, true);
    assert.equal(response.body.sfuBaseUrl, server.sfuBaseUrl);
    assert.deepEqual(response.body.supportedMediaModes, ['mesh', 'sfu']);
    assert.equal(response.body.meshParticipantLimit, 4);
});

test('persisted room state survives restart and protected join still validates passwords', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-persist');
    const schedule = buildFutureRiyadhSchedule({
        focusMinutes: 45,
        breakMinutes: 15,
        boardGoalTemplate: 'Protect the launch room'
    });
    let server = await startServer({ roomStateFile });
    let ownerSocket = null;
    let verifierSocket = null;

    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(verifierSocket);
        if (server) {
            await server.stop();
        }
        resetStateFile(roomStateFile);
    });

    // Scheduled rooms require an account, so the owner signs up first.
    const owner = await signupUser(server, { displayName: 'Owner' });
    ownerSocket = await connectSocket(server.baseUrl, {
        clientId: 'owner-client',
        extraHeaders: { Cookie: owner.cookie }
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Persistence Test Room',
        password: 'persist123',
        requirePassword: true,
        schedule
    });
    assert.equal(createRoom.ok, true);
    assert.equal(createRoom.room.schedule.cadence, schedule.cadence);
    assert.equal(createRoom.room.schedule.focusMinutes, 45);
    assert.equal(createRoom.room.schedule.breakMinutes, 15);

    const roomId = createRoom.room.roomId;
    assert.match(roomId, /^[A-Z0-9]{6}$/);

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'owner-client',
        password: 'persist123'
    });
    assert.equal(joinOwner.ok, true);
    assert.equal(joinOwner.room.schedule.attendance.joinedOnTimeCount, 1);
    assert.equal(joinOwner.room.board.goal, 'Protect the launch room');

    const sendMessage = await emitAck(ownerSocket, 'send-message', {
        roomId,
        text: 'Persistence integration message'
    });
    assert.equal(sendMessage.ok, true);

    const setGoal = await emitAck(ownerSocket, 'board-set-goal', {
        goal: 'Protect the room state'
    });
    assert.equal(setGoal.ok, true);

    const addTask = await emitAck(ownerSocket, 'board-add-task', {
        text: 'Confirm restart persistence',
        priority: 2
    });
    assert.equal(addTask.ok, true);

    await delay(400);
    await closeSocket(ownerSocket);
    ownerSocket = null;
    await server.stop();

    server = await startServer({ roomStateFile, resetStateFileOnStart: false });

    // Protected room: the public GET endpoint exposes only a safe preview and
    // must not leak persisted state (board, messages, schedule) before a
    // password-gated join. Persistence itself is verified via the valid join below.
    const preview = await server.request(`/api/rooms/${roomId}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.ok, true);
    assert.equal(preview.body.room.roomId, roomId);
    assert.equal(preview.body.room.protected, true);
    assert.equal(preview.body.room.requiresPassword, true);
    assert.equal(preview.body.board, undefined);
    assert.equal(preview.body.messages, undefined);
    assert.equal(preview.body.schedule, undefined);
    assert.equal(preview.body.room.board, undefined);
    assert.equal(preview.body.room.messages, undefined);
    assert.equal(preview.body.room.schedule, undefined);

    verifierSocket = await connectSocket(server.baseUrl, { clientId: 'verifier-client' });

    const invalidJoin = await emitAck(verifierSocket, 'join-room', {
        roomId,
        username: 'Verifier',
        clientId: 'verifier-client',
        password: 'wrongpass'
    });
    assert.equal(invalidJoin.ok, false);
    assert.equal(invalidJoin.errorCode, 'ROOM_PASSWORD_INVALID');

    const validJoin = await emitAck(verifierSocket, 'join-room', {
        roomId,
        username: 'Verifier',
        clientId: 'verifier-client',
        password: 'persist123'
    });
    assert.equal(validJoin.ok, true);
    assert.equal(validJoin.room.board.goal, 'Protect the room state');
    assert.equal(validJoin.room.board.tasks[0].text, 'Confirm restart persistence');
    assert.equal(validJoin.room.schedule.focusMinutes, 45);
    // Persistence across restart is proven through the password-verified join,
    // which legitimately returns full room state (formerly asserted via GET).
    assert.equal(validJoin.room.schedule.cadence, schedule.cadence);
    assert.equal(validJoin.room.schedule.breakMinutes, 15);
    assert.equal(validJoin.room.schedule.boardGoalTemplate, 'Protect the launch room');
    assert.equal(validJoin.room.board.tasks.length, 1);
    assert.ok(validJoin.room.messages.some((message) => message.text === 'Persistence integration message'));
});

test('scheduled rooms validate create payloads and expose schedule summaries', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const owner = await signupUser(server, { displayName: 'Scheduler' });
    const ownerSocket = await connectSocket(server.baseUrl, {
        clientId: 'schedule-owner',
        extraHeaders: { Cookie: owner.cookie }
    });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    // Guests cannot create scheduled rooms at all.
    const guestSocket = await connectSocket(server.baseUrl, { clientId: 'schedule-guest' });
    t.after(async () => {
        await closeSocket(guestSocket);
    });
    const guestScheduleCreate = await emitAck(guestSocket, 'create-room', {
        roomName: 'Guest Schedule Room',
        schedule: buildFutureRiyadhSchedule()
    });
    assert.equal(guestScheduleCreate.ok, false);
    assert.equal(guestScheduleCreate.errorCode, 'AUTH_REQUIRED_FOR_SCHEDULED');

    const invalidScheduleCreate = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Broken Schedule Room',
        schedule: {
            startDate: '2026-02-31',
            startTime: '25:99',
            cadence: 'weekdays'
        }
    });
    assert.equal(invalidScheduleCreate.ok, false);
    assert.equal(invalidScheduleCreate.errorCode, 'SCHEDULE_INVALID');

    const futureSchedule = buildFutureRiyadhSchedule({
        focusMinutes: 60,
        breakMinutes: 15,
        boardGoalTemplate: 'Finish the board for launch week'
    });
    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Scheduled Focus Room',
        schedule: futureSchedule
    });
    assert.equal(createRoom.ok, true);
    assert.equal(createRoom.room.schedule.cadence, futureSchedule.cadence);
    assert.equal(createRoom.room.schedule.boardGoalTemplate, 'Finish the board for launch week');
    assert.equal(typeof createRoom.room.schedule.nextOccurrenceAt, 'number');
    assert.equal(createRoom.room.board.goal, 'Finish the board for launch week');

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId: createRoom.room.roomId,
        username: 'Scheduler',
        clientId: 'schedule-owner'
    });
    assert.equal(joinOwner.ok, true);
    assert.equal(joinOwner.room.schedule.attendance.joinedOnTimeCount, 1);
    assert.equal(joinOwner.room.schedule.attendance.currentStreak, 1);

    const snapshot = await server.request(`/api/rooms/${createRoom.room.roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.schedule.focusMinutes, 60);
    assert.equal(snapshot.body.schedule.breakMinutes, 15);
});

test('media mode validation persists and SFU rooms fail clearly if the deployment loses SFU support', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-media-mode');
    let server = await startServer({
        roomStateFile,
        withFakeSfu: true
    });
    let ownerSocket = null;
    let verifierSocket = null;

    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(verifierSocket);
        if (server) {
            await server.stop();
        }
        resetStateFile(roomStateFile);
    });

    ownerSocket = await connectSocket(server.baseUrl, { clientId: 'media-owner' });

    const invalidCreate = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Invalid Media Room',
        mediaMode: 'big-room'
    });
    assert.equal(invalidCreate.ok, false);
    assert.equal(invalidCreate.errorCode, 'ROOM_MEDIA_MODE_INVALID');

    const sfuCreate = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Large Room',
        mediaMode: 'sfu'
    });
    assert.equal(sfuCreate.ok, true);
    assert.equal(sfuCreate.room.mediaMode, 'sfu');
    const roomId = sfuCreate.room.roomId;

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'media-owner'
    });
    assert.equal(joinOwner.ok, true);
    assert.equal(joinOwner.room.mediaMode, 'sfu');
    assert.equal(joinOwner.room.participantLimit, null);

    await delay(400);
    await closeSocket(ownerSocket);
    ownerSocket = null;
    await server.stop();

    server = await startServer({
        roomStateFile,
        resetStateFileOnStart: false
    });

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.mediaMode, 'sfu');
    assert.equal(snapshot.body.participantLimit, null);

    verifierSocket = await connectSocket(server.baseUrl, { clientId: 'media-verifier' });
    const unavailableJoin = await emitAck(verifierSocket, 'join-room', {
        roomId,
        username: 'Verifier',
        clientId: 'media-verifier'
    });
    assert.equal(unavailableJoin.ok, false);
    assert.equal(unavailableJoin.errorCode, 'ROOM_MEDIA_UNAVAILABLE');
});

test('startup fails fast for malformed room state and invalid env config', async () => {
    const malformedStateFile = makeTempStateFile('co-study-malformed');
    fs.writeFileSync(malformedStateFile, '{ not valid json', 'utf8');

    try {
        await expectStartFailure({
            roomStateFile: malformedStateFile,
            resetStateFileOnStart: false
        }, /Failed to load room state/);

        await expectStartFailure({
            env: { TRUST_PROXY: '2' }
        }, /TRUST_PROXY/);

        await expectStartFailure({
            env: { ALLOWED_ORIGINS: 'notaurl' }
        }, /ALLOWED_ORIGINS/);

        await expectStartFailure({
            env: { SFU_BASE_URL: 'not-a-url' }
        }, /SFU_BASE_URL/);

        await expectStartFailure({
            env: {
                NODE_ENV: 'production',
                VIDEO_PROVIDER: 'realtimekit',
                CLOUDFLARE_ACCOUNT_ID: '',
                CLOUDFLARE_REALTIMEKIT_APP_ID: '',
                CLOUDFLARE_REALTIMEKIT_API_TOKEN: ''
            }
        }, /RealtimeKit is selected/);

        const badParent = makeTempStateFile('co-study-state-parent');
        fs.writeFileSync(badParent, 'file-not-dir', 'utf8');
        await expectStartFailure({
            env: { ROOM_STATE_FILE: path.join(badParent, 'rooms.json') }
        }, /EEXIST|ENOTDIR|Room state/i);
        resetStateFile(badParent);
    } finally {
        resetStateFile(malformedStateFile);
    }
});

test('RealtimeKit video token endpoint issues safe participant tokens after room join', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Room'
    });
    assert.equal(createRoom.ok, true);
    assert.equal(createRoom.room.videoProvider, 'realtimekit');

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId: createRoom.room.roomId,
        username: 'Owner',
        clientId: 'rtk-owner'
    });
    assert.equal(joinOwner.ok, true);
    assert.equal(joinOwner.room.videoProvider, 'realtimekit');
    assert.equal(joinOwner.room.videoPolicy.maxRoomParticipants, 20);
    assert.equal(joinOwner.room.videoPolicy.recordingEnabled, false);

    const token = await issueVideoToken(server, createRoom.room.roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-owner',
        role: 'student'
    });

    assert.equal(token.status, 200);
    assert.equal(token.body.ok, true);
    assert.equal(token.body.provider, 'realtimekit');
    assert.equal(token.body.authToken, 'auth_participant_1');
    assert.equal(token.body.policy.micDefaultEnabled, false);
    assert.equal(token.body.policy.recordingEnabled, false);
    assert.doesNotMatch(JSON.stringify(token.body), /fake-secret-token/);

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 1);
    assert.equal(fakeState.participants.length, 1);
    assert.equal(fakeState.participants[0].body.preset_name, 'halastudy_student');
    assert.equal(fakeState.participants[0].body.custom_participant_id, 'rtk-owner');
});

test('RealtimeKit video token endpoint rejects invalid or unauthorized requests cleanly', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-auth-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Auth Room'
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const missingRoom = await issueVideoToken(server, 'NOPE99', {
        displayName: 'Owner',
        clientSessionId: 'rtk-auth-owner',
        role: 'student'
    });
    assert.equal(missingRoom.status, 404);
    assert.equal(missingRoom.body.errorCode, 'ROOM_NOT_FOUND');

    const notJoined = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-auth-owner',
        role: 'student'
    });
    assert.equal(notJoined.status, 403);
    assert.equal(notJoined.body.errorCode, 'ROOM_NOT_JOINED');

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-auth-owner'
    });
    assert.equal(joinOwner.ok, true);

    const invalidRole = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-auth-owner',
        role: 'host'
    });
    assert.equal(invalidRole.status, 400);
    assert.equal(invalidRole.body.errorCode, 'VIDEO_REQUEST_INVALID');

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 0);
    assert.equal(fakeState.participants.length, 0);
});

test('RealtimeKit caps reject before provider participant creation', async (t) => {
    const server = await startServer({
        withFakeRealtimeKit: true,
        env: {
            MAX_GLOBAL_VIDEO_PARTICIPANTS: '1',
            MAX_ROOM_VIDEO_PARTICIPANTS: '1'
        }
    });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-cap-owner' });
    const peerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-cap-peer' });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(peerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Cap Room'
    });
    const roomId = createRoom.room.roomId;
    assert.equal(createRoom.ok, true);

    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-cap-owner'
    });
    const peerJoin = await emitAck(peerSocket, 'join-room', {
        roomId,
        username: 'Peer',
        clientId: 'rtk-cap-peer'
    });
    assert.equal(ownerJoin.ok, true);
    assert.equal(peerJoin.ok, true);

    const firstToken = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-cap-owner',
        role: 'student'
    });
    assert.equal(firstToken.status, 200);

    const blockedToken = await issueVideoToken(server, roomId, {
        displayName: 'Peer',
        clientSessionId: 'rtk-cap-peer',
        role: 'student'
    });
    assert.equal(blockedToken.status, 409);
    assert.equal(blockedToken.body.errorCode, 'GLOBAL_VIDEO_LIMIT_REACHED');

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 1);
    assert.equal(fakeState.participants.length, 1);
});

test('RealtimeKit room cap rejects before provider participant creation', async (t) => {
    const server = await startServer({
        withFakeRealtimeKit: true,
        env: {
            MAX_GLOBAL_VIDEO_PARTICIPANTS: '20',
            MAX_ROOM_VIDEO_PARTICIPANTS: '1'
        }
    });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-room-cap-owner' });
    const peerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-room-cap-peer' });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(peerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Room Cap'
    });
    const roomId = createRoom.room.roomId;
    await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-room-cap-owner'
    });
    await emitAck(peerSocket, 'join-room', {
        roomId,
        username: 'Peer',
        clientId: 'rtk-room-cap-peer'
    });

    const firstToken = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-room-cap-owner',
        role: 'student'
    });
    assert.equal(firstToken.status, 200);

    const blockedToken = await issueVideoToken(server, roomId, {
        displayName: 'Peer',
        clientSessionId: 'rtk-room-cap-peer',
        role: 'student'
    });
    assert.equal(blockedToken.status, 409);
    assert.equal(blockedToken.body.errorCode, 'ROOM_FULL');

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 1);
    assert.equal(fakeState.participants.length, 1);
});

test('RealtimeKit provider failures release capacity and hide provider internals', async (t) => {
    const server = await startServer({
        withFakeRealtimeKit: true,
        fakeRealtimeKitOptions: { failParticipants: true }
    });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-fail-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Failure Room'
    });
    const roomId = createRoom.room.roomId;
    await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-fail-owner'
    });

    const failed = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-fail-owner',
        role: 'student'
    });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.errorCode, 'VIDEO_PROVIDER_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(failed.body), /Fake participant failure|fake-secret-token/);

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.activeVideoParticipantCount, 0);

    const logs = server.logs();
    assert.doesNotMatch(`${logs.stdout}\n${logs.stderr}`, /fake-secret-token/);
});

test('RealtimeKit meeting metadata persists and is reused after restart', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-rtk-persist');
    let server = await startServer({ roomStateFile, withFakeRealtimeKit: true });
    let ownerSocket = null;
    let verifierSocket = null;

    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(verifierSocket);
        if (server) {
            await server.stop();
        }
        resetStateFile(roomStateFile);
    });

    ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-persist-owner' });
    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Persist Room'
    });
    const roomId = createRoom.room.roomId;
    await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-persist-owner'
    });
    const firstToken = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-persist-owner',
        role: 'student'
    });
    assert.equal(firstToken.status, 200);
    assert.equal(firstToken.body.meetingId, 'meeting_1');

    await delay(400);
    await closeSocket(ownerSocket);
    ownerSocket = null;
    await server.stop();

    server = await startServer({
        roomStateFile,
        resetStateFileOnStart: false,
        withFakeRealtimeKit: true
    });
    verifierSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-persist-verifier' });
    const verifierJoin = await emitAck(verifierSocket, 'join-room', {
        roomId,
        username: 'Verifier',
        clientId: 'rtk-persist-verifier'
    });
    assert.equal(verifierJoin.ok, true);
    assert.equal(verifierJoin.room.videoProvider, 'realtimekit');

    const secondToken = await issueVideoToken(server, roomId, {
        displayName: 'Verifier',
        clientSessionId: 'rtk-persist-verifier',
        role: 'student'
    });
    assert.equal(secondToken.status, 200);
    assert.equal(secondToken.body.meetingId, 'meeting_1');

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 0);
    assert.equal(fakeState.participants.length, 1);
});

test('RealtimeKit expired idle meeting metadata is recycled for reusable rooms', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-rtk-recycle');
    const roomId = 'OLD123';
    fs.writeFileSync(roomStateFile, `${JSON.stringify([{
        id: roomId,
        name: 'Old Scheduled Room',
        requirePassword: false,
        mediaMode: 'mesh',
        videoProvider: 'realtimekit',
        videoProviderMeetingId: 'old_meeting',
        videoProviderMeetingCreatedAt: Date.now() - (5 * 60 * 1000),
        videoProviderStatus: 'active',
        videoPolicy: {
            maxParticipants: 20,
            recordingEnabled: false,
            screenshareEnabled: false,
            micDefaultEnabled: false
        },
        createdAt: Date.now() - (24 * 60 * 60 * 1000),
        messages: [],
        board: { goal: '', tasks: [] },
        schedule: null
    }], null, 2)}\n`, 'utf8');

    const server = await startServer({
        roomStateFile,
        resetStateFileOnStart: false,
        withFakeRealtimeKit: true,
        env: {
            MAX_ROOM_DURATION_MINUTES: '1'
        }
    });
    await cleanupServer(t, server, [roomStateFile]);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-recycle-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-recycle-owner'
    });
    assert.equal(joinOwner.ok, true);

    const token = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-recycle-owner',
        role: 'student'
    });
    assert.equal(token.status, 200);
    assert.equal(token.body.meetingId, 'meeting_1');

    const fakeState = await server.realtimeKitState();
    assert.equal(fakeState.meetings.length, 1);
    assert.equal(fakeState.participants.length, 1);
});

test('RealtimeKit heartbeat, leave, and socket disconnect update active video counts', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-life-owner' });
    const peerSocket = await connectSocket(server.baseUrl, { clientId: 'rtk-life-peer' });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(peerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'RealtimeKit Lifecycle Room'
    });
    const roomId = createRoom.room.roomId;
    await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'rtk-life-owner'
    });
    await emitAck(peerSocket, 'join-room', {
        roomId,
        username: 'Peer',
        clientId: 'rtk-life-peer'
    });

    const token = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'rtk-life-owner',
        role: 'student'
    });
    assert.equal(token.status, 200);

    const heartbeat = await server.request(`/api/rooms/${roomId}/video-heartbeat`, {
        method: 'POST',
        body: {
            clientSessionId: 'rtk-life-owner'
        }
    });
    assert.equal(heartbeat.status, 200);
    assert.equal(heartbeat.body.activeRoomVideoParticipants, 1);

    const leave = await server.request(`/api/rooms/${roomId}/video-leave`, {
        method: 'POST',
        body: {
            clientSessionId: 'rtk-life-owner'
        }
    });
    assert.equal(leave.status, 200);
    assert.equal(leave.body.activeRoomVideoParticipants, 0);

    const peerToken = await issueVideoToken(server, roomId, {
        displayName: 'Peer',
        clientSessionId: 'rtk-life-peer',
        role: 'student'
    });
    assert.equal(peerToken.status, 200);
    await closeSocket(peerSocket);
    await delay(100);

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.activeVideoParticipantCount, 0);
});

test('mesh rooms enforce participant caps while allowing same-identity reconnects at capacity', async (t) => {
    const server = await startServer({ env: { VIDEO_PROVIDER: 'mesh' } });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-owner' });
    const peerOneSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-peer-1' });
    const peerTwoSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-peer-2' });
    const peerThreeSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-peer-3' });
    const blockedSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-peer-4' });
    const reconnectSocket = await connectSocket(server.baseUrl, { clientId: 'mesh-owner' });

    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(peerOneSocket);
        await closeSocket(peerTwoSocket);
        await closeSocket(peerThreeSocket);
        await closeSocket(blockedSocket);
        await closeSocket(reconnectSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Mesh Cap Room',
        mediaMode: 'mesh'
    });
    assert.equal(createRoom.ok, true);
    assert.equal(createRoom.room.mediaMode, 'mesh');
    const roomId = createRoom.room.roomId;

    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'mesh-owner'
    });
    const peerOneJoin = await emitAck(peerOneSocket, 'join-room', {
        roomId,
        username: 'Peer One',
        clientId: 'mesh-peer-1'
    });
    const peerTwoJoin = await emitAck(peerTwoSocket, 'join-room', {
        roomId,
        username: 'Peer Two',
        clientId: 'mesh-peer-2'
    });
    const peerThreeJoin = await emitAck(peerThreeSocket, 'join-room', {
        roomId,
        username: 'Peer Three',
        clientId: 'mesh-peer-3'
    });

    assert.equal(ownerJoin.ok, true);
    assert.equal(ownerJoin.room.mediaMode, 'mesh');
    assert.equal(ownerJoin.room.participantLimit, 4);
    assert.equal(peerOneJoin.ok, true);
    assert.equal(peerTwoJoin.ok, true);
    assert.equal(peerThreeJoin.ok, true);

    const blockedJoin = await emitAck(blockedSocket, 'join-room', {
        roomId,
        username: 'Blocked Peer',
        clientId: 'mesh-peer-4'
    });
    assert.equal(blockedJoin.ok, false);
    assert.equal(blockedJoin.errorCode, 'ROOM_FULL');

    const reconnectJoin = await emitAck(reconnectSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'mesh-owner'
    });
    assert.equal(reconnectJoin.ok, true);
    assert.equal(reconnectJoin.room.mediaMode, 'mesh');
    assert.equal(reconnectJoin.room.participantLimit, 4);
    assert.equal(reconnectJoin.room.participantCount, 4);
});

test('large-room creation is rejected when SFU support is not configured', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'no-sfu-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'No SFU Room',
        mediaMode: 'sfu'
    });

    assert.equal(createRoom.ok, false);
    assert.equal(createRoom.errorCode, 'ROOM_MEDIA_UNAVAILABLE');
});

test('rate limits protect room lookup, create, password attempts, chat, and board mutations', async (t) => {
    const server = await startServer({
        env: { TRUST_PROXY: '1' }
    });
    await cleanupServer(t, server);

    const ownerHeaders = { 'X-Forwarded-For': '198.51.100.10' };
    const intruderHeaders = { 'X-Forwarded-For': '198.51.100.20' };

    const ownerSocket = await connectSocket(server.baseUrl, {
        clientId: 'room-owner',
        extraHeaders: ownerHeaders
    });
    const createProtectedRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Protected Limit Room',
        password: 'limit123',
        requirePassword: true
    });
    assert.equal(createProtectedRoom.ok, true);
    const roomId = createProtectedRoom.room.roomId;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const createRoom = await emitAck(ownerSocket, 'create-room', {
            roomName: `Rate Limited Room ${attempt}`
        });
        assert.equal(createRoom.ok, true);
    }

    const blockedCreate = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Rate Limited Room blocked'
    });
    assert.equal(blockedCreate.ok, false);
    assert.equal(blockedCreate.errorCode, 'RATE_LIMITED');

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await server.request(`/api/rooms/${roomId}`, {
            headers: ownerHeaders
        });
        assert.equal(response.status, 200);
    }
    const limitedLookup = await server.request(`/api/rooms/${roomId}`, {
        headers: ownerHeaders
    });
    assert.equal(limitedLookup.status, 429);
    assert.equal(limitedLookup.body.errorCode, 'RATE_LIMITED');

    const intruderSocket = await connectSocket(server.baseUrl, {
        clientId: 'intruder',
        extraHeaders: intruderHeaders
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrongJoin = await emitAck(intruderSocket, 'join-room', {
            roomId,
            username: 'Intruder',
            clientId: 'intruder',
            password: 'wrongpass'
        });
        assert.equal(wrongJoin.ok, false);
        assert.equal(wrongJoin.errorCode, 'ROOM_PASSWORD_INVALID');
    }
    const blockedJoin = await emitAck(intruderSocket, 'join-room', {
        roomId,
        username: 'Intruder',
        clientId: 'intruder',
        password: 'wrongpass'
    });
    assert.equal(blockedJoin.ok, false);
    assert.equal(blockedJoin.errorCode, 'RATE_LIMITED');

    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'room-owner',
        password: 'limit123'
    });
    assert.equal(ownerJoin.ok, true);

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const messageAck = await emitAck(ownerSocket, 'send-message', {
            roomId,
            text: `Message ${attempt}`
        });
        assert.equal(messageAck.ok, true);
    }
    const blockedMessage = await emitAck(ownerSocket, 'send-message', {
        roomId,
        text: 'Blocked message'
    });
    assert.equal(blockedMessage.ok, false);
    assert.equal(blockedMessage.errorCode, 'RATE_LIMITED');

    for (let attempt = 0; attempt < 40; attempt += 1) {
        const boardAck = await emitAck(ownerSocket, 'board-set-goal', {
            goal: `Goal ${attempt}`
        });
        assert.equal(boardAck.ok, true);
    }
    const blockedBoard = await emitAck(ownerSocket, 'board-set-goal', {
        goal: 'Blocked goal'
    });
    assert.equal(blockedBoard.ok, false);
    assert.equal(blockedBoard.errorCode, 'RATE_LIMITED');

    await closeSocket(ownerSocket);
    await closeSocket(intruderSocket);
});

test('socket payloads are bounded at server boundaries', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'bounds-owner' });
    const peerSocket = await connectSocket(server.baseUrl, { clientId: 'bounds-peer' });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(peerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Payload Bounds Room'
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const oversizedName = `  ${'Aziz'.repeat(20)}  `;
    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: oversizedName,
        clientId: 'bounds-owner'
    });
    assert.equal(ownerJoin.ok, true);
    assert.equal(ownerJoin.room.participants[0].name.length, 20);
    assert.equal(ownerJoin.room.participants[0].name, oversizedName.trim().slice(0, 20));

    const peerJoin = await emitAck(peerSocket, 'join-room', {
        roomId,
        username: 'Peer',
        clientId: 'bounds-peer'
    });
    assert.equal(peerJoin.ok, true);

    const receivedMessages = [];
    peerSocket.on('chat-message', (message) => {
        receivedMessages.push(message);
    });

    const oversizedMessage = `  ${'m'.repeat(600)}  `;
    const sendMessage = await emitAck(ownerSocket, 'send-message', {
        roomId,
        text: oversizedMessage
    });
    assert.equal(sendMessage.ok, true);

    const broadcastDeadline = Date.now() + 5000;
    while (!receivedMessages.some((message) => message.type === 'user') && Date.now() < broadcastDeadline) {
        await delay(10);
    }
    const userMessage = receivedMessages.find((message) => message.type === 'user');
    assert.ok(userMessage);
    assert.equal(userMessage.text.length, 500);
    assert.equal(userMessage.text, oversizedMessage.trim().slice(0, 500));

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.participants[0].name.length, 20);
    assert.ok(snapshot.body.messages.some((message) => message.type === 'user' && message.text.length === 500));
});

test('privacy page is served bilingually and linked from landing and open footers', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const privacy = await server.request('/privacy');
    assert.equal(privacy.status, 200);
    assert.match(`${privacy.headers['content-type']}`, /text\/html/);
    assert.match(`${privacy.body}`, /lang="ar"/);
    assert.match(`${privacy.body}`, /سياسة الخصوصية/);
    assert.match(`${privacy.body}`, /Privacy Policy/);

    const privacyAlias = await server.request('/privacy.html');
    assert.equal(privacyAlias.status, 200);

    const landing = await server.request('/');
    assert.match(`${landing.body}`, /href="\/privacy"/);

    const open = await server.request('/open');
    assert.match(`${open.body}`, /href="\/privacy"/);
});

test('open alias and media mounts serve published assets only', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const openPage = await server.request('/open');
    assert.equal(openPage.status, 200);
    assert.match(`${openPage.body}`, /id="create-form"/);

    const poster = await server.request('/videos/hero/01-saud-poster.jpg');
    assert.equal(poster.status, 200);
    assert.match(`${poster.headers['content-type']}`, /image\/jpeg/);
    assert.match(`${poster.headers['cache-control']}`, /max-age=\d+/);

    const sourceFootage = await server.request('/videos/hero/source/raw-clip.mp4');
    assert.equal(sourceFootage.status, 404);
});

test('sanitizers strip invisible characters and reject non-string payloads', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'invisible-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Invisible Input Room'
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const numericName = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 123,
        clientId: 'invisible-owner'
    });
    assert.equal(numericName.ok, false);
    assert.equal(numericName.errorCode, 'NICKNAME_REQUIRED');

    const invisibleName = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: '\u200B\u200B\u202E\u200F',
        clientId: 'invisible-owner'
    });
    assert.equal(invisibleName.ok, false);
    assert.equal(invisibleName.errorCode, 'NICKNAME_REQUIRED');

    const bidiName = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'evil\u202Etxt',
        clientId: 'invisible-owner'
    });
    assert.equal(bidiName.ok, true);
    assert.equal(bidiName.room.participants[0].name, 'eviltxt');

    const objectMessage = await emitAck(ownerSocket, 'send-message', {
        roomId,
        text: { nested: 'payload' }
    });
    assert.equal(objectMessage.ok, false);
    assert.equal(objectMessage.errorCode, 'MESSAGE_REQUIRED');

    const emojiMessage = await emitAck(ownerSocket, 'send-message', {
        roomId,
        text: '\u{1F3AF}'.repeat(600)
    });
    assert.equal(emojiMessage.ok, true);

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    const emojiStored = snapshot.body.messages.find((message) => message.type === 'user');
    assert.ok(emojiStored);
    // Truncation counts code points and never leaves a lone surrogate.
    assert.equal(Array.from(emojiStored.text).length, 500);
    assert.doesNotMatch(emojiStored.text, /[\uD800-\uDBFF]$/);
});

test('secure cookies honor trusted HTTPS proxy headers only', async (t) => {
    const secureServer = await startServer({
        env: { TRUST_PROXY: '1' }
    });
    await cleanupServer(t, secureServer);

    const secureResponse = await secureServer.request('/', {
        headers: {
            'X-Forwarded-Proto': 'https'
        }
    });
    const secureCookie = `${secureResponse.headers['set-cookie'] || ''}`;
    assert.match(secureCookie, /Secure/);

    const plainServer = await startServer();
    await cleanupServer(t, plainServer);
    const plainResponse = await plainServer.request('/');
    const plainCookie = `${plainResponse.headers['set-cookie'] || ''}`;
    assert.doesNotMatch(plainCookie, /Secure/);
});

test('socket origin checks only honor forwarded protocol when proxy trust is enabled', async (t) => {
    const plainServer = await startServer();
    await cleanupServer(t, plainServer);

    await assert.rejects(
        async () => {
            await connectSocket(plainServer.baseUrl, {
                clientId: 'spoofed-origin',
                extraHeaders: {
                    Origin: `https://127.0.0.1:${plainServer.port}`,
                    'X-Forwarded-Proto': 'https'
                }
            });
        },
        // Pin the handshake rejection specifically — a boot race or wrong
        // port would also reject, which must not satisfy this test.
        /websocket error|403/i
    );

    const trustedServer = await startServer({
        env: { TRUST_PROXY: '1' }
    });
    await cleanupServer(t, trustedServer);

    const trustedSocket = await connectSocket(trustedServer.baseUrl, {
        clientId: 'trusted-origin',
        extraHeaders: {
            Origin: `https://127.0.0.1:${trustedServer.port}`,
            'X-Forwarded-Proto': 'https'
        }
    });
    await closeSocket(trustedSocket);
});

test('backup restore tooling and deploy verification work against the HTTP app', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-backup');
    const backupDir = `${roomStateFile}.backups`;
    let server = await startServer({
        roomStateFile,
        env: {
            ROOM_STATE_BACKUP_DIR: backupDir
        }
    });

    t.after(async () => {
        if (server) {
            await server.stop();
        }
        resetStateFile(roomStateFile);
        fs.rmSync(backupDir, { recursive: true, force: true });
    });

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'backup-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Backup Room',
        password: 'backup123',
        requirePassword: true
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'backup-owner',
        password: 'backup123'
    });
    assert.equal(ownerJoin.ok, true);

    assert.equal((await emitAck(ownerSocket, 'send-message', { roomId, text: 'Backup message' })).ok, true);
    assert.equal((await emitAck(ownerSocket, 'board-set-goal', { goal: 'Backup goal' })).ok, true);
    await delay(400);

    const verifyBeforeStop = runNodeScript('scripts/verify-deploy.js', [server.baseUrl]);
    assert.equal(verifyBeforeStop.status, 0, verifyBeforeStop.stderr);

    await server.stop();
    server = null;

    const backupResult = runNodeScript('scripts/backup-rooms.js', [], {
        env: {
            ROOM_STATE_FILE: roomStateFile,
            ROOM_STATE_BACKUP_DIR: backupDir
        }
    });
    assert.equal(backupResult.status, 0, backupResult.stderr);
    const backupFiles = fs.readdirSync(backupDir).filter((entry) => entry.endsWith('.backup.json'));
    assert.equal(backupFiles.length, 1);

    fs.writeFileSync(roomStateFile, '[]\n', 'utf8');

    const restoreResult = runNodeScript('scripts/restore-rooms.js', [path.join(backupDir, backupFiles[0])], {
        env: {
            ROOM_STATE_FILE: roomStateFile,
            ROOM_STATE_BACKUP_DIR: backupDir
        }
    });
    assert.equal(restoreResult.status, 0, restoreResult.stderr);
    assert.match(restoreResult.stdout, /Pre-restore safety backup/);

    server = await startServer({
        roomStateFile,
        resetStateFileOnStart: false,
        env: {
            ROOM_STATE_BACKUP_DIR: backupDir
        }
    });

    // Backup/restore persisted the protected room. The GET endpoint now returns
    // only a safe preview, so verify the restored board + messages through a
    // password-gated join (the authenticated path that legitimately sees state).
    const restoredPreview = await server.request(`/api/rooms/${roomId}`);
    assert.equal(restoredPreview.status, 200);
    assert.equal(restoredPreview.body.room.protected, true);
    assert.equal(restoredPreview.body.board, undefined);

    const restoredSocket = await connectSocket(server.baseUrl, { clientId: 'backup-owner' });
    const restoredJoin = await emitAck(restoredSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'backup-owner',
        password: 'backup123'
    });
    await closeSocket(restoredSocket);
    assert.equal(restoredJoin.ok, true);
    assert.equal(restoredJoin.room.board.goal, 'Backup goal');
    assert.ok(restoredJoin.room.messages.some((message) => message.text === 'Backup message'));

    const verifyAfterRestore = runNodeScript('scripts/verify-deploy.js', [server.baseUrl]);
    assert.equal(verifyAfterRestore.status, 0, verifyAfterRestore.stderr);

    const verifyFailure = runNodeScript('scripts/verify-deploy.js', ['http://127.0.0.1:9']);
    assert.notEqual(verifyFailure.status, 0);
});

test('per-user session goal rides on user-status: sanitized, broadcast, and hidden with status', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const aliceSocket = await connectSocket(server.baseUrl, { clientId: 'goal-alice' });
    const bobSocket = await connectSocket(server.baseUrl, { clientId: 'goal-bob' });
    t.after(async () => {
        await closeSocket(aliceSocket);
        await closeSocket(bobSocket);
    });

    const createRoom = await emitAck(aliceSocket, 'create-room', { roomName: 'Goal Room' });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    assert.equal((await emitAck(aliceSocket, 'join-room', { roomId, username: 'Alice', clientId: 'goal-alice' })).ok, true);

    // Bob listens for Alice's status broadcast before she emits it.
    const statusReceived = new Promise((resolve) => {
        bobSocket.on('status-update', (payload) => {
            if (payload?.status?.goal) resolve(payload);
        });
    });
    assert.equal((await emitAck(bobSocket, 'join-room', { roomId, username: 'Bob', clientId: 'goal-bob' })).ok, true);

    const setStatus = await emitAck(aliceSocket, 'user-status', {
        status: { text: 'Studying', visible: true, goal: 'Solve 25 quant questions' }
    });
    assert.equal(setStatus.ok, true);

    const broadcast = await statusReceived;
    assert.equal(broadcast.status.goal, 'Solve 25 quant questions');

    // Join snapshot carries the goal for late joiners.
    const carolSocket = await connectSocket(server.baseUrl, { clientId: 'goal-carol' });
    t.after(async () => {
        await closeSocket(carolSocket);
    });
    const carolJoin = await emitAck(carolSocket, 'join-room', { roomId, username: 'Carol', clientId: 'goal-carol' });
    assert.equal(carolJoin.ok, true);
    const aliceRecord = carolJoin.room.participants.find((p) => p.name === 'Alice');
    assert.equal(aliceRecord.status.goal, 'Solve 25 quant questions');

    // Over-long goals are truncated to 80 code points at the trust boundary,
    // and bidi overrides (U+202E) are stripped like other user text.
    const nextStatusUpdate = () => new Promise((resolve) => {
        bobSocket.once('status-update', resolve);
    });

    let pending = nextStatusUpdate();
    assert.equal((await emitAck(aliceSocket, 'user-status', {
        status: { text: '', visible: true, goal: 'g'.repeat(120) }
    })).ok, true);
    assert.equal((await pending).status.goal.length, 80);

    pending = nextStatusUpdate();
    assert.equal((await emitAck(aliceSocket, 'user-status', {
        status: { text: '', visible: true, goal: `${'‮'}reversed goal` }
    })).ok, true);
    assert.equal((await pending).status.goal, 'reversed goal');

    // Hidden status blanks the goal server-side (privacy contract).
    assert.equal((await emitAck(aliceSocket, 'user-status', {
        status: { text: 'secret', visible: false, goal: 'secret goal' }
    })).ok, true);

    const daveSocket = await connectSocket(server.baseUrl, { clientId: 'goal-dave' });
    t.after(async () => {
        await closeSocket(daveSocket);
    });
    const daveJoin = await emitAck(daveSocket, 'join-room', { roomId, username: 'Dave', clientId: 'goal-dave' });
    assert.equal(daveJoin.ok, true);
    const hiddenAlice = daveJoin.room.participants.find((p) => p.name === 'Alice');
    assert.equal(hiddenAlice.status.goal, '');
    assert.equal(hiddenAlice.status.text, '');
    assert.equal(hiddenAlice.status.visible, false);
});

test('report-user validates targets, rate limits, persists sanitized, and never leaks to clients', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-reports');
    const server = await startServer({ roomStateFile });
    await cleanupServer(t, server, [roomStateFile]);

    const reporterSocket = await connectSocket(server.baseUrl, { clientId: 'rpt-reporter' });
    const targetSocket = await connectSocket(server.baseUrl, { clientId: 'rpt-target' });
    t.after(async () => {
        await closeSocket(reporterSocket);
        await closeSocket(targetSocket);
    });

    const createRoom = await emitAck(reporterSocket, 'create-room', { roomName: 'Report Room' });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    // Reporting before joining a room is rejected.
    const notJoined = await emitAck(reporterSocket, 'report-user', { targetId: 'whatever' });
    assert.equal(notJoined.ok, false);
    assert.equal(notJoined.errorCode, 'ROOM_NOT_JOINED');

    assert.equal((await emitAck(reporterSocket, 'join-room', { roomId, username: 'Reporter', clientId: 'rpt-reporter' })).ok, true);
    assert.equal((await emitAck(targetSocket, 'join-room', { roomId, username: 'Target', clientId: 'rpt-target' })).ok, true);

    // Unknown target and self-report are rejected.
    const unknownTarget = await emitAck(reporterSocket, 'report-user', { targetId: 'not-a-socket-id' });
    assert.equal(unknownTarget.errorCode, 'PARTICIPANT_NOT_FOUND');
    const selfReport = await emitAck(reporterSocket, 'report-user', { targetId: reporterSocket.id });
    assert.equal(selfReport.errorCode, 'CANNOT_REPORT_SELF');

    // Valid report: bad reason falls back to 'other', detail is truncated.
    const firstReport = await emitAck(reporterSocket, 'report-user', {
        targetId: targetSocket.id,
        reason: 'not-a-real-reason',
        detail: 'd'.repeat(300)
    });
    assert.equal(firstReport.ok, true);
    assert.match(firstReport.reportId, /^rpt-/);

    // Reports never appear in client-facing snapshots.
    const witnessSocket = await connectSocket(server.baseUrl, { clientId: 'rpt-witness' });
    t.after(async () => {
        await closeSocket(witnessSocket);
    });
    const witnessJoin = await emitAck(witnessSocket, 'join-room', { roomId, username: 'Witness', clientId: 'rpt-witness' });
    assert.equal(witnessJoin.ok, true);
    assert.equal(witnessJoin.room.reports, undefined);
    const publicGet = await server.request(`/api/rooms/${roomId}`);
    assert.equal(publicGet.status, 200);
    assert.doesNotMatch(JSON.stringify(publicGet.body), /reports|rpt-/);

    // Rate limit: 3 reports per window, the 4th is rejected.
    assert.equal((await emitAck(reporterSocket, 'report-user', { targetId: targetSocket.id, reason: 'spam' })).ok, true);
    assert.equal((await emitAck(reporterSocket, 'report-user', { targetId: targetSocket.id, reason: 'harassment' })).ok, true);
    const rateLimited = await emitAck(reporterSocket, 'report-user', { targetId: targetSocket.id, reason: 'spam' });
    assert.equal(rateLimited.ok, false);
    assert.equal(rateLimited.errorCode, 'RATE_LIMITED');

    // Persisted state carries the sanitized report (enum fallback + 200-char cap).
    await delay(400);
    const persisted = JSON.parse(fs.readFileSync(roomStateFile, 'utf8'));
    const persistedRoom = persisted.find((room) => room.id === roomId);
    assert.equal(persistedRoom.reports.length, 3);
    const persistedReport = persistedRoom.reports.find((report) => report.id === firstReport.reportId);
    assert.equal(persistedReport.reason, 'other');
    assert.equal(persistedReport.detail.length, 200);
    assert.equal(persistedReport.targetName, 'Target');
    assert.equal(persistedReport.reporterName, 'Reporter');
    assert.equal(persistedReport.status, 'open');
});

test('protected room GET exposes only a safe preview and leaks no private state', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);

    const owner = await signupUser(server, { displayName: 'PrivOwner' });
    const ownerSocket = await connectSocket(server.baseUrl, {
        clientId: 'priv-owner',
        extraHeaders: { Cookie: owner.cookie }
    });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const schedule = buildFutureRiyadhSchedule({ boardGoalTemplate: 'PRIVATE-BOARD-GOAL-do-not-leak' });
    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Private Study Room',
        password: 'topsecret1',
        requirePassword: true,
        schedule
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'priv-owner',
        password: 'topsecret1'
    });
    assert.equal(joinOwner.ok, true);

    assert.equal((await emitAck(ownerSocket, 'send-message', { roomId, text: 'PRIVATE-MESSAGE-do-not-leak' })).ok, true);
    assert.equal((await emitAck(ownerSocket, 'board-set-goal', { goal: 'PRIVATE-BOARD-GOAL-do-not-leak' })).ok, true);
    assert.equal((await emitAck(ownerSocket, 'board-add-task', { text: 'PRIVATE-TASK-do-not-leak', priority: 1 })).ok, true);

    // Populate real video-provider state (meeting id + active session) so the
    // preview is proven to omit it even when it exists internally.
    const token = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'priv-owner',
        role: 'student'
    });
    assert.equal(token.status, 200);

    const preview = await server.request(`/api/rooms/${roomId}`);
    assert.equal(preview.status, 200);

    // Contract: a safe preview only.
    assert.equal(preview.body.ok, true);
    assert.equal(preview.body.room.roomId, roomId);
    assert.equal(preview.body.room.protected, true);
    assert.equal(preview.body.room.requiresPassword, true);
    assert.equal(typeof preview.body.room.participantCount, 'number');

    // No private state at the top level of the response...
    assert.equal(preview.body.messages, undefined);                     // (1) no messages
    assert.equal(preview.body.participants, undefined);                 // (2) no participant details
    assert.equal(preview.body.board, undefined);                        // (3) no board state
    assert.equal(preview.body.schedule, undefined);                     // (4) no schedule/private metadata
    assert.equal(preview.body.videoProviderMeetingId, undefined);       // (5) no videoProviderMeetingId
    assert.equal(preview.body.videoProviderStatus, undefined);          // (6) no video session state
    assert.equal(preview.body.activeVideoParticipantCount, undefined);  // (6) no video session state
    assert.equal(preview.body.passwordHash, undefined);
    assert.equal(preview.body.videoPolicy, undefined);

    // ...nor nested under `room`.
    assert.equal(preview.body.room.messages, undefined);
    assert.equal(preview.body.room.participants, undefined);
    assert.equal(preview.body.room.board, undefined);
    assert.equal(preview.body.room.schedule, undefined);
    assert.equal(preview.body.room.videoProviderMeetingId, undefined);
    assert.equal(preview.body.room.videoProviderStatus, undefined);
    assert.equal(preview.body.room.activeVideoParticipantCount, undefined);
    assert.equal(preview.body.room.passwordHash, undefined);

    // Belt-and-suspenders: no secret substrings anywhere in the serialized body.
    const serialized = JSON.stringify(preview.body);
    assert.doesNotMatch(serialized, /PRIVATE-BOARD-GOAL-do-not-leak/);
    assert.doesNotMatch(serialized, /PRIVATE-MESSAGE-do-not-leak/);
    assert.doesNotMatch(serialized, /PRIVATE-TASK-do-not-leak/);
    assert.doesNotMatch(serialized, /fake-secret-token/);
});

test('protected room stays locked on wrong password and unlocks full state only on the correct one', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'lock-owner' });
    const intruderSocket = await connectSocket(server.baseUrl, { clientId: 'lock-intruder' });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(intruderSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', {
        roomName: 'Locked Room',
        password: 'correct-horse',
        requirePassword: true
    });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const ownerJoin = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'lock-owner',
        password: 'correct-horse'
    });
    assert.equal(ownerJoin.ok, true);
    assert.equal((await emitAck(ownerSocket, 'board-set-goal', { goal: 'LOCKED-GOAL' })).ok, true);

    // (7) A wrong password unlocks nothing: no room state in the ack, and the
    // GET endpoint still returns only a preview.
    const wrongJoin = await emitAck(intruderSocket, 'join-room', {
        roomId,
        username: 'Intruder',
        clientId: 'lock-intruder',
        password: 'nope'
    });
    assert.equal(wrongJoin.ok, false);
    assert.equal(wrongJoin.errorCode, 'ROOM_PASSWORD_INVALID');
    assert.equal(wrongJoin.room, undefined);

    const preview = await server.request(`/api/rooms/${roomId}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.room.protected, true);
    assert.equal(preview.body.board, undefined);
    assert.doesNotMatch(JSON.stringify(preview.body), /LOCKED-GOAL/);

    // (8) The correct password returns full room state to the verified member.
    const goodJoin = await emitAck(intruderSocket, 'join-room', {
        roomId,
        username: 'Guest',
        clientId: 'lock-intruder',
        password: 'correct-horse'
    });
    assert.equal(goodJoin.ok, true);
    assert.equal(goodJoin.room.board.goal, 'LOCKED-GOAL');
    assert.ok(Array.isArray(goodJoin.room.messages));
});

test('public room GET still returns the full snapshot (behavior unchanged)', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'pub-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', { roomName: 'Open Study Room' });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'pub-owner'
    });
    assert.equal(joinOwner.ok, true);
    assert.equal((await emitAck(ownerSocket, 'send-message', { roomId, text: 'public hello' })).ok, true);
    assert.equal((await emitAck(ownerSocket, 'board-set-goal', { goal: 'public goal' })).ok, true);

    // (9) Public rooms keep the existing flat full snapshot shape.
    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.roomId, roomId);
    assert.equal(snapshot.body.requirePassword, false);
    assert.equal(snapshot.body.board.goal, 'public goal');
    assert.ok(Array.isArray(snapshot.body.participants));
    assert.ok(snapshot.body.messages.some((message) => message.text === 'public hello'));
    assert.equal(snapshot.body.ok, undefined);
});

test('video-token requires verified room membership even for existing rooms', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'vt-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

    const createRoom = await emitAck(ownerSocket, 'create-room', { roomName: 'Token Gate Room' });
    assert.equal(createRoom.ok, true);
    const roomId = createRoom.room.roomId;

    // (10) A non-member cannot mint a participant token.
    const denied = await issueVideoToken(server, roomId, {
        displayName: 'Ghost',
        clientSessionId: 'not-a-member',
        role: 'student'
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.errorCode, 'ROOM_NOT_JOINED');
    assert.equal(denied.body.authToken, undefined);

    // ...but a verified member can, after a real join.
    const joinOwner = await emitAck(ownerSocket, 'join-room', {
        roomId,
        username: 'Owner',
        clientId: 'vt-owner'
    });
    assert.equal(joinOwner.ok, true);

    const granted = await issueVideoToken(server, roomId, {
        displayName: 'Owner',
        clientSessionId: 'vt-owner',
        role: 'student'
    });
    assert.equal(granted.status, 200);
    assert.equal(typeof granted.body.authToken, 'string');
});
