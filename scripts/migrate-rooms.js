const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { getScheduleExpiryAt, normalizeSchedule } = require('../schedule-utils');
const { createSupabaseReadOnlyClient } = require('../services/supabase/client');

const ROOM_SCHEMA_VERSION = 2;
const PROFILE_PAGE_SIZE = 1000;
const BOARD_TASK_LIMIT = 100;
const BOARD_TASK_MAX_BYTES = 500;
const BOARD_TASK_ID_MAX_LENGTH = 128;
const BOARD_SERIALIZED_MAX_BYTES = 64 * 1024;
// biome-ignore lint/suspicious/noControlCharactersInRegex: removes persisted control and bidi-spoofing characters
const INVISIBLE_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function canonicalRoomId(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function fingerprint(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function trimUtf8(value, byteLimit) {
    const visible = typeof value === 'string' ? value.replace(INVISIBLE_TEXT_PATTERN, '').trim() : '';
    let result = '';
    let bytes = 0;
    for (const character of visible) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (bytes + characterBytes > byteLimit) break;
        result += character;
        bytes += characterBytes;
    }
    return result;
}

function normalizeTask(task, index) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
    const text = trimUtf8(task.text, BOARD_TASK_MAX_BYTES);
    if (!text) return null;
    const id = typeof task.id === 'string' && task.id.trim()
        ? task.id.trim().slice(0, BOARD_TASK_ID_MAX_LENGTH)
        : `legacy-task-${index + 1}`;
    const numericPriority = Number.parseInt(task.priority, 10);
    return {
        id,
        text,
        priority: [1, 2, 3].includes(numericPriority) ? numericPriority : 2,
        done: !!task.done
    };
}

function normalizeBoard(board) {
    const source = board && typeof board === 'object' && !Array.isArray(board) ? board : {};
    const originalTasks = Array.isArray(source.tasks) ? source.tasks : [];
    const tasks = originalTasks.map(normalizeTask).filter(Boolean).slice(0, BOARD_TASK_LIMIT);
    const active = {
        goal: typeof source.goal === 'string' ? source.goal.trim().slice(0, 80) : '',
        tasks
    };
    while (active.tasks.length > 0 && Buffer.byteLength(JSON.stringify(active), 'utf8') > BOARD_SERIALIZED_MAX_BYTES) {
        active.tasks.pop();
    }
    const originalBytes = Buffer.byteLength(JSON.stringify(source), 'utf8');
    const activeBytes = Buffer.byteLength(JSON.stringify(active), 'utf8');
    const exceedsLimits = originalTasks.length > BOARD_TASK_LIMIT
        || originalTasks.some((task) => Buffer.byteLength(
            typeof task?.text === 'string' ? task.text.replace(INVISIBLE_TEXT_PATTERN, '').trim() : '',
            'utf8'
        ) > BOARD_TASK_MAX_BYTES)
        || originalTasks.some((task) => typeof task?.id === 'string' && task.id.trim().length > BOARD_TASK_ID_MAX_LENGTH)
        || originalBytes > BOARD_SERIALIZED_MAX_BYTES;
    return {
        active,
        detail: {
            changed: exceedsLimits,
            originalTaskCount: originalTasks.length,
            activeTaskCount: active.tasks.length,
            archivedTaskCount: Math.max(originalTasks.length - active.tasks.length, 0),
            originalBytes,
            activeBytes
        }
    };
}

function buildCreatorIndex(users) {
    const creatorsByRoom = new Map();
    for (const user of users) {
        if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id.trim()) continue;
        const userId = user.id.trim();
        const memberships = Array.isArray(user.myRooms) ? user.myRooms : [];
        const createdRooms = new Set(memberships
            .filter((entry) => entry?.role === 'created')
            .map((entry) => canonicalRoomId(entry?.roomId))
            .filter(Boolean));
        for (const roomId of createdRooms) {
            const creators = creatorsByRoom.get(roomId) || new Set();
            creators.add(userId);
            creatorsByRoom.set(roomId, creators);
        }
    }
    return creatorsByRoom;
}

