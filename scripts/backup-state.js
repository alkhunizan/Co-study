const path = require('node:path');

const {
    assertCompleteCurrentBackupBundle,
    createEncryptedBackupArtifact,
    decryptBackupArtifact,
    parseBackupEncryptionKey
} = require('../services/ops/backup-artifact');
const {
    collectBackupDatasets,
    createSupabaseBackupSource,
    writePinnedBackupArtifact,
    writeDailyBackupArtifact
} = require('../services/ops/backup-service');
const { createSupabaseClient } = require('../services/supabase/client');
const { readRoomStateArray, resolveBackupDir, resolveRoomStateFile } = require('./room-state-utils');

function createOptionalSupabaseSource(env) {
    const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
    const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
        ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
        : '';
    if (!!url !== !!serviceKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must either both be set or both be absent.');
    }
    if (env.NODE_ENV === 'production' && !url) {
        throw new Error('Complete Supabase configuration is required for production backups.');
    }
    if (!url) return null;
    return createSupabaseBackupSource({
        client: createSupabaseClient({ url, serviceKey })
    });
}

function parseArguments(args) {
    if (!Array.isArray(args) || args.length > 1 || (args.length === 1 && args[0] !== '--pin-pre-cutover')) {
        throw new Error('Usage: node scripts/backup-state.js [--pin-pre-cutover]');
    }
    return args[0] === '--pin-pre-cutover' ? 'pin-pre-cutover' : 'daily';
}

async function main({
    args = process.argv.slice(2),
    env = process.env,
    logger = console,
    now = new Date()
} = {}) {
    const mode = parseArguments(args);
    const encryptionKey = parseBackupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
    try {
        const roomStateFile = resolveRoomStateFile(env);
        const backupDir = resolveBackupDir(env);
        const supabaseSource = createOptionalSupabaseSource(env);
        const collected = await collectBackupDatasets({
            readRooms: async () => readRoomStateArray(roomStateFile),
            supabaseSource
        });
        const artifact = createEncryptedBackupArtifact({
            datasets: collected.datasets,
            failedSources: collected.failedSources,
            encryptionKey,
            createdAt: now
        });
        let written;
        if (mode === 'pin-pre-cutover') {
            const authenticated = decryptBackupArtifact({ artifact, encryptionKey });
            assertCompleteCurrentBackupBundle(authenticated, 'Pinned pre-cutover backup');
            written = writePinnedBackupArtifact({ backupDir, artifact, createdAt: now });
            logger.log(`Pinned pre-cutover backup created: ${written.filePath}`);
            logger.log(`Authenticated schema v${authenticated.manifest.schemaVersion}; SHA-256: ${written.sha256}`);
        } else {
            written = writeDailyBackupArtifact({ backupDir, artifact, createdAt: now });
            logger.log(`Encrypted backup created: ${written.filePath}`);
            logger.log(`Daily snapshots retained: 7 (${written.removedFiles.length} old artifact(s) pruned)`);
        }

        logger.log(`Sources: ${Object.keys(collected.datasets).join(', ')}`);
        if (collected.failedSources.length > 0) {
            logger.warn(`Unreadable sources recorded in manifest: ${collected.failedSources.join(', ')}`);
        }
        return {
            filePath: path.resolve(written.filePath),
            checksumPath: written.checksumPath ? path.resolve(written.checksumPath) : null,
            sha256: written.sha256 || null,
            sources: Object.keys(collected.datasets),
            failedSources: collected.failedSources
        };
    } finally {
        encryptionKey.fill(0);
    }
}

async function runCli() {
    try {
        await main();
    } catch (error) {
        console.error(error?.message || 'Backup failed.');
        process.exitCode = 1;
    }
}

if (require.main === module) void runCli();

module.exports = {
    createOptionalSupabaseSource,
    main,
    parseArguments,
    runCli
};
