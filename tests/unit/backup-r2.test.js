const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    R2_RETENTION_SCOPE,
    executeR2Retention,
    findLatestEncryptedArtifact,
    planR2Retention
} = require('../../scripts/backup-r2');

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
        lastModified: `2026-07-${String(day).padStart(2, '0')}T02:15:00.000Z`
    };
}

test('R2 retention keeps one encrypted artifact for each of the latest seven UTC days', () => {
    const objects = Array.from({ length: 9 }, (_, index) => encryptedObject(index + 1));
    objects.push(encryptedObject(9, '031500', 'replacement'));
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
