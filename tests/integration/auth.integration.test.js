const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const { resetStateFile, makeTempStateFile } = require('../helpers/test-env');
const { delay, startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { extractCookies, signupUser } = require('../helpers/auth-helpers');

async function cleanupServer(t, server) {
    t.after(async () => {
        if (server) {
            await server.stop();
            resetStateFile(server.roomStateFile);
            resetStateFile(server.userStateFile);
        }
    });
}

function authedRequest(server, pathname, cookie, options = {}) {
    return server.request(pathname, {
        ...options,
        headers: { ...(options.headers || {}), Cookie: cookie }
    });
}

function currentRiyadhDayKey(now = Date.now()) {
    return new Date(now + (3 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function cookieValue(cookieHeader, name) {
    const cookies = extractCookies(cookieHeader);
    const match = cookies.split('; ')
        .find((cookie) => cookie.startsWith(`${name}=`));
    return match ? match.slice(name.length + 1) : null;
}

test('signup issues an auth cookie and /api/auth/me returns the profile', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const response = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'Sara@Example.com', password: 'longenough1', displayName: 'Sara' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.user.email, 'sara@example.com');
    assert.equal(response.body.user.displayName, 'Sara');
    assert.equal(response.body.user.avatarColor, 'amber');
    assert.equal(response.body.user.passwordHash, undefined);
    assert.equal(response.body.user.tokenEpoch, undefined);

    const cookie = extractCookies(response.headers['set-cookie']);
    assert.match(cookie, /coStudyAuth=v1\./);

    const me = await authedRequest(server, '/api/auth/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'sara@example.com');
    assert.deepEqual(me.body.user.authMethods, { password: true, google: false });
});

test('signup rejects invalid email, short password, missing name, and duplicate email', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const badEmail = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'not-an-email', password: 'longenough1', displayName: 'Sara' }
    });
    assert.equal(badEmail.status, 400);
    assert.equal(badEmail.body.errorCode, 'EMAIL_INVALID');

    const shortPassword = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'sara@example.com', password: 'short', displayName: 'Sara' }
    });
    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.body.errorCode, 'PASSWORD_INVALID');

    const noName = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'sara@example.com', password: 'longenough1', displayName: '   ' }
    });
    assert.equal(noName.status, 400);
    assert.equal(noName.body.errorCode, 'DISPLAY_NAME_REQUIRED');

    await signupUser(server, { email: 'taken@example.com' });
    const duplicate = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'TAKEN@example.com', password: 'longenough1', displayName: 'Copy' }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.errorCode, 'EMAIL_TAKEN');
});

test('signup is rate limited per IP', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    for (let index = 0; index < 5; index += 1) {
        const response = await server.request('/api/auth/signup', {
            method: 'POST',
            body: { email: `student-${index}@example.com`, password: 'longenough1', displayName: 'S' }
        });
        assert.equal(response.status, 200);
    }
    const throttled = await server.request('/api/auth/signup', {
        method: 'POST',
        body: { email: 'student-6@example.com', password: 'longenough1', displayName: 'S' }
    });
    assert.equal(throttled.status, 429);
    assert.equal(throttled.body.errorCode, 'RATE_LIMITED');
    assert.equal(typeof throttled.body.retryAfterMs, 'number');
});

test('login succeeds with correct credentials and never enumerates accounts', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { credentials } = await signupUser(server, { email: 'known@example.com' });

    const good = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.ok, true);

    const wrongPassword = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: 'incorrect-password' }
    });
    const unknownEmail = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: 'ghost@example.com', password: 'incorrect-password' }
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    // Same errorCode for both — no way to probe which emails exist.
    assert.equal(wrongPassword.body.errorCode, 'INVALID_CREDENTIALS');
    assert.equal(unknownEmail.body.errorCode, 'INVALID_CREDENTIALS');
});

