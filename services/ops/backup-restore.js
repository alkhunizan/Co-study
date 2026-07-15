const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATABASE_DATASETS = [
    'profiles',
    'focus_completion_claims',
    'focus_sessions',
    'room_events'
];
const ROOM_USER_REFERENCE_FIELDS = [
    'owner_user_id',
    'ownerUserId',
    'created_by_user_id',
    'createdByUserId'
];
const USER_BEARING_BACKUP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function tombstoneIdentity(row) {
    if (!row || typeof row !== 'object') throw new Error('Deletion tombstone row is invalid.');
    const value = row.user_id ?? row.userId;
    const rawExpiresAt = row.expires_at ?? row.expiresAt;
    const expiresAt = typeof rawExpiresAt === 'string' ? Date.parse(rawExpiresAt) : Number.NaN;
    if (typeof value !== 'string' || !value.trim() || !Number.isFinite(expiresAt)) {
        throw new Error('Deletion tombstone row is invalid.');
    }
    return { userId: value.trim(), expiresAt };
}

function currentTombstoneUserId(row, now) {
    const tombstone = tombstoneIdentity(row);
    return tombstone.expiresAt > now ? tombstone.userId : '';
}

function rowReferencesDeletedUser(row, deletedIds, fields) {
    if (!row || typeof row !== 'object') return false;
    return fields.some((field) => typeof row[field] === 'string' && deletedIds.has(row[field]));
}

/** @param {{ bundle: any, deletionTombstones?: any[], now?: number }} options */
function buildRestorePlan({ bundle, deletionTombstones = [], now = Date.now() } = /** @type {any} */ ({})) {
    if (!bundle || typeof bundle !== 'object' || !bundle.datasets || typeof bundle.datasets !== 'object') {
        throw new Error('Validated backup bundle is required.');
    }
    if (!Array.isArray(deletionTombstones)) throw new Error('Deletion tombstones must be an array.');
    if (!Number.isFinite(now)) throw new Error('Restore timestamp is invalid.');
    const artifactTombstones = Object.hasOwn(bundle.datasets, 'deletion_tombstones')
        ? bundle.datasets.deletion_tombstones
        : [];
    if (!Array.isArray(artifactTombstones)) throw new Error('Artifact deletion tombstones must be an array.');
    const schemaVersion = bundle.manifest?.schemaVersion;
    if (schemaVersion >= 2
        && DATABASE_DATASETS.some((name) => Object.hasOwn(bundle.datasets, name))
        && !Object.hasOwn(bundle.datasets, 'deletion_tombstones')) {
        throw new Error('Backup source deletion_tombstones is required beside database datasets.');
    }
    if (requiresDeletionTombstoneFilter(bundle)) {
        const createdAt = Date.parse(bundle.manifest?.createdAt);
        const artifactAge = now - createdAt;
        if (!Number.isFinite(createdAt)) {
            throw new Error('Backup artifact creation time is invalid.');
        }
        if (artifactAge < 0) {
            throw new Error('Backup artifact creation time is in the future.');
        }
        if (artifactAge >= USER_BEARING_BACKUP_MAX_AGE_MS) {
            if (schemaVersion === 1) {
                throw new Error('Legacy backup schema is too old to restore without embedded deletion tombstones.');
            }
            throw new Error('Backup artifact is too old to restore safely with expiring deletion tombstones.');
        }
    }

    const protectedTombstones = new Map();
    const activeTombstones = new Map();
    for (const row of artifactTombstones) {
        const tombstone = tombstoneIdentity(row);
        protectedTombstones.set(tombstone.userId, row);
        if (tombstone.expiresAt > now) activeTombstones.set(tombstone.userId, row);
    }
    const currentIds = new Set();
    for (const row of deletionTombstones) {
        const userId = currentTombstoneUserId(row, now);
        if (!userId) continue;
        currentIds.add(userId);
        // Current database state is authoritative when both sources carry the same user.
        protectedTombstones.set(userId, row);
        activeTombstones.set(userId, row);
    }
    const deletedIds = new Set(protectedTombstones.keys());
    const datasets = {};
    const filtered = {};

    for (const [name, rows] of Object.entries(bundle.datasets)) {
        let restored = rows;
        if (name === 'deletion_tombstones') {
            restored = [...activeTombstones.values()];
        } else if (name === 'profiles') {
            restored = rows.filter((row) => !rowReferencesDeletedUser(row, deletedIds, ['id']));
        } else if (name === 'focus_sessions' || name === 'focus_completion_claims') {
            restored = rows.filter((row) => !rowReferencesDeletedUser(row, deletedIds, ['user_id', 'userId']));
        } else if (name === 'room_events') {
            restored = rows.filter((row) => !rowReferencesDeletedUser(
                row,
                deletedIds,
                ['user_id', 'userId', 'owner_user_id', 'ownerUserId']
            ));
        } else if (name === 'rooms') {
            restored = rows.filter((row) => !rowReferencesDeletedUser(
                row,
                deletedIds,
                ['owner_user_id', 'ownerUserId', 'created_by_user_id', 'createdByUserId']
            ));
        }
        datasets[name] = restored;
        filtered[name] = name === 'deletion_tombstones'
            ? Math.max(0, rows.length - [...new Set(rows.map((row) => tombstoneIdentity(row).userId))]
                .filter((userId) => activeTombstones.has(userId)).length)
            : rows.length - restored.length;
    }
    return {
        manifest: bundle.manifest,
        datasets,
        filtered,
        tombstoneProtection: {
            artifactCount: new Set(artifactTombstones.map((row) => tombstoneIdentity(row).userId)).size,
            currentCount: currentIds.size,
            protectedUserCount: protectedTombstones.size
        }
    };
}

