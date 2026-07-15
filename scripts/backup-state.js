const path = require('node:path');

const { createEncryptedBackupArtifact, parseBackupEncryptionKey } = require('../services/ops/backup-artifact');
const {
    collectBackupDatasets,
    createSupabaseBackupSource,
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
    if (!url) return null;
    return createSupabaseBackupSource({
        client: createSupabaseClient({ url, serviceKey })
    });
}

async function main({ env = process.env, logger = console, now = new Date() } = {}) {
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
        const written = writeDailyBackupArtifact({
            backupDir,
            artifact,
            createdAt: now
        });

        logger.log(`Encrypted backup created: ${written.filePath}`);
        logger.log(`Sources: ${Object.keys(collected.datasets).join(', ')}`);
        logger.log(`Daily snapshots retained: 7 (${written.removedFiles.length} old artifact(s) pruned)`);
        if (collected.failedSources.length > 0) {
            logger.warn(`Unreadable sources recorded in manifest: ${collected.failedSources.join(', ')}`);
        }
        return {
            filePath: path.resolve(written.filePath),
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
    runCli
};
