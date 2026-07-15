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

function uuidFor(index) {
    return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function preparedJoinSaga(index) {
    const joinedAt = Date.parse('2026-07-15T06:55:00.000Z') + index;
    return {
        operationId: uuidFor(index + 1),
        userId: '11111111-1111-4111-8111-111111111111',
        roomId: 'ABC123',
        joinedAt,
        preparedAt: joinedAt,
        previousMyRooms: [{
            roomId: 'OLD123',
            name: 'Prior room',
            role: 'joined',
            lastJoinedAt: joinedAt - 1,
            passwordHash: 'must-not-survive'
        }],
        events: [{
            eventId: uuidFor(index + 20_000),
            roomCode: 'ABC123',
            userId: '11111111-1111-4111-8111-111111111111',
            nickname: 'Student',
            eventType: 'join',
            roomSchemaVersion: 2,
            ownerUserId: null,
            roomExpiresAt: null,
            occurrenceId: null,
            lifecycleEpoch: 0,
            occurredAt: new Date(joinedAt).toISOString()
        }],
        authToken: 'must-not-survive'
    };
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

test('room snapshots sanitize and cap private prepared join sagas', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-join-sagas-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = makeStore(filePath);
    const room = {
        id: 'LOBBY',
        name: 'Lobby',
        joinCompensationOutbox: [
            ...Array.from({ length: 1001 }, (_, index) => preparedJoinSaga(index)),
            { operationId: 'not-a-uuid', authToken: 'drop-me' }
        ]
    };

    await store.flush(new Map([['LOBBY', room]]));
    const [reloaded] = makeStore(filePath).loadRooms({ strict: true });

    assert.equal(reloaded.joinCompensationOutbox.length, 1000);
    assert.deepEqual(reloaded.joinCompensationOutbox[0], {
        operationId: uuidFor(1),
        userId: '11111111-1111-4111-8111-111111111111',
        roomId: 'ABC123',
        joinedAt: Date.parse('2026-07-15T06:55:00.000Z'),
        preparedAt: Date.parse('2026-07-15T06:55:00.000Z'),
        previousMyRooms: [{
            roomId: 'OLD123',
            name: 'Prior room',
            role: 'joined',
            lastJoinedAt: Date.parse('2026-07-15T06:55:00.000Z') - 1
        }],
        events: [preparedJoinSaga(0).events[0]]
    });
    assert.equal(JSON.stringify(reloaded).includes('must-not-survive'), false);
    assert.equal(JSON.stringify(reloaded).includes('drop-me'), false);
});

test('prepared join sagas preserve bounded opaque legacy user ids without collapsing invalid ids to guests', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-legacy-saga-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const valid = preparedJoinSaga(0);
    valid.userId = 'legacy:file-user-1';
    valid.events[0].userId = valid.userId;
    const invalid = preparedJoinSaga(1);
    invalid.userId = 'invalid\u0000user';
    invalid.events[0].userId = invalid.userId;

    await makeStore(filePath).flush(new Map([['LOBBY', {
        id: 'LOBBY',
        name: 'Lobby',
        joinCompensationOutbox: [valid, invalid]
    }]]));
    const [reloaded] = makeStore(filePath).loadRooms({ strict: true });

    assert.equal(reloaded.joinCompensationOutbox.length, 1);
    assert.equal(reloaded.joinCompensationOutbox[0].userId, 'legacy:file-user-1');
    assert.equal(reloaded.joinCompensationOutbox[0].events[0].userId, 'legacy:file-user-1');
});

test('strict hydration fails closed for a corrupted prepared join saga', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-corrupt-saga-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const corrupt = preparedJoinSaga(0);
    corrupt.events[0].userId = 'different-user';
    fs.writeFileSync(filePath, `${JSON.stringify([{
        id: 'LOBBY',
        name: 'Lobby',
        joinCompensationOutbox: [corrupt]
    }])}\n`);

    assert.throws(
        () => makeStore(filePath).loadRooms({ strict: true }),
        /join compensation journal contains an invalid or duplicate intent/
    );
});

test('strict hydration rejects duplicate normalized room ids before a Lobby journal can be overwritten', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-duplicate-lobby-'));
    const filePath = path.join(directory, 'rooms.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(filePath, `${JSON.stringify([{
        id: 'lobby',
        name: 'First Lobby',
        joinCompensationOutbox: [preparedJoinSaga(0)]
    }, {
        id: 'LOBBY',
        name: 'Second Lobby',
        joinCompensationOutbox: []
    }])}\n`);

    assert.throws(
        () => makeStore(filePath).loadRooms({ strict: true }),
        /duplicate normalized room id/i
    );
});
