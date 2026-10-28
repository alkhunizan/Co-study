const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    R2_PINNED_PREFIX,
    R2_RETENTION_SCOPE,
    executeR2Retention,
    findLatestEncryptedArtifact,
    main,
    parseArguments,
    planR2Retention
} = require('../../scripts/backup-r2');
const { createEncryptedBackupArtifact } = require('../../services/ops/backup-artifact');

const BACKUP_KEY = Buffer.alloc(32, 17).toString('base64');

test('R2 upload selection accepts only the newest encrypted artifact', (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-selection-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(backupDir, 'rooms.json'), '[{"secret":true}]', 'utf8');
    fs.writeFileSync(path.join(backupDir, 'halastudy-2026-07-14T021500Z-first.hsbackup'), '{}', 'utf8');
    fs.writeFileSync(path.join(backupDir, 'halastudy-2026-07-15T021500Z-second.hsbackup'), '{}', 'utf8');

    assert.equal(
        path.basename(findLatestEncryptedArtifact(backupDir)),
        'halastudy-2026-07-15T021500Z-second.hsbackup'
    );
});

test('R2 upload selection fails closed when no encrypted artifact exists', (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-empty-'));
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(backupDir, 'rooms.json'), '[]', 'utf8');

    assert.throws(() => findLatestEncryptedArtifact(backupDir), /no encrypted backup artifact/i);
});

function encryptedObject(day, time = '021500', nonce = 'run') {
    return {
        key: `encrypted/halastudy-2026-07-${String(day).padStart(2, '0')}T${time}Z-${nonce}.hsbackup`,
        lastModified: `2026-07-${String(day).padStart(2, '0')}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}.000Z`
    };
}

test('R2 retention keeps one encrypted artifact for each of the latest seven UTC days', () => {
    const objects = Array.from({ length: 9 }, (_, index) => encryptedObject(index + 1));
    objects.push(encryptedObject(9, '031500', 'replacement'));
    objects.push({
        key: 'pinned/pre-cutover/halastudy-pre-cutover-2026-07-01T021500Z-rollback.hsbackup',
        lastModified: '2026-07-01T02:15:00.000Z'
    });
    objects.push({ key: 'encrypted/operator-note.txt', lastModified: '2026-07-01T00:00:00.000Z' });
    objects.push({ key: 'users/legacy-user.json', lastModified: '2026-07-01T00:00:00.000Z' });

    const plan = planR2Retention(objects);

    assert.equal(plan.retainedKeys.length, 7);
    assert.ok(plan.retainedKeys.some((key) => key.includes('2026-07-09T031500Z-replacement')));
    assert.ok(plan.deleteKeys.some((key) => key.includes('2026-07-01T021500Z-run')));
    assert.ok(plan.deleteKeys.some((key) => key.includes('2026-07-09T021500Z-run')));
    assert.ok(plan.deleteKeys.every((key) => /^encrypted\/halastudy-.*\.hsbackup$/.test(key)));
    assert.ok(!plan.deleteKeys.includes('encrypted/operator-note.txt'));
    assert.ok(!plan.deleteKeys.includes('users/legacy-user.json'));
    assert.ok(!plan.deleteKeys.some((key) => key.startsWith('pinned/')));
});

test('R2 pin mode accepts no caller-selected object key or prefix', () => {
    assert.throws(
        () => parseArguments(['--upload-pinned-pre-cutover=pinned/operator-choice/']),
        /Usage: node scripts\/backup-r2\.js/i
    );
    assert.throws(
        () => parseArguments(['--upload-pinned-pre-cutover', 'pinned/operator-choice/']),
        /Usage: node scripts\/backup-r2\.js/i
    );
});

test('R2 retention dry-run cannot delete and apply requires the fixed automated scope', async () => {
    const calls = [];
    const client = {
        async listObjectsDetailed(bucket, prefix) {
            calls.push(['list', bucket, prefix]);
            return Array.from({ length: 8 }, (_, index) => encryptedObject(index + 1));
        },
        async deleteObject(bucket, key) {
            calls.push(['delete', bucket, key]);
        }
    };

    const dryRun = await executeR2Retention({ client, bucket: 'backups' });
    assert.equal(dryRun.mode, 'dry-run');
    assert.equal(dryRun.deleteKeys.length, 1);
    assert.deepEqual(calls, [['list', 'backups', 'encrypted/']]);

    await assert.rejects(
        executeR2Retention({ client, bucket: 'backups', apply: true, scope: 'operator-cleanup' }),
        /automated retention scope/i
    );
    assert.equal(calls.filter(([name]) => name === 'delete').length, 0);

    const applied = await executeR2Retention({
        client,
        bucket: 'backups',
        apply: true,
        scope: R2_RETENTION_SCOPE
    });
    assert.equal(applied.mode, 'applied');
    assert.equal(calls.filter(([name]) => name === 'delete').length, 1);
    assert.ok(calls.at(-1)[2].startsWith('encrypted/halastudy-'));
});

