const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { makeTempStateFile, resetStateFile } = require('../helpers/test-env');
const { startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { extractCookies, signupUser } = require('../helpers/auth-helpers');

const ADMIN_PATH = '/ops-integration-1234';
const ADMIN_PASSWORD = 'test-password-123';
// Precomputed with `npm run admin:hash -- "test-password-123"` so tests do
// not import server code.
const ADMIN_PASSWORD_HASH = 'cad5e43589f0e2215e75e00ba86cc550:0914de952c39f2c4ac8f9dc10ab4e10edfa2e1db0523de0afeae4cd7fcd581cac7c9c2e8789c41cfd4ed2e53ea2230c680191057c7d85557ee6aeff9d6fc51dc';

async function startAdminServer(options = {}) {
    return startServer({
        ...options,
        env: {
            ADMIN_PATH,
            ADMIN_PASSWORD_HASH,
            ...(options.env || {})
        }
    });
}

async function cleanupServer(t, server) {
    t.after(async () => {
        if (server) {
            await server.stop();
            resetStateFile(server.roomStateFile);
            resetStateFile(server.userStateFile);
        }
    });
}

async function adminLogin(server) {
    const response = await server.request(`${ADMIN_PATH}/api/login`, {
        method: 'POST',
        body: { password: ADMIN_PASSWORD }
    });
    assert.equal(response.status, 200);
    return extractCookies(response.headers['set-cookie']);
}

function adminRequest(server, apiPath, cookie, options = {}) {
    return server.request(`${ADMIN_PATH}/api${apiPath}`, {
        ...options,
        headers: { ...(options.headers || {}), Cookie: cookie }
    });
}

test('admin surface is completely absent when admin env vars are not set', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const page = await server.request(ADMIN_PATH);
    assert.equal(page.status, 404);

    // The would-be admin API answers exactly like any other unknown page —
    // same generic 404, no hint that the path is special.
    const login = await server.request(`${ADMIN_PATH}/api/login`, {
        method: 'POST',
        body: { password: ADMIN_PASSWORD }
    });
    assert.equal(login.status, 404);
    const randomPage = await server.request('/definitely-not-real');
    assert.equal(randomPage.status, 404);
    assert.equal(login.text, randomPage.text);
});

test('admin login gates the console: wrong password 401, lockout 429, success sets a scoped cookie', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);

    const page = await server.request(ADMIN_PATH);
    assert.equal(page.status, 200);
    assert.match(page.text, /Halastudy Ops/);

    const wrong = await server.request(`${ADMIN_PATH}/api/login`, {
        method: 'POST',
        body: { password: 'not-the-password' }
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.errorCode, 'ADMIN_INVALID');

    const unauthed = await server.request(`${ADMIN_PATH}/api/overview`);
    assert.equal(unauthed.status, 401);
    assert.equal(unauthed.body.errorCode, 'ADMIN_AUTH_REQUIRED');

    const cookie = await adminLogin(server);
    assert.match(cookie, /coStudyAdmin=v1\.admin\./);

    const overview = await adminRequest(server, '/overview', cookie);
    assert.equal(overview.status, 200);
    for (const key of ['uptimeSeconds', 'memory', 'roomCount', 'participantCount', 'userCount', 'videoJoinDisabled', 'backup']) {
        assert.ok(key in overview.body, `overview missing ${key}`);
    }
});

test('admin login locks out after repeated failures', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);

    for (let index = 0; index < 5; index += 1) {
        const failed = await server.request(`${ADMIN_PATH}/api/login`, {
            method: 'POST',
            body: { password: `bad-${index}` }
        });
        assert.equal(failed.status, 401);
    }
    const locked = await server.request(`${ADMIN_PATH}/api/login`, {
        method: 'POST',
        body: { password: ADMIN_PASSWORD }
    });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.errorCode, 'RATE_LIMITED');
});

