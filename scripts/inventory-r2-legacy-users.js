// Metadata-only inventory of the locked Cloudflare R2 `users/` prefix.
// The executable imports a frozen listing-only client, reads no object bodies,
// and exposes no mutation, apply, or deletion mode.
const crypto = require('node:crypto');
const path = require('node:path');

const { createR2ReadOnlyClient } = require('./cloudflare/r2-client');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { defaultEvidencePath, writeJsonEvidence } = require('./evidence/report-writer');

const LEGACY_USER_PREFIX = 'users/';
const MAX_CANDIDATES = 100_000;
const SAFE_SNAPSHOT_KEY_PATTERN = /^users\/users\.\d{8}T\d{6}Z\.json$/;

function parseArgs(argv) {
    const parsed = { dryRun: true, help: false, outputPath: null };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--dry-run') continue;
        if (argument === '--help' || argument === '-h') {
            parsed.help = true;
            continue;
        }
        if (argument === '--output') {
            const value = argv[index + 1];
            if (!value || value.startsWith('--')) throw new Error('--output requires a file path.');
            parsed.outputPath = value;
            index += 1;
            continue;
        }
        throw new Error(`Unsupported argument: ${argument}`);
    }
    return parsed;
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeString(value, maxLength = 1024) {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return null;
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code < 32 || code === 127) return null;
    }
    return value;
}

function redactedKeyHint(key) {
    const extension = path.posix.extname(key).toLowerCase();
    const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
    return `${LEGACY_USER_PREFIX}[redacted]${safeExtension}`;
}

function projectObject(object) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return null;
    const key = safeString(object.key);
    if (!key?.startsWith(LEGACY_USER_PREFIX)) return null;
    const size = Number(object.size);
    const base = {
        keyRedacted: !SAFE_SNAPSHOT_KEY_PATTERN.test(key),
        keySha256: fingerprint(key),
        classification: SAFE_SNAPSHOT_KEY_PATTERN.test(key)
            ? 'legacy_full_user_snapshot'
            : 'legacy_user_object',
        lastModified: Number.isFinite(Date.parse(object.lastModified)) ? new Date(object.lastModified).toISOString() : null,
        sizeBytes: Number.isSafeInteger(size) && size >= 0 ? size : null,
        etagSha256: object.etag ? fingerprint(object.etag) : null,
        storageClass: safeString(object.storageClass, 64)
    };
    if (SAFE_SNAPSHOT_KEY_PATTERN.test(key)) return { key, ...base };
    return { keyHint: redactedKeyHint(key), ...base };
}

async function runR2LegacyUserInventory({
    bucket,
    client,
    outputPath,
    now = new Date(),
    env = process.env
} = /** @type {any} */ ({})) {
    const resolvedBucket = safeString(bucket || env.R2_BUCKET, 255);
    if (!resolvedBucket) throw new Error('R2 legacy user inventory requires R2_BUCKET.');
    const readOnlyClient = client || createR2ReadOnlyClient({
        endpoint: env.R2_ENDPOINT,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
    });
    if (!readOnlyClient || typeof readOnlyClient.listObjectsDetailed !== 'function') {
        throw new Error('R2 legacy user inventory requires a metadata-listing client.');
    }

    const listed = await readOnlyClient.listObjectsDetailed(resolvedBucket, LEGACY_USER_PREFIX);
    if (!Array.isArray(listed)) throw new Error('R2 inventory expected an object metadata array.');
    if (listed.length > MAX_CANDIDATES) {
        throw new Error(`R2 inventory exceeded ${MAX_CANDIDATES} candidates; report not written.`);
    }
    const candidates = [];
    let rejectedProviderObjects = 0;
    for (const object of listed) {
        const projected = projectObject(object);
        if (projected) candidates.push(projected);
        else rejectedProviderObjects += 1;
    }
    let totalBytes = 0;
    for (const candidate of candidates) {
        const size = Number.isSafeInteger(candidate.sizeBytes) ? candidate.sizeBytes : 0;
        if (totalBytes > Number.MAX_SAFE_INTEGER - size) {
            throw new Error('R2 inventory byte total exceeded the safe integer range; report not written.');
        }
        totalBytes += size;
    }
    const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
    const report = {
        schemaVersion: 1,
        kind: 'halastudy-r2-legacy-user-object-inventory',
        generatedAt,
        dryRun: true,
        metadataOnly: true,
        objectBodiesRead: false,
        mutationsPerformed: false,
        deletionPossible: false,
        deletionAuthorized: false,
        sourceHost: safeString(readOnlyClient.host, 255) || 'injected-read-only-client',
        bucketSha256: fingerprint(resolvedBucket),
        lockedPrefix: LEGACY_USER_PREFIX,
        candidateCount: candidates.length,
        rejectedProviderObjects,
        totalBytes,
        candidates,
        evidenceSha256: fingerprint(JSON.stringify({ candidates, rejectedProviderObjects })),
        operatorNotice: 'Candidate metadata requires separate approval. This tool cannot read bodies or delete R2 objects.'
    };
    const resolvedOutput = outputPath
        ? path.resolve(outputPath)
        : defaultEvidencePath('r2-legacy-user-inventory', { now });
    return { outputPath: writeJsonEvidence(resolvedOutput, report), report };
}

function printHelp() {
    console.log('Usage: npm run inventory:r2-users -- [--dry-run] [--output <new-file.json>]');
    console.log(`Locked prefix: ${LEGACY_USER_PREFIX}`);
    console.log('Metadata-only: there is no object-body, apply, or deletion mode.');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    loadDotEnv();
    const result = await runR2LegacyUserInventory({ outputPath: args.outputPath });
    console.log(`Dry-run R2 inventory wrote ${result.report.candidateCount} candidate(s) to ${result.outputPath}`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = { LEGACY_USER_PREFIX, parseArgs, runR2LegacyUserInventory };
