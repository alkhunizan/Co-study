// Off-site copy of the newest client-side encrypted Halastudy artifact.
// Raw rooms/profile/event sources are never uploaded by this command.
const fs = require('node:fs');
const path = require('node:path');
const { decryptBackupArtifact, parseBackupEncryptionKey } = require('../services/ops/backup-artifact');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { createR2Client } = require('./cloudflare/r2-client');
const { resolveBackupDir, timestampLabel } = require('./room-state-utils');

const ENCRYPTED_ARTIFACT_PATTERN = /^halastudy-\d{4}-\d{2}-\d{2}T\d{6}Z-[A-Za-z0-9-]+\.hsbackup$/;

async function runCheck(client, bucket) {
    console.log(`R2 check → bucket "${bucket}" at ${client.host}`);
    if (!(await client.headBucket(bucket))) {
        console.log('  bucket missing — creating…');
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
    console.log('  PUT + GET + DELETE round-trip OK — credentials work.');
    return true;
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

async function main() {
    loadDotEnv();
    const bucket = process.env.R2_BUCKET;
    if (!bucket) {
        throw new Error('R2_BUCKET is not set. See .env.example → Cloudflare R2.');
    }
    const client = createR2Client();

    if (process.argv.includes('--check')) {
        await runCheck(client, bucket);
        return;
    }

    const artifactPath = findLatestEncryptedArtifact(resolveBackupDir(process.env));
    const body = fs.readFileSync(artifactPath);
    const encryptionKey = parseBackupEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
    try {
        decryptBackupArtifact({ artifact: body, encryptionKey });
    } finally {
        encryptionKey.fill(0);
    }

    console.log(`R2 encrypted backup → bucket "${bucket}"`);
    if (!(await client.headBucket(bucket))) {
        console.log('  bucket missing — creating…');
        await client.createBucket(bucket);
    }
    const objectKey = `encrypted/${path.basename(artifactPath)}`;
    await client.putObject(bucket, objectKey, body, 'application/vnd.halastudy.backup+json');
    console.log(`  uploaded ${body.length} encrypted bytes → ${objectKey}`);
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
    findLatestEncryptedArtifact,
    main,
    runCli
};