test('video kill-switch toggles at runtime and is reflected in runtime-config and token issuance', async (t) => {
    const server = await startAdminServer({ withFakeRealtimeKit: true });
    await cleanupServer(t, server);
    const cookie = await adminLogin(server);

    const socket = await connectSocket(server.baseUrl, { clientId: 'ks-owner' });
    t.after(async () => {
        await closeSocket(socket);
    });
    const created = await emitAck(socket, 'create-room', { roomName: 'Kill Switch Room' });
    assert.equal(created.ok, true);
    const roomId = created.room.code;
    const joined = await emitAck(socket, 'join-room', { roomId, username: 'Owner', clientId: 'ks-owner' });
    assert.equal(joined.ok, true);

    const flipOn = await adminRequest(server, '/video-kill-switch', cookie, {
        method: 'POST',
        body: { disabled: true }
    });
    assert.equal(flipOn.status, 200);

    const runtimeConfig = await server.request('/api/runtime-config');
    assert.equal(runtimeConfig.body.videoJoinDisabled, true);

    const token = await server.request(`/api/rooms/${roomId}/video-token`, {
        method: 'POST',
        body: { displayName: 'Owner', clientSessionId: 'ks-owner', role: 'student' }
    });
    assert.equal(token.status, 503);
    assert.equal(token.body.errorCode, 'VIDEO_JOIN_DISABLED');

    const flipOff = await adminRequest(server, '/video-kill-switch', cookie, {
        method: 'POST',
        body: { disabled: false }
    });
    assert.equal(flipOff.status, 200);
    const restored = await server.request('/api/runtime-config');
    assert.equal(restored.body.videoJoinDisabled, false);
});

test('force-close disconnects members, deletes the room, and 404s afterwards', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);
    const cookie = await adminLogin(server);

    const socket = await connectSocket(server.baseUrl, { clientId: 'fc-owner' });
    t.after(async () => {
        await closeSocket(socket);
    });
    const created = await emitAck(socket, 'create-room', { roomName: 'Doomed Room' });
    const roomId = created.room.code;
    await emitAck(socket, 'join-room', { roomId, username: 'Owner', clientId: 'fc-owner' });

    const closedEvent = new Promise((resolve) => {
        socket.once('room-closed', resolve);
    });
    const disconnected = new Promise((resolve) => {
        socket.once('disconnect', resolve);
    });

    const close = await adminRequest(server, `/rooms/${roomId}/close`, cookie, { method: 'POST' });
    assert.equal(close.status, 200);
    assert.equal(close.body.kicked, 1);

    const closedPayload = await closedEvent;
    assert.equal(closedPayload.reason, 'admin');
    await disconnected;

    const lookup = await server.request(`/api/rooms/${roomId}`);
    assert.equal(lookup.status, 404);
});

test('kick removes a single participant and presence shrinks', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);
    const cookie = await adminLogin(server);

    const owner = await connectSocket(server.baseUrl, { clientId: 'kick-owner' });
    const target = await connectSocket(server.baseUrl, { clientId: 'kick-target' });
    t.after(async () => {
        await closeSocket(owner);
        await closeSocket(target);
    });

    const created = await emitAck(owner, 'create-room', { roomName: 'Kick Room' });
    const roomId = created.room.code;
    await emitAck(owner, 'join-room', { roomId, username: 'Owner', clientId: 'kick-owner' });
    await emitAck(target, 'join-room', { roomId, username: 'Target', clientId: 'kick-target' });

    const inspect = await adminRequest(server, `/rooms/${roomId}`, cookie);
    assert.equal(inspect.body.room.participants.length, 2);
    const targetRecord = inspect.body.room.participants.find((participant) => participant.name === 'Target');
    assert.ok(targetRecord);

    const kickedEvent = new Promise((resolve) => {
        target.once('kicked', resolve);
    });
    const kick = await adminRequest(server, `/rooms/${roomId}/kick`, cookie, {
        method: 'POST',
        body: { socketId: targetRecord.socketId }
    });
    assert.equal(kick.status, 200);
    const kickedPayload = await kickedEvent;
    assert.equal(kickedPayload.reason, 'admin');

    // Give the disconnect handler a beat to update presence.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = await adminRequest(server, `/rooms/${roomId}`, cookie);
    assert.equal(after.body.room.participants.length, 1);
});

test('ban kills sessions via epoch bump; unban restores sign-in', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);
    const adminCookie = await adminLogin(server);

    const { user, cookie: userCookie, credentials } = await signupUser(server, { email: 'banned@example.com' });

    const ban = await adminRequest(server, `/users/${user.id}/ban`, adminCookie, { method: 'POST' });
    assert.equal(ban.status, 200);

    // Old cookie dies instantly (tokenEpoch bumped).
    const me = await server.request('/api/auth/me', { headers: { Cookie: userCookie } });
    assert.equal(me.body.user, null);

    const login = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(login.status, 403);
    assert.equal(login.body.errorCode, 'ACCOUNT_BANNED');

    const unban = await adminRequest(server, `/users/${user.id}/unban`, adminCookie, { method: 'POST' });
    assert.equal(unban.status, 200);
    const loginAgain = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(loginAgain.status, 200);
});

