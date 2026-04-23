const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { createRoomStore } = require('./room-store');
const {
    buildScheduleSummary,
    normalizeSchedule,
    recordScheduleJoin,
    rollScheduleAttendance
} = require('./schedule-utils');

const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';

const ROOM_HISTORY_LIMIT = 80;
const ROOM_TTL_MS = 1000 * 60 * 30;
const SESSION_COOKIE_NAME = 'coStudySessionId';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const CLIENT_ID_MAX_LENGTH = 64;
const ROOM_CODE_LENGTH = 6;
const ROOM_NAME_MAX_LENGTH = 48;
const ROOM_PASSWORD_MAX_LENGTH = 64;
const BOARD_GOAL_MAX_LENGTH = 80;
const BOARD_TASK_MAX_LENGTH = 120;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MEDIA_MODE_MESH = 'mesh';
const MEDIA_MODE_SFU = 'sfu';
const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_HTTPS_PORT = 3443;
const DEFAULT_MESH_PARTICIPANT_LIMIT = 4;
const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];
const CREATE_ROOM_RATE = { limit: 6, windowMs: 60 * 1000 };
const JOIN_ATTEMPT_RATE = { limit: 12, windowMs: 60 * 1000 };
const ROOM_LOOKUP_RATE = { limit: 12, windowMs: 60 * 1000 };
const PASSWORD_FAILURE_RATE = { limit: 5, windowMs: 10 * 60 * 1000 };
const CHAT_RATE = { limit: 20, windowMs: 30 * 1000 };
const BOARD_RATE = { limit: 40, windowMs: 30 * 1000 };

class SlidingWindowRateLimiter {
    constructor({ limit, windowMs }) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.entries = new Map();
    }

    prune(key, now = Date.now()) {
        const timestamps = this.entries.get(key) || [];
        const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        if (active.length > 0) {
            this.entries.set(key, active);
        } else {
            this.entries.delete(key);
        }
        return active;
    }

    check(key, now = Date.now()) {
        if (!key) {
            return { allowed: true, remaining: this.limit, retryAfterMs: 0 };
        }

        const active = this.prune(key, now);
        if (active.length >= this.limit) {
            const retryAfterMs = Math.max(0, this.windowMs - (now - active[0]));
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        return {
            allowed: true,
            remaining: Math.max(0, this.limit - active.length),
            retryAfterMs: 0
        };
    }

    consume(key, now = Date.now()) {
        if (!key) {
            return { allowed: true, remaining: this.limit, retryAfterMs: 0 };
        }

        const active = this.prune(key, now);
        if (active.length >= this.limit) {
            const retryAfterMs = Math.max(0, this.windowMs - (now - active[0]));
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        active.push(now);
        this.entries.set(key, active);
        return {
            allowed: true,
            remaining: Math.max(0, this.limit - active.length),
            retryAfterMs: 0
        };
    }

    reset(key) {
        if (!key) return;
        this.entries.delete(key);
    }
}

function normalizeIp(ip = '') {
    if (typeof ip !== 'string') return 'unknown';
    const trimmed = ip.trim();
    if (!trimmed) return 'unknown';
    return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

function parsePort(value, envName, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${envName} must be an integer between 1 and 65535.`);
    }

    return port;
}

function parsePositiveInteger(value, envName, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${envName} must be a positive integer.`);
    }

    return parsed;
}

function parseTrustProxy(value) {
    if (value === undefined || value === null || value === '') {
        return false;
    }
    if (value === '0' || value === 0) return false;
    if (value === '1' || value === 1) return true;
    throw new Error('TRUST_PROXY must be "0" or "1".');
}

function parseAllowedOrigins(value) {
    if (value === undefined || value === null || `${value}`.trim() === '') {
        return [];
    }

    return `${value}`
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            let parsed;
            try {
                parsed = new URL(entry);
            } catch (_error) {
                throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${entry}`);
            }

            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error(`ALLOWED_ORIGINS must use http or https: ${entry}`);
            }
            if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
                throw new Error(`ALLOWED_ORIGINS must contain bare origins only: ${entry}`);
            }

            return parsed.origin;
        });
}

function parseSfuBaseUrl(value) {
    if (value === undefined || value === null || `${value}`.trim() === '') {
        return '';
    }

    let parsed;
    try {
        parsed = new URL(`${value}`.trim());
    } catch (_error) {
        throw new Error('SFU_BASE_URL must be an absolute http(s) URL.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('SFU_BASE_URL must use http or https.');
    }
    if (parsed.search || parsed.hash) {
        throw new Error('SFU_BASE_URL must not include query strings or fragments.');
    }

    return parsed.toString().replace(/\/$/, '');
}

function ensureWritableFileParent(filePath) {
    const parentDir = path.dirname(filePath);
    fs.mkdirSync(parentDir, { recursive: true });
    const probeFile = path.join(parentDir, `.co-study-write-test-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probeFile, '', 'utf8');
    fs.rmSync(probeFile, { force: true });
}

function cloneIceServerList(iceServers = []) {
    return iceServers.map((serverEntry) => ({
        ...serverEntry,
        urls: Array.isArray(serverEntry.urls) ? [...serverEntry.urls] : serverEntry.urls
    }));
}

function sanitizeIceServerEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

    let urls = [];
    if (typeof entry.urls === 'string') {
        const trimmedUrl = entry.urls.trim();
        if (trimmedUrl) urls = [trimmedUrl];
    } else if (Array.isArray(entry.urls)) {
        urls = entry.urls
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean);
    }

    if (!urls.length) return null;

    const sanitized = { urls: entry.urls && !Array.isArray(entry.urls) && urls.length === 1 ? urls[0] : urls };
    if (typeof entry.username === 'string' && entry.username.trim()) {
        sanitized.username = entry.username.trim();
    }
    if (typeof entry.credential === 'string' && entry.credential.trim()) {
        sanitized.credential = entry.credential.trim();
    }
    if (typeof entry.credentialType === 'string' && entry.credentialType.trim()) {
        sanitized.credentialType = entry.credentialType.trim();
    }

    return sanitized;
}

