const assert = require('node:assert/strict');
const test = require('node:test');

const { createAnonSessionToken, verifyAnonSessionToken } = require('../../services/auth');
const { startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

const SECRET = 'anon-session-unit-secret-0123456789abcdef';

// ---------------------------------------------------------------------------
// #1 — signed anonymous session token (pure helpers). Mirrors the auth-token
// HMAC pattern so an unauthenticated `coStudySessionId` cannot be forged or
// picked by the client.
// ---------------------------------------------------------------------------

test('anon session token round-trips to its session id', () => {
    const token = createAnonSessionToken({ sessionId: 'session-abc', secret: SECRET });
    assert.equal(verifyAnonSessionToken(token, { secret: SECRET }), 'session-abc');
});

test('anon session token carries a signature, not a bare id', () => {
    const token = createAnonSessionToken({ sessionId: 'session-abc', secret: SECRET });
    assert.notEqual(token, 'session-abc');
    assert.match(token, /^as1\.session-abc\./);
});

test('anon session token verified with the wrong secret is rejected', () => {
    const token = createAnonSessionToken({ sessionId: 'session-abc', secret: SECRET });
    assert.equal(verifyAnonSessionToken(token, { secret: 'a-different-secret' }), null);
});

test('anon session token with a tampered session id is rejected', () => {
    const token = createAnonSessionToken({ sessionId: 'session-abc', secret: SECRET });
    const forged = token.replace('session-abc', 'session-victim');
    assert.equal(verifyAnonSessionToken(forged, { secret: SECRET }), null);
});

test('anon session token with a tampered signature is rejected', () => {
    const token = createAnonSessionToken({ sessionId: 'session-abc', secret: SECRET });
    const forged = `${token}tampered`;
    assert.equal(verifyAnonSessionToken(forged, { secret: SECRET }), null);
});

test('a bare (unsigned) client-picked value is rejected', () => {
    assert.equal(verifyAnonSessionToken('session-victim', { secret: SECRET }), null);
    assert.equal(verifyAnonSessionToken('as1.session-victim', { secret: SECRET }), null);
});

test('non-string or empty anon tokens are rejected', () => {
    assert.equal(verifyAnonSessionToken('', { secret: SECRET }), null);
    assert.equal(verifyAnonSessionToken(/** @type {any} */ (null), { secret: SECRET }), null);
    assert.equal(verifyAnonSessionToken(/** @type {any} */ (undefined), { secret: SECRET }), null);
});

test('createAnonSessionToken requires a session id and secret', () => {
    assert.throws(() => createAnonSessionToken({ sessionId: '', secret: SECRET }));
    assert.throws(() => createAnonSessionToken({ sessionId: 'x', secret: '' }));
});

// ---------------------------------------------------------------------------
// #1 — server issues and honours a signed session cookie.
// ---------------------------------------------------------------------------

function getSessionCookie(setCookieHeader) {
    const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader].filter(Boolean);
    const entry = list.find((c) => typeof c === 'string' && c.startsWith('coStudySessionId='));
    if (!entry) return null;
    return entry.split(';')[0].slice('coStudySessionId='.length);
}

test('a fresh request receives a signed coStudySessionId cookie', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());

    const res = await server.request('/');
    const cookieValue = getSessionCookie(res.headers['set-cookie']);

    assert.ok(cookieValue, 'expected a coStudySessionId cookie to be set');
    assert.match(cookieValue, /^as1\./, 'session cookie must be a signed token, not a bare UUID');
});

test('a valid signed session cookie is accepted without reissue', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());

    const first = await server.request('/');
    const issued = getSessionCookie(first.headers['set-cookie']);
    assert.ok(issued);

    const second = await server.request('/', {
        headers: { Cookie: `coStudySessionId=${issued}` }
    });
    assert.equal(getSessionCookie(second.headers['set-cookie']), null,
        'a valid signed cookie should be honoured, not reissued');
});

test('a forged/unsigned session cookie is rejected and reissued', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());

    const res = await server.request('/', {
        headers: { Cookie: 'coStudySessionId=attacker-picked-value' }
    });
    const reissued = getSessionCookie(res.headers['set-cookie']);

    assert.ok(reissued, 'server must replace a forged session cookie');
    assert.match(reissued, /^as1\./);
    assert.notEqual(reissued, 'attacker-picked-value');
});

// ---------------------------------------------------------------------------
// #2 — joining a second room removes the socket from the first (no leak).
// ---------------------------------------------------------------------------

test('joining a second room removes the socket from the first room', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());

    const mover = await connectSocket(server.baseUrl);
    const checker = await connectSocket(server.baseUrl);
    t.after(async () => {
        await closeSocket(mover);
        await closeSocket(checker);
    });

    // Two distinct rooms.
    const roomA = await emitAck(mover, 'create-room', { roomName: 'Room A' });
    const roomB = await emitAck(mover, 'create-room', { roomName: 'Room B' });
    const codeA = roomA.room.code;
    const codeB = roomB.room.code;

    // Mover joins A, then switches to B on the same socket.
    await emitAck(mover, 'join-room', { roomId: codeA, username: 'Mover' });
    await emitAck(mover, 'join-room', { roomId: codeB, username: 'Mover' });

    // A fresh socket joining A gets the authoritative participant list back in
    // its ack — deterministic, no presence-event race.
    const checkerJoin = await emitAck(checker, 'join-room', { roomId: codeA, username: 'Checker' });
    const names = checkerJoin.room.participants.map((p) => p.name);
    assert.ok(!names.includes('Mover'),
        `Mover must be removed from room A after switching to B; saw ${JSON.stringify(names)}`);
});
