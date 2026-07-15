const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    applyRestorePlan,
    buildRestorePlan,
    createSupabaseRestoreTarget,
    requiresDeletionTombstoneFilter
} = require('../../services/ops/backup-restore');

function sampleBundle() {
    return {
        manifest: {
            schemaVersion: 1,
            createdAt: '2026-07-15T02:15:00.000Z',
            sources: {},
            failedSources: []
        },
        datasets: {
            profiles: [{ id: 'deleted-user' }, { id: 'active-user' }],
            focus_sessions: [
                { id: 1, user_id: 'deleted-user' },
                { id: 2, user_id: 'active-user' }
            ],
            room_events: [
                { id: 1, user_id: 'deleted-user' },
                { id: 2, user_id: 'active-user' }
            ],
            rooms: [
                { id: 'OLD', ownerUserId: 'deleted-user' },
                { id: 'LIVE', ownerUserId: 'active-user' }
            ]
        }
    };
}

test('restore plans filter every current deletion tombstone before data can be applied', () => {
    const plan = buildRestorePlan({
        bundle: sampleBundle(),
        deletionTombstones: [{ user_id: 'deleted-user' }]
    });

    assert.deepEqual(plan.datasets.profiles, [{ id: 'active-user' }]);
    assert.deepEqual(plan.datasets.focus_sessions, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.room_events, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.rooms, [{ id: 'LIVE', ownerUserId: 'active-user' }]);
    assert.deepEqual(plan.filtered, {
        profiles: 1,
        focus_sessions: 1,
        room_events: 1,
        rooms: 1
    });
});

test('rooms-only restore artifacts still require current tombstones when ownership can resurrect a user', () => {
    assert.equal(requiresDeletionTombstoneFilter({
        datasets: {
            rooms: [{ id: 'OWNED', ownerUserId: 'deleted-user' }]
        }
    }), true);
    assert.equal(requiresDeletionTombstoneFilter({
        datasets: {
            rooms: [{ id: 'ANONYMOUS', ownerUserId: null }]
        }
    }), false);
});

test('restore defaults to dry-run and performs no writes', async () => {
    const calls = [];
    const result = await applyRestorePlan({
        plan: buildRestorePlan({ bundle: sampleBundle(), deletionTombstones: [] }),
        target: {
            async restoreProfiles() { calls.push('profiles'); },
            async restoreFocusSessions() { calls.push('focus_sessions'); },
            async restoreRoomEvents() { calls.push('room_events'); },
            async restoreRooms() { calls.push('rooms'); }
        }
    });

    assert.equal(result.mode, 'dry-run');
    assert.deepEqual(calls, []);
});

test('restore apply requires explicit stopped-writer confirmation and rejects an active lock', async (t) => {
    const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-restore-lock-'));
    const lockFile = path.join(lockDir, 'writer.lock');
    fs.writeFileSync(lockFile, 'active\n', 'utf8');
    t.after(() => fs.rmSync(lockDir, { recursive: true, force: true }));
    const plan = buildRestorePlan({ bundle: sampleBundle(), deletionTombstones: [] });
    const target = {};

    await assert.rejects(
        applyRestorePlan({ plan, target, apply: true }),
        /--writer-stopped/i
    );
    await assert.rejects(
        applyRestorePlan({ plan, target, apply: true, writerStopped: true, writerLockFile: lockFile }),
        /writer lock is present/i
    );
});

test('restore applies profiles, event tables, then rooms in dependency order', async () => {
    const calls = [];
    const plan = buildRestorePlan({ bundle: sampleBundle(), deletionTombstones: [] });
    const result = await applyRestorePlan({
        plan,
        apply: true,
        writerStopped: true,
        target: {
            async restoreProfiles(rows) { calls.push(['profiles', rows.length]); },
            async restoreFocusSessions(rows) { calls.push(['focus_sessions', rows.length]); },
            async restoreRoomEvents(rows) { calls.push(['room_events', rows.length]); },
            async restoreRooms(rows) { calls.push(['rooms', rows.length]); }
        }
    });

    assert.equal(result.mode, 'applied');
    assert.deepEqual(calls.map(([name]) => name), [
        'profiles',
        'focus_sessions',
        'room_events',
        'rooms'
    ]);
});

test('a failed restore phase stops before dependent event and room writes', async () => {
    const calls = [];
    const plan = buildRestorePlan({ bundle: sampleBundle(), deletionTombstones: [] });

    await assert.rejects(
        applyRestorePlan({
            plan,
            apply: true,
            writerStopped: true,
            target: {
                async restoreProfiles() {
                    calls.push('profiles');
                    throw new Error('injected profile failure');
                },
                async restoreFocusSessions() { calls.push('focus_sessions'); },
                async restoreRoomEvents() { calls.push('room_events'); },
                async restoreRooms() { calls.push('rooms'); }
            }
        }),
        /injected profile failure/
    );
    assert.deepEqual(calls, ['profiles']);
});

test('Supabase restore target paginates tombstones and writes bounded idempotent batches', async () => {
    const selects = [];
    const upserts = [];
    const client = {
        async select(table, query) {
            selects.push({ table, query });
            return query.includes('offset=0')
                ? [{ user_id: 'deleted-1' }, { user_id: 'deleted-2' }]
                : [];
        },
        async upsert(table, rows, options) {
            upserts.push({ table, rows, options });
        }
    };
    const target = createSupabaseRestoreTarget({ client, pageSize: 2, batchSize: 2 });

    const tombstones = await target.readDeletionTombstones();
    await target.restoreProfiles([{ id: 1 }, { id: 2 }, { id: 3 }]);

    assert.equal(tombstones.length, 2);
    assert.match(selects[1].query, /offset=2/);
    assert.deepEqual(upserts.map((entry) => entry.rows.length), [2, 1]);
    assert.ok(upserts.every((entry) => entry.table === 'profiles'));
    assert.ok(upserts.every((entry) => entry.options.onConflict === 'id'));
});