function resolveRuntimeIceServers(rawValue) {
    if (!rawValue) {
        return {
            iceServers: cloneIceServerList(DEFAULT_ICE_SERVERS),
            source: 'default'
        };
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            console.warn('ICE_SERVERS_JSON must be a JSON array. Falling back to default STUN servers.');
            return {
                iceServers: cloneIceServerList(DEFAULT_ICE_SERVERS),
                source: 'default'
            };
        }

        const sanitized = parsed.map(sanitizeIceServerEntry).filter(Boolean);
        if (!sanitized.length) {
            return {
                iceServers: cloneIceServerList(DEFAULT_ICE_SERVERS),
                source: 'default'
            };
        }

        return {
            iceServers: cloneIceServerList(sanitized),
            source: 'custom'
        };
    } catch (err) {
        console.warn('Failed to parse ICE_SERVERS_JSON. Falling back to default STUN servers.', err.message);
        return {
            iceServers: cloneIceServerList(DEFAULT_ICE_SERVERS),
            source: 'default'
        };
    }
}

function resolveServerConfig({ env = process.env, mode = 'http' } = {}) {
    const portEnvName = mode === 'https' ? 'HTTPS_PORT' : 'PORT';
    const defaultPort = mode === 'https' ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT;
    const roomStateFile = path.resolve(env.ROOM_STATE_FILE || path.join(__dirname, 'data', 'rooms.json'));
    const roomStateBackupDir = path.resolve(env.ROOM_STATE_BACKUP_DIR || path.join(__dirname, 'data', 'backups'));
    const runtimeIce = resolveRuntimeIceServers(env.ICE_SERVERS_JSON);
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const trustProxy = parseTrustProxy(env.TRUST_PROXY);
    const sfuBaseUrl = parseSfuBaseUrl(env.SFU_BASE_URL);
    const meshParticipantLimit = parsePositiveInteger(
        env.MESH_PARTICIPANT_LIMIT,
        'MESH_PARTICIPANT_LIMIT',
        DEFAULT_MESH_PARTICIPANT_LIMIT
    );
    const port = parsePort(env[portEnvName], portEnvName, defaultPort);

    ensureWritableFileParent(roomStateFile);
    fs.mkdirSync(roomStateBackupDir, { recursive: true });

    return {
        mode,
        port,
        trustProxy,
        allowedOrigins,
        roomStateFile,
        roomStateBackupDir,
        sfuBaseUrl,
        sfuAvailable: !!sfuBaseUrl,
        supportedMediaModes: sfuBaseUrl ? [MEDIA_MODE_MESH, MEDIA_MODE_SFU] : [MEDIA_MODE_MESH],
        meshParticipantLimit,
        runtimeIceServers: runtimeIce.iceServers,
        iceMode: runtimeIce.source
    };
}

function normalizeRoom(roomId = '') {
    return roomId.trim().toUpperCase();
}

function normalizeMediaMode(raw) {
    if (typeof raw !== 'string') {
        return MEDIA_MODE_MESH;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === MEDIA_MODE_SFU ? MEDIA_MODE_SFU : MEDIA_MODE_MESH;
}

function isValidRequestedMediaMode(raw) {
    if (raw === undefined) {
        return true;
    }
    if (typeof raw !== 'string') {
        return false;
    }
    return raw === MEDIA_MODE_MESH || raw === MEDIA_MODE_SFU;
}

function sanitizeRoomName(raw = '') {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, ROOM_NAME_MAX_LENGTH);
}

function sanitizeRoomPassword(raw = '') {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, ROOM_PASSWORD_MAX_LENGTH);
}

function sanitizeBoardGoal(raw = '') {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, BOARD_GOAL_MAX_LENGTH);
}

function sanitizeBoardTaskText(raw = '') {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, BOARD_TASK_MAX_LENGTH);
}

function normalizeBoardPriority(raw) {
    const numeric = Number.parseInt(raw, 10);
    if (numeric === 1 || numeric === 2 || numeric === 3) {
        return numeric;
    }
    return 2;
}

function normalizeBoardTask(raw = {}) {
    const text = sanitizeBoardTaskText(raw.text);
    if (!text) return null;
    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : crypto.randomUUID(),
        text,
        priority: normalizeBoardPriority(raw.priority),
        done: !!raw.done
    };
}

function ensureRoomBoard(room) {
    if (!room || typeof room !== 'object') {
        return { goal: '', tasks: [] };
    }
    if (!room.board || typeof room.board !== 'object' || Array.isArray(room.board)) {
        room.board = { goal: '', tasks: [] };
    }
    room.board.goal = sanitizeBoardGoal(room.board.goal);
    if (!Array.isArray(room.board.tasks)) {
        room.board.tasks = [];
    }
    room.board.tasks = room.board.tasks.map(normalizeBoardTask).filter(Boolean);
    return room.board;
}

function cloneBoard(board = {}) {
    const room = { board };
    const safeBoard = ensureRoomBoard(room);
    return {
        goal: safeBoard.goal,
        tasks: safeBoard.tasks.map((task) => ({
            id: task.id,
            text: task.text,
            priority: task.priority,
            done: !!task.done
        }))
    };
}

async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST, (err, key) => {
            if (err) return reject(err);
            resolve(`${salt}:${key.toString('hex')}`);
        });
    });
}

