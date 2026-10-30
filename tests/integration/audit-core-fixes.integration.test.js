const assert = require('node:assert/strict');
const test = require('node:test');
const { signupUser } = require('../helpers/auth-helpers');
const { startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { controlledRuntime } = require('../helpers/controlled-runtime');

// A-01: an unknown email must cost the same password-hash work as a wrong
// password, otherwise response time reveals which emails have accounts.
test('login timing does not distinguish unknown emails from wrong passwords', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { credentials } = await signupUser(server, { email: 'timing-known@example.com' });
    const timed = async (email) => {
        const started = process.hrtime.bigint();
        const response = await server.request('/api/auth/login', { method: 'POST', body: { email, password: 'incorrect-password' } });
        assert.equal(response.status, 401);
        return Number(process.hrtime.bigint() - started) / 1e6;
    };
    const known = [], unknown = [];
    for (let i = 0; i < 3; i++) {
        known.push(await timed(credentials.email));
        unknown.push(await timed(`timing-ghost-${i}@example.com`));
    }
    const median = (values) => values.sort((a, b) => a - b)[1];
    assert.ok(median(known) > 5, `hash work expected on known email, got ${median(known)}ms`);
    assert.ok(median(unknown) >= median(known) * 0.5,
        `unknown email answered too fast: ${median(unknown)}ms vs ${median(known)}ms`);
});

// A-16: socket events inside an ordinary (non-circle) room must not issue a
// database query per packet; circle rooms re-check membership at most once
// per interval, not on every ICE candidate.
test('per-packet socket guard does not query the database for every event', async (t) => {
    const fixture = await controlledRuntime();
    t.after(() => fixture.stop());
    const db = fixture.platform.db;
    const originalQuery = db.query.bind(db);
    let queries = 0;
    db.query = (...args) => { queries += 1; return originalQuery(...args); };
    const socket = await connectSocket(fixture.baseUrl, { clientId: 'guard-client' });
    t.after(() => closeSocket(socket));
    const created = await emitAck(socket, 'create-room', { roomName: 'Guard room' });
    assert.equal(created.ok, true);
    const joined = await emitAck(socket, 'join-room', { roomId: created.room.roomId, username: 'Guard', clientId: 'guard-client' });
    assert.equal(joined.ok, true);
    queries = 0;
    for (let i = 0; i < 40; i++) {
        await emitAck(socket, 'user-status', { status: { visible: true, goal: `step ${i}` } });
    }
    assert.equal(queries, 0, `expected no database work for ordinary room events, saw ${queries} queries`);
});