test('R2 retention rejects future-dated keys before deleting any valid artifact', async () => {
    const calls = [];
    const objects = Array.from({ length: 8 }, (_, index) => encryptedObject(index + 1));
    objects.push({
        key: 'encrypted/halastudy-2099-01-01T021500Z-clock-skew.hsbackup',
        lastModified: '2026-07-15T02:15:00.000Z'
    });
    const client = {
        async listObjectsDetailed() {
            calls.push(['list']);
            return objects;
        },
        async deleteObject(_bucket, key) {
            calls.push(['delete', key]);
        }
    };

    await assert.rejects(
        executeR2Retention({
            client,
            bucket: 'backups',
            apply: true,
            scope: R2_RETENTION_SCOPE
        }),
        /future-dated artifact timestamp/i
    );
    assert.deepEqual(calls, [['list']]);
});

test('pre-cutover upload authenticates its checksum and uses only the fixed pinned prefix', async (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-pinned-'));
    const pinnedDir = path.join(backupDir, 'pinned');
    fs.mkdirSync(pinnedDir);
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const fileName = 'halastudy-pre-cutover-2026-07-15T021500Z-cutover.hsbackup';
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
        createdAt: new Date('2026-07-15T02:15:00.000Z'),
        randomBytes: () => Buffer.alloc(12, 4)
    });
    const body = Buffer.from(`${JSON.stringify(artifact)}\n`);
    fs.writeFileSync(path.join(pinnedDir, fileName), body);
    fs.writeFileSync(
        path.join(pinnedDir, `${fileName}.sha256`),
        `${crypto.createHash('sha256').update(body).digest('hex')}  ${fileName}\n`
    );
    const calls = [];
    const client = {
        host: 'loopback-r2.invalid',
        async headBucket(bucket) {
            calls.push(['head', bucket]);
            return true;
        },
        async putObject(bucket, key, uploadedBody) {
            calls.push(['put', bucket, key, Buffer.compare(uploadedBody, body)]);
        },
        async listObjectsDetailed() {
            calls.push(['list']);
            return [];
        },
        async deleteObject() {
            calls.push(['delete']);
        }
    };

    const result = await main({
        args: ['--upload-pinned-pre-cutover'],
        env: {
            NODE_ENV: 'test',
            ROOM_STATE_BACKUP_DIR: backupDir,
            BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
            R2_BUCKET: 'backups'
        },
        logger: { log() {} },
        client
    });

    assert.equal(result.objectKey, `${R2_PINNED_PREFIX}${fileName}`);
    assert.deepEqual(calls, [
        ['head', 'backups'],
        ['put', 'backups', `${R2_PINNED_PREFIX}${fileName}`, 0]
    ]);
});

test('pre-cutover upload rejects a checksum mismatch before any R2 request', async (t) => {
    const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-pinned-tamper-'));
    const pinnedDir = path.join(backupDir, 'pinned');
    fs.mkdirSync(pinnedDir);
    t.after(() => fs.rmSync(backupDir, { recursive: true, force: true }));
    const fileName = 'halastudy-pre-cutover-2026-07-15T021500Z-cutover.hsbackup';
    fs.writeFileSync(path.join(pinnedDir, fileName), '{}\n');
    fs.writeFileSync(path.join(pinnedDir, `${fileName}.sha256`), `${'0'.repeat(64)}  ${fileName}\n`);
    let touchedR2 = false;

    await assert.rejects(
        main({
            args: ['--upload-pinned-pre-cutover'],
            env: {
                NODE_ENV: 'test',
                ROOM_STATE_BACKUP_DIR: backupDir,
                BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
                R2_BUCKET: 'backups'
            },
            logger: { log() {} },
            client: {
                async headBucket() {
                    touchedR2 = true;
                    return true;
                }
            }
        }),
        /checksum mismatch/i
    );
    assert.equal(touchedR2, false);
});
