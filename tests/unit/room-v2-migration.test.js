const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    applyRoomMigration,
    buildRoomMigrationPlan,
    loadMigrationUsers,
    parseArgs
} = require('../../scripts/migrate-rooms');

function scheduledRoom(id) {
    return {
        id,
        name: id,
        schedule: {
            timezone: 'Asia/Riyadh',
            startDate: '2026-07-20',
            startTime: '10:00',
            cadence: 'once',
            focusMinutes: 50,
            breakMinutes: 10
        }
    };
}

test('room v2 plan reports unique, ambiguous, and absent ownership exactly', () => {
    const plan = buildRoomMigrationPlan({
        rooms: [{ id: 'unique' }, { id: 'AMBIG' }, { id: 'absent' }],
        users: [
            { id: 'one', myRooms: [{ roomId: 'UNIQUE', role: 'created' }] },
            { id: 'two', myRooms: [{ roomId: 'AMBIG', role: 'created' }] },
            { id: 'three', myRooms: [{ roomId: 'ambig', role: 'created' }] }
        ]
    });

    assert.deepEqual(plan.summary.ownership, { unique: 1, ambiguous: 1, absent: 1, preserved: 0 });
    assert.deepEqual(plan.rooms.map((room) => ({
        roomId: room.roomId,
        classification: room.ownership.classification,
        candidates: room.ownership.candidateUserIds,
        owner: room.ownership.toOwnerUserId
    })), [
        { roomId: 'UNIQUE', classification: 'unique', candidates: ['one'], owner: 'one' },
        { roomId: 'AMBIG', classification: 'ambiguous', candidates: ['three', 'two'], owner: null },
        { roomId: 'ABSENT', classification: 'absent', candidates: [], owner: null }
    ]);
    assert.equal(plan.migratedRooms[0].schemaVersion, 2);
    assert.equal(plan.migratedRooms[1].ownerUserId, null);
});

test('room v2 plan reports scheduled expiry, normalization, and preserved board overflow', () => {
    const tasks = Array.from({ length: 101 }, (_, index) => ({
        id: `task-${index}`,
        text: index === 0 ? ` ${'x'.repeat(600)} ` : `Task ${index}`,
        priority: 9,
        done: false
    }));
    const room = scheduledRoom(' lower ');
    room.board = { goal: ' Goal ', tasks };

    const plan = buildRoomMigrationPlan({ rooms: [room], users: [] });
    const detail = plan.rooms[0];

    assert.equal(detail.roomId, 'LOWER');
    assert.equal(detail.expiry.changed, true);
    assert.ok(Number.isFinite(detail.expiry.to));
    assert.equal(detail.overflow.changed, true);
    assert.equal(detail.overflow.originalTaskCount, 101);
    assert.equal(detail.overflow.activeTaskCount, 100);
    assert.equal(detail.overflow.archivedTaskCount, 1);
    assert.ok(detail.normalization.fields.includes('id'));
    assert.ok(detail.normalization.fields.includes('schedule'));
    assert.ok(detail.normalization.fields.includes('board'));
    assert.equal(plan.migratedRooms[0].board.tasks.length, 100);
    assert.equal(Buffer.byteLength(plan.migratedRooms[0].board.tasks[0].text, 'utf8'), 500);
    assert.deepEqual(plan.overflowArchive.rooms[0].board, room.board);
});

test('room v2 migration plan is idempotent after the first migration', () => {
    const first = buildRoomMigrationPlan({ rooms: [scheduledRoom('ROOM1')], users: [] });
    const second = buildRoomMigrationPlan({ rooms: first.migratedRooms, users: [] });

    assert.equal(first.changesRequired, true);
    assert.equal(second.changesRequired, false);
    assert.equal(second.summary.roomsChanged, 0);
    assert.deepEqual(second.migratedRooms, first.migratedRooms);
});

