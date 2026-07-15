const assert = require('node:assert/strict');
const test = require('node:test');

const {
    BACKUP_SCHEMA_VERSION,
    createEncryptedBackupArtifact,
    decryptBackupArtifact,
    parseBackupEncryptionKey,
    validateBackupBundle
} = require('../../services/ops/backup-artifact');

const KEY_TEXT = Buffer.alloc(32, 7).toString('base64');

test('backup encryption keys must be canonical base64 encoding exactly 32 bytes', () => {
    const key = parseBackupEncryptionKey(KEY_TEXT);
    assert.equal(key.length, 32);
    assert.throws(() => parseBackupEncryptionKey('short'), /32-byte base64/i);
    assert.throws(() => parseBackupEncryptionKey(Buffer.alloc(31).toString('base64')), /32-byte base64/i);
});

test('AES-256-GCM artifacts hide source data and round-trip a checksummed manifest', () => {
    const key = parseBackupEncryptionKey(KEY_TEXT);
    const artifact = createEncryptedBackupArtifact({
        datasets: {
            rooms: [{ id: 'ROOM1', name: 'Private Study Room' }],
            profiles: [{ id: 'user-1', email: 'student@example.com' }],
            deletion_tombstones: [{
                user_id: 'user-1',
                deleted_at: '2026-07-01T00:00:00.000Z',
                expires_at: '2026-07-31T00:00:00.000Z',
                reason: 'user_request'
            }]
        },
        failedSources: ['focus_sessions'],
        encryptionKey: key,
        createdAt: new Date('2026-07-15T02:15:00.000Z'),
        randomBytes: (size) => Buffer.alloc(size, 9)
    });
    const serialized = JSON.stringify(artifact);

    assert.doesNotMatch(serialized, /Private Study Room|student@example\.com/);
    assert.equal(artifact.encryption.algorithm, 'AES-256-GCM');

    const bundle = decryptBackupArtifact({ artifact, encryptionKey: key });
    assert.equal(bundle.manifest.schemaVersion, BACKUP_SCHEMA_VERSION);
    assert.equal(bundle.manifest.createdAt, '2026-07-15T02:15:00.000Z');
    assert.deepEqual(bundle.manifest.failedSources, ['focus_sessions']);
    assert.equal(bundle.manifest.sources.rooms.rowCount, 1);
    assert.match(bundle.manifest.sources.rooms.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(bundle.datasets.rooms, [{ id: 'ROOM1', name: 'Private Study Room' }]);
    assert.equal(bundle.datasets.deletion_tombstones[0].user_id, 'user-1');
});

test('artifact authentication rejects ciphertext tampering without exposing crypto internals', () => {
    const key = parseBackupEncryptionKey(KEY_TEXT);
    const artifact = createEncryptedBackupArtifact({
        datasets: { rooms: [] },
        encryptionKey: key
    });
    const first = artifact.ciphertext[0] === 'A' ? 'B' : 'A';
    artifact.ciphertext = `${first}${artifact.ciphertext.slice(1)}`;

    assert.throws(
        () => decryptBackupArtifact({ artifact, encryptionKey: key }),
        /authentication failed/i
    );
});

test('bundle validation rejects unsupported schemas and source checksum mismatches', () => {
    const valid = {
        manifest: {
            schemaVersion: BACKUP_SCHEMA_VERSION,
            createdAt: '2026-07-15T02:15:00.000Z',
            sources: {
                rooms: {
                    rowCount: 0,
                    sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
                }
            },
            failedSources: []
        },
        datasets: { rooms: [] }
    };

    assert.equal(validateBackupBundle(valid), valid);
    assert.throws(
        () => validateBackupBundle({
            ...valid,
            manifest: { ...valid.manifest, schemaVersion: BACKUP_SCHEMA_VERSION + 1 }
        }),
        /unsupported backup schema/i
    );
    assert.throws(
        () => validateBackupBundle({
            ...valid,
            manifest: {
                ...valid.manifest,
                sources: { rooms: { rowCount: 0, sha256: '0'.repeat(64) } }
            }
        }),
        /checksum mismatch/i
    );
});

test('current backup schema requires deletion tombstones beside database datasets', () => {
    assert.ok(BACKUP_SCHEMA_VERSION >= 2);
    assert.throws(
        () => createEncryptedBackupArtifact({
            datasets: { profiles: [{ id: 'user-1' }], rooms: [] },
            encryptionKey: KEY_TEXT
        }),
        /deletion_tombstones.*required/i
    );
});

test('deletion tombstone datasets reject malformed or inverted retention rows', () => {
    assert.throws(
        () => createEncryptedBackupArtifact({
            datasets: {
                deletion_tombstones: [{
                    user_id: 'user-1',
                    deleted_at: '2026-07-31T00:00:00.000Z',
                    expires_at: '2026-07-01T00:00:00.000Z',
                    reason: 'user_request'
                }],
                rooms: []
            },
            encryptionKey: KEY_TEXT
        }),
        /deletion_tombstones contains an invalid row/i
    );
});
