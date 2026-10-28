const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_DATASETS = {
    profiles: 'id.asc',
    deletion_tombstones: 'user_id.asc',
    focus_completion_claims: 'user_id.asc,completion_id.asc',
    focus_sessions: 'created_at.asc,id.asc',
    room_events: 'created_at.asc,id.asc'
};
const RETENTION_DAYS = 7;
const ARTIFACT_PATTERN = /^halastudy-(\d{4}-\d{2}-\d{2})T\d{6}Z-[A-Za-z0-9-]+\.hsbackup$/;
const PINNED_BACKUP_DIRECTORY = 'pinned';

/** @param {{ client: any, pageSize?: number }} options */
function createSupabaseBackupSource({ client, pageSize = 1000 } = /** @type {any} */ ({})) {
    if (!client || typeof client.select !== 'function') {
        throw new Error('Supabase backup source requires a client.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
        throw new Error('Supabase backup page size must be between 1 and 1000.');
    }

    async function readDataset(name) {
        const order = SUPABASE_DATASETS[name];
        if (!order) throw new Error(`Unsupported Supabase backup source: ${name}.`);
        const rows = [];
        for (let offset = 0; ; offset += pageSize) {
            const page = await client.select(
                name,
                `select=*&order=${order}&limit=${pageSize}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error(`Supabase ${name} backup response must be an array.`);
            rows.push(...page);
            if (page.length < pageSize) break;
        }
        return rows;
    }

    return { readDataset };
}

/** @param {{ readRooms?: () => Promise<any[]>, supabaseSource?: {readDataset(name: string): Promise<any[]>} }} options */
async function collectBackupDatasets({ readRooms, supabaseSource } = /** @type {any} */ ({})) {
    const sources = [{
        name: 'rooms',
        read: typeof readRooms === 'function'
            ? readRooms
            : async () => { throw new Error('Room source is not configured.'); }
    }];
    if (supabaseSource) {
        if (typeof supabaseSource.readDataset !== 'function') {
            throw new Error('Supabase backup source must provide readDataset().');
        }
        for (const name of Object.keys(SUPABASE_DATASETS)) {
            sources.push({ name, read: () => supabaseSource.readDataset(name) });
        }
    }

    const datasets = {};
    const failedSources = [];
    for (const source of sources) {
        try {
            const rows = await source.read();
            if (!Array.isArray(rows)) throw new Error('Source did not return an array.');
            datasets[source.name] = rows;
        } catch {
            failedSources.push(source.name);
        }
    }
    if (Object.keys(datasets).length === 0) {
        throw new Error('No readable backup sources; no artifact was created.');
    }
    if (supabaseSource && !Object.hasOwn(datasets, 'deletion_tombstones')) {
        throw new Error('Deletion tombstones are required for a restorable database backup.');
    }
    failedSources.sort();
    return { datasets, failedSources };
}

function pruneDailyArtifacts(backupDir) {
    const matching = fs.readdirSync(backupDir)
        .map((name) => ({ name, match: name.match(ARTIFACT_PATTERN) }))
        .filter((entry) => entry.match)
        .sort((left, right) => left.name.localeCompare(right.name));
    const latestByDay = new Map();
    for (const entry of matching) latestByDay.set(entry.match[1], entry.name);
    const retainedDays = new Set([...latestByDay.keys()].sort().slice(-RETENTION_DAYS));
    const keep = new Set([...retainedDays].map((day) => latestByDay.get(day)));
    const removedFiles = [];
    for (const entry of matching) {
        if (keep.has(entry.name)) continue;
        const filePath = path.join(backupDir, entry.name);
        fs.rmSync(filePath, { force: true });
        removedFiles.push(filePath);
    }
    return removedFiles;
}

function backupFileParts({ createdAt, nonce, prefix = 'halastudy' }) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (!Number.isFinite(date.getTime())) throw new Error('Backup creation time is invalid.');
    const safeNonce = typeof nonce === 'string' && /^[A-Za-z0-9-]{1,32}$/.test(nonce)
        ? nonce
        : crypto.randomBytes(6).toString('hex');
    const iso = date.toISOString();
    const timestamp = `${iso.slice(0, 10)}T${iso.slice(11, 19).replaceAll(':', '')}Z`;
    return { fileName: `${prefix}-${timestamp}-${safeNonce}.hsbackup` };
}

function writePrivateArtifact({ directory, fileName, artifact }) {
    const resolvedDir = path.resolve(directory);
    const filePath = path.join(resolvedDir, fileName);
    const tempPath = path.join(resolvedDir, `.${fileName}.${process.pid}.tmp`);
    fs.mkdirSync(resolvedDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(resolvedDir, 0o700);
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(artifact)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        fs.renameSync(tempPath, filePath);
        fs.chmodSync(filePath, 0o600);
        return filePath;
    } catch (error) {
        fs.rmSync(tempPath, { force: true });
        throw error;
    }
}

/** @param {{ backupDir: string, artifact: any, createdAt?: Date, nonce?: string }} options */
function writeDailyBackupArtifact({ backupDir, artifact, createdAt = new Date(), nonce } = /** @type {any} */ ({})) {
    if (typeof backupDir !== 'string' || !backupDir.trim()) throw new Error('Backup directory is required.');
    const resolvedDir = path.resolve(backupDir);
    const { fileName } = backupFileParts({ createdAt, nonce });
    const filePath = writePrivateArtifact({ directory: resolvedDir, fileName, artifact });
    const removedFiles = pruneDailyArtifacts(resolvedDir);
    return { filePath, removedFiles };
}

/** @param {{ backupDir: string, artifact: any, createdAt?: Date, nonce?: string }} options */
function writePinnedBackupArtifact({ backupDir, artifact, createdAt = new Date(), nonce } = /** @type {any} */ ({})) {
    if (typeof backupDir !== 'string' || !backupDir.trim()) throw new Error('Backup directory is required.');
    const { fileName } = backupFileParts({
        createdAt,
        nonce,
        prefix: 'halastudy-pre-cutover'
    });
    const pinnedDir = path.join(path.resolve(backupDir), PINNED_BACKUP_DIRECTORY);
    let filePath;
    let checksumPath;
    try {
        filePath = writePrivateArtifact({ directory: pinnedDir, fileName, artifact });
        const body = fs.readFileSync(filePath);
        const sha256 = crypto.createHash('sha256').update(body).digest('hex');
        checksumPath = `${filePath}.sha256`;
        fs.writeFileSync(checksumPath, `${sha256}  ${fileName}\n`, {
            encoding: 'utf8',
            flag: 'wx',
            mode: 0o600
        });
        fs.chmodSync(checksumPath, 0o600);
        return { filePath, checksumPath, sha256 };
    } catch (error) {
        if (checksumPath) fs.rmSync(checksumPath, { force: true });
        if (filePath) fs.rmSync(filePath, { force: true });
        throw error;
    }
}

module.exports = {
    collectBackupDatasets,
    createSupabaseBackupSource,
    writePinnedBackupArtifact,
    writeDailyBackupArtifact
};
