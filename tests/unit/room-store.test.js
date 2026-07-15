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

test('legacy board overflow is archived before active state is trimmed', (t) => {
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

    const [room] = makeStore(filePath).loadRooms({ strict: true });
    const backupName = fs.readdirSync(directory).find((name) => name.includes('.board-overflow-'));

    assert.equal(room.board.tasks.length, 100);
    assert.ok(backupName);
    const backup = JSON.parse(fs.readFileSync(path.join(directory, backupName), 'utf8'));
    assert.equal(backup.rooms[0].board.tasks.length, 101);
    assert.ok(Buffer.byteLength(JSON.stringify(room.board), 'utf8') <= 64 * 1024);
});