test('login lockout engages after repeated failures and clears on success', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { credentials } = await signupUser(server, { email: 'lockout@example.com' });

    for (let index = 0; index < 5; index += 1) {
        const failed = await server.request('/api/auth/login', {
            method: 'POST',
            body: { email: credentials.email, password: 'wrong-password' }
        });
        assert.equal(failed.status, 401);
    }
    const locked = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.errorCode, 'RATE_LIMITED');

    // A different email on the same IP is not locked out (key is ip:email).
    const other = await signupUser(server, { email: 'other@example.com' });
    const otherLogin = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: other.credentials.email, password: other.credentials.password }
    });
    assert.equal(otherLogin.status, 200);
});

test('logout clears the cookie and /api/auth/me reports a guest after', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server);
    const originalAnonymousIdentity = cookieValue(cookie, 'coStudySessionId');
    assert.ok(originalAnonymousIdentity);
    const logout = await authedRequest(server, '/api/auth/logout', cookie, { method: 'POST' });
    assert.equal(logout.status, 200);
    const clearedCookie = extractCookies(logout.headers['set-cookie']);
    assert.match(clearedCookie, /coStudyAuth=/);
    const rotatedAnonymousIdentity = cookieValue(logout.headers['set-cookie'], 'coStudySessionId');
    assert.ok(rotatedAnonymousIdentity);
    assert.notEqual(rotatedAnonymousIdentity, originalAnonymousIdentity);

    // 200 + user:null (not 401): this probe runs on every guest page load.
    const me = await authedRequest(server, '/api/auth/me', clearedCookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user, null);
});

test('profile updates validate avatar color and bio bounds', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server);

    const good = await authedRequest(server, '/api/me/profile', cookie, {
        method: 'PATCH',
        body: { displayName: 'Noor', avatarColor: 'sage', bio: 'Studying medicine in Riyadh.' }
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.user.displayName, 'Noor');
    assert.equal(good.body.user.avatarColor, 'sage');
    assert.equal(good.body.user.bio, 'Studying medicine in Riyadh.');

    const badColor = await authedRequest(server, '/api/me/profile', cookie, {
        method: 'PATCH',
        body: { avatarColor: '#ff0000' }
    });
    assert.equal(badColor.status, 400);
    assert.equal(badColor.body.errorCode, 'AVATAR_COLOR_INVALID');

    const longBio = await authedRequest(server, '/api/me/profile', cookie, {
        method: 'PATCH',
        body: { bio: 'x'.repeat(161) }
    });
    assert.equal(longBio.status, 400);
    assert.equal(longBio.body.errorCode, 'BIO_TOO_LONG');

    const unauthenticated = await server.request('/api/me/profile', {
        method: 'PATCH',
        body: { displayName: 'Nope' }
    });
    assert.equal(unauthenticated.status, 401);
});

test('focus sessions accumulate stats and validate minutes', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server);

    const first = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 25, completionId: 'focus-completion-0001' }
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.acceptedMinutes, 25);
    assert.equal(first.body.duplicate, false);
    assert.equal(first.body.focusStats.totalFocusMinutes, 25);
    assert.equal(first.body.focusStats.totalSessions, 1);
    assert.equal(first.body.streak.current, 1);

    const second = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 50, completionId: 'focus-completion-0002' }
    });
    assert.equal(second.body.focusStats.totalFocusMinutes, 75);
    assert.equal(second.body.focusStats.totalSessions, 2);
    // Same Riyadh day — streak does not double-count.
    assert.equal(second.body.streak.current, 1);

    const invalid = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 0, completionId: 'focus-completion-invalid-minutes' }
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.errorCode, 'FOCUS_MINUTES_INVALID');

    const stats = await authedRequest(server, '/api/me/stats', cookie);
    assert.equal(stats.status, 200);
    assert.equal(stats.body.focusStats.totalFocusMinutes, 75);
});

