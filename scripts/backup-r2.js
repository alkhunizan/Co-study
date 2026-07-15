// Off-site copy of the newest client-side encrypted Halastudy artifact.
// Raw rooms/profile/event sources are never uploaded by this command.
const fs = require('node:fs');
const path = require('node:path');
const { decryptBackupArtifact, parseBackupEncryptionKey } = require('../services/ops/backup-artifact');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { createR2Client } = require('./cloudflare/r2-client');
const { resolveBackupDir, timestampLabel } = require('./room-state-utils');

const ENCRYPTED_ARTIFACT_PATTERN = /^halastudy-\d{4}-\d{2}-\d{2}T\d{6}Z-[A-Za-z0-9-]+\.hsbackup$/;
const R2_ENCRYPTED_PREFIX = 'encrypted/';
const R2_ARTIFACT_PATTERN = /^encrypted\/halastudy-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z-[A-Za-z0-9-]+\.hsbackup$/;
const R2_RETENTION_DAYS = 7;
const R2_RETENTION_SCOPE = 'encrypted-daily-backups';

/** @param {any} client @param {string} bucket @param {{log(...args: any[]): void}} logger */
async function runCheck(client, bucket, logger = console) {
    logger.log(`R2 check → bucket "${bucket}" at ${client.host}`);
    if (!(await client.headBucket(bucket))) {
        logger.log('  bucket missing — creating…');
        await client.createBucket(bucket);
    }
    const key = `healthcheck/${timestampLabel()}.txt`;
    const marker = `halastudy r2 ok ${timestampLabel()}`;
    await client.putObject(bucket, key, marker, 'text/plain');
    const readBack = await client.getObject(bucket, key);
    if (readBack.trim() !== marker) {
        throw new Error('Round-trip mismatch: object read back did not match what was written.');
    }
    await client.deleteObject(bucket, key);
    logger.log('  PUT + GET + DELETE round-trip OK — credentials work.');
    return true;
}

