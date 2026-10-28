// Off-site copy of the newest client-side encrypted Halastudy artifact.
// Raw rooms/profile/event sources are never uploaded by this command.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    assertCompleteCurrentBackupBundle,
    decryptBackupArtifact,
    parseBackupEncryptionKey
} = require('../services/ops/backup-artifact');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { createR2Client } = require('./cloudflare/r2-client');
const { resolveBackupDir, timestampLabel } = require('./room-state-utils');

const ENCRYPTED_ARTIFACT_PATTERN = /^halastudy-\d{4}-\d{2}-\d{2}T\d{6}Z-[A-Za-z0-9-]+\.hsbackup$/;
const PINNED_ARTIFACT_PATTERN = /^halastudy-pre-cutover-\d{4}-\d{2}-\d{2}T\d{6}Z-[A-Za-z0-9-]+\.hsbackup$/;
const R2_ENCRYPTED_PREFIX = 'encrypted/';
const R2_PINNED_PREFIX = 'pinned/pre-cutover/';
const R2_ARTIFACT_PATTERN = /^encrypted\/halastudy-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z-[A-Za-z0-9-]+\.hsbackup$/;
const R2_RETENTION_DAYS = 7;
const R2_RETENTION_SCOPE = 'encrypted-daily-backups';
const R2_TIMESTAMP_FUTURE_SKEW_MS = 5 * 60 * 1000;

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
        const lastModified = typeof object.lastModified === 'string'
            ? Date.parse(object.lastModified)
            : Number.NaN;
        if (!Number.isFinite(lastModified)) {
            throw new Error(`R2 retention found invalid LastModified metadata: ${object.key}.`);
        }
        if (parsedTimestamp.getTime() > lastModified + R2_TIMESTAMP_FUTURE_SKEW_MS) {
            throw new Error(`R2 retention found a future-dated artifact timestamp: ${object.key}.`);
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
    const modes = new Set([
        '--check',
        '--retention-dry-run',
        '--apply-retention',
        '--upload-pinned-pre-cutover'
    ]);
    if (!Array.isArray(args) || args.length !== 1 || !modes.has(args[0])) {
        throw new Error(
            'Usage: node scripts/backup-r2.js '
            + '--check|--retention-dry-run|--apply-retention|--upload-pinned-pre-cutover'
        );
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

function findLatestPinnedArtifact(backupDir) {
    const pinnedDir = path.join(path.resolve(backupDir), 'pinned');
    if (!fs.existsSync(pinnedDir)) {
        throw new Error(`No pinned pre-cutover backup artifact exists in ${pinnedDir}.`);
    }
    const latest = fs.readdirSync(pinnedDir)
        .filter((name) => PINNED_ARTIFACT_PATTERN.test(name))
        .sort()
        .at(-1);
    if (!latest) throw new Error(`No pinned pre-cutover backup artifact exists in ${pinnedDir}.`);
    return path.join(pinnedDir, latest);
}

function readVerifiedPinnedArtifact(artifactPath) {
    const body = fs.readFileSync(artifactPath);
    const fileName = path.basename(artifactPath);
    const checksumPath = `${artifactPath}.sha256`;
    let checksumText;
    try {
        checksumText = fs.readFileSync(checksumPath, 'utf8');
    } catch {
        throw new Error(`Pinned pre-cutover checksum is unavailable: ${checksumPath}.`);
    }
    const match = checksumText.match(/^([a-f0-9]{64}) {2}([A-Za-z0-9.-]+)\n$/);
    if (!match || match[2] !== fileName) {
        throw new Error('Pinned pre-cutover checksum file is invalid.');
    }
    const actual = crypto.createHash('sha256').update(body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), Buffer.from(actual, 'hex'))) {
        throw new Error('Pinned pre-cutover artifact checksum mismatch.');
    }
    return body;
}

function authenticateCompleteArtifact(body, env, label = 'R2 backup artifact') {
    const encryptionKey = parseBackupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
    try {
        const bundle = decryptBackupArtifact({ artifact: body, encryptionKey });
        assertCompleteCurrentBackupBundle(bundle, label);
        return bundle;
    } finally {
        encryptionKey.fill(0);
    }
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

    if (mode === '--upload-pinned-pre-cutover') {
        const artifactPath = findLatestPinnedArtifact(resolveBackupDir(env));
        const body = readVerifiedPinnedArtifact(artifactPath);
        authenticateCompleteArtifact(body, env, 'Pinned pre-cutover backup');
        if (!(await client.headBucket(bucket))) {
            logger.log('  bucket missing — creating…');
            await client.createBucket(bucket);
        }
        const objectKey = `${R2_PINNED_PREFIX}${path.basename(artifactPath)}`;
        await client.putObject(bucket, objectKey, body, 'application/vnd.halastudy.backup+json');
        logger.log(`R2 pinned pre-cutover backup → ${objectKey}`);
        return { artifactPath, objectKey };
    }

    const artifactPath = findLatestEncryptedArtifact(resolveBackupDir(env));
    const body = fs.readFileSync(artifactPath);
    authenticateCompleteArtifact(body, env);

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
    R2_PINNED_PREFIX,
    R2_RETENTION_SCOPE,
    executeR2Retention,
    findLatestEncryptedArtifact,
    findLatestPinnedArtifact,
    main,
    parseArguments,
    planR2Retention,
    runCli
};
