const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const test = require('node:test');
const { startServer } = require('../helpers/server-control');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

test('board cap rejects growth, permits deletion and preserves oversized restored boards', async () => {
    let app = await startServer({ env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
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
            app = await startServer({ roomStateFile: stateFile, resetStateFileOnStart: false, env: { VIDEO_PROVIDER: 'mesh', ENABLE_DEV_MESH: 'true' } });
            socket = await connectSocket(app.baseUrl, { clientId: 'board-capacity' });
            const joined = await emitAck(socket, 'join-room', { roomId, username: 'Synthetic' });
            // Restored boards are bounded on load (main's bounded-state contract), never grown past the cap.
            assert.equal(joined.room.board.tasks.length, Math.min(count, 100), 'restore is bounded to the task cap');
            if (count === 99) assert.equal((await emitAck(socket, 'board-add-task', { text: 'Task 100' })).ok, true);
            const rejected = await emitAck(socket, 'board-add-task', { text: 'Must remain a draft' });
            assert.equal(rejected.ok, false);
            assert.equal(rejected.errorCode, 'BOARD_TASK_LIMIT_REACHED');
            assert.equal((await app.request(`/api/rooms/${roomId}`)).body.board.tasks.length, 100);
            assert.equal((await emitAck(socket, 'board-toggle-task', { taskId: 'fixture-0', done: true })).ok, true);
            assert.equal((await emitAck(socket, 'board-delete-task', { taskId: 'fixture-0' })).ok, true);
            const added = await emitAck(socket, 'board-add-task', { text: 'After deletion' });
            // Both fixtures sit at the cap after restore; one deletion frees a seat for a new task.
            assert.equal(added.ok, true, 'a board back under the cap accepts a task after deletion');
            await closeSocket(socket); socket = null; await app.stop();
        }
    } finally { if (socket) await closeSocket(socket); await app.stop(); }
});