function planR2Retention(objects) {
    if (!Array.isArray(objects)) throw new Error('R2 retention expected an object metadata array.');
    const matching = [];
    for (const object of objects) {
        if (!object || typeof object !== 'object' || typeof object.key !== 'string') {
            throw new Error('R2 retention received invalid object metadata.');
        }
        const match = object.key.match(R2_ARTIFACT_PATTERN);
        if (!match) continue;
        const timestamp = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.000Z`;
        const parsedTimestamp = new Date(timestamp);
        if (!Number.isFinite(parsedTimestamp.getTime()) || parsedTimestamp.toISOString() !== timestamp) {
            throw new Error(`R2 retention found an invalid artifact timestamp: ${object.key}.`);
        }
        matching.push({ key: object.key, day: match[1] });
    }
    matching.sort((left, right) => left.key.localeCompare(right.key));

    const latestByDay = new Map();
    for (const artifact of matching) latestByDay.set(artifact.day, artifact.key);
    const retainedDays = new Set([...latestByDay.keys()].sort().slice(-R2_RETENTION_DAYS));
    const retainedKeys = [...retainedDays]
        .map((day) => latestByDay.get(day))
        .sort();
    const retained = new Set(retainedKeys);
    const deleteKeys = matching
        .map(({ key }) => key)
        .filter((key) => !retained.has(key));
    return { retainedKeys, deleteKeys };
}

async function executeR2Retention({
    client,
    bucket,
    apply = false,
    scope
} = /** @type {any} */ ({})) {
    if (!client || typeof client.listObjectsDetailed !== 'function') {
        throw new Error('R2 retention requires a metadata-listing client.');
    }
    if (typeof bucket !== 'string' || !bucket.trim()) throw new Error('R2 retention requires a bucket.');
    if (apply && scope !== R2_RETENTION_SCOPE) {
        throw new Error('R2 deletion requires the fixed automated retention scope.');
    }
    if (apply && typeof client.deleteObject !== 'function') {
        throw new Error('R2 automated retention requires deleteObject support.');
    }

    const objects = await client.listObjectsDetailed(bucket, R2_ENCRYPTED_PREFIX);
    const plan = planR2Retention(objects);
    if (!apply) return { mode: 'dry-run', ...plan };
    for (const key of plan.deleteKeys) {
        if (!R2_ARTIFACT_PATTERN.test(key)) {
            throw new Error(`R2 automated retention refused an out-of-scope key: ${key}.`);
        }
        await client.deleteObject(bucket, key);
    }
    return { mode: 'applied', ...plan };
}

function parseArguments(args) {
    const modes = new Set(['--check', '--retention-dry-run', '--apply-retention']);
    if (!Array.isArray(args) || args.length !== 1 || !modes.has(args[0])) {
        throw new Error('Usage: node scripts/backup-r2.js --check|--retention-dry-run|--apply-retention');
    }
    return args[0];
}

function findLatestEncryptedArtifact(backupDir) {
    const resolvedDir = path.resolve(backupDir);
    if (!fs.existsSync(resolvedDir)) {
        throw new Error(`No encrypted backup artifact exists in ${resolvedDir}.`);
    }
    const latest = fs.readdirSync(resolvedDir)
        .filter((name) => ENCRYPTED_ARTIFACT_PATTERN.test(name))
        .sort()
        .at(-1);
    if (!latest) throw new Error(`No encrypted backup artifact exists in ${resolvedDir}.`);
    return path.join(resolvedDir, latest);
}

/**
 * @param {{
 *   args?: string[],
 *   env?: NodeJS.ProcessEnv,
 *   logger?: {log(...args: any[]): void},
 *   client?: any
 * }} options
 */
async function main({
    args = process.argv.slice(2),
    env = process.env,
    logger = console,
    client: injectedClient
} = /** @type {any} */ ({})) {
    const mode = parseArguments(args);
    if (env === process.env) loadDotEnv();
    const bucket = env.R2_BUCKET;
    if (!bucket) {
        throw new Error('R2_BUCKET is not set. See .env.example → Cloudflare R2.');
    }
    const client = injectedClient || createR2Client({
        endpoint: env.R2_ENDPOINT,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
    });

    if (mode === '--check') {
        await runCheck(client, bucket, logger);
        return { mode: 'check' };
    }
    if (mode === '--retention-dry-run') {
        const retention = await executeR2Retention({ client, bucket });
        logger.log(`R2 retention dry run: ${retention.deleteKeys.length} encrypted artifact(s) would be pruned.`);
        for (const key of retention.deleteKeys) logger.log(`  would prune ${key}`);
        return { retention };
    }

    const artifactPath = findLatestEncryptedArtifact(resolveBackupDir(env));
    const body = fs.readFileSync(artifactPath);
    const encryptionKey = parseBackupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
    try {
        decryptBackupArtifact({ artifact: body, encryptionKey });
    } finally {
        encryptionKey.fill(0);
    }

    logger.log(`R2 encrypted backup → bucket "${bucket}"`);
    if (!(await client.headBucket(bucket))) {
        logger.log('  bucket missing — creating…');
        await client.createBucket(bucket);
    }
    const objectKey = `${R2_ENCRYPTED_PREFIX}${path.basename(artifactPath)}`;
    await client.putObject(bucket, objectKey, body, 'application/vnd.halastudy.backup+json');
    logger.log(`  uploaded ${body.length} encrypted bytes → ${objectKey}`);
    const retention = await executeR2Retention({
        client,
        bucket,
        apply: true,
        scope: R2_RETENTION_SCOPE
    });
    logger.log(`  retained ${retention.retainedKeys.length} daily R2 snapshot(s); pruned ${retention.deleteKeys.length}.`);
    return { artifactPath, objectKey, retention };
}

async function runCli() {
    try {
        await main();
    } catch (error) {
        console.error(error?.message || 'R2 backup failed.');
        process.exitCode = 1;
    }
}

if (require.main === module) void runCli();

module.exports = {
    R2_RETENTION_SCOPE,
    executeR2Retention,
    findLatestEncryptedArtifact,
    main,
    parseArguments,
    planR2Retention,
    runCli
};
