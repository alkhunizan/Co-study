const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { spawnSync } = require('child_process');

const { repoRoot, resetStateFile, makeTempStateFile } = require('../helpers/test-env');
const { delay, startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

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
        extraFiles.forEach((filePath) => resetStateFile(filePath));
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
        (error) => {
            assert.match(String(error.message), pattern);
            return true;
        }
    );
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
        socket: true,
        config: true
    });
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

    ownerSocket = await connectSocket(server.baseUrl, { clientId: 'owner-client' });

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

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.roomId, roomId);
    assert.equal(snapshot.body.requirePassword, true);
    assert.equal(snapshot.body.schedule.cadence, schedule.cadence);
    assert.equal(snapshot.body.schedule.focusMinutes, 45);
    assert.equal(snapshot.body.schedule.breakMinutes, 15);
    assert.equal(snapshot.body.schedule.boardGoalTemplate, 'Protect the launch room');
    assert.equal(snapshot.body.board.goal, 'Protect the room state');
    assert.equal(snapshot.body.board.tasks.length, 1);
    assert.equal(snapshot.body.board.tasks[0].text, 'Confirm restart persistence');
    assert.ok(snapshot.body.messages.some((message) => message.text === 'Persistence integration message'));

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
});

test('scheduled rooms validate create payloads and expose schedule summaries', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const ownerSocket = await connectSocket(server.baseUrl, { clientId: 'schedule-owner' });
    t.after(async () => {
        await closeSocket(ownerSocket);
    });

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

test('mesh rooms enforce participant caps while allowing same-identity reconnects at capacity', async (t) => {
    const server = await startServer();
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

    const snapshot = await server.request(`/api/rooms/${roomId}`);
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.board.goal, 'Backup goal');
    assert.ok(snapshot.body.messages.some((message) => message.text === 'Backup message'));

    const verifyAfterRestore = runNodeScript('scripts/verify-deploy.js', [server.baseUrl]);
    assert.equal(verifyAfterRestore.status, 0, verifyAfterRestore.stderr);

    const verifyFailure = runNodeScript('scripts/verify-deploy.js', ['http://127.0.0.1:9']);
    assert.notEqual(verifyFailure.status, 0);
});