test('broadcast reaches connected sockets and fresh joiners; clear stops it', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);
    const cookie = await adminLogin(server);

    const connected = await connectSocket(server.baseUrl, { clientId: 'ann-listener' });
    t.after(async () => {
        await closeSocket(connected);
    });
    const received = new Promise((resolve) => {
        connected.once('announcement', resolve);
    });

    const publish = await adminRequest(server, '/broadcast', cookie, {
        method: 'POST',
        body: { messageAr: 'صيانة الليلة', messageEn: 'Maintenance tonight', durationMinutes: 30 }
    });
    assert.equal(publish.status, 200);
    const payload = await received;
    assert.equal(payload.messageEn, 'Maintenance tonight');

    // Fresh connections get the active announcement on connect.
    const late = await connectSocket(server.baseUrl, { clientId: 'ann-late' });
    t.after(async () => {
        await closeSocket(late);
    });
    const lateReceived = await new Promise((resolve) => {
        late.once('announcement', resolve);
    });
    assert.equal(lateReceived.messageAr, 'صيانة الليلة');

    const publicEndpoint = await server.request('/api/announcement');
    assert.equal(publicEndpoint.body.announcement.messageEn, 'Maintenance tonight');

    const clear = await adminRequest(server, '/broadcast', cookie, { method: 'DELETE' });
    assert.equal(clear.status, 200);
    const cleared = await server.request('/api/announcement');
    assert.equal(cleared.body.announcement, null);
});

test('manual backup writes rooms and users snapshots with retention-friendly names', async (t) => {
    const backupDir = makeTempStateFile('co-study-admin-backups').replace(/\.json$/, '-dir');
    const server = await startAdminServer({
        env: { ROOM_STATE_BACKUP_DIR: backupDir }
    });
    t.after(async () => {
        await server.stop();
        resetStateFile(server.roomStateFile);
        resetStateFile(server.userStateFile);
        fs.rmSync(backupDir, { recursive: true, force: true });
    });
    const cookie = await adminLogin(server);

    // Seed state so both files exist on disk.
    await signupUser(server, { email: 'backup@example.com' });
    const socket = await connectSocket(server.baseUrl, { clientId: 'backup-owner' });
    t.after(async () => {
        await closeSocket(socket);
    });
    await emitAck(socket, 'create-room', { roomName: 'Backup Room' });
    await new Promise((resolve) => setTimeout(resolve, 400));

    const backup = await adminRequest(server, '/backup', cookie, { method: 'POST' });
    assert.equal(backup.status, 200);
    assert.ok(backup.body.files.some((name) => name.startsWith('rooms.')));
    assert.ok(backup.body.files.some((name) => name.startsWith('users.')));
    for (const name of backup.body.files) {
        assert.ok(fs.existsSync(path.join(backupDir, name)), `${name} missing on disk`);
    }
});

test('errors endpoint returns recent redacted warnings; metrics and API 404 behave', async (t) => {
    const server = await startAdminServer();
    await cleanupServer(t, server);
    const cookie = await adminLogin(server);

    // Trigger a warn entry (failed admin login logs admin_login_failed).
    await server.request(`${ADMIN_PATH}/api/login`, { method: 'POST', body: { password: 'nope' } });

    const errors = await adminRequest(server, '/errors', cookie);
    assert.equal(errors.status, 200);
    assert.ok(Array.isArray(errors.body.errors));
    assert.ok(errors.body.errors.some((entry) => entry.event === 'admin_login_failed'));

    const metrics = await server.request('/api/metrics');
    assert.equal(metrics.status, 200);
    for (const key of ['uptimeSeconds', 'roomCount', 'participantCount', 'activeVideoParticipants', 'memoryRssMb']) {
        assert.ok(key in metrics.body, `metrics missing ${key}`);
    }

    const missing = await server.request('/api/definitely-not-a-route');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.errorCode, 'NOT_FOUND');

    const missingPage = await server.request('/definitely-not-a-page');
    assert.equal(missingPage.status, 404);
    assert.match(missingPage.text, /404/);
});