function ownershipForRoom(room, roomId, creatorsByRoom) {
    const fromOwnerUserId = typeof room.ownerUserId === 'string' && room.ownerUserId.trim()
        ? room.ownerUserId.trim()
        : null;
    if (room.schemaVersion === ROOM_SCHEMA_VERSION) {
        return {
            classification: 'preserved',
            candidateUserIds: [],
            fromOwnerUserId,
            toOwnerUserId: fromOwnerUserId
        };
    }
    const candidateUserIds = [...(creatorsByRoom.get(roomId) || [])].sort();
    const classification = candidateUserIds.length === 1
        ? 'unique'
        : candidateUserIds.length > 1
            ? 'ambiguous'
            : 'absent';
    return {
        classification,
        candidateUserIds,
        fromOwnerUserId,
        toOwnerUserId: candidateUserIds.length === 1 ? candidateUserIds[0] : null
    };
}

function migrateRoom(room, index, creatorsByRoom) {
    if (!room || typeof room !== 'object' || Array.isArray(room)) {
        return { issue: `rooms[${index}] is not a room object.` };
    }
    const sourceId = room.id || room.roomId || room.code || '';
    const roomId = canonicalRoomId(sourceId);
    if (!roomId) return { issue: `rooms[${index}] has no valid room identifier.` };

    const ownership = ownershipForRoom(room, roomId, creatorsByRoom);
    const migrated = { ...room };
    const normalizationFields = [];
    if (sourceId !== roomId || room.id !== roomId || 'roomId' in room || 'code' in room) {
        normalizationFields.push('id');
    }
    migrated.id = roomId;
    delete migrated.roomId;
    delete migrated.code;

    const normalizedName = typeof room.name === 'string' && room.name.trim()
        ? room.name.trim().slice(0, 48)
        : roomId;
    if (room.name !== normalizedName) normalizationFields.push('name');
    migrated.name = normalizedName;

    let normalizedSchedule = null;
    if (room.schedule !== undefined && room.schedule !== null) {
        normalizedSchedule = normalizeSchedule(room.schedule, {
            titleFallback: normalizedName,
            strict: false
        });
        if (!normalizedSchedule) {
            return { issue: `Room ${roomId} has an invalid schedule and cannot be migrated safely.`, roomId };
        }
        if (!jsonEqual(room.schedule, normalizedSchedule)) normalizationFields.push('schedule');
        migrated.schedule = normalizedSchedule;
    } else {
        migrated.schedule = null;
        if (room.schedule !== null) normalizationFields.push('schedule');
    }

    const board = normalizeBoard(room.board);
    if (!jsonEqual(room.board, board.active)) normalizationFields.push('board');
    migrated.board = board.active;

    const fromExpiry = Number.isFinite(room.expiresAt) ? room.expiresAt : null;
    const calculatedExpiry = normalizedSchedule ? getScheduleExpiryAt(normalizedSchedule) : null;
    if (normalizedSchedule && !Number.isFinite(calculatedExpiry)) {
        return { issue: `Room ${roomId} schedule has no finite expiry.`, roomId };
    }
    const toExpiry = fromExpiry ?? calculatedExpiry;
    migrated.expiresAt = toExpiry;
    migrated.ownerUserId = ownership.toOwnerUserId;
    migrated.schemaVersion = ROOM_SCHEMA_VERSION;
    const normalizedLifecycleEpoch = Number.isInteger(room.lifecycleEpoch) && room.lifecycleEpoch >= 0
        ? room.lifecycleEpoch
        : 0;
    if (room.lifecycleEpoch !== normalizedLifecycleEpoch) normalizationFields.push('lifecycleEpoch');
    migrated.lifecycleEpoch = normalizedLifecycleEpoch;

    const changed = !jsonEqual(room, migrated);
    return {
        migrated,
        detail: {
            roomId,
            fromSchemaVersion: room.schemaVersion === ROOM_SCHEMA_VERSION ? ROOM_SCHEMA_VERSION : 1,
            toSchemaVersion: ROOM_SCHEMA_VERSION,
            changed,
            ownership,
            expiry: {
                changed: fromExpiry !== toExpiry,
                from: fromExpiry,
                to: toExpiry
            },
            normalization: {
                changed: normalizationFields.length > 0,
                fields: [...new Set(normalizationFields)].sort()
            },
            overflow: board.detail
        },
        overflowSource: board.detail.changed ? { roomId, board: room.board } : null
    };
}

