const crypto = require('node:crypto');

const BACKUP_FORMAT = 'halastudy-encrypted-backup';
const BACKUP_ARTIFACT_VERSION = 1;
const BACKUP_SCHEMA_VERSION = 2;
const SUPPORTED_BACKUP_SCHEMA_VERSIONS = new Set([1, BACKUP_SCHEMA_VERSION]);
const BACKUP_ALGORITHM = 'AES-256-GCM';
const BACKUP_DATASETS = [
    'profiles',
    'deletion_tombstones',
    'focus_completion_claims',
    'focus_sessions',
    'room_events',
    'rooms'
];
const DATABASE_BACKUP_DATASETS = [
    'profiles',
    'focus_completion_claims',
    'focus_sessions',
    'room_events'
];
const AUTH_TAG_BYTES = 16;
const IV_BYTES = 12;
const AAD = Buffer.from(`${BACKUP_FORMAT}:${BACKUP_ARTIFACT_VERSION}`, 'utf8');

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function parseBackupEncryptionKey(rawKey) {
    if (Buffer.isBuffer(rawKey)) {
        if (rawKey.length !== 32) {
            throw new Error('BACKUP_ENCRYPTION_KEY must be a canonical 32-byte base64 value.');
        }
        return Buffer.from(rawKey);
    }

    const text = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) {
        throw new Error('BACKUP_ENCRYPTION_KEY must be a canonical 32-byte base64 value.');
    }
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== text) {
        decoded.fill(0);
        throw new Error('BACKUP_ENCRYPTION_KEY must be a canonical 32-byte base64 value.');
    }
    return decoded;
}

function normalizeCreatedAt(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) throw new Error('Backup creation time is invalid.');
    return date.toISOString();
}

function assertDataset(name, rows) {
    if (!BACKUP_DATASETS.includes(name)) throw new Error(`Unknown backup source: ${name}.`);
    if (!Array.isArray(rows) || rows.some((row) => !isPlainObject(row))) {
        throw new Error(`Backup source ${name} must be an array of plain objects.`);
    }
    if (name === 'deletion_tombstones') {
        for (const row of rows) {
            const userId = row.user_id;
            const deletedAt = typeof row.deleted_at === 'string' ? Date.parse(row.deleted_at) : Number.NaN;
            const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : Number.NaN;
            const reason = row.reason;
            if (typeof userId !== 'string'
                || !userId.trim()
                || userId.length > 128
                || !Number.isFinite(deletedAt)
                || !Number.isFinite(expiresAt)
                || expiresAt <= deletedAt
                || typeof reason !== 'string'
                || reason !== reason.trim()
                || reason.length < 1
                || reason.length > 40) {
                throw new Error('Backup source deletion_tombstones contains an invalid row.');
            }
        }
    }
}

function datasetChecksum(rows) {
    return crypto.createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

function createBackupBundle({ datasets, failedSources = [], createdAt = new Date() }) {
    if (!isPlainObject(datasets)) throw new Error('Backup datasets must be a plain object.');

    const normalizedDatasets = {};
    const sources = {};
    for (const name of BACKUP_DATASETS) {
        if (!Object.hasOwn(datasets, name)) continue;
        const rows = datasets[name];
        assertDataset(name, rows);
        normalizedDatasets[name] = rows;
        sources[name] = {
            rowCount: rows.length,
            sha256: datasetChecksum(rows)
        };
    }
    if (Object.keys(sources).length === 0) throw new Error('A backup requires at least one readable source.');
    if (DATABASE_BACKUP_DATASETS.some((name) => Object.hasOwn(sources, name))
        && !Object.hasOwn(sources, 'deletion_tombstones')) {
        throw new Error('Backup source deletion_tombstones is required beside database datasets.');
    }

    const normalizedFailures = [...new Set(failedSources)]
        .filter((name) => BACKUP_DATASETS.includes(name) && !Object.hasOwn(sources, name))
        .sort();
    return {
        manifest: {
            schemaVersion: BACKUP_SCHEMA_VERSION,
            createdAt: normalizeCreatedAt(createdAt),
            sources,
            failedSources: normalizedFailures
        },
        datasets: normalizedDatasets
    };
}

function decodeBase64Field(value, label, expectedBytes) {
    if (typeof value !== 'string' || !value) throw new Error(`Backup ${label} is invalid.`);
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value || (expectedBytes && decoded.length !== expectedBytes)) {
        decoded.fill(0);
        throw new Error(`Backup ${label} is invalid.`);
    }
    return decoded;
}