test('production profile loading is read-only, selects only ownership fields, and paginates', async () => {
    const queries = [];
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `user-${index}`, my_rooms: [] }));
    const client = Object.freeze({
        async select(table, query) {
            queries.push({ table, query });
            return queries.length === 1 ? firstPage : [{ id: 'last-user', my_rooms: [] }];
        }
    });

    const result = await loadMigrationUsers({
        env: {
            NODE_ENV: 'production',
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
        },
        supabaseClient: client
    });

    assert.equal(result.source, 'supabase');
    assert.equal(result.users.length, 1001);
    assert.deepEqual(queries, [
        { table: 'profiles', query: 'select=id,my_rooms&order=id.asc&limit=1000&offset=0' },
        { table: 'profiles', query: 'select=id,my_rooms&order=id.asc&limit=1000&offset=1000' }
    ]);
    assert.deepEqual(Object.keys(client), ['select']);
});

test('production room migration fails closed without complete Supabase configuration', async () => {
    await assert.rejects(
        loadMigrationUsers({ env: { NODE_ENV: 'production' } }),
        /complete Supabase.*required/i
    );
    await assert.rejects(
        loadMigrationUsers({
            env: { NODE_ENV: 'production', SUPABASE_URL: 'http://127.0.0.1:54321' }
        }),
        /configured together/i
    );
});

test('apply requires both explicit guards and an atomic failure preserves the original', () => {
    assert.deepEqual(parseArgs([]), { apply: false, writerStopped: false, help: false });
    assert.throws(() => parseArgs(['--apply']), /--writer-stopped/);
    assert.throws(() => parseArgs(['--writer-stopped']), /--apply/);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-migrate-'));
    const roomFile = path.join(directory, 'rooms.json');
    const original = `${JSON.stringify([{ id: 'ROOM1' }], null, 2)}\n`;
    fs.writeFileSync(roomFile, original, 'utf8');
    const plan = buildRoomMigrationPlan({ rooms: JSON.parse(original), users: [] });
    const fsImpl = {
        ...fs,
        renameSync(source, destination) {
            if (destination === roomFile) throw new Error('injected atomic replace failure');
            return fs.renameSync(source, destination);
        }
    };

    assert.throws(
        () => applyRoomMigration({ roomFile, backupDir: directory, sourceText: original, plan, fsImpl }),
        /injected atomic replace failure/
    );
    assert.equal(fs.readFileSync(roomFile, 'utf8'), original);
    const backups = fs.readdirSync(directory).filter((name) => name.includes('.pre-room-v2.'));
    assert.equal(backups.length, 1);
    const backup = JSON.parse(fs.readFileSync(path.join(directory, backups[0]), 'utf8'));
    assert.equal(backup.sourceSha256, require('node:crypto').createHash('sha256').update(original).digest('hex'));
    assert.equal(Buffer.from(backup.sourceBase64, 'base64').toString('utf8'), original);
    fs.rmSync(directory, { recursive: true, force: true });
});

test('an exclusive-backup race never removes or overwrites the competing backup', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-backup-race-'));
    const roomFile = path.join(directory, 'rooms.json');
    const original = `${JSON.stringify([{ id: 'ROOM1' }])}\n`;
    fs.writeFileSync(roomFile, original, 'utf8');
    const plan = buildRoomMigrationPlan({ rooms: JSON.parse(original), users: [] });
    let racedPath = null;
    const fsImpl = {
        ...fs,
        openSync(filePath, flags, mode) {
            if (filePath.includes('.pre-room-v2.') && !racedPath) {
                racedPath = filePath;
                fs.writeFileSync(filePath, 'competing-backup', { flag: 'wx', mode: 0o600 });
            }
            return fs.openSync(filePath, flags, mode);
        }
    };

    assert.throws(
        () => applyRoomMigration({ roomFile, backupDir: directory, sourceText: original, plan, fsImpl }),
        /EEXIST/
    );
    assert.equal(fs.readFileSync(racedPath, 'utf8'), 'competing-backup');
    assert.equal(fs.readFileSync(roomFile, 'utf8'), original);
    fs.rmSync(directory, { recursive: true, force: true });
});
