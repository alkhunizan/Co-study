const assert = require('node:assert/strict');
const test = require('node:test');
const { signupUser } = require('../helpers/auth-helpers');
const { startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');
const { controlledRuntime } = require('../helpers/controlled-runtime');

test('stale account tabs cannot read, modify or delete the newly signed-in account', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const a = await signupUser(server), b = await signupUser(server);
    const headers = { Cookie: b.cookie, 'X-Halastudy-Account': a.user.id };
    for (const [path, method, body] of [
        ['/api/me/stats', 'GET', undefined], ['/api/me/rooms', 'GET', undefined],
        ['/api/me/profile', 'PATCH', { displayName: 'Stale account draft' }],
        ['/api/me', 'DELETE', { password: b.credentials.password }]
    ]) {
        const response = await server.request(path, { method, headers, body });
        assert.equal(response.status, 401, `${method} ${path}`);
        assert.equal(response.body.errorCode, 'AUTH_ACCOUNT_CHANGED');
    }
    const current = await server.request('/api/auth/me', { headers: { Cookie: b.cookie } });
    assert.equal(current.body.user.displayName, b.user.displayName);
    assert.equal((await server.request('/api/me/profile', { method: 'PATCH',
        headers: { Cookie: b.cookie, 'X-Halastudy-Account': b.user.id }, body: { displayName: 'Current account' } })).status, 200);
});

test('overlapping joins under a held final authorization cannot retain two room memberships', async (t) => {
    const fixture = await controlledRuntime(); t.after(() => fixture.stop());
    const socket = await connectSocket(fixture.baseUrl); t.after(() => closeSocket(socket));
    const first = (await emitAck(socket, 'create-room', { roomName: 'First gate', mediaMode: 'mesh' })).room.code;
    const second = (await emitAck(socket, 'create-room', { roomName: 'Second gate', mediaMode: 'mesh' })).room.code;
    const canJoin = fixture.platform.canJoin;
    let count = 0, entered;
    /** @type {() => void} */
    let release;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = () => resolve(undefined); });
    fixture.platform.canJoin = async (...args) => {
        const result = await canJoin(...args);
        if (args[0] === first && ++count === 2) { entered(); await gate; }
        return result;
    };
    const joining = emitAck(socket, 'join-room', { roomId: first, username: 'One identity' });
    await started;
    const overlapping = await emitAck(socket, 'join-room', { roomId: second, username: 'One identity' });
    release();
    assert.equal((await joining).ok, true);
    const occupied = [first, second].map(id => fixture.app.rooms.get(id).users.has(socket.id));
    assert.equal(occupied.filter(Boolean).length, 1, JSON.stringify({ occupied, overlapping }));
    assert.equal((await emitAck(socket, 'join-room', { roomId: second, username: 'One identity' })).ok, true);
    assert.equal(fixture.app.rooms.get(first).users.has(socket.id), false);
    assert.equal(fixture.app.rooms.get(second).users.has(socket.id), true);
});

test('a denied password join preserves the empty room cleanup deadline', async (t) => {
    const fixture = await controlledRuntime(); t.after(() => fixture.stop());
    const socket = await connectSocket(fixture.baseUrl); t.after(() => closeSocket(socket));
    const created = await emitAck(socket, 'create-room', { roomName: 'Timed room', mediaMode: 'mesh', requirePassword: true, password: 'correct-password' });
    const room = fixture.app.rooms.get(created.room.code);
    assert.ok(room.cleanupTimer);
    const deadline = room.cleanupTimer;
    assert.equal((await emitAck(socket, 'join-room', { roomId: created.room.code, username: 'Guest', password: 'wrong-password' })).errorCode, 'ROOM_PASSWORD_INVALID');
    assert.equal(room.users.size, 0);
    assert.equal(room.cleanupTimer, deadline);
    assert.equal((await emitAck(socket, 'join-room', { roomId: created.room.code, username: 'Guest', password: 'correct-password' })).ok, true);
    assert.equal(room.cleanupTimer, null);
});

test('overlapping socket joins retain only one room seat and relay membership', async (t) => {
    const server = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
    t.after(() => server.stop());
    const socket = await connectSocket(server.baseUrl);
    t.after(() => closeSocket(socket));
    const a = (await emitAck(socket, 'create-room', { roomName: 'First', mediaMode: 'mesh' })).room.code;
    const b = (await emitAck(socket, 'create-room', { roomName: 'Second', mediaMode: 'mesh' })).room.code;
    const results = await Promise.all([a, b].map(roomId => emitAck(socket, 'join-room', { roomId, username: 'One socket' })));
    assert.ok(results.some(result => result.ok));
    const snapshots = await Promise.all([a, b].map(room => server.request(`/api/rooms/${room}`)));
    const seats = snapshots.map(result => result.body.participants?.length || 0);
    assert.equal(seats.reduce((sum, value) => sum + value, 0), 1, JSON.stringify(seats));
});

test('hidden status omits manual and activity fields from socket and room snapshots', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const owner = await connectSocket(server.baseUrl), peer = await connectSocket(server.baseUrl);
    t.after(() => Promise.all([closeSocket(owner), closeSocket(peer)]));
    const created = await emitAck(owner, 'create-room', { roomName: 'Private status', mediaMode: 'mesh' });
    for (const [socket, username] of [[owner, 'Owner'], [peer, 'Peer']]) {
        assert.equal((await emitAck(socket, 'join-room', { roomId: created.room.code, username })).ok, true);
    }
    const hiddenUpdate = new Promise(resolve => peer.once('status-update', resolve));
    assert.equal((await emitAck(owner, 'user-status', { status: { visible: false, text: 'PRIVATE-TEXT',
        goal: 'PRIVATE-GOAL', manual: 'PRIVATE-MANUAL', manualPreset: 'PRIVATE-PRESET',
        ambientType: 'PRIVATE-AMBIENT', timerMode: 'focus', autoSync: true } })).ok, true);
    const hidden = await hiddenUpdate;
    assert.doesNotMatch(JSON.stringify(hidden), /PRIVATE-|"focus"|"autoSync":true/);
    assert.doesNotMatch((await server.request(`/api/rooms/${created.room.code}`)).text, /PRIVATE-/);
    const visibleUpdate = new Promise(resolve => peer.once('status-update', resolve));
    await emitAck(owner, 'user-status', { status: { visible: true, manual: 'Reading', text: 'Reading' } });
    assert.equal((await visibleUpdate).status.manual, 'Reading');
});
