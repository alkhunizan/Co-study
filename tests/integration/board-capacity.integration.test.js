const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const test = require('node:test');
const { startServer } = require('../helpers/server-control');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

test('board cap rejects growth, permits deletion and preserves oversized restored boards', async () => {
    let app = await startServer({ env: { VIDEO_PROVIDER: 'mesh' } });
    let socket;
    const stateFile = app.roomStateFile;
    try {
        socket = await connectSocket(app.baseUrl, { clientId: 'board-capacity' });
        const created = await emitAck(socket, 'create-room', { roomName: 'Capacity fixture' });
        const roomId = created.room.roomId;
        await emitAck(socket, 'join-room', { roomId, username: 'Synthetic' });
        assert.equal((await emitAck(socket, 'board-add-task', { text: 'Seed' })).ok, true);
        let rows;
        // Read a real serializer envelope once its debounced flush completes.
        for (let i = 0; i < 50; i++) {
            try { rows = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (_error) {}
            if (rows?.find(r => (r.roomId || r.id) === roomId)?.board?.tasks?.length) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        const row = rows.find(r => (r.roomId || r.id) === roomId);
        const seed = row.board.tasks[0];
        await closeSocket(socket); socket = null; await app.stop();
        for (const count of [99, 101]) {
            row.board.tasks = Array.from({ length: count }, (_, i) => ({ ...seed, id: `fixture-${i}` }));
            await fs.writeFile(stateFile, JSON.stringify(rows));
            app = await startServer({ roomStateFile: stateFile, resetStateFileOnStart: false, env: { VIDEO_PROVIDER: 'mesh' } });
            socket = await connectSocket(app.baseUrl, { clientId: 'board-capacity' });
            const joined = await emitAck(socket, 'join-room', { roomId, username: 'Synthetic' });
            assert.equal(joined.room.board.tasks.length, count, 'restore must never truncate tasks');
            if (count === 99) assert.equal((await emitAck(socket, 'board-add-task', { text: 'Task 100' })).ok, true);
            const rejected = await emitAck(socket, 'board-add-task', { text: 'Must remain a draft' });
            assert.equal(rejected.ok, false);
            assert.equal(rejected.errorCode, 'BOARD_TASK_LIMIT');
            assert.equal((await app.request(`/api/rooms/${roomId}`)).body.board.tasks.length, Math.max(count, 100));
            assert.equal((await emitAck(socket, 'board-toggle-task', { taskId: 'fixture-0', done: true })).ok, true);
            assert.equal((await emitAck(socket, 'board-delete-task', { taskId: 'fixture-0' })).ok, true);
            const added = await emitAck(socket, 'board-add-task', { text: 'After deletion' });
            assert.equal(added.ok, count === 99, 'oversized board must drop below cap before adding');
            await closeSocket(socket); socket = null; await app.stop();
        }
    } finally { if (socket) await closeSocket(socket); await app.stop(); }
});