function buildRoomMigrationPlan({ rooms, users } = /** @type {any} */ ({})) {
    if (!Array.isArray(rooms)) throw new TypeError('Room migration requires a room array.');
    if (!Array.isArray(users)) throw new TypeError('Room migration requires a user array.');
    const creatorsByRoom = buildCreatorIndex(users);
    const migratedRooms = [];
    const roomDetails = [];
    const overflowRooms = [];
    const blockingIssues = [];
    const seenRoomIds = new Set();

    for (const [index, room] of rooms.entries()) {
        const result = migrateRoom(room, index, creatorsByRoom);
        if (result.issue) {
            blockingIssues.push(result.issue);
            continue;
        }
        if (seenRoomIds.has(result.detail.roomId)) {
            blockingIssues.push(`Room identifier ${result.detail.roomId} is duplicated after normalization.`);
        }
        seenRoomIds.add(result.detail.roomId);
        migratedRooms.push(result.migrated);
        roomDetails.push(result.detail);
        if (result.overflowSource) overflowRooms.push(result.overflowSource);
    }

    const ownership = { unique: 0, ambiguous: 0, absent: 0, preserved: 0 };
    for (const room of roomDetails) ownership[room.ownership.classification] += 1;
    return {
        schemaVersion: 1,
        kind: 'halastudy-room-v2-migration-plan',
        changesRequired: roomDetails.some((room) => room.changed),
        blockingIssues,
        summary: {
            roomsScanned: rooms.length,
            roomsChanged: roomDetails.filter((room) => room.changed).length,
            ownership,
            expiryAdded: roomDetails.filter((room) => room.expiry.changed).length,
            normalizationRooms: roomDetails.filter((room) => room.normalization.changed).length,
            overflowRooms: roomDetails.filter((room) => room.overflow.changed).length,
            overflowTasksArchived: roomDetails.reduce((total, room) => total + room.overflow.archivedTaskCount, 0)
        },
        rooms: roomDetails,
        migratedRooms,
        overflowArchive: {
            schemaVersion: 1,
            reason: 'legacy_board_overflow',
            rooms: overflowRooms
        }
    };
}

function parseArgs(argv) {
    const parsed = { apply: false, writerStopped: false, help: false };
    for (const argument of argv) {
        if (argument === '--apply') parsed.apply = true;
        else if (argument === '--writer-stopped') parsed.writerStopped = true;
        else if (argument === '--help' || argument === '-h') parsed.help = true;
        else throw new Error(`Unsupported argument: ${argument}`);
    }
    if (!parsed.help && parsed.apply !== parsed.writerStopped) {
        if (parsed.apply) throw new Error('--apply also requires --writer-stopped.');
        throw new Error('--writer-stopped is only valid together with --apply.');
    }
    return parsed;
}

function readJsonArray(filePath, label, fsImpl = fs) {
    if (!fsImpl.existsSync(filePath)) throw new Error(`${label} file not found: ${filePath}`);
    const sourceText = fsImpl.readFileSync(filePath, 'utf8');
    if (!sourceText.trim()) throw new Error(`${label} file is empty: ${filePath}`);
    let parsed;
    try {
        parsed = JSON.parse(sourceText);
    } catch (error) {
        throw new Error(`${label} file is not valid JSON: ${filePath} (${error.message})`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${label} file must contain a JSON array: ${filePath}`);
    return { sourceText, rows: parsed };
}

function validateProfileRows(rows) {
    const ids = new Set();
    return rows.map((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)
            || typeof row.id !== 'string' || !row.id.trim()
            || (row.my_rooms !== undefined && !Array.isArray(row.my_rooms))) {
            throw new Error(`Invalid Supabase profile ownership row at index ${index}.`);
        }
        const id = row.id.trim();
        if (ids.has(id)) throw new Error(`Duplicate Supabase profile id: ${id}`);
        ids.add(id);
        return { id, myRooms: row.my_rooms || [] };
    });
}

async function loadMigrationUsers({
    env = process.env,
    supabaseClient,
    fsImpl = fs
} = /** @type {any} */ ({})) {
    if (env.NODE_ENV === 'production') {
        const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
        const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string'
            ? env.SUPABASE_SERVICE_ROLE_KEY.trim()
            : '';
        if (!!url !== !!serviceKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.');
        }
        if (!url) throw new Error('Complete Supabase configuration is required for production room migration.');
        const client = supabaseClient || createSupabaseReadOnlyClient({ url, serviceKey });
        if (!client || typeof client.select !== 'function' || Object.keys(client).some((key) => key !== 'select')) {
            throw new Error('Production room migration requires a read-only Supabase client.');
        }
        const rows = [];
        for (let offset = 0; ; offset += PROFILE_PAGE_SIZE) {
            const page = await client.select(
                'profiles',
                `select=id,my_rooms&order=id.asc&limit=${PROFILE_PAGE_SIZE}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error('Invalid Supabase profiles response: expected an array.');
            rows.push(...page);
            if (page.length < PROFILE_PAGE_SIZE) break;
        }
        return { source: 'supabase', users: validateProfileRows(rows) };
    }

    const userFile = path.resolve(env.USER_STATE_FILE || path.join(__dirname, '..', 'data', 'users.json'));
    const { rows } = readJsonArray(userFile, 'User state', fsImpl);
    const ids = new Set();
    const users = rows.map((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)
            || typeof row.id !== 'string' || !row.id.trim()
            || (row.myRooms !== undefined && !Array.isArray(row.myRooms))) {
            throw new Error(`Invalid local user ownership row at index ${index}.`);
        }
        const id = row.id.trim();
        if (ids.has(id)) throw new Error(`Duplicate local user id: ${id}`);
        ids.add(id);
        return { id, myRooms: row.myRooms || [] };
    });
    return { source: 'file', userFile, users };
}