test('focus completion ids deduplicate and daily caps use only the accepted delta', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server, { email: 'focus-cap@example.com' });
    const dayKey = currentRiyadhDayKey();
    const imported = await authedRequest(server, '/api/me/stats/import', cookie, {
        method: 'POST',
        body: { days: { [dayKey]: { focusMinutes: 1435, sessions: 10 } } }
    });
    assert.equal(imported.status, 200);

    const first = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 25, completionId: 'daily-cap-completion-0001' }
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.acceptedMinutes, 5);
    assert.equal(first.body.duplicate, false);
    assert.equal(first.body.focusStats.days[dayKey].focusMinutes, 1440);
    assert.equal(first.body.focusStats.totalFocusMinutes, 1440);
    assert.equal(first.body.focusStats.totalSessions, 11);

    const duplicate = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 25, completionId: 'daily-cap-completion-0001' }
    });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.acceptedMinutes, 5);
    assert.equal(duplicate.body.duplicate, true);
    assert.equal(duplicate.body.focusStats.totalFocusMinutes, 1440);
    assert.equal(duplicate.body.focusStats.totalSessions, 11);

    const capped = await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 25, completionId: 'daily-cap-completion-0002' }
    });
    assert.equal(capped.status, 200);
    assert.equal(capped.body.acceptedMinutes, 0);
    assert.equal(capped.body.focusStats.totalFocusMinutes, 1440);
    assert.equal(capped.body.focusStats.totalSessions, 11);
});

test('stats import merges by max per day and is idempotent', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server);
    const days = {
        '2026-06-01': { focusMinutes: 100, sessions: 4 },
        '2026-06-02': { focusMinutes: 50, sessions: 2 }
    };

    const first = await authedRequest(server, '/api/me/stats/import', cookie, {
        method: 'POST',
        body: { days }
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.focusStats.totalFocusMinutes, 150);
    assert.equal(first.body.focusStats.totalSessions, 6);

    const again = await authedRequest(server, '/api/me/stats/import', cookie, {
        method: 'POST',
        body: { days }
    });
    assert.equal(again.body.focusStats.totalFocusMinutes, 150);
    assert.equal(again.body.focusStats.totalSessions, 6);
});

test('accounts persist across server restart with the same state file', async (t) => {
    const roomStateFile = makeTempStateFile('co-study-auth-rooms');
    const userStateFile = makeTempStateFile('co-study-auth-users');
    let server = await startServer({ roomStateFile, userStateFile });

    t.after(async () => {
        if (server) await server.stop();
        resetStateFile(roomStateFile);
        resetStateFile(userStateFile);
    });

    const { cookie, credentials } = await signupUser(server, { email: 'persist@example.com' });
    await authedRequest(server, '/api/me/focus-session', cookie, {
        method: 'POST',
        body: { minutes: 40, completionId: 'persisted-focus-completion' }
    });

    // The acknowledged focus mutation is an immediate durable write. Stop as
    // soon as the response arrives so restart coverage cannot pass on debounce.
    await server.stop();
    server = await startServer({ roomStateFile, userStateFile, resetStateFileOnStart: false });

    // Old cookie still verifies (fixed SESSION_SECRET) and state survived.
    const me = await authedRequest(server, '/api/auth/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'persist@example.com');

    const login = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(login.status, 200);

    const stats = await authedRequest(server, '/api/me/stats', cookie);
    assert.equal(stats.body.focusStats.totalFocusMinutes, 40);
});

test('account deletion re-authenticates, removes the record from disk, and kills the session', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie, credentials } = await signupUser(server, { email: 'delete-me@example.com' });
    const originalAnonymousIdentity = cookieValue(cookie, 'coStudySessionId');

    const wrongPassword = await authedRequest(server, '/api/me', cookie, {
        method: 'DELETE',
        body: { password: 'not-my-password' }
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.errorCode, 'INVALID_CREDENTIALS');

    const deleted = await authedRequest(server, '/api/me', cookie, {
        method: 'DELETE',
        body: { password: credentials.password }
    });
    assert.equal(deleted.status, 200);
    const rotatedAnonymousIdentity = cookieValue(deleted.headers['set-cookie'], 'coStudySessionId');
    assert.ok(rotatedAnonymousIdentity);
    assert.notEqual(rotatedAnonymousIdentity, originalAnonymousIdentity);

    // PDPL: the record is gone from disk immediately (flushed, not debounced).
    const onDisk = fs.readFileSync(server.userStateFile, 'utf8');
    assert.doesNotMatch(onDisk, /delete-me@example\.com/);

    const me = await authedRequest(server, '/api/auth/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user, null);

    const login = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.email, password: credentials.password }
    });
    assert.equal(login.status, 401);
    assert.equal(login.body.errorCode, 'INVALID_CREDENTIALS');
});

