const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { normalizeSchedule } = require('./schedule-utils');

const SAVE_DEBOUNCE_MS = 250;

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
    let lastWrittenJson = null;
    let queuedJson = null;
    let saveTimer = null;
    let writePromise = Promise.resolve();

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
            id: typeof task.id === 'string' && task.id.trim() ? task.id.trim() : `task-${Date.now()}-${index}`,
            text,
            priority: normalizeBoardPriority(task.priority),
            done: !!task.done
        };
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

        return {
            id: roomId,
            name: safeName,
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
            board: {
                goal: sanitizeBoardGoal(room.board?.goal),
                tasks: safeTasks
            },
            reports: Array.isArray(room.reports)
                ? room.reports.map(sanitizeReport).filter(Boolean).slice(-ROOM_REPORTS_LIMIT)
                : [],
            schedule: safeSchedule
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

    async function writeSnapshot(json) {
        if (json === lastWrittenJson) return;

        await fsPromises.mkdir(path.dirname(resolvedFilePath), { recursive: true });
        const tempFilePath = `${resolvedFilePath}.tmp`;
        await fsPromises.writeFile(tempFilePath, json, 'utf8');
        await fsPromises.rename(tempFilePath, resolvedFilePath);
        lastWrittenJson = json;
    }

    function enqueueWrite(json) {
        writePromise = writePromise
            .then(() => writeSnapshot(json))
            .catch((error) => {
                warn(`Failed to persist room state to ${resolvedFilePath}.`, error);
            });
        return writePromise;
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

            const sanitizedRooms = parsed.map(sanitizeRoom).filter(Boolean);
            lastWrittenJson = `${JSON.stringify(sanitizedRooms, null, 2)}\n`;
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
        queuedJson = toJson(rooms);
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            const json = queuedJson;
            queuedJson = null;
            saveTimer = null;
            if (json !== null) {
                void enqueueWrite(json);
            }
        }, SAVE_DEBOUNCE_MS);
        return writePromise;
    }

    function flush(rooms) {
        if (rooms) {
            queuedJson = toJson(rooms);
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        if (queuedJson === null) {
            return writePromise;
        }

        const json = queuedJson;
        queuedJson = null;
        return enqueueWrite(json);
    }

    return {
        filePath: resolvedFilePath,
        loadRooms,
        scheduleSave,
        flush
    };
}

module.exports = {
    createRoomStore
};
