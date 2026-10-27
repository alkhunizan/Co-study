const assert = require('node:assert/strict');
const test = require('node:test');
const { startServer } = require('../helpers/server-control');
const { closeSocket, connectSocket, emitAck } = require('../helpers/socket-client');

test('a requested room password is required before creating a protected room', async (t) => {
    const server = await startServer(); t.after(() => server.stop());
    const creator = await connectSocket(server.baseUrl), outsider = await connectSocket(server.baseUrl);
    t.after(() => Promise.all([closeSocket(creator), closeSocket(outsider)]));
    for (const password of ['', '   ', {}, undefined]) {
        const created = await emitAck(creator, 'create-room', { roomName: 'Private intent', mediaMode: 'mesh', requirePassword: true, password });
        assert.equal(created.ok, false, `invalid password type ${typeof password}`);
        assert.equal(created.errorCode, 'ROOM_PASSWORD_REQUIRED');
        assert.equal(created.room, undefined);
    }
    const protectedRoom = await emitAck(creator, 'create-room', { roomName: 'Protected control', mediaMode: 'mesh', requirePassword: true, password: 'valid-test-password' });
    assert.equal(protectedRoom.ok, true);
    assert.equal((await emitAck(outsider, 'join-room', { roomId: protectedRoom.room.code, username: 'Outsider' })).errorCode, 'ROOM_PASSWORD_REQUIRED');
    assert.equal((await emitAck(outsider, 'join-room', { roomId: protectedRoom.room.code, username: 'Allowed', password: 'valid-test-password' })).ok, true);
    const publicRoom = await emitAck(creator, 'create-room', { roomName: 'Public control', mediaMode: 'mesh', requirePassword: false });
    assert.equal(publicRoom.ok, true);
    assert.equal((await emitAck(outsider, 'join-room', { roomId: publicRoom.room.code, username: 'Public guest' })).ok, true);
});