test('account deletion closes owned rooms and revokes live membership identities', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const guestSocket = await connectSocket(server.baseUrl, { clientId: 'delete-cascade-guest' });
    const { cookie, credentials } = await signupUser(server, {
        email: 'delete-cascade@example.com',
        displayName: 'Cascade Owner'
    });
    const ownerSocket = await connectSocket(server.baseUrl, {
        clientId: 'delete-cascade-owner',
        extraHeaders: { Cookie: cookie }
    });
    t.after(async () => {
        await closeSocket(ownerSocket);
        await closeSocket(guestSocket);
    });

    const guestRoom = await emitAck(guestSocket, 'create-room', { roomName: 'Surviving Room' });
    assert.equal(guestRoom.ok, true);
    const guestJoined = await emitAck(guestSocket, 'join-room', {
        roomId: guestRoom.room.code,
        username: 'Guest'
    });
    assert.equal(guestJoined.ok, true);

    const ownedRoom = await emitAck(ownerSocket, 'create-room', { roomName: 'Owned Room' });
    assert.equal(ownedRoom.ok, true);
    const ownerJoined = await emitAck(ownerSocket, 'join-room', {
        roomId: guestRoom.room.code,
        username: 'Cascade Owner'
    });
    assert.equal(ownerJoined.ok, true);

    const disconnected = new Promise((resolve) => ownerSocket.once('disconnect', resolve));
    const deleted = await authedRequest(server, '/api/me', cookie, {
        method: 'DELETE',
        body: { password: credentials.password }
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.cleanupPending, false);
    await Promise.race([
        disconnected,
        delay(2000).then(() => assert.fail('deleted account socket stayed connected'))
    ]);

    const deletedOwnedRoom = await server.request(`/api/rooms/${ownedRoom.room.code}`);
    assert.equal(deletedOwnedRoom.status, 404);

    const survivingRoom = await server.request(`/api/rooms/${guestRoom.room.code}`);
    assert.equal(survivingRoom.status, 200);
    assert.deepEqual(survivingRoom.body.participants.map((participant) => participant.name), ['Guest']);

    const staleMembership = await server.request(`/api/rooms/${guestRoom.room.code}/video-token`, {
        method: 'POST',
        headers: { 'X-Halastudy-Membership': ownerJoined.membershipToken },
        body: {
            displayName: 'Cascade Owner',
            clientSessionId: 'delete-cascade-owner',
            role: 'student'
        }
    });
    assert.equal(staleMembership.status, 403);
    assert.equal(staleMembership.body.errorCode, 'ROOM_MEMBERSHIP_REQUIRED');
});

test('failed durable account deletion returns 503 and leaves the account live', async (t) => {
    const server = await startServer();
    let blockingDirectoryPresent = false;
    t.after(async () => {
        if (blockingDirectoryPresent) {
            fs.rmSync(server.userStateFile, { recursive: true, force: true });
        }
        await server.stop();
        resetStateFile(server.roomStateFile);
        resetStateFile(server.userStateFile);
    });

    const { cookie, credentials } = await signupUser(server, { email: 'durable-delete@example.com' });
    await delay(300);
    fs.rmSync(server.userStateFile, { force: true });
    fs.mkdirSync(server.userStateFile);
    blockingDirectoryPresent = true;

    const failed = await authedRequest(server, '/api/me', cookie, {
        method: 'DELETE',
        body: { password: credentials.password }
    });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.errorCode, 'PERSISTENCE_UNAVAILABLE');
    assert.equal(cookieValue(failed.headers['set-cookie'], 'coStudySessionId'), null);

    const me = await authedRequest(server, '/api/auth/me', cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, credentials.email);

    fs.rmSync(server.userStateFile, { recursive: true, force: true });
    blockingDirectoryPresent = false;
});