async function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        if (!hash || !hash.includes(':')) return resolve(false);
        const [salt, key] = hash.split(':');
        crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST, (err, derivedKey) => {
            if (err) return reject(err);
            const keyBuffer = Buffer.from(key, 'hex');
            const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
            if (keyBuffer.length !== derivedBuffer.length) {
                return resolve(false);
            }
            resolve(crypto.timingSafeEqual(keyBuffer, derivedBuffer));
        });
    });
}

function generateRoomCode(rooms, length = ROOM_CODE_LENGTH) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        let code = '';
        for (let index = 0; index < length; index += 1) {
            code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
        }
        const normalized = normalizeRoom(code);
        if (normalized && !rooms.has(normalized)) {
            return normalized;
        }
    }
    return crypto.randomUUID().replace(/[^A-Z0-9]/gi, '').slice(0, length).toUpperCase();
}

function buildIdentityKey(roomId, sessionId, clientId) {
    if (!roomId) return null;
    return `${roomId}:${sessionId || ''}:${clientId || ''}`;
}

function parseCookies(cookieHeader = '') {
    return cookieHeader.split(';').reduce((acc, part) => {
        if (!part) return acc;
        const [rawKey, ...rawValue] = part.split('=');
        if (!rawKey) return acc;
        const key = rawKey.trim();
        if (!key) return acc;
        const value = rawValue.join('=').trim();
        try {
            acc[key] = value ? decodeURIComponent(value) : '';
        } catch (_err) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function normalizeClientId(raw = '') {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, CLIENT_ID_MAX_LENGTH);
}

function isSameIdentity(record = {}, sessionId, clientId) {
    if (!record) return false;
    if (sessionId && record.sessionId && record.sessionId === sessionId) return true;
    if (clientId && record.clientId && record.clientId === clientId) return true;
    return false;
}

function sanitizeStatus(input = {}) {
    if (!input || typeof input !== 'object') {
        return { text: '', visible: false, updatedAt: Date.now() };
    }
    const visible = input.visible !== false;
    const safeText = typeof input.text === 'string' ? input.text.slice(0, 80) : '';
    return {
        text: visible ? safeText : '',
        visible,
        manual: typeof input.manual === 'string' ? input.manual.slice(0, 40) : '',
        manualPreset: typeof input.manualPreset === 'string' ? input.manualPreset : null,
        autoSync: !!input.autoSync,
        ambientType: typeof input.ambientType === 'string' ? input.ambientType.slice(0, 20) : null,
        timerMode: input.timerMode === 'break' ? 'break' : (input.timerMode === 'focus' ? 'focus' : null),
        updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now()
    };
}

function createSystemMessage(text, username = '', action = '') {
    return {
        id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: 'system',
        text,
        username,
        action,
        timestamp: Date.now(),
        type: 'system'
    };
}

function normalizeOrigin(origin) {
    if (!origin || typeof origin !== 'string') return null;
    try {
        return new URL(origin).origin;
    } catch (_error) {
        return null;
    }
}

function getExpectedOrigin(headers = {}, mode = 'http') {
    const host = headers.host;
    if (!host) return null;
    const forwardedProto = typeof headers['x-forwarded-proto'] === 'string'
        ? headers['x-forwarded-proto'].split(',')[0].trim()
        : '';
    const protocol = forwardedProto || mode;
    return `${protocol}://${host}`;
}

function isOriginAllowed({ origin, expectedOrigin, allowedOrigins }) {
    if (!origin) return true;
    const normalizedOrigin = normalizeOrigin(origin);
    if (!normalizedOrigin) return false;
    if (allowedOrigins.length > 0) {
        return allowedOrigins.includes(normalizedOrigin);
    }
    if (!expectedOrigin) {
        return false;
    }
    return normalizedOrigin === expectedOrigin;
}

function getSocketRequestIp(request, trustProxy) {
    if (trustProxy) {
        const forwardedFor = request.headers['x-forwarded-for'];
        if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
            return normalizeIp(forwardedFor.split(',')[0]);
        }
    }
    return normalizeIp(request.socket && request.socket.remoteAddress);
}

function createCoStudyServer(options = {}) {
    const { env = process.env, mode = 'http', createServer } = options;
    const config = resolveServerConfig({ env, mode });
    const pendingLeaveTimers = new Map();
    const skippedDisconnects = new Set();
    const rooms = new Map();
    const rateLimiters = {
        createRoom: new SlidingWindowRateLimiter(CREATE_ROOM_RATE),
        joinRoom: new SlidingWindowRateLimiter(JOIN_ATTEMPT_RATE),
        roomLookup: new SlidingWindowRateLimiter(ROOM_LOOKUP_RATE),
        passwordFailures: new SlidingWindowRateLimiter(PASSWORD_FAILURE_RATE),
        chatMessages: new SlidingWindowRateLimiter(CHAT_RATE),
        boardMutations: new SlidingWindowRateLimiter(BOARD_RATE)
    };
    const readinessState = {
        config: true,
        roomStore: false,
        socket: false
    };

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy ? 1 : false);

    const server = typeof createServer === 'function'
        ? createServer(app)
        : (() => {
            throw new Error('createCoStudyServer requires a createServer(app) function.');
        })();

    const io = new Server(server, {
        cors: {
            origin(origin, callback) {
                const normalizedOrigin = normalizeOrigin(origin);
                const allowed = !origin
                    || !config.allowedOrigins.length
                    || !!(normalizedOrigin && config.allowedOrigins.includes(normalizedOrigin));
                callback(null, allowed);
            },
            credentials: true
        },
        allowRequest: (req, callback) => {
            const allowed = isOriginAllowed({
                origin: req.headers.origin,
                expectedOrigin: getExpectedOrigin(req.headers, config.mode),
                allowedOrigins: config.allowedOrigins
            });
            callback(null, allowed);
        }
    });
    readinessState.socket = true;

    const roomStore = createRoomStore({
        filePath: config.roomStateFile,
        roomHistoryLimit: ROOM_HISTORY_LIMIT,
        normalizeRoom,
        normalizeMediaMode,
        sanitizeRoomName,
        sanitizeBoardGoal,
        sanitizeBoardTaskText,
        normalizeBoardPriority
    });

    function roomSnapshot(roomId) {
        const normalized = normalizeRoom(roomId);
        const room = rooms.get(normalized);
        if (!room) {
            return {
                roomId: normalized,
                name: normalized,
                requirePassword: false,
                mediaMode: MEDIA_MODE_MESH,
                participantCount: 0,
                participantLimit: config.meshParticipantLimit,
                participants: [],
                messages: [],
                board: { goal: '', tasks: [] },
                schedule: null
            };
        }
        const scheduleChanged = syncRoomSchedule(room);
        if (scheduleChanged) {
            persistRoomsSoon();
        }
        const board = cloneBoard(ensureRoomBoard(room));
        return {
            roomId: normalized,
            name: room.name || normalized,
            requirePassword: !!room.requirePassword,
            mediaMode: normalizeMediaMode(room.mediaMode),
            participantCount: room.users.size,
            participantLimit: normalizeMediaMode(room.mediaMode) === MEDIA_MODE_MESH ? config.meshParticipantLimit : null,
            participants: Array.from(room.users.values()).map((user) => ({
                id: user.socketId,
                name: user.name,
                joinedAt: user.joinedAt,
                cameraOn: !!user.cameraOn,
                status: user.status || null
            })),
            messages: room.messages,
            board,
            schedule: buildScheduleSummary(room.schedule)
        };
    }

    function emitBoardState(roomId, room) {
        io.to(roomId).emit('board-state', cloneBoard(ensureRoomBoard(room)));
    }

    function buildRuntimeRoom(room = {}) {
        const schedule = normalizeSchedule(room.schedule, {
            titleFallback: sanitizeRoomName(room.name || room.id || '') || normalizeRoom(room.id || room.roomId || room.code || ''),
            strict: false
        });
        return {
            id: normalizeRoom(room.id || room.roomId || room.code || ''),
            name: sanitizeRoomName(room.name || room.id || '') || normalizeRoom(room.id || room.roomId || room.code || ''),
            requirePassword: !!room.requirePassword,
            passwordHash: room.passwordHash || null,
            mediaMode: normalizeMediaMode(room.mediaMode),
            createdAt: typeof room.createdAt === 'number' ? room.createdAt : Date.now(),
            users: new Map(),
            messages: Array.isArray(room.messages) ? room.messages.map((message) => ({ ...message })) : [],
            board: cloneBoard(room.board),
            schedule,
            identities: new Map(),
            cleanupTimer: null
        };
    }

    function getRoomMediaMode(room) {
        return normalizeMediaMode(room && room.mediaMode);
    }

    function roomHasSchedule(room) {
        return !!(room && room.schedule);
    }

    function roomUsesMesh(room) {
        return getRoomMediaMode(room) === MEDIA_MODE_MESH;
    }

    function roomUsesSfu(room) {
        return getRoomMediaMode(room) === MEDIA_MODE_SFU;
    }

    function persistRoomsSoon() {
        return roomStore.scheduleSave(rooms);
    }

    function syncRoomSchedule(room, now = Date.now()) {
        if (!roomHasSchedule(room)) {
            return false;
        }
        return rollScheduleAttendance(room.schedule, now);
    }

    function clearRoomCleanupTimer(room) {
        if (!room || !room.cleanupTimer) return;
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }

    function deleteRoom(roomId) {
        const normalizedRoom = normalizeRoom(roomId);
        const room = rooms.get(normalizedRoom);
        if (!room) return false;
        clearRoomCleanupTimer(room);
        rooms.delete(normalizedRoom);
        persistRoomsSoon();
        return true;
    }

    function ensureRoom(roomId, meta = {}) {
        const normalized = normalizeRoom(roomId);
        if (!normalized) return null;
        if (!rooms.has(normalized)) {
            const schedule = normalizeSchedule(meta.schedule, {
                titleFallback: sanitizeRoomName(meta.name || normalized) || normalized,
                strict: false
            });
            rooms.set(normalized, buildRuntimeRoom({
                id: normalized,
                name: meta.name || normalized,
                requirePassword: !!meta.requirePassword,
                passwordHash: meta.passwordHash || null,
                mediaMode: normalizeMediaMode(meta.mediaMode),
                createdAt: meta.createdAt || Date.now(),
                schedule,
                board: {
                    goal: sanitizeBoardGoal(
                        (meta.board && meta.board.goal)
                        || (schedule && schedule.boardGoalTemplate)
                    ),
                    tasks: Array.isArray(meta.board && meta.board.tasks)
                        ? meta.board.tasks.map(normalizeBoardTask).filter(Boolean)
                        : []
                }
            }));
        }
        const room = rooms.get(normalized);
        if (!room.identities) {
            room.identities = new Map();
        }
        if (typeof room.name !== 'string') {
            room.name = normalized;
        }
        if (typeof room.requirePassword !== 'boolean') {
            room.requirePassword = !!room.passwordHash;
        }
        room.mediaMode = normalizeMediaMode(room.mediaMode);
        room.schedule = normalizeSchedule(room.schedule, {
            titleFallback: room.name || normalized,
            strict: false
        });
        ensureRoomBoard(room);
        clearRoomCleanupTimer(room);
        return room;
    }

    function scheduleRoomCleanup(roomId) {
        const room = rooms.get(roomId);
        if (!room || room.users.size > 0 || room.cleanupTimer || roomHasSchedule(room)) return;
        room.cleanupTimer = setTimeout(() => deleteRoom(roomId), ROOM_TTL_MS);
    }

    function removeUserFromRoom(room, socketId, normalizedRoom, existingRecord = null) {
        if (!room || !socketId) return false;
        const record = existingRecord || room.users.get(socketId);
        if (!record) return false;

        room.users.delete(socketId);

        const identityKey = record.identityKey || buildIdentityKey(normalizedRoom, record.sessionId, record.clientId);
        if (identityKey && room.identities && room.identities.get(identityKey) === socketId) {
            room.identities.delete(identityKey);
        }

        const socketRef = io.sockets.sockets.get(socketId);
        if (socketRef) {
            socketRef.leave(normalizedRoom);
            socketRef.data.roomId = null;
        } else {
            skippedDisconnects.add(socketId);
        }
        return true;
    }

    function loadPersistedRooms() {
        const persistedRooms = roomStore.loadRooms({ strict: true });
        persistedRooms.forEach((persistedRoom) => {
            const runtimeRoom = buildRuntimeRoom(persistedRoom);
            if (!runtimeRoom.id) return;
            rooms.set(runtimeRoom.id, runtimeRoom);
            if (runtimeRoom.users.size === 0) {
                scheduleRoomCleanup(runtimeRoom.id);
            }
        });
        readinessState.roomStore = true;
        return persistedRooms.length;
    }

    function resolveClientId(socket, candidate) {
        const normalized = normalizeClientId(candidate);
        if (normalized) {
            socket.data.clientId = normalized;
            return normalized;
        }
        if (socket.data.clientId) return socket.data.clientId;
        const fallback = socket.data.sessionId || crypto.randomUUID();
        socket.data.clientId = fallback;
        return fallback;
    }

    function ackError(ack, errorCode) {
        return ack({ ok: false, errorCode });
    }

    function getRequestIp(req) {
        return normalizeIp(req.ip || req.socket.remoteAddress);
    }

    function getSessionIdFromSocket(socket) {
        const header = (socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie) || '';
        const cookies = parseCookies(header);
        return cookies[SESSION_COOKIE_NAME] || null;
    }

    function getJoinSessionKey(socket) {
        if (!socket.data.roomId) return null;
        return `${socket.data.roomId}:${socket.data.sessionId || socket.id}`;
    }

    function checkSocketRateLimit(socket, limiter, key, ack) {
        const result = limiter.consume(key);
        if (result.allowed) return true;
        socket.emit('rate-limited', { retryAfterMs: result.retryAfterMs });
        ackError(ack, 'RATE_LIMITED');
        return false;
    }

    function applyHttpRateLimit(req, res, limiter, key) {
        const result = limiter.consume(key);
        if (result.allowed) return true;
        res.status(429).json({
            errorCode: 'RATE_LIMITED',
            retryAfterMs: result.retryAfterMs
        });
        return false;
    }

    function originGuard(req, res, next) {
        const origin = req.headers.origin;
        const allowed = isOriginAllowed({
            origin,
            expectedOrigin: `${req.protocol}://${req.get('host')}`,
            allowedOrigins: config.allowedOrigins
        });

        if (allowed) {
            if (origin) {
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
            }
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }
            next();
            return;
        }

        res.status(403).json({ error: 'Origin not allowed' });
    }

    function sessionMiddleware(req, res, next) {
        const cookies = parseCookies(req.headers.cookie || '');
        let sessionId = cookies[SESSION_COOKIE_NAME];
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            const cookieParts = [
                `${SESSION_COOKIE_NAME}=${sessionId}`,
                'Path=/',
                'HttpOnly',
                'SameSite=Lax',
                `Max-Age=${SESSION_COOKIE_MAX_AGE}`
            ];
            if (req.secure) {
                cookieParts.push('Secure');
            }
            res.setHeader('Set-Cookie', cookieParts.join('; '));
        }
        req.sessionId = sessionId;
        next();
    }

    function evaluateReadiness({ logFailures = false } = {}) {
        const checks = {
            roomStore: readinessState.roomStore,
            socket: readinessState.socket && !io._closed,
            config: readinessState.config
        };
        const ready = Object.values(checks).every(Boolean);

        if (!ready && logFailures) {
            Object.entries(checks).forEach(([checkName, passed]) => {
                if (!passed) {
                    console.error(`Readiness check failed: ${checkName}`);
                }
            });
        }

        return {
            ready,
            checks
        };
    }

    let loadedRoomCount = loadPersistedRooms();

    let isShuttingDown = false;
    async function flushRoomStateAndExit(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`Received ${signal}. Persisting room state to ${roomStore.filePath}...`);
        try {
            await roomStore.flush(rooms);
        } catch (err) {
            console.error('Final room state flush failed:', err);
        }
        server.close(() => {
            process.exit(0);
        });
        setTimeout(() => process.exit(0), 5000).unref();
    }

    process.once('SIGINT', () => {
        void flushRoomStateAndExit('SIGINT');
    });

    process.once('SIGTERM', () => {
        void flushRoomStateAndExit('SIGTERM');
    });

    app.use(originGuard);
    app.use(express.json());
    app.use(sessionMiddleware);
    app.use('/audio', express.static(path.join(__dirname, 'audio')));
    app.use('/images', express.static(path.join(__dirname, 'images')));

    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'ok',
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            mode: config.mode
        });
    });

    app.get('/api/ready', (_req, res) => {
        const readiness = evaluateReadiness({ logFailures: true });
        res.status(readiness.ready ? 200 : 503).json({
            status: readiness.ready ? 'ready' : 'not_ready',
            checks: readiness.checks
        });
    });

    app.get('/api/runtime-config', (_req, res) => {
        res.json({
            iceServers: cloneIceServerList(config.runtimeIceServers),
            sfuBaseUrl: config.sfuBaseUrl,
            sfuAvailable: config.sfuAvailable,
            supportedMediaModes: [...config.supportedMediaModes],
            meshParticipantLimit: config.meshParticipantLimit
        });
    });

    app.get('/api/rooms/:roomId', (req, res) => {
        const { roomId } = req.params;
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.roomLookup, requestIp)) {
            return;
        }

        if (!roomId) {
            res.status(400).json({ error: 'Room id missing' });
            return;
        }

        const snapshot = roomSnapshot(roomId);
        if (!rooms.has(normalizeRoom(roomId))) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }

        res.json(snapshot);
    });

    app.get('/', (_req, res) => {
        res.sendFile(path.join(__dirname, 'landing.html'));
    });

    app.get(['/index.html', '/study', '/workspace', '/room'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    io.on('connection', (socket) => {
        const auth = socket.handshake && socket.handshake.auth;
        const handshakeClientId = normalizeClientId(auth && auth.clientId);
        const sessionId = getSessionIdFromSocket(socket) || handshakeClientId || crypto.randomUUID();
        const ip = getSocketRequestIp(socket.request, config.trustProxy);

        socket.data.sessionId = sessionId;
        socket.data.clientId = handshakeClientId || sessionId;
        socket.data.ip = ip;

        socket.on('create-room', async (payload = {}, ack = () => {}) => {
            const { roomName, password, requirePassword } = payload;
            const cleanName = sanitizeRoomName(roomName);
            const mediaMode = normalizeMediaMode(payload.mediaMode);
            const schedule = payload.schedule === undefined || payload.schedule === null
                ? null
                : normalizeSchedule(payload.schedule, {
                    titleFallback: cleanName,
                    strict: true,
                    now: Date.now()
                });

            if (!cleanName) {
                return ackError(ack, 'ROOM_NAME_REQUIRED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.createRoom, ip, ack)) {
                return;
            }
            if (!isValidRequestedMediaMode(payload.mediaMode)) {
                return ackError(ack, 'ROOM_MEDIA_MODE_INVALID');
            }
            if (mediaMode === MEDIA_MODE_SFU && !config.sfuAvailable) {
                return ackError(ack, 'ROOM_MEDIA_UNAVAILABLE');
            }
            if (payload.schedule !== undefined && payload.schedule !== null && !schedule) {
                return ackError(ack, 'SCHEDULE_INVALID');
            }

            const roomCode = generateRoomCode(rooms);
            if (!roomCode || rooms.has(roomCode)) {
                return ackError(ack, 'ROOM_CODE_GENERATION_FAILED');
            }

            const sanitizedPassword = sanitizeRoomPassword(password);
            const shouldProtect = !!requirePassword && sanitizedPassword.length > 0;
            let passwordHash = null;

            if (shouldProtect) {
                try {
                    passwordHash = await hashPassword(sanitizedPassword);
                } catch (err) {
                    console.error('Password hash failed:', err);
                    return ackError(ack, 'PASSWORD_HASH_FAILED');
                }
            }

            ensureRoom(roomCode, {
                name: cleanName,
                requirePassword: shouldProtect,
                passwordHash,
                mediaMode,
                createdAt: Date.now(),
                schedule
            });

            scheduleRoomCleanup(roomCode);
            persistRoomsSoon();
            const snapshot = roomSnapshot(roomCode);

            return ack({
                ok: true,
                room: {
                    ...snapshot,
                    code: roomCode
                }
            });
        });

        socket.on('join-room', async (payload = {}, ack = () => {}) => {
            const { roomId, username, clientId: payloadClientId, password } = payload;
            const cleanName = (username || '').trim();
            const normalizedRoom = normalizeRoom(roomId);
            const clientId = resolveClientId(socket, payloadClientId);

            if (!cleanName) {
                return ackError(ack, 'NICKNAME_REQUIRED');
            }
            if (!normalizedRoom) {
                return ackError(ack, 'ROOM_CODE_REQUIRED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.joinRoom, ip, ack)) {
                return;
            }

            const room = rooms.get(normalizedRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }
            clearRoomCleanupTimer(room);
            if (roomUsesSfu(room) && !config.sfuAvailable) {
                return ackError(ack, 'ROOM_MEDIA_UNAVAILABLE');
            }

            const passwordFailureKey = `${ip}:${normalizedRoom}`;
            const passwordFailureStatus = rateLimiters.passwordFailures.check(passwordFailureKey);
            if (!passwordFailureStatus.allowed) {
                return ackError(ack, 'RATE_LIMITED');
            }

            if (room.requirePassword) {
                const providedPassword = sanitizeRoomPassword(password);
                if (!providedPassword) {
                    return ackError(ack, 'ROOM_PASSWORD_REQUIRED');
                }
                if (!room.passwordHash) {
                    return ackError(ack, 'ROOM_PASSWORD_MISCONFIGURED');
                }
                try {
                    const isValid = await verifyPassword(providedPassword, room.passwordHash);
                    if (!isValid) {
                        rateLimiters.passwordFailures.consume(passwordFailureKey);
                        return ackError(ack, 'ROOM_PASSWORD_INVALID');
                    }
                    rateLimiters.passwordFailures.reset(passwordFailureKey);
                } catch (err) {
                    console.error('Password verification failed:', err);
                    return ackError(ack, 'ROOM_PASSWORD_VERIFICATION_FAILED');
                }
            }

            let isRejoin = false;
            const identityKey = buildIdentityKey(normalizedRoom, sessionId, clientId);

            if (identityKey) {
                const previousSocketId = room.identities.get(identityKey);
                if (previousSocketId && previousSocketId !== socket.id) {
                    if (removeUserFromRoom(room, previousSocketId, normalizedRoom)) {
                        isRejoin = true;
                    }
                }
            }

            const userKey = `${normalizedRoom}:${cleanName}`;
            const pendingTimer = pendingLeaveTimers.get(userKey);
            if (pendingTimer) {
                if (isSameIdentity(pendingTimer, sessionId, clientId)) {
                    clearTimeout(pendingTimer.timeoutId);
                    pendingLeaveTimers.delete(userKey);
                    isRejoin = true;
                } else {
                    return ackError(ack, 'USERNAME_TAKEN');
                }
            }

            const matchingUsers = Array.from(room.users.entries()).filter(([, user]) => user.name === cleanName);
            const releasableUsers = [];
            let hasConflict = false;

            matchingUsers.forEach(([existingSocketId, user]) => {
                if (isSameIdentity(user, sessionId, clientId)) {
                    releasableUsers.push([existingSocketId, user]);
                } else {
                    hasConflict = true;
                }
            });

            if (hasConflict) {
                return ackError(ack, 'USERNAME_TAKEN');
            }

            releasableUsers.forEach(([oldSocketId, userRecord]) => {
                if (removeUserFromRoom(room, oldSocketId, normalizedRoom, userRecord)) {
                    isRejoin = true;
                }
            });

            if (roomUsesMesh(room) && !isRejoin && room.users.size >= config.meshParticipantLimit) {
                return ackError(ack, 'ROOM_FULL');
            }

            const scheduleChanged = recordScheduleJoin(room.schedule, Date.now());
            const userRecord = {
                socketId: socket.id,
                name: cleanName,
                sessionId,
                clientId,
                identityKey,
                joinedAt: Date.now(),
                cameraOn: false,
                status: null
            };

            room.users.set(socket.id, userRecord);
            if (identityKey) {
                room.identities.set(identityKey, socket.id);
            }

            socket.data.username = cleanName;
            socket.data.roomId = normalizedRoom;
            socket.join(normalizedRoom);

            const snapshot = roomSnapshot(normalizedRoom);
            ack({ ok: true, room: snapshot });
            if (scheduleChanged) {
                persistRoomsSoon();
            }

            io.to(normalizedRoom).emit('presence', snapshot.participants);

            if (!isRejoin) {
                const systemMsg = createSystemMessage(`${cleanName} joined the room`, cleanName, 'join');
                room.messages.push(systemMsg);
                if (room.messages.length > ROOM_HISTORY_LIMIT) room.messages.shift();
                io.to(normalizedRoom).emit('chat-message', systemMsg);
                persistRoomsSoon();
            }
        });

        socket.on('send-message', (payload = {}, ack = () => {}) => {
            const { text } = payload;
            const currentRoom = socket.data.roomId;
            const cleanText = (text || '').trim();

            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!cleanText) {
                return ackError(ack, 'MESSAGE_REQUIRED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.chatMessages, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }
            const message = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                author: socket.data.username,
                text: cleanText,
                timestamp: Date.now(),
                type: 'user'
            };

            room.messages.push(message);
            if (room.messages.length > ROOM_HISTORY_LIMIT) room.messages.shift();
            io.to(currentRoom).emit('chat-message', message);
            persistRoomsSoon();
            ack({ ok: true });
        });

        socket.on('board-set-goal', (payload = {}, ack = () => {}) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.boardMutations, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }

            const board = ensureRoomBoard(room);
            board.goal = sanitizeBoardGoal(payload.goal);
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        socket.on('board-add-task', (payload = {}, ack = () => {}) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.boardMutations, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }

            const cleanText = sanitizeBoardTaskText(payload.text);
            if (!cleanText) {
                return ackError(ack, 'BOARD_TASK_REQUIRED');
            }

            const board = ensureRoomBoard(room);
            board.tasks.push({
                id: crypto.randomUUID(),
                text: cleanText,
                priority: normalizeBoardPriority(payload.priority),
                done: false
            });
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        socket.on('board-toggle-task', (payload = {}, ack = () => {}) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.boardMutations, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }

            const board = ensureRoomBoard(room);
            const targetTaskId = typeof payload.taskId === 'string' ? payload.taskId.trim() : '';
            const task = board.tasks.find((entry) => entry.id === targetTaskId);
            if (!task) {
                return ackError(ack, 'BOARD_TASK_NOT_FOUND');
            }

            task.done = !!payload.done;
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        socket.on('board-delete-task', (payload = {}, ack = () => {}) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.boardMutations, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }

            const board = ensureRoomBoard(room);
            const targetTaskId = typeof payload.taskId === 'string' ? payload.taskId.trim() : '';
            const taskIndex = board.tasks.findIndex((entry) => entry.id === targetTaskId);
            if (taskIndex === -1) {
                return ackError(ack, 'BOARD_TASK_NOT_FOUND');
            }

            board.tasks.splice(taskIndex, 1);
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        socket.on('board-reorder-tasks', (payload = {}, ack = () => {}) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.boardMutations, getJoinSessionKey(socket), ack)) {
                return;
            }

            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }

            const board = ensureRoomBoard(room);
            const { taskIds } = payload;
            if (!Array.isArray(taskIds) || taskIds.length !== board.tasks.length) {
                return ackError(ack, 'BOARD_REORDER_INVALID');
            }

            const normalizedTaskIds = taskIds
                .filter((taskId) => typeof taskId === 'string')
                .map((taskId) => taskId.trim());
            if (normalizedTaskIds.length !== board.tasks.length) {
                return ackError(ack, 'BOARD_REORDER_INVALID');
            }

            const orderedTasks = [];
            const taskMap = new Map(board.tasks.map((task) => [task.id, task]));
            for (const taskId of normalizedTaskIds) {
                const task = taskMap.get(taskId);
                if (!task) {
                    return ackError(ack, 'BOARD_REORDER_INVALID');
                }
                orderedTasks.push(task);
                taskMap.delete(taskId);
            }

            if (taskMap.size > 0) {
                return ackError(ack, 'BOARD_REORDER_INVALID');
            }

            board.tasks = orderedTasks;
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        socket.on('camera-status', (payload = {}) => {
            const { roomId } = socket.data;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room) return;
            if (!roomUsesMesh(room)) return;
            const user = room.users.get(socket.id);
            if (!user) return;
            user.cameraOn = !!payload.camera;
            io.to(roomId).emit('camera-status', { userId: socket.id, camera: user.cameraOn });
        });

        socket.on('rtc-offer', (payload = {}) => {
            const { roomId } = socket.data;
            const { targetId, sdp } = payload;
            if (!roomId || !targetId || !sdp) return;
            const room = rooms.get(roomId);
            if (!room || !roomUsesMesh(room) || !room.users.has(targetId)) return;
            io.to(targetId).emit('rtc-offer', { from: socket.id, sdp });
        });

        socket.on('rtc-answer', (payload = {}) => {
            const { roomId } = socket.data;
            const { targetId, sdp } = payload;
            if (!roomId || !targetId || !sdp) return;
            const room = rooms.get(roomId);
            if (!room || !roomUsesMesh(room) || !room.users.has(targetId)) return;
            io.to(targetId).emit('rtc-answer', { from: socket.id, sdp });
        });

        socket.on('rtc-ice', (payload = {}) => {
            const { roomId } = socket.data;
            const { targetId, candidate } = payload;
            if (!roomId || !targetId || !candidate) return;
            const room = rooms.get(roomId);
            if (!room || !roomUsesMesh(room) || !room.users.has(targetId)) return;
            io.to(targetId).emit('rtc-ice', { from: socket.id, candidate });
        });

        socket.on('user-status', (payload = {}, ack = () => {}) => {
            const { status } = payload || {};
            const { roomId } = socket.data;
            if (!roomId) return ack({ ok: false });
            const room = rooms.get(roomId);
            if (!room) return ack({ ok: false });
            const user = room.users.get(socket.id);
            if (!user) return ack({ ok: false });
            const safeStatus = sanitizeStatus(status);
            user.status = safeStatus;
            io.to(roomId).emit('status-update', { userId: socket.id, status: safeStatus });
            ack({ ok: true });
        });

        socket.on('disconnect', () => {
            if (skippedDisconnects.has(socket.id)) {
                skippedDisconnects.delete(socket.id);
                return;
            }

            const { roomId, sessionId: userSessionId, clientId: userClientId } = socket.data;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room) return;

            const user = room.users.get(socket.id);
            room.users.delete(socket.id);

            if (user) {
                const identityKey = user.identityKey || buildIdentityKey(roomId, user.sessionId, user.clientId || userClientId);
                if (identityKey && room.identities && room.identities.get(identityKey) === socket.id) {
                    room.identities.delete(identityKey);
                }
            }

            io.to(roomId).emit('camera-status', { userId: socket.id, camera: false });
            const snapshot = roomSnapshot(roomId);
            io.to(roomId).emit('presence', snapshot.participants);

            if (user) {
                const userKey = `${roomId}:${user.name}`;
                const existingPending = pendingLeaveTimers.get(userKey);
                if (existingPending) {
                    clearTimeout(existingPending.timeoutId);
                }

                const timerRecord = {
                    sessionId: user.sessionId || userSessionId,
                    clientId: user.clientId || userClientId || socket.data.clientId || null,
                    timeoutId: null
                };

                timerRecord.timeoutId = setTimeout(() => {
                    const activeRecord = pendingLeaveTimers.get(userKey);
                    if (activeRecord !== timerRecord) return;

                    pendingLeaveTimers.delete(userKey);
                    const currentRoom = rooms.get(roomId);
                    if (currentRoom) {
                        const systemMsg = createSystemMessage(`${user.name} left the room`, user.name, 'leave');
                        currentRoom.messages.push(systemMsg);
                        if (currentRoom.messages.length > ROOM_HISTORY_LIMIT) currentRoom.messages.shift();
                        io.to(roomId).emit('chat-message', systemMsg);
                        persistRoomsSoon();
                    }
                }, 3000);

                pendingLeaveTimers.set(userKey, timerRecord);
            }

            scheduleRoomCleanup(roomId);
        });
    });

    function listen(callback) {
        server.listen(config.port, () => {
            const startupSummary = {
                event: 'startup',
                mode: config.mode,
                port: config.port,
                roomStateFile: roomStore.filePath,
                loadedRoomCount,
                iceMode: config.iceMode,
                sfuAvailable: config.sfuAvailable,
                meshParticipantLimit: config.meshParticipantLimit
            };
            console.log(JSON.stringify(startupSummary));
            if (typeof callback === 'function') {
                callback({
                    config,
                    roomStore,
                    loadedRoomCount
                });
            }
        });
        return server;
    }

    return {
        app,
        server,
        io,
        config,
        roomStore,
        rooms,
        listen,
        evaluateReadiness,
        getLoadedRoomCount() {
            return loadedRoomCount;
        }
    };
}

module.exports = {
    createCoStudyServer,
    DEFAULT_ICE_SERVERS
};
