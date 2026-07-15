const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATABASE_DATASETS = ['profiles', 'focus_sessions', 'room_events'];
const ROOM_USER_REFERENCE_FIELDS = [
    'owner_user_id',
    'ownerUserId',
    'created_by_user_id',
    'createdByUserId'
];

function tombstoneUserId(row) {
    if (!row || typeof row !== 'object') return '';
    const value = row.user_id ?? row.userId;
    return typeof value === 'string' ? value : '';
}

function rowReferencesDeletedUser(row, deletedIds, fields) {
    if (!row || typeof row !== 'object') return false;
    return fields.some((field) => typeof row[field] === 'string' && deletedIds.has(row[field]));
}

/** @param {{ bundle: any, deletionTombstones?: any[] }} options */
function buildRestorePlan({ bundle, deletionTombstones = [] } = /** @type {any} */ ({})) {
    if (!bundle || typeof bundle !== 'object' || !bundle.datasets || typeof bundle.datasets !== 'object') {
        throw new Error('Validated backup bundle is required.');
    }
    if (!Array.isArray(deletionTombstones)) throw new Error('Deletion tombstones must be an array.');
    const deletedIds = new Set(deletionTombstones.map(tombstoneUserId).filter(Boolean));
    const datasets = {};
    const filtered = {};

    for (const [name, rows] of Object.entries(bundle.datasets)) {
        let restored = rows;
        if (name === 'profiles') {
            restored = rows.filter((row) => !rowReferencesDeletedUser(row, deletedIds, ['id']));
        } else if (name === 'focus_sessions') {
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
        filtered[name] = rows.length - restored.length;
    }
    return {
        manifest: bundle.manifest,
        datasets,
        filtered
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
        ['profiles', 'restoreProfiles'],
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

/** @param {{ client: any, pageSize?: number, batchSize?: number }} options */
function createSupabaseRestoreTarget({ client, pageSize = 1000, batchSize = 250 } = /** @type {any} */ ({})) {
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
        for (let offset = 0; ; offset += pageSize) {
            const page = await client.select(
                'deletion_tombstones',
                `select=user_id,deleted_at,expires_at&order=user_id.asc&limit=${pageSize}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error('Supabase deletion tombstones response must be an array.');
            rows.push(...page);
            if (page.length < pageSize) break;
        }
        return rows;
    }

    async function upsertBatches(table, rows) {
        for (let offset = 0; offset < rows.length; offset += batchSize) {
            await client.upsert(table, rows.slice(offset, offset + batchSize), { onConflict: 'id' });
        }
    }

    return {
        readDeletionTombstones,
        restoreProfiles: (rows) => upsertBatches('profiles', rows),
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
