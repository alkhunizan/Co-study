const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createRoomStore } = require('../../room-store');

function makeStore(filePath) {
    return createRoomStore({
        filePath,
        normalizeRoom: (value) => String(value || '').trim().toUpperCase(),
        normalizeMediaMode: () => 'mesh',
        normalizeVideoProvider: () => 'mesh',
        buildVideoPolicy: () => ({
            maxRoomParticipants: 20,
            screenshareEnabled: false,
            chatEnabled: false
        }),
        sanitizeRoomName: (value) => String(value || '').trim().slice(0, 48),
        sanitizeBoardGoal: (value) => String(value || '').trim().slice(0, 80),
        sanitizeBoardTaskText: (value) => String(value || '').trim().slice(0, 500),
        normalizeBoardPriority: (value) => Number(value) || 2,
        logger: { warn() {}, error() {} }
    });
}

test('legacy board overflow is detected and trimmed in memory without startup writes', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-store-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const tasks = Array.from({ length: 101 }, (_, index) => ({
        id: `task-${index}`,
        text: `Task ${index}`,
        priority: 2,
        done: false
    }));
    fs.writeFileSync(filePath, `${JSON.stringify([{ id: 'ABC123', board: { goal: '', tasks } }])}\n`);

    const store = makeStore(filePath);
    const before = fs.readFileSync(filePath, 'utf8');
    const [room] = store.loadRooms({ strict: true });
    const backupName = fs.readdirSync(directory).find((name) => name.includes('.board-overflow-'));

    assert.equal(room.board.tasks.length, 100);
    assert.equal(backupName, undefined);
    assert.equal(fs.readFileSync(filePath, 'utf8'), before);
    assert.equal(store.needsMigration(), true);
    assert.ok(Buffer.byteLength(JSON.stringify(room.board), 'utf8') <= 64 * 1024);
});

test('room snapshots preserve a bounded private lifecycle-event outbox', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-outbox-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = makeStore(filePath);
    const room = {
        id: 'LOBBY',
        name: 'Lobby',
        roomEventOutbox: [{
            eventId: '11111111-1111-4111-8111-111111111111',
            roomCode: 'ABC123',
            userId: null,
            nickname: 'Student',
            eventType: 'join',
            roomSchemaVersion: 2,
            ownerUserId: null,
            roomExpiresAt: '2026-10-13T08:00:00.000Z',
            occurrenceId: '2026-07-15T07:00:00.000Z',
            lifecycleEpoch: 4,
            occurredAt: '2026-07-15T06:55:00.000Z'
        }, {
            eventId: 'not-a-uuid',
            roomCode: 'LEAK',
            eventType: 'join'
        }]
    };

    await store.flush(new Map([['LOBBY', room]]));
    const [reloaded] = makeStore(filePath).loadRooms({ strict: true });

    assert.deepEqual(reloaded.roomEventOutbox, [room.roomEventOutbox[0]]);
});
