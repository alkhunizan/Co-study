const fs = require('node:fs');
const path = require('node:path');
const { normalizeSchedule } = require('./schedule-utils');
const { normalizePersistedUserId } = require('./user-store');
const { createDebouncedAtomicJsonStore } = require('./services/persistence/debounced-atomic-json-store');

const SAVE_DEBOUNCE_MS = 250;
const BOARD_TASK_LIMIT = 100;
const BOARD_TASK_MAX_BYTES = 500;
const BOARD_TASK_ID_MAX_LENGTH = 128;
const BOARD_SERIALIZED_MAX_BYTES = 64 * 1024;
const ROOM_EVENT_OUTBOX_LIMIT = 10_000;
const JOIN_COMPENSATION_OUTBOX_LIMIT = 1000;
const JOIN_COMPENSATION_EVENT_LIMIT = 2;
const JOIN_COMPENSATION_MY_ROOMS_LIMIT = 12;
const ROOM_EVENT_TYPES = new Set(['create', 'join', 'leave', 'close']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createRoomStore(options = {}) {
    const {
        filePath = process.env.ROOM_STATE_FILE || path.join(__dirname, 'data', 'rooms.json'),
        roomHistoryLimit = 80,
        normalizeRoom,
        normalizeMediaMode,
        normalizeVideoProvider,
        buildVideoPolicy,
        sanitizeRoomName,
        sanitizeBoardGoal,
        sanitizeBoardTaskText,
        normalizeBoardPriority,
        logger = console
    } = options;

    if (typeof normalizeRoom !== 'function') {
        throw new TypeError('createRoomStore requires normalizeRoom');
    }
    if (typeof normalizeMediaMode !== 'function') {
        throw new TypeError('createRoomStore requires normalizeMediaMode');
    }
    if (typeof normalizeVideoProvider !== 'function') {
        throw new TypeError('createRoomStore requires normalizeVideoProvider');
    }
    if (typeof buildVideoPolicy !== 'function') {
        throw new TypeError('createRoomStore requires buildVideoPolicy');
    }
    if (typeof sanitizeRoomName !== 'function') {
        throw new TypeError('createRoomStore requires sanitizeRoomName');
    }
    if (typeof sanitizeBoardGoal !== 'function') {
        throw new TypeError('createRoomStore requires sanitizeBoardGoal');
    }
    if (typeof sanitizeBoardTaskText !== 'function') {
        throw new TypeError('createRoomStore requires sanitizeBoardTaskText');
    }
    if (typeof normalizeBoardPriority !== 'function') {
        throw new TypeError('createRoomStore requires normalizeBoardPriority');
    }

    const resolvedFilePath = path.resolve(filePath);
    let migrationRequired = false;
    const atomicStore = createDebouncedAtomicJsonStore({
        filePath: resolvedFilePath,
        debounceMs: SAVE_DEBOUNCE_MS,
        logger
    });

    function warn(message, error) {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(message, error || '');
            return;
        }
        console.warn(message, error || '');
    }

    /**
     * @param {Record<string, any>} message
     * @param {number} [index]
     */
    function sanitizeMessage(message = {}, index = 0) {
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
            return null;
        }

        const text = typeof message.text === 'string' ? message.text : '';
        if (!text) return null;

        const type = message.type === 'system' ? 'system' : 'user';
        const safeMessage = {
            id: typeof message.id === 'string' && message.id.trim() ? message.id.trim() : `msg-${Date.now()}-${index}`,
            author: typeof message.author === 'string' ? message.author : (type === 'system' ? 'system' : ''),
            text,
            timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
            type
        };

        if (typeof message.username === 'string' && message.username.trim()) {
            safeMessage.username = message.username.trim();
        }
        if (typeof message.action === 'string' && message.action.trim()) {
            safeMessage.action = message.action.trim();
        }

        return safeMessage;
    }

    /**
     * @param {Record<string, any>} task
     * @param {number} [index]
     */
    function sanitizeBoardTask(task = {}, index = 0) {
        if (!task || typeof task !== 'object' || Array.isArray(task)) {
            return null;
        }

        const text = sanitizeBoardTaskText(task.text);
        if (!text) return null;

        return {
            id: typeof task.id === 'string' && task.id.trim()
                ? task.id.trim().slice(0, BOARD_TASK_ID_MAX_LENGTH)
                : `task-${Date.now()}-${index}`,
            text,
            priority: normalizeBoardPriority(task.priority),
            done: !!task.done
        };
    }

    function boardExceedsLimits(board = {}) {
        const tasks = Array.isArray(board?.tasks) ? board.tasks : [];
        return tasks.length > BOARD_TASK_LIMIT
            || tasks.some((task) => Buffer.byteLength(String(task?.text || '').trim(), 'utf8') > BOARD_TASK_MAX_BYTES)
            || tasks.some((task) => typeof task?.id === 'string' && task.id.trim().length > BOARD_TASK_ID_MAX_LENGTH)
            || Buffer.byteLength(JSON.stringify(board || {}), 'utf8') > BOARD_SERIALIZED_MAX_BYTES;
    }

    function fitBoardWithinLimits(goal, tasks) {
        const safeBoard = {
            goal,
            tasks: tasks.slice(0, BOARD_TASK_LIMIT)
        };
        while (
            safeBoard.tasks.length > 0
            && Buffer.byteLength(JSON.stringify(safeBoard), 'utf8') > BOARD_SERIALIZED_MAX_BYTES
        ) {
            safeBoard.tasks.pop();
        }
        return safeBoard;
    }

    const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'];
    const REPORT_STATUSES = ['open', 'resolved'];
    const REPORT_DETAIL_MAX_LENGTH = 200;
    const ROOM_REPORTS_LIMIT = 50;

    /**
     * @param {Record<string, any>} report
     * @param {number} [index]
     */
    function sanitizeReport(report = {}, index = 0) {
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            return null;
        }

        const targetName = typeof report.targetName === 'string' ? report.targetName.trim() : '';
        const targetSessionIdPrefix = typeof report.targetSessionIdPrefix === 'string'
            ? report.targetSessionIdPrefix.slice(0, 8)
            : '';
        if (!targetName && !targetSessionIdPrefix) return null;

        return {
            id: typeof report.id === 'string' && report.id.trim() ? report.id.trim() : `rpt-${Date.now()}-${index}`,
            reporterName: typeof report.reporterName === 'string' ? report.reporterName.trim() : '',
            reporterSessionIdPrefix: typeof report.reporterSessionIdPrefix === 'string'
                ? report.reporterSessionIdPrefix.slice(0, 8)
                : '',
            targetSocketId: typeof report.targetSocketId === 'string' ? report.targetSocketId : '',
            targetSessionIdPrefix,
            targetClientId: typeof report.targetClientId === 'string' ? report.targetClientId : '',
            targetName,
            reason: REPORT_REASONS.includes(report.reason) ? report.reason : 'other',
            detail: typeof report.detail === 'string' ? report.detail.slice(0, REPORT_DETAIL_MAX_LENGTH) : '',
            createdAt: typeof report.createdAt === 'number' ? report.createdAt : Date.now(),
            status: REPORT_STATUSES.includes(report.status) ? report.status : 'open'
        };
    }

    function sanitizeVideoProvider(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return null;
        try {
            return normalizeVideoProvider(raw);
        } catch (_error) {
            return null;
        }
    }

    function sanitizeVideoProviderStatus(raw) {
        return ['active', 'closed', 'error'].includes(raw) ? raw : null;
    }

    function sanitizeIsoTimestamp(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
    }

    /** @param {Record<string, any>} event */
    function sanitizeRoomEvent(event = {}) {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
        const eventId = typeof event.eventId === 'string' ? event.eventId.trim() : '';
        const roomCode = normalizeRoom(event.roomCode || '');
        const eventType = typeof event.eventType === 'string' ? event.eventType.trim() : '';
        const occurredAt = sanitizeIsoTimestamp(event.occurredAt);
        if (!UUID_PATTERN.test(eventId)
            || !roomCode
            || roomCode.length > 12
            || !ROOM_EVENT_TYPES.has(eventType)
            || !occurredAt
            || !Number.isInteger(event.lifecycleEpoch)
            || event.lifecycleEpoch < 0) {
            return null;
        }
        const hasUserId = event.userId !== null && event.userId !== undefined;
        const userId = hasUserId ? normalizePersistedUserId(event.userId) : null;
        const hasOwnerUserId = event.ownerUserId !== null && event.ownerUserId !== undefined;
        const ownerUserId = hasOwnerUserId ? normalizePersistedUserId(event.ownerUserId) : null;
        if ((hasUserId && !userId) || (hasOwnerUserId && !ownerUserId)) return null;
        const occurrenceId = event.occurrenceId === null || event.occurrenceId === undefined
            ? null
            : sanitizeIsoTimestamp(event.occurrenceId);
        const roomExpiresAt = event.roomExpiresAt === null || event.roomExpiresAt === undefined
            ? null
            : sanitizeIsoTimestamp(event.roomExpiresAt);
        return {
            eventId,
            roomCode,
            userId,
            nickname: typeof event.nickname === 'string' ? event.nickname.trim().slice(0, 80) || null : null,
            eventType,
            roomSchemaVersion: Number.isInteger(event.roomSchemaVersion) && event.roomSchemaVersion >= 1
                ? event.roomSchemaVersion
                : 1,
            ownerUserId,
            roomExpiresAt,
            occurrenceId,
            lifecycleEpoch: event.lifecycleEpoch,
            occurredAt
        };
    }

    /** @param {Record<string, any>} entry */
    function sanitizeCompensationMyRoom(entry = {}) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const roomId = normalizeRoom(entry.roomId || '');
        if (!roomId || roomId.length > 12 || !Number.isFinite(entry.lastJoinedAt)) return null;
        return {
            roomId,
            name: sanitizeRoomName(entry.name || roomId) || roomId,
            role: entry.role === 'created' ? 'created' : 'joined',
            lastJoinedAt: entry.lastJoinedAt
        };
    }

    /** @param {Record<string, any>} intent */
    function sanitizeJoinCompensation(intent = {}) {
        if (!intent || typeof intent !== 'object' || Array.isArray(intent)) return null;
        const operationId = typeof intent.operationId === 'string' ? intent.operationId.trim() : '';
        const roomId = normalizeRoom(intent.roomId || '');
        const hasUserId = Object.hasOwn(intent, 'userId') && intent.userId !== null && intent.userId !== undefined;
        const userId = hasUserId ? normalizePersistedUserId(intent.userId) : null;
        if (!UUID_PATTERN.test(operationId)
            || !roomId
            || roomId.length > 12
            || (hasUserId && !userId)
            || !Number.isFinite(intent.joinedAt)
            || !Number.isFinite(intent.preparedAt)) {
            return null;
        }
        if (!Array.isArray(intent.events)
            || intent.events.length === 0
            || intent.events.length > JOIN_COMPENSATION_EVENT_LIMIT) return null;
        const events = intent.events.map(sanitizeRoomEvent);
        if (events.some((event) => !event)) return null;
        if (events.length === 0
            || events.some((event) => event.userId !== userId)
            || !events.some((event) => event.eventType === 'join' && event.roomCode === roomId)) {
            return null;
        }
        if (userId && (!Array.isArray(intent.previousMyRooms)
            || intent.previousMyRooms.length > JOIN_COMPENSATION_MY_ROOMS_LIMIT)) return null;
        const previousMyRooms = userId
            ? intent.previousMyRooms.map(sanitizeCompensationMyRoom)
            : [];
        if (previousMyRooms.some((entry) => !entry)) return null;
        return {
            operationId,
            userId,
            roomId,
            joinedAt: intent.joinedAt,
            preparedAt: intent.preparedAt,
            previousMyRooms,
            events
        };
    }

    function validatePersistedJoinCompensations(parsedRooms) {
        const roomIds = new Set();
        for (const room of parsedRooms) {
            if (!room || typeof room !== 'object') continue;
            const roomId = normalizeRoom(room.id || room.roomId || room.code || '');
            if (roomId && roomIds.has(roomId)) {
                throw new Error(`Persisted room state contains duplicate normalized room id ${roomId}.`);
            }
            if (roomId) roomIds.add(roomId);
            if (!Object.hasOwn(room, 'joinCompensationOutbox')) continue;
            const journal = room.joinCompensationOutbox;
            if (roomId !== 'LOBBY'
                || !Array.isArray(journal)
                || journal.length > JOIN_COMPENSATION_OUTBOX_LIMIT) {
                throw new Error('Persisted join compensation journal is malformed.');
            }
            const operationIds = new Set();
            for (const rawIntent of journal) {
                const intent = sanitizeJoinCompensation(rawIntent);
                if (!intent || operationIds.has(intent.operationId)) {
                    throw new Error('Persisted join compensation journal contains an invalid or duplicate intent.');
                }
                operationIds.add(intent.operationId);
            }
        }
    }

    function sanitizeVideoPolicy(policy = {}) {
        const safe = buildVideoPolicy({
            maxRoomParticipants: Number.isInteger(policy.maxParticipants) && policy.maxParticipants > 0
                ? policy.maxParticipants
                : 20,
            maxGlobalParticipants: Number.isInteger(policy.maxGlobalParticipants) && policy.maxGlobalParticipants > 0
                ? policy.maxGlobalParticipants
                : 20,
            maxRoomDurationMinutes: Number.isInteger(policy.maxRoomDurationMinutes) && policy.maxRoomDurationMinutes > 0
                ? policy.maxRoomDurationMinutes
                : 180,
            recordingEnabled: false,
            screenshareEnabled: !!policy.screenshareEnabled,
            chatEnabled: !!policy.chatEnabled
        });
        return {
            maxParticipants: safe.maxRoomParticipants,
            recordingEnabled: false,
            screenshareEnabled: !!safe.screenshareEnabled,
            micDefaultEnabled: false,
            chatEnabled: !!safe.chatEnabled
        };
    }

    /**
     * @param {Record<string, any>} room
     * @param {number} [_index]
     */
    function sanitizeRoom(room = {}, _index = 0) {
        if (!room || typeof room !== 'object' || Array.isArray(room)) {
            return null;
        }

        const roomId = normalizeRoom(room.id || room.roomId || room.code || '');
        if (!roomId) return null;

        const passwordHash = typeof room.passwordHash === 'string' && room.passwordHash.trim()
            ? room.passwordHash.trim()
            : null;
        const safeName = sanitizeRoomName(room.name || roomId) || roomId;
        const safeMessages = Array.isArray(room.messages)
            ? room.messages.map(sanitizeMessage).filter(Boolean).slice(-roomHistoryLimit)
            : [];
        const safeTasks = Array.isArray(room.board?.tasks)
            ? room.board.tasks.map(sanitizeBoardTask).filter(Boolean)
            : [];
        const safeSchedule = normalizeSchedule(room.schedule, {
            titleFallback: safeName,
            strict: false
        });

        const safeBoard = fitBoardWithinLimits(sanitizeBoardGoal(room.board?.goal), safeTasks);
        const roomEventOutbox = Array.isArray(room.roomEventOutbox)
            ? room.roomEventOutbox
                .map(sanitizeRoomEvent)
                .filter(Boolean)
                .slice(0, ROOM_EVENT_OUTBOX_LIMIT)
            : [];
        const seenJoinCompensations = new Set();
        const joinCompensationOutbox = roomId === 'LOBBY' && Array.isArray(room.joinCompensationOutbox)
            ? room.joinCompensationOutbox
                .slice(0, JOIN_COMPENSATION_OUTBOX_LIMIT)
                .map(sanitizeJoinCompensation)
                .filter((intent) => {
                    if (!intent || seenJoinCompensations.has(intent.operationId)) return false;
                    seenJoinCompensations.add(intent.operationId);
                    return true;
                })
            : [];

        return {
            schemaVersion: room.schemaVersion === 2 ? 2 : 1,
            id: roomId,
            name: safeName,
            ownerUserId: typeof room.ownerUserId === 'string' && room.ownerUserId.trim()
                ? room.ownerUserId.trim().slice(0, 128)
                : null,
            expiresAt: Number.isFinite(room.expiresAt) ? room.expiresAt : null,
            lifecycleEpoch: Number.isInteger(room.lifecycleEpoch) && room.lifecycleEpoch >= 0
                ? room.lifecycleEpoch
                : 0,
            closedAt: Number.isFinite(room.closedAt) ? room.closedAt : null,
            closureReason: typeof room.closureReason === 'string'
                ? room.closureReason.trim().slice(0, 64) || null
                : null,
            cleanupPending: !!room.cleanupPending,
            providerCleanupLastError: typeof room.providerCleanupLastError === 'string'
                ? room.providerCleanupLastError.slice(0, 200)
                : null,
            requirePassword: room.requirePassword === undefined ? !!passwordHash : !!room.requirePassword,
            passwordHash,
            mediaMode: normalizeMediaMode(room.mediaMode),
            videoProvider: sanitizeVideoProvider(room.videoProvider),
            videoProviderMeetingId: typeof room.videoProviderMeetingId === 'string' && room.videoProviderMeetingId.trim()
                ? room.videoProviderMeetingId.trim()
                : null,
            videoProviderMeetingCreatedAt: Number.isFinite(room.videoProviderMeetingCreatedAt)
                ? room.videoProviderMeetingCreatedAt
                : null,
            videoProviderStatus: sanitizeVideoProviderStatus(room.videoProviderStatus),
            videoPolicy: sanitizeVideoPolicy(room.videoPolicy),
            createdAt: typeof room.createdAt === 'number' ? room.createdAt : Date.now(),
            messages: safeMessages,
            board: safeBoard,
            reports: Array.isArray(room.reports)
                ? room.reports.map(sanitizeReport).filter(Boolean).slice(-ROOM_REPORTS_LIMIT)
                : [],
            schedule: safeSchedule,
            ...(roomEventOutbox.length > 0 ? { roomEventOutbox } : {}),
            ...(joinCompensationOutbox.length > 0 ? { joinCompensationOutbox } : {})
        };
    }

    function buildSnapshot(rooms) {
        const source = rooms instanceof Map
            ? Array.from(rooms.values())
            : Array.isArray(rooms)
                ? rooms
                : Array.from(rooms || []);

        return source.map(sanitizeRoom).filter(Boolean);
    }

    function toJson(rooms) {
        return `${JSON.stringify(buildSnapshot(rooms), null, 2)}\n`;
    }

    function loadRooms(options = {}) {
        const { strict = false } = options;
        if (!fs.existsSync(resolvedFilePath)) {
            return [];
        }

        try {
            const fileContents = fs.readFileSync(resolvedFilePath, 'utf8');
            if (!fileContents.trim()) {
                return [];
            }

            const parsed = JSON.parse(fileContents);
            if (!Array.isArray(parsed)) {
                const error = new Error(`Room state file ${resolvedFilePath} must contain a JSON array.`);
                if (strict) throw error;
                warn(`${error.message} Starting with empty state.`);
                return [];
            }

            validatePersistedJoinCompensations(parsed);
            migrationRequired = parsed.some((room) => (
                room?.schemaVersion !== 2 || boardExceedsLimits(room?.board)
            ));
            const sanitizedRooms = parsed.map(sanitizeRoom).filter(Boolean);
            atomicStore.setBaseline(`${JSON.stringify(sanitizedRooms, null, 2)}\n`);
            return sanitizedRooms;
        } catch (error) {
            if (strict) {
                throw new Error(`Failed to load room state from ${resolvedFilePath}: ${error.message}`);
            }
            warn(`Failed to load room state from ${resolvedFilePath}. Starting with empty state.`, error);
            return [];
        }
    }

    function scheduleSave(rooms) {
        return atomicStore.schedule(rooms, toJson);
    }

    function flush(rooms) {
        return rooms ? atomicStore.flush(rooms, toJson) : atomicStore.flush();
    }

    return {
        filePath: resolvedFilePath,
        loadRooms,
        scheduleSave,
        flush,
        needsMigration() {
            return migrationRequired;
        }
    };
}

module.exports = {
    createRoomStore
};