function sourceCounts(plan) {
    return Object.fromEntries(Object.entries(plan.datasets).map(([name, rows]) => [name, rows.length]));
}

/** @param {{ plan: any, target: any, apply?: boolean, writerStopped?: boolean, writerLockFile?: string }} options */
async function applyRestorePlan({
    plan,
    target,
    apply = false,
    writerStopped = false,
    writerLockFile
} = /** @type {any} */ ({})) {
    if (!plan || typeof plan !== 'object' || !plan.datasets) throw new Error('Restore plan is required.');
    if (!apply) return { mode: 'dry-run', counts: sourceCounts(plan), filtered: plan.filtered };
    if (!writerStopped) {
        throw new Error('Restore apply requires --writer-stopped after the single application writer is stopped.');
    }
    if (writerLockFile && fs.existsSync(path.resolve(writerLockFile))) {
        throw new Error(`Application writer lock is present: ${path.resolve(writerLockFile)}.`);
    }
    if (!target || typeof target !== 'object') throw new Error('Restore target is required.');

    const operations = [
        ['deletion_tombstones', 'restoreDeletionTombstones'],
        ['profiles', 'restoreProfiles'],
        ['focus_completion_claims', 'restoreFocusCompletionClaims'],
        ['focus_sessions', 'restoreFocusSessions'],
        ['room_events', 'restoreRoomEvents'],
        ['rooms', 'restoreRooms']
    ];
    for (const [datasetName, methodName] of operations) {
        if (!Object.hasOwn(plan.datasets, datasetName)) continue;
        if (typeof target[methodName] !== 'function') {
            throw new Error(`Restore target does not support ${datasetName}.`);
        }
        await target[methodName](plan.datasets[datasetName]);
    }
    return { mode: 'applied', counts: sourceCounts(plan), filtered: plan.filtered };
}

/** @param {{ client: any, pageSize?: number, batchSize?: number, now?: () => number }} options */
function createSupabaseRestoreTarget({
    client,
    pageSize = 1000,
    batchSize = 250,
    now = () => Date.now()
} = /** @type {any} */ ({})) {
    if (!client || typeof client.select !== 'function' || typeof client.upsert !== 'function') {
        throw new Error('Supabase restore target requires select and upsert support.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
        throw new Error('Supabase tombstone page size must be between 1 and 1000.');
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
        throw new Error('Supabase restore batch size must be between 1 and 1000.');
    }

    async function readDeletionTombstones() {
        const rows = [];
        const readAt = now();
        if (!Number.isFinite(readAt)) throw new Error('Restore timestamp is invalid.');
        const currentIso = new Date(readAt).toISOString();
        for (let offset = 0; ; offset += pageSize) {
            const page = await client.select(
                'deletion_tombstones',
                `select=user_id,deleted_at,expires_at,reason&expires_at=gt.${encodeURIComponent(currentIso)}`
                    + `&order=user_id.asc&limit=${pageSize}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error('Supabase deletion tombstones response must be an array.');
            for (const row of page) {
                if (currentTombstoneUserId(row, readAt)) rows.push(row);
            }
            if (page.length < pageSize) break;
        }
        return rows;
    }

    async function upsertBatches(table, rows, onConflict = 'id') {
        for (let offset = 0; offset < rows.length; offset += batchSize) {
            await client.upsert(table, rows.slice(offset, offset + batchSize), { onConflict });
        }
    }

    return {
        readDeletionTombstones,
        restoreDeletionTombstones: (rows) => upsertBatches('deletion_tombstones', rows, 'user_id'),
        restoreProfiles: (rows) => upsertBatches('profiles', rows),
        restoreFocusCompletionClaims: (rows) =>
            upsertBatches('focus_completion_claims', rows, 'user_id,completion_id'),
        restoreFocusSessions: (rows) => upsertBatches('focus_sessions', rows),
        restoreRoomEvents: (rows) => upsertBatches('room_events', rows)
    };
}

function writeRoomsAtomically(filePath, rooms) {
    const resolvedPath = path.resolve(filePath);
    const parent = path.dirname(resolvedPath);
    const tempPath = path.join(parent, `.${path.basename(resolvedPath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(rooms, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        fs.renameSync(tempPath, resolvedPath);
        fs.chmodSync(resolvedPath, 0o600);
    } catch (error) {
        fs.rmSync(tempPath, { force: true });
        throw error;
    }
}

function hasDatabaseDatasets(bundle) {
    return DATABASE_DATASETS.some((name) => Object.hasOwn(bundle.datasets, name));
}

function requiresDeletionTombstoneFilter(bundle) {
    if (!bundle || typeof bundle !== 'object' || !bundle.datasets || typeof bundle.datasets !== 'object') {
        throw new Error('Validated backup bundle is required.');
    }
    if (hasDatabaseDatasets(bundle)) return true;
    const rooms = bundle.datasets.rooms;
    if (!Array.isArray(rooms)) return false;
    return rooms.some((room) => ROOM_USER_REFERENCE_FIELDS.some(
        (field) => typeof room?.[field] === 'string' && room[field].trim() !== ''
    ));
}

module.exports = {
    applyRestorePlan,
    buildRestorePlan,
    createSupabaseRestoreTarget,
    requiresDeletionTombstoneFilter,
    writeRoomsAtomically
};
