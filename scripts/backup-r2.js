// Off-site backup of Halastudy state to Cloudflare R2.
//
// Uploads the current rooms + users state files to an R2 bucket so they survive
// VM loss. Complements the local snapshots (scripts/backup-rooms.js) — this is
// the off-box copy. Cron it (e.g. hourly/daily) alongside the app.
//
// Usage:
//   npm run backup:r2            upload rooms.json + users.json snapshots
//   npm run backup:r2 -- --check verify credentials with a round-trip test object
//
// Needs R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in .env.
const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv } = require('./cloudflare/realtimekit-common');
const { createR2Client } = require('./cloudflare/r2-client');
const { timestampLabel, resolveRoomStateFile } = require('./room-state-utils');
const { hash } = require('../services/platform/common');

function resolveUserStateFile(env = process.env) {
    return path.resolve(env.USER_STATE_FILE || path.join(__dirname, '..', 'data', 'users.json'));
}

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

async function backupFile(client, bucket, label, filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`  ${label}: no state file at ${filePath} — skipped.`);
        return null;
    }
    const body = fs.readFileSync(filePath);
    const key = `${label}/${label}.${timestampLabel()}.json`;
    await client.putObject(bucket, key, body, 'application/json');
    console.log(`  ${label}: uploaded ${body.length} bytes → ${key}`);
    return key;
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

    const platformEnabled = process.env.PLATFORM_ENABLED !== 'false' && (process.env.NODE_ENV !== 'test' || process.env.PLATFORM_ENABLED === 'true');
    let platformFile = null;
    if (platformEnabled) {
        const index = process.argv.indexOf('--platform-file');
        if (index < 0 || !process.argv[index + 1]) throw new Error('Platform storage is enabled. Supply --platform-file <fresh platform backup>; legacy JSON is no longer authoritative.');
        platformFile = path.resolve(process.argv[index + 1]);
        const snapshot = JSON.parse(fs.readFileSync(platformFile, 'utf8'));
        if (snapshot.format !== 'halastudy-platform-v1' || !snapshot.tables || snapshot.checksum !== hash(JSON.stringify(snapshot.tables))) {
            throw new Error('Invalid platform backup.');
        }
        const age = Date.now() - Date.parse(snapshot.createdAt);
        if (!Number.isFinite(age) || age < 0 || age > 24 * 3600000) throw new Error('Create a fresh platform backup (less than 24 hours old).');
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Legacy Supabase profiles need a separate verified backup before this snapshot can represent the full platform.');
    }

    console.log(`R2 backup → bucket "${bucket}"`);
    if (!(await client.headBucket(bucket))) {
        console.log('  bucket missing — creating…');
        await client.createBucket(bucket);
    }
    const uploaded = [];
    if (platformFile) {
        await backupFile(client, bucket, 'platform', platformFile);
        console.log('Done — canonical platform snapshot uploaded to R2.');
        return;
    }
    const rooms = await backupFile(client, bucket, 'rooms', resolveRoomStateFile());
    if (rooms) uploaded.push(rooms);
    const users = await backupFile(client, bucket, 'users', resolveUserStateFile());
    if (users) uploaded.push(users);
    console.log(`Done — ${uploaded.length} object(s) uploaded to R2.`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
