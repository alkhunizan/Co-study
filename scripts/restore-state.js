const fs = require('node:fs');
const path = require('node:path');

const { decryptBackupArtifact, parseBackupEncryptionKey } = require('../services/ops/backup-artifact');
const {
    applyRestorePlan,
    buildRestorePlan,
    createSupabaseRestoreTarget,
    requiresDeletionTombstoneFilter,
    writeRoomsAtomically
} = require('../services/ops/backup-restore');
const { createSupabaseClient } = require('../services/supabase/client');
const { resolveRoomStateFile } = require('./room-state-utils');

const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;

function parseArguments(args) {
    const artifactPaths = args.filter((arg) => !arg.startsWith('--'));
    const flags = args.filter((arg) => arg.startsWith('--'));
    const allowedFlags = new Set(['--apply', '--writer-stopped']);
    const unknown = flags.find((flag) => !allowedFlags.has(flag));
    if (unknown) throw new Error(`Unknown restore option: ${unknown}.`);
    if (artifactPaths.length !== 1) {
        throw new Error('Usage: node scripts/restore-state.js <artifact.hsbackup> [--apply --writer-stopped]');
    }
    const apply = flags.includes('--apply');
    const writerStopped = flags.includes('--writer-stopped');
    if (writerStopped && !apply) throw new Error('--writer-stopped is only valid together with --apply.');
    return { artifactPath: path.resolve(artifactPaths[0]), apply, writerStopped };
}

function readArtifact(filePath) {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) throw new Error(`Backup artifact is not a regular file: ${filePath}.`);
    if (stats.size > MAX_ARTIFACT_BYTES) throw new Error('Backup artifact exceeds the 512 MiB safety limit.');
    return fs.readFileSync(filePath, 'utf8');
}

function createRequiredSupabaseTarget(env) {
    const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
    const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
        ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
        : '';
    if (!url || !serviceKey) {
        throw new Error('Supabase credentials are required to restore database sources and filter deletion tombstones.');
    }
    return createSupabaseRestoreTarget({
        client: createSupabaseClient({ url, serviceKey })
    });
}

async function main({ args = process.argv.slice(2), env = process.env, logger = console } = {}) {
    const options = parseArguments(args);
    const encryptionKey = parseBackupEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
    try {
        const bundle = decryptBackupArtifact({
            artifact: readArtifact(options.artifactPath),
            encryptionKey
        });
        let supabaseTarget = null;
        let deletionTombstones = [];
        if (requiresDeletionTombstoneFilter(bundle)) {
            supabaseTarget = createRequiredSupabaseTarget(env);
            deletionTombstones = await supabaseTarget.readDeletionTombstones();
        }
        const plan = buildRestorePlan({ bundle, deletionTombstones });
        const target = {
            ...(supabaseTarget || {}),
            restoreRooms: async (rooms) => writeRoomsAtomically(resolveRoomStateFile(env), rooms)
        };
        const result = await applyRestorePlan({
            plan,
            target,
            apply: options.apply,
            writerStopped: options.writerStopped,
            writerLockFile: env.RESTORE_WRITER_LOCK_FILE
        });

        logger.log(`Artifact: ${options.artifactPath}`);
        logger.log(`Schema: ${bundle.manifest.schemaVersion}`);
        for (const [name, count] of Object.entries(result.counts)) {
            logger.log(`${name}: ${count} row(s), ${result.filtered[name] || 0} tombstone-filtered`);
        }
        if (result.mode === 'dry-run') {
            logger.log('DRY RUN: validation passed; no data was written.');
        } else {
            logger.log('APPLIED: tombstones, profiles, events, and rooms restored in dependency order.');
        }
        return result;
    } finally {
        encryptionKey.fill(0);
    }
}

async function runCli() {
    try {
        await main();
    } catch (error) {
        console.error(error?.message || 'Restore failed.');
        process.exitCode = 1;
    }
}

if (require.main === module) void runCli();

module.exports = {
    main,
    parseArguments,
    runCli
};
