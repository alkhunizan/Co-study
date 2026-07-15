const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveBackupConfig } = require('../../co-study-server');
const {
    collectBackupDatasets,
    createSupabaseBackupSource,
    writeDailyBackupArtifact
} = require('../../services/ops/backup-service');
const { createBackupScheduler } = require('../../services/ops/backup-scheduler');

test('production disables the legacy plaintext snapshot scheduler', () => {
    assert.throws(
        () => resolveBackupConfig({ NODE_ENV: 'production', BACKUP_INTERVAL_MINUTES: '60' }),
        /plaintext backup scheduler is disabled in production/i
    );
    assert.equal(
        resolveBackupConfig({ NODE_ENV: 'production', BACKUP_INTERVAL_MINUTES: '0' }).plaintextSnapshotsAllowed,
        false
    );
});

test('legacy scheduler reports failure when it has zero readable targets', () => {
    const scheduler = createBackupScheduler({
        backupDir: path.join(os.tmpdir(), 'unused-halastudy-backup-dir'),
        targets: [],
        logger: { info() {}, error() {} }
    });

    assert.throws(() => scheduler.runBackup(), /no readable snapshot sources/i);
});

test('backup collection covers rooms plus injectable Supabase profiles and events', async () => {
    const source = {
        async readDataset(name) {
            return [{ source: name }];
        }
    };

    const result = await collectBackupDatasets({
        readRooms: async () => [{ id: 'ROOM1' }],
        supabaseSource: source
    });

    assert.deepEqual(Object.keys(result.datasets).sort(), [
        'focus_completion_claims',
        'focus_sessions',
        'profiles',
        'room_events',
        'rooms'
    ]);
    assert.deepEqual(result.failedSources, []);
});

test('backup collection records partial source failures but rejects zero readable sources', async () => {
    const partial = await collectBackupDatasets({
        readRooms: async () => [],
        supabaseSource: {
            async readDataset() {
                throw new Error('injected provider failure');
            }
        }
    });

    assert.deepEqual(partial.datasets, { rooms: [] });
    assert.deepEqual(partial.failedSources, [
        'focus_completion_claims',
        'focus_sessions',
        'profiles',
        'room_events'
    ]);

    await assert.rejects(
        collectBackupDatasets({
            readRooms: async () => { throw new Error('missing rooms'); },
            supabaseSource: {
                async readDataset() { throw new Error('provider down'); }
            }
        }),
        /no readable backup sources/i
    );
});

test('Supabase backup source paginates every table beyond 1000 rows', async () => {
    const queries = [];
    const page = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` }));
    const client = {
        async select(table, query) {
            queries.push({ table, query });
            return query.includes('offset=0') ? page : [{ id: 'row-1000' }];
        }
    };
    const source = createSupabaseBackupSource({ client });

    const rows = await source.readDataset('profiles');

    assert.equal(rows.length, 1001);
    assert.match(queries[0].query, /limit=1000/);
    assert.match(queries[1].query, /offset=1000/);
});

test('daily artifact writer retains one successful snapshot for each of the latest seven UTC days', (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-retention-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));

    for (let day = 1; day <= 8; day += 1) {
        writeDailyBackupArtifact({
            backupDir,
            artifact: { day },
            createdAt: new Date(`2026-07-${String(day).padStart(2, '0')}T02:15:00.000Z`),
            nonce: `run-${day}`
        });
    }
    writeDailyBackupArtifact({
        backupDir,
        artifact: { day: 8, replacement: true },
        createdAt: new Date('2026-07-08T03:15:00.000Z'),
        nonce: 'replacement'
    });

    const files = fs.readdirSync(backupDir).filter((name) => name.endsWith('.hsbackup'));
    assert.equal(files.length, 7);
    assert.ok(files.every((name) => !name.includes('2026-07-01')));
    assert.equal(files.filter((name) => name.includes('2026-07-08')).length, 1);
    if (process.platform !== 'win32') {
        for (const file of files) {
            const mode = fs.statSync(path.join(backupDir, file)).mode & 0o777;
            assert.equal(mode, 0o600);
        }
    }
});
