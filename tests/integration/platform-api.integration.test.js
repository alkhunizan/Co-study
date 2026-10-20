const assert = require('node:assert/strict');
const test = require('node:test');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');
const { resetStateFile } = require('../helpers/test-env');

test('platform HTTP and socket journeys use real database and scoped policies', { timeout: 120000 }, async (t) => {
    const server = await startServer({
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATABASE_URL: '', PLATFORM_DATA_DIR: 'memory://', BILLING_MODE: 'test', VIDEO_PROVIDER: 'mesh', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }
    });
    const sockets = [];
    t.after(async () => {
        for (const socket of sockets) await closeSocket(socket);
        await server.stop();
        resetStateFile(server.roomStateFile);
        resetStateFile(server.userStateFile);
    });
    const alice = await signupUser(server, { email: 'alice@platform.test', displayName: 'Alice' });
    const bob = await signupUser(server, { email: 'bob@platform.test', displayName: 'Bob' });
    const request = (cookie, route, method = 'GET', body = undefined) =>
        server.request(`/api/platform${route}`, { method, headers: { Cookie: cookie }, body });
    const me = await request(alice.cookie, '/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.benefits.plan.id, 'free');
    assert.equal((await request(alice.cookie, '/staff/audit')).status, 403);
    const checkout = await request(alice.cookie, '/billing/checkout', 'POST', {});
    assert.equal(checkout.status, 200);
    const paid = await request(alice.cookie, `/billing/checkout/${checkout.body.id}/complete`, 'POST', { token: checkout.body.token, outcome: 'success' });
    assert.equal(paid.status, 200);
    const circle = await request(alice.cookie, '/cohorts', 'POST', { name: 'Test circle' });
    assert.equal(circle.status, 200);
    assert.equal((await request(bob.cookie, `/cohorts/${circle.body.id}/members`)).status, 404);
    const invitation = await request(alice.cookie, `/cohorts/${circle.body.id}/invitations`, 'POST', {});
    assert.equal((await request(bob.cookie, '/cohorts/accept', 'POST', { token: invitation.body.token })).status, 200);

    const socket = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: alice.cookie }, clientId: 'platform-alice' });
    sockets.push(socket);
    const created = await emitAck(socket, 'create-room', { roomName: 'Owned room' });
    assert.equal(created.ok, true);
    const code = created.room.roomId;
    const mine = await request(alice.cookie, '/rooms');
    assert.equal(mine.body.rooms[0].id, code);
    assert.equal((await request(bob.cookie, `/rooms/${code}`, 'PATCH', { name: 'Forged' })).status, 404);
    const schedule = await request(alice.cookie, `/cohorts/${circle.body.id}/sessions`, 'POST', {
        roomId: code, title: 'Focus together', startsAt: Date.now() + 60000, durationMinutes: 25
    });
    assert.equal(schedule.status, 200);
    const guest = await connectSocket(server.baseUrl, { clientId: 'platform-guest' });
    sockets.push(guest);
    assert.equal((await emitAck(guest, 'join-room', { roomId: code, username: 'Guest' })).errorCode, 'ROOM_MEMBERSHIP_REQUIRED');
    const preview = await server.request(`/api/rooms/${code}`);
    assert.equal(preview.body.room.messages, undefined);
    const joined = await emitAck(socket, 'join-room', { roomId: code, username: 'Alice' });
    assert.equal(joined.ok, true);
    const attendance = await request(alice.cookie, `/cohorts/${circle.body.id}/sessions/${schedule.body.id}/attendance`);
    assert.equal(attendance.status, 200);
    assert.equal(attendance.body.attendance.find((entry) => entry.display_name === 'Alice').status, 'on_time');
    const start = await request(alice.cookie, '/focus/start', 'POST', {});
    assert.equal(start.status, 200);
    assert.equal((await request(bob.cookie, `/focus/${start.body.id}/complete`, 'POST', {})).status, 404);
    const complete = await request(alice.cookie, `/focus/${start.body.id}/complete`, 'POST', {});
    assert.equal(complete.body.xp, 0);
    const deleted = await server.request('/api/me', { method: 'DELETE', headers: { Cookie: bob.cookie }, body: { password: bob.credentials.password } });
    assert.equal(deleted.status, 200);
    assert.equal((await request(bob.cookie, '/me')).status, 401);
    const capacityRoom = await emitAck(socket, 'create-room', { roomName: 'Concurrent seats', requirePassword: true, password: 'seat-test-password' });
    assert.equal(capacityRoom.ok, true);
    const contenders = await Promise.all(Array.from({ length: 5 }, (_value, index) =>
        connectSocket(server.baseUrl, { extraHeaders: { Cookie: alice.cookie }, clientId: `capacity-${index}` })));
    sockets.push(...contenders);
    const seats = await Promise.all(contenders.map((contender, index) => emitAck(contender, 'join-room', {
        roomId: capacityRoom.room.roomId, username: `Seat ${index}`, password: 'seat-test-password'
    })));
    assert.equal(seats.filter((entry) => entry.ok).length, 4, 'asynchronous auth must not oversubscribe mesh capacity');
    assert.equal(seats.filter((entry) => entry.errorCode === 'ROOM_FULL').length, 1);
    const remaining = await signupUser(server, { email: 'remaining@platform.test', displayName: 'Remaining member' });
    const finalInvite = await request(alice.cookie, `/cohorts/${circle.body.id}/invitations`, 'POST', {});
    assert.equal((await request(remaining.cookie, '/cohorts/accept', 'POST', { token: finalInvite.body.token })).status, 200);
    const memberSocket = await connectSocket(server.baseUrl, { extraHeaders: { Cookie: remaining.cookie } });
    sockets.push(memberSocket);
    assert.equal((await emitAck(memberSocket, 'join-room', { roomId: code, username: 'Remaining member' })).ok, true);
    const closed = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Owner deletion did not close the circle room')), 5000);
        memberSocket.once('disconnect', () => { clearTimeout(timeout); resolve(undefined); });
    });
    const ownerDeleted = await server.request('/api/me', {
        method: 'DELETE', headers: { Cookie: alice.cookie }, body: { password: alice.credentials.password }
    });
    assert.equal(ownerDeleted.status, 200);
    await closed;
    assert.equal(memberSocket.connected, false);
    assert.equal((await request(remaining.cookie, '/me')).body.cohorts.length, 0);
    assert.equal((await request(remaining.cookie, `/cohorts/${circle.body.id}/members`)).status, 404);
    assert.equal((await server.request('/api/health')).status, 200);
});
