const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createVideoRevocations } = require('../../services/video/revocations');
const { startServer, delay } = require('../helpers/server-control');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');
const { extractCookies } = require('../helpers/auth-helpers');

test('revocation journal retries failures and revokes surviving grants after restart', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-revocation-'));
    const file = path.join(directory, 'grants.json');
    let fail = true;
    const removed = [];
    const provider = { async revokeParticipant(row) { if (fail) throw new Error('offline'); removed.push(row.id); } };
    const logger = { error() {} };
    const first = createVideoRevocations({ file, provider, logger });
    await first.track({ meetingId: 'meeting', participantId: 'participant', socketId: 'socket', roomId: 'room' });
    await first.close();
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8'))[0].pending, true);
    const second = createVideoRevocations({ file, provider, logger });
    fail = false;
    await second.drain();
    assert.equal(removed.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), []);
    await second.close();
});

test('failed revocations rotate fairly and a rejected runtime never touches the journal', async () => {
    const tried = [];
    const journal = createVideoRevocations({ file: null, logger: { error() {} },
        provider: { async revokeParticipant(row) { tried.push(row.participantId); throw new Error('offline'); } } });
    for (let i = 0; i < 21; i++) {
        await journal.track({ meetingId: 'meeting', participantId: String(i), socketId: 'socket', roomId: 'room' });
    }
    await journal.revokeWhere(() => true);
    await journal.drain();
    assert.ok(tried.includes('20'));
    await journal.close();
    const blocked = createVideoRevocations({ file: 'must-not-be-created/grants.json',
        provider: {}, logger: { error() {} }, start: Promise.reject(new Error('PLATFORM_LOCKED')) });
    await assert.rejects(blocked.ready, /PLATFORM_LOCKED/);
    await assert.rejects(blocked.close(), /PLATFORM_LOCKED/);
    assert.equal(blocked.status().healthy, false);
});

test('late video mint after disconnect is revoked, duplicate mint excluded, foreign leave denied', async (t) => {
    const server = await startServer({ withFakeRealtimeKit: true, fakeRealtimeKitOptions: { participantDelay: 500 } });
    t.after(() => server.stop());
    const cookie = extractCookies((await server.request('/api/runtime-config')).headers['set-cookie']);
    const socket = await connectSocket(server.baseUrl, { clientId: 'revocation-client', extraHeaders: { Cookie: cookie } });
    t.after(() => closeSocket(socket));
    const created = await emitAck(socket, 'create-room', { roomName: 'Revocation test' });
    const roomId = created.room.roomId;
    await emitAck(socket, 'join-room', { roomId, username: 'Member', clientId: 'revocation-client' });
    const body = { displayName: 'Member', clientSessionId: 'revocation-client', role: 'student' };
    const pending = server.request(`/api/rooms/${roomId}/video-token`, { method: 'POST', body, headers: { Cookie: cookie } });
    for (let i = 0; i < 50 && !(await server.realtimeKitState()).participants.length; i++) await delay(20);
    const duplicate = await server.request(`/api/rooms/${roomId}/video-token`, { method: 'POST', body, headers: { Cookie: cookie } });
    assert.equal(duplicate.status, 409);
    const foreign = await server.request(`/api/rooms/${roomId}/video-leave`, {
        method: 'POST', body
    });
    assert.equal(foreign.status, 403);
    socket.disconnect();
    const response = await pending;
    assert.equal(response.status, 403);
    assert.equal(response.body.authToken, undefined);
    const participant = (await server.realtimeKitState()).participants[0];
    assert.equal(participant.kicked, true);
    assert.equal(participant.revoked, true);
});