function timestampLabel(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (!Number.isFinite(date.getTime())) throw new Error('Migration timestamp is invalid.');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function writeExclusiveMode600(filePath, contents, fsImpl) {
    let descriptor;
    let created = false;
    try {
        descriptor = fsImpl.openSync(filePath, 'wx', 0o600);
        created = true;
        fsImpl.writeFileSync(descriptor, contents, 'utf8');
        fsImpl.fsyncSync(descriptor);
        fsImpl.closeSync(descriptor);
        descriptor = undefined;
        fsImpl.chmodSync(filePath, 0o600);
    } catch (error) {
        if (descriptor !== undefined) {
            try {
                fsImpl.closeSync(descriptor);
            } catch (_closeError) {}
        }
        if (created) {
            try {
                fsImpl.rmSync(filePath, { force: true });
            } catch (_removeError) {}
        }
        throw error;
    }
}

function reserveBackupPath({ roomFile, backupDir, sourceSha256, now, fsImpl }) {
    const basename = path.basename(roomFile).replace(/[^A-Za-z0-9._-]/g, '_');
    const prefix = `${basename}.pre-room-v2.${timestampLabel(now)}.${sourceSha256.slice(0, 16)}`;
    for (let suffix = 0; suffix < 1000; suffix += 1) {
        const candidate = path.join(backupDir, `${prefix}${suffix ? `.${suffix}` : ''}.json`);
        if (!fsImpl.existsSync(candidate)) return candidate;
    }
    throw new Error(`Could not reserve a unique pre-migration backup in ${backupDir}.`);
}

function applyRoomMigration({
    roomFile,
    backupDir = path.dirname(roomFile),
    sourceText,
    plan,
    now = new Date(),
    fsImpl = fs
} = /** @type {any} */ ({})) {
    if (!plan || !Array.isArray(plan.migratedRooms)) throw new TypeError('A room migration plan is required.');
    if (plan.blockingIssues?.length) {
        throw new Error(`Room migration is blocked: ${plan.blockingIssues.join(' ')}`);
    }
    if (!plan.changesRequired) return { applied: false, backup: null };
    const resolvedRoomFile = path.resolve(roomFile);
    const resolvedBackupDir = path.resolve(backupDir);
    if (fsImpl.readFileSync(resolvedRoomFile, 'utf8') !== sourceText) {
        throw new Error('Room state changed after migration planning; no files were written.');
    }

    fsImpl.mkdirSync(resolvedBackupDir, { recursive: true, mode: 0o700 });
    const sourceSha256 = fingerprint(sourceText);
    const backupPath = reserveBackupPath({
        roomFile: resolvedRoomFile,
        backupDir: resolvedBackupDir,
        sourceSha256,
        now,
        fsImpl
    });
    const backupArtifact = {
        schemaVersion: 1,
        kind: 'halastudy-room-v2-pre-migration-backup',
        createdAt: (now instanceof Date ? now : new Date(now)).toISOString(),
        sourceFile: resolvedRoomFile,
        sourceBytes: Buffer.byteLength(sourceText, 'utf8'),
        sourceSha256,
        sourceBase64: Buffer.from(sourceText, 'utf8').toString('base64')
    };
    writeExclusiveMode600(backupPath, `${JSON.stringify(backupArtifact, null, 2)}\n`, fsImpl);

    if (fsImpl.readFileSync(resolvedRoomFile, 'utf8') !== sourceText) {
        throw new Error(`Room state changed after backup ${backupPath}; original was not replaced.`);
    }
    const migratedText = `${JSON.stringify(plan.migratedRooms, null, 2)}\n`;
    const tempPath = `${resolvedRoomFile}.room-v2.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        writeExclusiveMode600(tempPath, migratedText, fsImpl);
        fsImpl.renameSync(tempPath, resolvedRoomFile);
    } catch (error) {
        try {
            fsImpl.rmSync(tempPath, { force: true });
        } catch (_removeError) {}
        throw error;
    }
    return {
        applied: true,
        backup: {
            path: backupPath,
            sourceBytes: backupArtifact.sourceBytes,
            sourceSha256
        }
    };
}

async function runRoomMigration({
    env = process.env,
    args = { apply: false, writerStopped: false, help: false },
    now = new Date(),
    fsImpl = fs,
    supabaseClient
} = /** @type {any} */ ({})) {
    if (args.apply !== args.writerStopped) {
        throw new Error('Applying room migration requires both --apply and --writer-stopped.');
    }
    const roomFile = path.resolve(env.ROOM_STATE_FILE || path.join(__dirname, '..', 'data', 'rooms.json'));
    const backupDir = path.resolve(env.ROOM_STATE_BACKUP_DIR || path.dirname(roomFile));
    const { sourceText, rows: rooms } = readJsonArray(roomFile, 'Room state', fsImpl);
    const userSource = await loadMigrationUsers({ env, supabaseClient, fsImpl });
    const plan = buildRoomMigrationPlan({ rooms, users: userSource.users });
    const publicBlockingIssues = plan.blockingIssues.map((issue) => ({
        issueSha256: fingerprint(issue)
    }));
    const publicRooms = plan.rooms.map((room) => ({
        roomIdSha256: fingerprint(room.roomId),
        fromSchemaVersion: room.fromSchemaVersion,
        toSchemaVersion: room.toSchemaVersion,
        changed: room.changed,
        ownership: {
            classification: room.ownership.classification,
            candidateCount: room.ownership.candidateUserIds.length,
            candidateUserIdSha256: room.ownership.candidateUserIds.map(fingerprint),
            fromOwnerUserIdSha256: room.ownership.fromOwnerUserId
                ? fingerprint(room.ownership.fromOwnerUserId)
                : null,
            toOwnerUserIdSha256: room.ownership.toOwnerUserId
                ? fingerprint(room.ownership.toOwnerUserId)
                : null
        },
        expiry: room.expiry,
        normalization: room.normalization,
        overflow: room.overflow
    }));
    const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
    const report = {
        schemaVersion: plan.schemaVersion,
        kind: plan.kind,
        changesRequired: plan.changesRequired,
        blockingIssueCount: publicBlockingIssues.length,
        blockingIssues: publicBlockingIssues,
        summary: plan.summary,
        rooms: publicRooms,
        generatedAt,
        mode: args.apply ? 'apply' : 'dry-run',
        mutationsPerformed: false,
        source: {
            roomFile,
            userSource: userSource.source,
            userFile: userSource.userFile || null,
            userCount: userSource.users.length,
            roomSha256: fingerprint(sourceText)
        },
        applied: false,
        backup: null
    };
    if (!args.apply) return report;
    if (plan.blockingIssues.length) {
        throw new Error(
            `Room migration is blocked by ${plan.blockingIssues.length} issue(s): `
            + publicBlockingIssues.map((issue) => issue.issueSha256).join(', ')
        );
    }
    const result = applyRoomMigration({ roomFile, backupDir, sourceText, plan, now, fsImpl });
    report.applied = result.applied;
    report.mutationsPerformed = result.applied;
    report.backup = result.backup;
    return report;
}

function printHelp() {
    console.log('Usage: npm run migration:rooms -- [--apply --writer-stopped]');
    console.log('Default: read-only dry-run. Apply requires a stopped single writer and creates an exclusive backup.');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    const report = await runRoomMigration({ args });
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {
    applyRoomMigration,
    buildRoomMigrationPlan,
    loadMigrationUsers,
    parseArgs,
    runRoomMigration
};
