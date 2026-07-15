const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { findLatestEncryptedArtifact } = require('../../scripts/backup-r2');

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
