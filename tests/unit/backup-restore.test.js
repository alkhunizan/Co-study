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
            createdAt: '2026-07-14T02:15:00.000Z',
            sources: {},
            failedSources: []
        },
        datasets: {
            profiles: [{ id: 'deleted-user' }, { id: 'active-user' }],
            focus_completion_claims: [
                { user_id: 'deleted-user', completion_id: 'deleted-claim' },
                { user_id: 'active-user', completion_id: 'active-claim' }
            ],
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
        deletionTombstones: [{ user_id: 'deleted-user', expires_at: '2026-08-14T00:00:00.000Z' }],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.deepEqual(plan.datasets.profiles, [{ id: 'active-user' }]);
    assert.deepEqual(plan.datasets.focus_completion_claims, [{
        user_id: 'active-user',
        completion_id: 'active-claim'
    }]);
    assert.deepEqual(plan.datasets.focus_sessions, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.room_events, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.rooms, [{ id: 'LIVE', ownerUserId: 'active-user' }]);
    assert.deepEqual(plan.filtered, {
        profiles: 1,
        focus_completion_claims: 1,
        focus_sessions: 1,
        room_events: 1,
        rooms: 1
    });
});

test('expired deletion tombstones no longer suppress a restore', () => {
    const plan = buildRestorePlan({
        bundle: sampleBundle(),
        deletionTombstones: [{ user_id: 'deleted-user', expires_at: '2026-07-14T23:59:59.000Z' }],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.equal(plan.datasets.profiles.length, 2);
    assert.equal(plan.filtered.profiles, 0);
});

test('embedded tombstones keep deleted accounts suppressed within the restore safety window', () => {
    const bundle = sampleBundle();
    bundle.manifest.schemaVersion = 2;
    bundle.manifest.createdAt = '2026-06-16T02:15:00.000Z';
    bundle.datasets.deletion_tombstones = [{
        user_id: 'deleted-user',
        deleted_at: '2026-05-02T00:00:00.000Z',
        expires_at: '2026-06-01T00:00:00.000Z',
        reason: 'user_request'
    }];
    bundle.datasets.profiles.push({ id: 'newly-deleted-user' });
    bundle.datasets.focus_sessions.push({ id: 3, user_id: 'newly-deleted-user' });
    bundle.datasets.room_events.push({
        id: 3,
        user_id: 'newly-deleted-user',
        owner_user_id: 'newly-deleted-user'
    });
    bundle.datasets.rooms.push({ id: 'NEWLY-DELETED', ownerUserId: 'newly-deleted-user' });

    const plan = buildRestorePlan({
        bundle,
        deletionTombstones: [{
            user_id: 'newly-deleted-user',
            deleted_at: '2026-07-10T00:00:00.000Z',
            expires_at: '2026-08-09T00:00:00.000Z',
            reason: 'user_request'
        }],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.deepEqual(plan.datasets.profiles, [{ id: 'active-user' }]);
    assert.deepEqual(plan.datasets.focus_completion_claims, [{
        user_id: 'active-user',
        completion_id: 'active-claim'
    }]);
    assert.deepEqual(plan.datasets.focus_sessions, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.room_events, [{ id: 2, user_id: 'active-user' }]);
    assert.deepEqual(plan.datasets.rooms, [{ id: 'LIVE', ownerUserId: 'active-user' }]);
    assert.deepEqual(plan.tombstoneProtection, {
        artifactCount: 1,
        currentCount: 1,
        protectedUserCount: 2
    });
});

test('schema-v2 user-bearing artifacts fail closed at the tombstone retention boundary', () => {
    const bundle = sampleBundle();
    bundle.manifest.schemaVersion = 2;
    bundle.manifest.createdAt = '2026-06-15T00:00:00.000Z';
    bundle.datasets.deletion_tombstones = [];

    assert.throws(
        () => buildRestorePlan({
            bundle,
            deletionTombstones: [],
            now: Date.parse('2026-07-15T00:00:00.000Z')
        }),
        /backup artifact is too old/i
    );
});

test('schema-v2 user-bearing artifacts fail closed when creation time is in the future', () => {
    const bundle = sampleBundle();
    bundle.manifest.schemaVersion = 2;
    bundle.manifest.createdAt = '2026-07-15T00:00:00.001Z';
    bundle.datasets.deletion_tombstones = [];

    assert.throws(
        () => buildRestorePlan({
            bundle,
            deletionTombstones: [],
            now: Date.parse('2026-07-15T00:00:00.000Z')
        }),
        /backup artifact creation time is in the future/i
    );
});

test('old schema-v2 owned-room artifacts fail closed even without database datasets', () => {
    const bundle = {
        manifest: {
            schemaVersion: 2,
            createdAt: '2026-06-15T00:00:00.000Z',
            sources: {},
            failedSources: []
        },
        datasets: {
            rooms: [{ id: 'OWNED', ownerUserId: 'deleted-after-backup' }]
        }
    };

    assert.throws(
        () => buildRestorePlan({
            bundle,
            deletionTombstones: [],
            now: Date.parse('2026-07-15T00:00:00.000Z')
        }),
        /backup artifact is too old/i
    );
});

test('current tombstone rows override artifact rows before an applied restore', () => {
    const bundle = sampleBundle();
    bundle.manifest.schemaVersion = 2;
    bundle.datasets.deletion_tombstones = [{
        user_id: 'deleted-user',
        deleted_at: '2026-07-01T00:00:00.000Z',
        expires_at: '2026-07-31T00:00:00.000Z',
        reason: 'artifact'
    }];
    const current = {
        user_id: 'deleted-user',
        deleted_at: '2026-07-10T00:00:00.000Z',
        expires_at: '2026-08-09T00:00:00.000Z',
        reason: 'user_request'
    };

    const plan = buildRestorePlan({
        bundle,
        deletionTombstones: [current],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

    assert.deepEqual(plan.datasets.deletion_tombstones, [current]);
    assert.deepEqual(plan.tombstoneProtection, {
        artifactCount: 1,
        currentCount: 1,
        protectedUserCount: 1
    });
});

test('legacy database artifacts at the tombstone expiry boundary fail closed', () => {
    const bundle = sampleBundle();
    bundle.manifest.createdAt = '2026-06-15T00:00:00.000Z';

    assert.throws(
        () => buildRestorePlan({
            bundle,
            deletionTombstones: [],
            now: Date.parse('2026-07-15T00:00:00.000Z')
        }),
        /legacy backup schema is too old/i
    );
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
        plan: buildRestorePlan({
            bundle: sampleBundle(),
            deletionTombstones: [],
            now: Date.parse('2026-07-15T00:00:00.000Z')
        }),
        target: {
            async restoreProfiles() { calls.push('profiles'); },
            async restoreFocusCompletionClaims() { calls.push('focus_completion_claims'); },
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
    const plan = buildRestorePlan({
        bundle: sampleBundle(),
        deletionTombstones: [],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });
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
    const plan = buildRestorePlan({
        bundle: sampleBundle(),
        deletionTombstones: [],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });
    const result = await applyRestorePlan({
        plan,
        apply: true,
        writerStopped: true,
        target: {
            async restoreProfiles(rows) { calls.push(['profiles', rows.length]); },
            async restoreFocusCompletionClaims(rows) {
                calls.push(['focus_completion_claims', rows.length]);
            },
            async restoreFocusSessions(rows) { calls.push(['focus_sessions', rows.length]); },
            async restoreRoomEvents(rows) { calls.push(['room_events', rows.length]); },
            async restoreRooms(rows) { calls.push(['rooms', rows.length]); }
        }
    });

    assert.equal(result.mode, 'applied');
    assert.deepEqual(calls.map(([name]) => name), [
        'profiles',
        'focus_completion_claims',
        'focus_sessions',
        'room_events',
        'rooms'
    ]);
});

test('schema-v2 restore writes protective tombstones before profiles and rooms', async () => {
    const bundle = sampleBundle();
    bundle.manifest.schemaVersion = 2;
    bundle.datasets.deletion_tombstones = [{
        user_id: 'deleted-user',
        deleted_at: '2026-07-01T00:00:00.000Z',
        expires_at: '2026-07-31T00:00:00.000Z',
        reason: 'user_request'
    }];
    const calls = [];
    const plan = buildRestorePlan({
        bundle,
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

    await applyRestorePlan({
        plan,
        apply: true,
        writerStopped: true,
        target: {
            async restoreDeletionTombstones() { calls.push('deletion_tombstones'); },
            async restoreProfiles() { calls.push('profiles'); },
            async restoreFocusCompletionClaims() { calls.push('focus_completion_claims'); },
            async restoreFocusSessions() { calls.push('focus_sessions'); },
            async restoreRoomEvents() { calls.push('room_events'); },
            async restoreRooms() { calls.push('rooms'); }
        }
    });

    assert.deepEqual(calls, [
        'deletion_tombstones',
        'profiles',
        'focus_completion_claims',
        'focus_sessions',
        'room_events',
        'rooms'
    ]);
});

test('a failed restore phase stops before dependent event and room writes', async () => {
    const calls = [];
    const plan = buildRestorePlan({
        bundle: sampleBundle(),
        deletionTombstones: [],
        now: Date.parse('2026-07-15T00:00:00.000Z')
    });

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
                async restoreFocusCompletionClaims() { calls.push('focus_completion_claims'); },
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
                ? [
                    { user_id: 'deleted-1', expires_at: '2026-08-14T00:00:00.000Z' },
                    { user_id: 'deleted-2', expires_at: '2026-08-14T00:00:00.000Z' }
                ]
                : [];
        },
        async upsert(table, rows, options) {
            upserts.push({ table, rows, options });
        }
    };
    const target = createSupabaseRestoreTarget({
        client,
        pageSize: 2,
        batchSize: 2,
        now: () => Date.parse('2026-07-15T00:00:00.000Z')
    });

    const tombstones = await target.readDeletionTombstones();
    await target.restoreProfiles([{ id: 1 }, { id: 2 }, { id: 3 }]);

    assert.equal(tombstones.length, 2);
    assert.match(selects[1].query, /offset=2/);
    assert.match(selects[0].query, /expires_at=gt\./);
    assert.deepEqual(upserts.map((entry) => entry.rows.length), [2, 1]);
    assert.ok(upserts.every((entry) => entry.table === 'profiles'));
    assert.ok(upserts.every((entry) => entry.options.onConflict === 'id'));
});