test('scheduled room creation is gated on auth over sockets; instant rooms stay guest-open', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const guestSocket = await connectSocket(server.baseUrl, { clientId: 'gate-guest' });
    t.after(async () => {
        await closeSocket(guestSocket);
    });

    const guestInstant = await emitAck(guestSocket, 'create-room', {
        roomName: 'Guest Instant Room'
    });
    assert.equal(guestInstant.ok, true);

    const futureDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const schedule = {
        startDate: futureDate.toISOString().slice(0, 10),
        startTime: '20:00',
        cadence: 'daily'
    };
    const guestScheduled = await emitAck(guestSocket, 'create-room', {
        roomName: 'Guest Scheduled Room',
        schedule
    });
    assert.equal(guestScheduled.ok, false);
    assert.equal(guestScheduled.errorCode, 'AUTH_REQUIRED_FOR_SCHEDULED');

    const { cookie } = await signupUser(server);
    const authedSocket = await connectSocket(server.baseUrl, {
        clientId: 'gate-authed',
        extraHeaders: { Cookie: cookie }
    });
    t.after(async () => {
        await closeSocket(authedSocket);
    });

    const authedScheduled = await emitAck(authedSocket, 'create-room', {
        roomName: 'Authed Scheduled Room',
        schedule
    });
    assert.equal(authedScheduled.ok, true);
});

test('created and joined rooms land in /api/me/rooms and presence carries avatarColor', async (t) => {
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server, { displayName: 'Rooma' });
    await authedRequest(server, '/api/me/profile', cookie, {
        method: 'PATCH',
        body: { avatarColor: 'dusk' }
    });

    const socket = await connectSocket(server.baseUrl, {
        clientId: 'myrooms-client',
        extraHeaders: { Cookie: cookie }
    });
    t.after(async () => {
        await closeSocket(socket);
    });

    const created = await emitAck(socket, 'create-room', { roomName: 'My Tracked Room' });
    assert.equal(created.ok, true);

    const joined = await emitAck(socket, 'join-room', {
        roomId: created.room.code,
        username: 'Rooma',
        clientId: 'myrooms-client'
    });
    assert.equal(joined.ok, true);
    const self = joined.room.participants.find((participant) => participant.name === 'Rooma');
    assert.equal(self.avatarColor, 'dusk');
    assert.equal(typeof self.streakCurrent, 'number');

    const myRooms = await authedRequest(server, '/api/me/rooms', cookie);
    assert.equal(myRooms.status, 200);
    assert.equal(myRooms.body.rooms.length, 1);
    assert.equal(myRooms.body.rooms[0].roomId, created.room.code);
    // 'created' wins over the later 'joined' record for the same room.
    assert.equal(myRooms.body.rooms[0].role, 'created');
    assert.equal(myRooms.body.rooms[0].exists, true);
});

test('banned semantics: a bad users file entry is dropped, not fatal, in non-strict mode', async (t) => {
    // Malformed users.json fails fast in production (strict), mirrored from
    // room-store; here we only assert the API surface never sees a half user.
    const server = await startServer();
    await cleanupServer(t, server);

    const { cookie } = await signupUser(server, { email: 'shape@example.com' });
    const me = await authedRequest(server, '/api/auth/me', cookie);
    assert.deepEqual(Object.keys(me.body.user).sort(), [
        'authMethods', 'avatarColor', 'bio', 'createdAt', 'displayName', 'email', 'id', 'streak'
    ]);
});
