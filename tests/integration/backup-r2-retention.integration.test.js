const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createEncryptedBackupArtifact } = require('../../services/ops/backup-artifact');
const { main } = require('../../scripts/backup-r2');

const BACKUP_KEY = Buffer.alloc(32, 11).toString('base64');

test('R2 backup applies seven-day retention only to encrypted backup objects', async (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-retention-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const artifactName = 'halastudy-2026-07-09T021500Z-current.hsbackup';
    const artifact = createEncryptedBackupArtifact({
        datasets: {
            profiles: [],
            deletion_tombstones: [],
            focus_completion_claims: [],
            focus_sessions: [],
            room_events: [],
            rooms: []
        },
        encryptionKey: BACKUP_KEY,
        createdAt: new Date('2026-07-09T02:15:00.000Z'),
        randomBytes: (size) => Buffer.alloc(size, 4)
    });
    fs.writeFileSync(path.join(backupDir, artifactName), `${JSON.stringify(artifact)}\n`, 'utf8');

    const objects = Array.from({ length: 8 }, (_, index) => ({
        key: `encrypted/halastudy-2026-07-${String(index + 1).padStart(2, '0')}T021500Z-old.hsbackup`,
        lastModified: `2026-07-${String(index + 1).padStart(2, '0')}T02:15:00.000Z`
    }));
    objects.push({ key: 'encrypted/operator-note.txt', lastModified: '2026-07-01T00:00:00.000Z' });
    objects.push({ key: 'users/legacy.json', lastModified: '2026-07-01T00:00:00.000Z' });
    const calls = [];
    const client = {
        host: 'fixture.invalid',
        async headBucket() { return true; },
        async putObject(bucket, key) {
            calls.push(['put', bucket, key]);
            objects.push({ key, lastModified: '2026-07-09T02:15:00.000Z' });
        },
        async listObjectsDetailed(bucket, prefix) {
            calls.push(['list', bucket, prefix]);
            return objects;
        },
        async deleteObject(bucket, key) {
            calls.push(['delete', bucket, key]);
        }
    };

    const result = await main({
        args: ['--apply-retention'],
        env: {
            R2_BUCKET: 'backups',
            ROOM_STATE_BACKUP_DIR: backupDir,
            BACKUP_ENCRYPTION_KEY: BACKUP_KEY
        },
        client,
        logger: { log() {} }
    });

    assert.equal(result.retention.mode, 'applied');
    assert.equal(result.retention.retainedKeys.length, 7);
    assert.deepEqual(calls.find(([name]) => name === 'list'), ['list', 'backups', 'encrypted/']);
    const deleted = calls.filter(([name]) => name === 'delete').map(([, , key]) => key);
    assert.ok(deleted.length >= 2);
    assert.ok(deleted.every((key) => /^encrypted\/halastudy-.*\.hsbackup$/.test(key)));
    assert.ok(!deleted.includes('encrypted/operator-note.txt'));
    assert.ok(!deleted.includes('users/legacy.json'));
});

test('R2 backup rejects an authenticated partial artifact before upload or retention', async (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-partial-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const artifactName = 'halastudy-2026-07-09T021500Z-partial.hsbackup';
    const artifact = createEncryptedBackupArtifact({
        datasets: {
            deletion_tombstones: [],
            rooms: []
        },
        encryptionKey: BACKUP_KEY,
        createdAt: new Date('2026-07-09T02:15:00.000Z'),
        randomBytes: (size) => Buffer.alloc(size, 5)
    });
    fs.writeFileSync(path.join(backupDir, artifactName), `${JSON.stringify(artifact)}\n`, 'utf8');
    const calls = [];
    const client = {
        host: 'fixture.invalid',
        async headBucket() {
            calls.push('head');
            return true;
        },
        async putObject() { calls.push('put'); },
        async listObjectsDetailed() {
            calls.push('list');
            return [];
        },
        async deleteObject() { calls.push('delete'); }
    };

    await assert.rejects(
        main({
            args: ['--apply-retention'],
            env: {
                R2_BUCKET: 'backups',
                ROOM_STATE_BACKUP_DIR: backupDir,
                BACKUP_ENCRYPTION_KEY: BACKUP_KEY
            },
            client,
            logger: { log() {} }
        }),
        /incomplete.*profiles.*focus_completion_claims.*focus_sessions.*room_events/i
    );
    assert.deepEqual(calls, []);
});