function validateBackupBundle(bundle) {
    if (!isPlainObject(bundle) || !isPlainObject(bundle.manifest) || !isPlainObject(bundle.datasets)) {
        throw new Error('Backup payload has an invalid structure.');
    }
    if (!SUPPORTED_BACKUP_SCHEMA_VERSIONS.has(bundle.manifest.schemaVersion)) {
        throw new Error(`Unsupported backup schema version: ${bundle.manifest.schemaVersion}.`);
    }
    if (!Number.isFinite(Date.parse(bundle.manifest.createdAt))) {
        throw new Error('Backup manifest creation time is invalid.');
    }
    if (!isPlainObject(bundle.manifest.sources)) throw new Error('Backup manifest sources are invalid.');
    if (!Array.isArray(bundle.manifest.failedSources)
        || bundle.manifest.failedSources.some((name) => !BACKUP_DATASETS.includes(name))) {
        throw new Error('Backup manifest failedSources is invalid.');
    }

    const sourceNames = Object.keys(bundle.manifest.sources);
    const datasetNames = Object.keys(bundle.datasets);
    if (sourceNames.length === 0
        || sourceNames.some((name) => !BACKUP_DATASETS.includes(name))
        || datasetNames.some((name) => !BACKUP_DATASETS.includes(name))
        || sourceNames.length !== datasetNames.length
        || sourceNames.some((name) => !Object.hasOwn(bundle.datasets, name))) {
        throw new Error('Backup manifest and datasets do not describe the same sources.');
    }
    if (bundle.manifest.schemaVersion >= 2
        && DATABASE_BACKUP_DATASETS.some((name) => sourceNames.includes(name))
        && !sourceNames.includes('deletion_tombstones')) {
        throw new Error('Backup source deletion_tombstones is required beside database datasets.');
    }

    for (const name of sourceNames) {
        const rows = bundle.datasets[name];
        const metadata = bundle.manifest.sources[name];
        assertDataset(name, rows);
        if (!isPlainObject(metadata)
            || metadata.rowCount !== rows.length
            || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) {
            throw new Error(`Backup manifest metadata is invalid for ${name}.`);
        }
        if (datasetChecksum(rows) !== metadata.sha256) {
            throw new Error(`Backup checksum mismatch for ${name}.`);
        }
    }
    return bundle;
}

function assertCompleteCurrentBackupBundle(bundle, label = 'Backup artifact') {
    validateBackupBundle(bundle);
    if (bundle.manifest.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new Error(`${label} must use the current schema-v${BACKUP_SCHEMA_VERSION} format.`);
    }
    const missingOrFailed = [...new Set([
        ...BACKUP_DATASETS.filter((name) => !Object.hasOwn(bundle.datasets, name)),
        ...bundle.manifest.failedSources
    ])];
    if (missingOrFailed.length > 0) {
        throw new Error(`${label} is incomplete; missing or failed sources: ${missingOrFailed.join(', ')}.`);
    }
    return bundle;
}

function createEncryptedBackupArtifact({
    datasets,
    failedSources = [],
    encryptionKey,
    createdAt = new Date(),
    randomBytes = crypto.randomBytes
}) {
    const key = parseBackupEncryptionKey(encryptionKey);
    try {
        const bundle = createBackupBundle({ datasets, failedSources, createdAt });
        const iv = randomBytes(IV_BYTES);
        if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) throw new Error('Backup IV generator returned invalid data.');
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
        cipher.setAAD(AAD);
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(bundle), 'utf8'),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();
        return {
            format: BACKUP_FORMAT,
            artifactVersion: BACKUP_ARTIFACT_VERSION,
            encryption: {
                algorithm: BACKUP_ALGORITHM,
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64')
            },
            ciphertext: ciphertext.toString('base64')
        };
    } finally {
        key.fill(0);
    }
}

function decryptBackupArtifact({ artifact, encryptionKey }) {
    let parsed = artifact;
    if (Buffer.isBuffer(parsed)) parsed = parsed.toString('utf8');
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            throw new Error('Backup artifact is not valid JSON.');
        }
    }
    if (!isPlainObject(parsed)
        || parsed.format !== BACKUP_FORMAT
        || parsed.artifactVersion !== BACKUP_ARTIFACT_VERSION
        || !isPlainObject(parsed.encryption)
        || parsed.encryption.algorithm !== BACKUP_ALGORITHM) {
        throw new Error('Backup artifact format or version is unsupported.');
    }

    const key = parseBackupEncryptionKey(encryptionKey);
    let iv;
    let authTag;
    let ciphertext;
    try {
        iv = decodeBase64Field(parsed.encryption.iv, 'IV', IV_BYTES);
        authTag = decodeBase64Field(parsed.encryption.authTag, 'authentication tag', AUTH_TAG_BYTES);
        ciphertext = decodeBase64Field(parsed.ciphertext, 'ciphertext');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
        decipher.setAAD(AAD);
        decipher.setAuthTag(authTag);
        let plaintext;
        try {
            plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        } catch {
            throw new Error('Backup authentication failed; the key or artifact is invalid.');
        }
        let bundle;
        try {
            bundle = JSON.parse(plaintext);
        } catch {
            throw new Error('Backup payload is not valid JSON.');
        }
        return validateBackupBundle(bundle);
    } finally {
        key.fill(0);
        iv?.fill(0);
        authTag?.fill(0);
        ciphertext?.fill(0);
    }
}

module.exports = {
    BACKUP_SCHEMA_VERSION,
    assertCompleteCurrentBackupBundle,
    createEncryptedBackupArtifact,
    decryptBackupArtifact,
    parseBackupEncryptionKey,
    validateBackupBundle
};
