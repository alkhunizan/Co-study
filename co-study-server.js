const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { createRoomStore } = require('./room-store');
const {
    VIDEO_PROVIDER_MESH,
    VIDEO_PROVIDER_REALTIMEKIT,
    buildVideoPolicy,
    normalizeVideoProvider,
    resolveVideoConfig
} = require('./server-config');
const { createLogger } = require('./services/logging/logger');
const { createCompatibilityTelemetry } = require('./services/compatibility/telemetry');
const { createErrorBuffer } = require('./services/ops/error-buffer');
const { createBackupScheduler } = require('./services/ops/backup-scheduler');
const { createAdminRouter } = require('./services/admin/admin-routes');
const { resolveListenHost } = require('./services/config/network');
const { resolveSessionSecrets } = require('./services/config/secrets');
const { hashPassword, verifyPassword } = require('./services/auth/password');
const {
    createSessionToken,
    verifySessionToken,
    createAnonSessionToken,
    verifyAnonSessionToken
} = require('./services/auth');
const { createAuthRouter } = require('./services/auth/auth-routes');
const { createGoogleAuthRouter } = require('./services/auth/google-routes');
const { createOAuthSecurity } = require('./services/auth/oauth-security');
const {
    createKeyedMutationCoordinator,
    createUserMutationCoordinator
} = require('./services/auth/user-mutation-coordinator');
const { createUserStore, recordMyRoom } = require('./user-store');
const { createSupabaseClient } = require('./services/supabase/client');
const { createSupabaseUserStore } = require('./supabase-user-store');
const { createVideoProvider } = require('./services/video');
const { createVideoSessionRegistry } = require('./services/video/video-session-registry');
const { createVideoSessionStore } = require('./services/video/video-session-store');
const {
    createWebhookDeduplicator,
    processRealtimeKitWebhook,
    verifyRealtimeKitWebhookSignature
} = require('./services/video/realtimekit-webhook');
const { SlidingWindowRateLimiter } = require('./services/security/bounded-rate-limiter');
const { validateSocketRequest } = require('./services/socket/socket-request-validator');
const {
    buildScheduleSummary,
    findOpenOccurrence,
    getScheduleExpiryAt,
    normalizeSchedule,
    recordScheduleJoin,
    rollScheduleAttendance
} = require('./schedule-utils');
const { version: APP_VERSION } = require('./package.json');

const ROOM_HISTORY_LIMIT = 80;
const ROOM_TTL_MS = 1000 * 60 * 30;
const ROOM_SCHEMA_VERSION = 2;
const MAX_LIFECYCLE_TIMER_MS = 2_147_000_000;
const ROOM_CLEANUP_RETRY_MS = 5 * 60 * 1000;
const ROOM_EVENT_DRAIN_RETRY_MS = 10 * 1000;
const ROOM_EVENT_OUTBOX_LIMIT = 10_000;
// The Lobby: one reserved, always-available public room. Fixed code so /lobby
// always resolves to the same room; seeded at startup and exempt from the
// empty-room TTL cleanup so it never disappears.
const LOBBY_ROOM_CODE = 'LOBBY';
const LOBBY_ROOM_NAME = 'The Lobby';
// Max people present in the Lobby (watchers + publishers). Distinct from the
// mesh 4-cap and from the RealtimeKit publisher cap.
const LOBBY_PARTICIPANT_LIMIT = 30;
const SESSION_COOKIE_NAME = 'coStudySessionId';
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const AUTH_COOKIE_NAME = 'coStudyAuth';
const AUTH_COOKIE_MAX_AGE_MS = SESSION_COOKIE_MAX_AGE * 1000;
const ADMIN_USER_ID = 'admin';
const CLIENT_ID_MAX_LENGTH = 64;
const ROOM_CODE_LENGTH = 6;
const ROOM_NAME_MAX_LENGTH = 48;
const ROOM_PASSWORD_MAX_LENGTH = 64;
const NICKNAME_MAX_LENGTH = 20;
const CHAT_MESSAGE_MAX_LENGTH = 500;
const BOARD_GOAL_MAX_LENGTH = 80;
const BOARD_TASK_MAX_BYTES = 500;
const BOARD_TASK_LIMIT = 100;
const BOARD_TASK_ID_MAX_LENGTH = 128;
const BOARD_SERIALIZED_MAX_BYTES = 64 * 1024;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MEDIA_MODE_MESH = 'mesh';
const MEDIA_MODE_SFU = 'sfu';
const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_HTTPS_PORT = 3443;
const DEFAULT_MESH_PARTICIPANT_LIMIT = 4;
const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];
const COMPRESSED_AMBIENT_AUDIO_ALIASES = new Map([
    ['/audio/chimney-fire.wav', 'chimney-fire.mp3'],
    ['/audio/cafe.wav', 'cafe.mp3'],
    ['/audio/waves.wav', 'waves.mp3']
]);
const CREATE_ROOM_RATE = { limit: 6, windowMs: 60 * 1000 };
const JOIN_ATTEMPT_RATE = { limit: 12, windowMs: 60 * 1000 };
const ROOM_LOOKUP_RATE = { limit: 12, windowMs: 60 * 1000 };
const PASSWORD_FAILURE_RATE = { limit: 5, windowMs: 10 * 60 * 1000 };
const CHAT_RATE = { limit: 20, windowMs: 30 * 1000 };
const BOARD_RATE = { limit: 40, windowMs: 30 * 1000 };
const VIDEO_TOKEN_RATE = { limit: 12, windowMs: 60 * 1000 };
const VIDEO_HEARTBEAT_RATE = { limit: 90, windowMs: 60 * 1000 };
const VIDEO_SESSION_SWEEP_MS = 1000;
const VIDEO_RECONCILE_MS = 5 * 60 * 1000;
const VIDEO_CLEANUP_RETRY_MS = 30 * 1000;
const MAX_IP_VIDEO_PARTICIPANTS = 3;
const WEBHOOK_BODY_LIMIT = '128kb';
const AUTH_SIGNUP_RATE = { limit: 5, windowMs: 15 * 60 * 1000 };
const AUTH_LOGIN_RATE = { limit: 10, windowMs: 15 * 60 * 1000 };
const AUTH_FAILURE_RATE = { limit: 5, windowMs: 15 * 60 * 1000 };
const PROFILE_MUTATION_RATE = { limit: 20, windowMs: 5 * 60 * 1000 };
const FOCUS_LOG_RATE = { limit: 30, windowMs: 60 * 60 * 1000 };
const ADMIN_LOGIN_RATE = { limit: 5, windowMs: 15 * 60 * 1000 };
const METRICS_RATE = { limit: 30, windowMs: 60 * 1000 };
const REPORT_RATE = { limit: 3, windowMs: 60 * 1000 };
const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'];
const REPORT_DETAIL_MAX_LENGTH = 200;
const ROOM_REPORTS_LIMIT = 50;

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

const ADMIN_PATH_PATTERN = /^\/[a-z0-9][a-z0-9/_-]{7,63}$/i;
const PASSWORD_HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/i;

function resolveAdminConfig(env) {
    const rawPath = typeof env.ADMIN_PATH === 'string' ? env.ADMIN_PATH.trim() : '';
    const rawHash = typeof env.ADMIN_PASSWORD_HASH === 'string' ? env.ADMIN_PASSWORD_HASH.trim() : '';
    if (!rawPath && !rawHash) {
        return { enabled: false, path: '', passwordHash: '', partial: false };
    }
    if (!rawPath || !rawHash) {
        // One of the pair set: stay disabled but let the caller warn loudly.
        return { enabled: false, path: '', passwordHash: '', partial: true };
    }
    if (!ADMIN_PATH_PATTERN.test(rawPath)) {
        throw new Error('ADMIN_PATH must look like /ops-7f3k9qwe2 (8-64 chars of a-z, 0-9, -, _, /).');
    }
    if (!PASSWORD_HASH_PATTERN.test(rawHash)) {
        throw new Error('ADMIN_PASSWORD_HASH must be a salt:hex pair from `npm run admin:hash`.');
    }
    return { enabled: true, path: rawPath.replace(/\/$/, ''), passwordHash: rawHash, partial: false };
}

function resolveBackupConfig(env) {
    const rawInterval = env.BACKUP_INTERVAL_MINUTES;
    let intervalMinutes = 0;
    if (rawInterval !== undefined && rawInterval !== null && `${rawInterval}`.trim() !== '') {
        intervalMinutes = Number.parseInt(rawInterval, 10);
        if (!Number.isInteger(intervalMinutes) || (intervalMinutes !== 0 && intervalMinutes < 5)) {
            throw new Error('BACKUP_INTERVAL_MINUTES must be 0 (off) or an integer >= 5.');
        }
    }
    const retentionCount = parsePositiveInteger(env.BACKUP_RETENTION_COUNT, 'BACKUP_RETENTION_COUNT', 48);
    const plaintextSnapshotsAllowed = env.NODE_ENV !== 'production';
    if (!plaintextSnapshotsAllowed && intervalMinutes !== 0) {
        throw new Error('The plaintext backup scheduler is disabled in production; use halastudy-backup.timer.');
    }
    return { intervalMinutes, retentionCount, plaintextSnapshotsAllowed };
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

function resolveSupabaseConfig(env) {
    const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
    const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
    if (!!url !== !!serviceKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together.');
    }
    if (env.NODE_ENV === 'production' && !url) {
        throw new Error('Complete Supabase persistence is required in production.');
    }
    return { enabled: !!(url && serviceKey), url, serviceKey };
}

function resolveGoogleConfig(env, allowedOrigins) {
    const clientId = typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '';
    const clientSecret = typeof env.GOOGLE_CLIENT_SECRET === 'string' ? env.GOOGLE_CLIENT_SECRET.trim() : '';
    const explicitRedirect = typeof env.GOOGLE_REDIRECT_URI === 'string' ? env.GOOGLE_REDIRECT_URI.trim() : '';
    const fallbackBase = Array.isArray(allowedOrigins) && allowedOrigins[0] ? allowedOrigins[0] : '';
    const redirectUri = explicitRedirect || (fallbackBase ? `${fallbackBase}/auth/google/callback` : '');
    return { enabled: !!(clientId && clientSecret && redirectUri), clientId, clientSecret, redirectUri };
}

function resolveServerConfig({ env = process.env, mode = 'http' } = {}) {
    const portEnvName = mode === 'https' ? 'HTTPS_PORT' : 'PORT';
    const defaultPort = mode === 'https' ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT;
    const roomStateFile = path.resolve(env.ROOM_STATE_FILE || path.join(__dirname, 'data', 'rooms.json'));
    const userStateFile = path.resolve(env.USER_STATE_FILE || path.join(__dirname, 'data', 'users.json'));
    const roomStateBackupDir = path.resolve(env.ROOM_STATE_BACKUP_DIR || path.join(__dirname, 'data', 'backups'));
    const host = resolveListenHost(env);
    const {
        sessionSecret,
        adminSessionSecret,
        sessionSecretEphemeral,
        adminSessionSecretDerived
    } = resolveSessionSecrets(env);
    const admin = resolveAdminConfig(env);
    const backup = resolveBackupConfig(env);
    const video = resolveVideoConfig(env);
    const runtimeIce = video.devMeshEnabled
        ? resolveRuntimeIceServers(env.ICE_SERVERS_JSON)
        : { iceServers: [], source: 'disabled' };
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const trustProxy = parseTrustProxy(env.TRUST_PROXY);
    const sfuBaseUrl = parseSfuBaseUrl(env.SFU_BASE_URL);
    const supabase = resolveSupabaseConfig(env);
    const google = resolveGoogleConfig(env, allowedOrigins);
    const meshParticipantLimit = parsePositiveInteger(
        env.MESH_PARTICIPANT_LIMIT,
        'MESH_PARTICIPANT_LIMIT',
        DEFAULT_MESH_PARTICIPANT_LIMIT
    );
    const port = parsePort(env[portEnvName], portEnvName, defaultPort);

    ensureWritableFileParent(roomStateFile);
    ensureWritableFileParent(userStateFile);
    fs.mkdirSync(roomStateBackupDir, { recursive: true });

    return {
        mode,
        host,
        port,
        trustProxy,
        allowedOrigins,
        roomStateFile,
        realtimeKitWebhookStateFile: `${roomStateFile}.realtimekit-webhooks.json`,
        videoSessionStateFile: `${roomStateFile}.video-sessions.json`,
        userStateFile,
        roomStateBackupDir,
        sessionSecret,
        adminSessionSecret,
        sessionSecretEphemeral,
        adminSessionSecretDerived,
        admin,
        backup,
        sfuBaseUrl,
        sfuAvailable: !!sfuBaseUrl,
        supportedMediaModes: sfuBaseUrl ? [MEDIA_MODE_MESH, MEDIA_MODE_SFU] : [MEDIA_MODE_MESH],
        meshParticipantLimit,
        runtimeIceServers: runtimeIce.iceServers,
        iceMode: runtimeIce.source,
        supabase,
        google,
        video
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

// Controls, zero-width chars, and bidi overrides enable invisible names and
// RTL/LTR spoofing — a real vector in a bilingual chat. ZWNJ/ZWJ (U+200C/D)
// stay: Arabic shaping and composite emoji need them.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars deliberately to strip them at the trust boundary
const INVISIBLE_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function sanitizeUserText(raw, maxLength) {
    if (typeof raw !== 'string') return '';
    const visible = raw.replace(INVISIBLE_TEXT_PATTERN, '').trim();
    // Truncate by code points so an emoji straddling the cap is dropped
    // whole instead of leaving a lone surrogate in persisted state.
    return Array.from(visible).slice(0, maxLength).join('');
}

function sanitizeNickname(raw = '') {
    return sanitizeUserText(raw, NICKNAME_MAX_LENGTH);
}

function sanitizeChatMessage(raw = '') {
    return sanitizeUserText(raw, CHAT_MESSAGE_MAX_LENGTH);
}

function sanitizeBoardGoal(raw = '') {
    if (typeof raw !== 'string') return '';
    return raw.trim().slice(0, BOARD_GOAL_MAX_LENGTH);
}

function sanitizeBoardTaskText(raw = '') {
    if (typeof raw !== 'string') return '';
    const visible = raw.replace(INVISIBLE_TEXT_PATTERN, '').trim();
    let result = '';
    let usedBytes = 0;
    for (const character of visible) {
        const characterBytes = Buffer.byteLength(character, 'utf8');
        if (usedBytes + characterBytes > BOARD_TASK_MAX_BYTES) break;
        result += character;
        usedBytes += characterBytes;
    }
    return result;
}

function boardTaskTextExceedsLimit(raw = '') {
    if (typeof raw !== 'string') return false;
    const visible = raw.replace(INVISIBLE_TEXT_PATTERN, '').trim();
    return Buffer.byteLength(visible, 'utf8') > BOARD_TASK_MAX_BYTES;
}

function boardFitsSerializedLimit(board) {
    return Buffer.byteLength(JSON.stringify(board), 'utf8') <= BOARD_SERIALIZED_MAX_BYTES;
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
        id: typeof raw.id === 'string' && raw.id.trim()
            ? raw.id.trim().slice(0, BOARD_TASK_ID_MAX_LENGTH)
            : crypto.randomUUID(),
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
    room.board.tasks = room.board.tasks.map(normalizeBoardTask).filter(Boolean).slice(0, BOARD_TASK_LIMIT);
    while (room.board.tasks.length > 0 && !boardFitsSerializedLimit(room.board)) {
        room.board.tasks.pop();
    }
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

function buildIdentityKey(roomId, identityId) {
    if (!roomId || !identityId) return null;
    return `${roomId}:${identityId}`;
}

function appendSetCookie(res, cookie) {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
        res.setHeader('Set-Cookie', cookie);
    } else if (Array.isArray(existing)) {
        res.setHeader('Set-Cookie', [...existing, cookie]);
    } else {
        res.setHeader('Set-Cookie', [existing, cookie]);
    }
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

function normalizeOpaqueId(raw = '') {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return /^[A-Za-z0-9_-]{32,128}$/.test(trimmed) ? trimmed : null;
}

function isSameIdentity(record = {}, identityId) {
    return !!(record && identityId && record.identityId === identityId);
}

/** @param {Record<string, any>} input */
function sanitizeStatus(input = {}) {
    if (!input || typeof input !== 'object') {
        return {
            text: '',
            goal: '',
            visible: false,
            updatedAt: Math.floor(Date.now() / 60_000) * 60_000
        };
    }
    const visible = input.visible !== false;
    // Status timestamps are server-authored. Hidden users expose only a
    // minute bucket so a caller cannot smuggle activity precision or arbitrary
    // metadata through the otherwise-redacted snapshot.
    const now = Date.now();
    const updatedAt = visible ? now : Math.floor(now / 60_000) * 60_000;
    if (!visible) {
        return { visible: false, updatedAt };
    }
    const safeText = typeof input.text === 'string' ? input.text.slice(0, 80) : '';
    return {
        text: safeText,
        // Session goal rides on status: same 80-char cap as the board goal,
        // stripped at the trust boundary, hidden when status is hidden.
        goal: sanitizeUserText(input.goal, 80),
        visible,
        manual: typeof input.manual === 'string' ? input.manual.slice(0, 40) : '',
        manualPreset: typeof input.manualPreset === 'string' ? input.manualPreset : null,
        autoSync: !!input.autoSync,
        ambientType: typeof input.ambientType === 'string' ? input.ambientType.slice(0, 20) : null,
        timerMode: input.timerMode === 'break' ? 'break' : (input.timerMode === 'focus' ? 'focus' : null),
        updatedAt
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

function getExpectedOrigin(headers = {}, mode = 'http', trustProxy = false) {
    const host = headers.host;
    if (!host) return null;
    const forwardedProto = trustProxy && typeof headers['x-forwarded-proto'] === 'string'
        ? headers['x-forwarded-proto'].split(',')[0].trim()
        : '';
    const protocol = forwardedProto || mode;
    return `${protocol}://${host}`;
}

/**
 * @param {{ sfuOrigin?: string, videoConfig?: Record<string, any> }} [options]
 */
function buildContentSecurityPolicy({ sfuOrigin = '', videoConfig = {} } = {}) {
    const usesRealtimeKit = videoConfig.provider === VIDEO_PROVIDER_REALTIMEKIT;
    const scriptSrc = ["script-src 'self' 'unsafe-inline'"];
    const connectSrc = ["connect-src 'self'"];
    const mediaSrc = ["media-src 'self' blob: mediastream:"];

    if (usesRealtimeKit) {
        scriptSrc.push('https://cdn.jsdelivr.net');
        connectSrc.push(
            'https://*.cloudflare.com',
            'wss://*.cloudflare.com',
            'https://*.cloudflarestream.com',
            'wss://*.cloudflarestream.com'
        );
    }

    return [
        "default-src 'self'",
        scriptSrc.join(' '),
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        mediaSrc.join(' '),
        connectSrc.join(' '),
        sfuOrigin ? `frame-src 'self' ${sfuOrigin}` : "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'"
    ].join('; ');
}

/**
 * @param {{ sfuOrigin?: string, videoConfig?: Record<string, any> }} [options]
 */
function buildPermissionsPolicy({ sfuOrigin = '', videoConfig = {} } = {}) {
    // The SFU iframe is cross-origin; camera/mic/display-capture delegation
    // through its allow="" attribute only works if the embedding document's
    // policy allow-lists that origin too.
    const allowList = sfuOrigin ? `(self "${sfuOrigin}")` : '(self)';
    const displayCapture = videoConfig.screenshareEnabled ? allowList : '()';
    return `camera=${allowList}, microphone=${allowList}, display-capture=${displayCapture}`;
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
    return normalizeIp(request.socket?.remoteAddress);
}

function createCoStudyServer(options = {}) {
    const { env = process.env, mode = 'http', createServer } = options;
    const startupBackoffMs = Array.isArray(options.startupBackoffMs)
        ? options.startupBackoffMs
        : [1000, 2000, 4000];
    const sleep = typeof options.sleep === 'function'
        ? options.sleep
        : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const config = resolveServerConfig({ env, mode });
    const oauthSecurity = createOAuthSecurity({ secret: config.sessionSecret });
    const errorBuffer = createErrorBuffer({ capacity: 200 });
    const logger = createLogger({ service: 'halastudy' }, { onEntry: errorBuffer.push });
    const compatibilityTelemetry = options.compatibilityTelemetry || createCompatibilityTelemetry({ logger });
    if (typeof compatibilityTelemetry.record !== 'function'
        || typeof compatibilityTelemetry.snapshot !== 'function') {
        throw new TypeError('createCoStudyServer compatibilityTelemetry must expose record() and snapshot().');
    }
    // Admin-toggleable runtime overrides. In-memory by design: a restart
    // falls back to the env-configured defaults (fail-safe).
    const runtimeFlags = { videoJoinDisabled: null };
    const isVideoJoinDisabled = () => runtimeFlags.videoJoinDisabled ?? !!config.video.joinDisabled;
    // Site-wide announcement banner (admin broadcast). Lazy-expired on read.
    const announcementState = { current: null };
    function getActiveAnnouncement(now = Date.now()) {
        const current = announcementState.current;
        if (!current) return null;
        if (current.expiresAt && current.expiresAt <= now) {
            announcementState.current = null;
            return null;
        }
        return current;
    }
    const sfuOrigin = config.sfuAvailable ? new URL(config.sfuBaseUrl).origin : '';
    const contentSecurityPolicy = buildContentSecurityPolicy({ sfuOrigin, videoConfig: config.video });
    const permissionsPolicy = buildPermissionsPolicy({ sfuOrigin, videoConfig: config.video });
    const pendingLeaveTimers = new Map();
    const skippedDisconnects = new Set();
    const rooms = new Map();
    const meetingCreationLocks = new Map();
    const roomLifecycleLocks = new Map();
    const socketMembershipLocks = new Map();
    const membershipTokens = new Map();
    const rateLimiters = {
        createRoom: new SlidingWindowRateLimiter(CREATE_ROOM_RATE),
        joinRoom: new SlidingWindowRateLimiter(JOIN_ATTEMPT_RATE),
        roomLookup: new SlidingWindowRateLimiter(ROOM_LOOKUP_RATE),
        passwordFailures: new SlidingWindowRateLimiter(PASSWORD_FAILURE_RATE),
        chatMessages: new SlidingWindowRateLimiter(CHAT_RATE),
        boardMutations: new SlidingWindowRateLimiter(BOARD_RATE),
        videoToken: new SlidingWindowRateLimiter(VIDEO_TOKEN_RATE),
        videoHeartbeat: new SlidingWindowRateLimiter(VIDEO_HEARTBEAT_RATE),
        authSignup: new SlidingWindowRateLimiter(AUTH_SIGNUP_RATE),
        authLogin: new SlidingWindowRateLimiter(AUTH_LOGIN_RATE),
        authFailure: new SlidingWindowRateLimiter(AUTH_FAILURE_RATE),
        profileMutation: new SlidingWindowRateLimiter(PROFILE_MUTATION_RATE),
        focusLog: new SlidingWindowRateLimiter(FOCUS_LOG_RATE),
        adminLogin: new SlidingWindowRateLimiter(ADMIN_LOGIN_RATE),
        metrics: new SlidingWindowRateLimiter(METRICS_RATE),
        reports: new SlidingWindowRateLimiter(REPORT_RATE)
    };
    const videoProvider = options.videoProvider || createVideoProvider({ config: config.video, logger });
    const videoSessionRegistry = createVideoSessionRegistry({ logger });
    config.video.warnings.forEach((message) => {
        logger.warn({
            event: 'video_config_warning',
            message
        });
    });
    if (config.sessionSecretEphemeral) {
        logger.warn({
            event: 'session_secret_ephemeral',
            message: 'SESSION_SECRET is not set — using an ephemeral secret; all sessions reset on restart.'
        });
    }
    if (config.admin.partial) {
        logger.warn({
            event: 'admin_config_partial',
            message: 'Only one of ADMIN_PATH / ADMIN_PASSWORD_HASH is set — admin portal stays disabled.'
        });
    }
    const readinessState = {
        config: true,
        roomStore: false,
        userStore: false,
        videoSessionStore: false,
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
        maxHttpBufferSize: 128 * 1024,
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
                expectedOrigin: getExpectedOrigin(req.headers, config.mode, config.trustProxy),
                allowedOrigins: config.allowedOrigins
            });
            callback(null, allowed);
        }
    });
    readinessState.socket = true;

    const roomStore = options.roomStore || createRoomStore({
        filePath: config.roomStateFile,
        roomHistoryLimit: ROOM_HISTORY_LIMIT,
        normalizeRoom,
        normalizeMediaMode,
        normalizeVideoProvider,
        buildVideoPolicy,
        sanitizeRoomName,
        sanitizeBoardGoal,
        sanitizeBoardTaskText,
        normalizeBoardPriority
    });
    const realtimeKitWebhookDeduplicator = options.realtimeKitWebhookDeduplicator
        || createWebhookDeduplicator({
            filePath: config.realtimeKitWebhookStateFile,
            logger
        });
    const videoSessionStore = options.videoSessionStore || createVideoSessionStore({
        filePath: config.videoSessionStateFile,
        logger
    });
    const videoCleanupLocks = new Map();
    let realtimeKitProviderInitialized = false;
    let realtimeKitProviderAvailable = config.video.provider !== VIDEO_PROVIDER_REALTIMEKIT;
    let realtimeKitReconciliationPromise = null;

    // Persistence backend: Supabase profiles table when configured (accounts +
    // dashboards), otherwise the local users.json file store (dev default).
    let supabaseClient = null;
    let userStore = options.userStore || null;
    if (userStore) {
        logger.info({ event: 'user_store_backend', backend: userStore.isSupabase ? 'supabase' : 'injected' });
    } else if (config.supabase.enabled) {
        supabaseClient = createSupabaseClient({
            url: config.supabase.url,
            serviceKey: config.supabase.serviceKey
        });
        userStore = createSupabaseUserStore({
            client: supabaseClient,
            logger,
            onLegacyAuthProvider: () => compatibilityTelemetry.record('auth_provider_fallback')
        });
        logger.info({ event: 'user_store_backend', backend: 'supabase' });
    } else {
        userStore = createUserStore({
            filePath: config.userStateFile,
            logger,
            onLegacyAuthProvider: () => compatibilityTelemetry.record('auth_provider_fallback')
        });
        logger.info({ event: 'user_store_backend', backend: 'file' });
    }

    const backupScheduler = createBackupScheduler({
        intervalMinutes: config.backup.intervalMinutes,
        retentionCount: config.backup.retentionCount,
        backupDir: config.roomStateBackupDir,
        targets: config.backup.plaintextSnapshotsAllowed
            ? [
                { label: 'rooms', filePath: config.roomStateFile },
                // Skip the users.json snapshot target when Supabase owns accounts.
                ...(config.supabase.enabled ? [] : [{ label: 'users', filePath: config.userStateFile }])
            ]
            : [],
        logger
    });
    /** @type {Map<string, any>} userId -> user record */
    const users = new Map();
    /** @type {Map<string, string>} normalized email -> userId */
    const usersByEmail = new Map();
    const userMutationCoordinator = createUserMutationCoordinator({
        getUser: (userId) => users.get(userId) || null
    });
    const googleSubjectMutationCoordinator = createKeyedMutationCoordinator();
    const runUserMutation = (user, operation) => userMutationCoordinator.run(user, operation);
    const runGoogleSubjectMutation = (googleSub, operation) =>
        googleSubjectMutationCoordinator.run(googleSub, operation);

    function persistUserImmediate(user) {
        if (typeof userStore.saveUser === 'function') {
            return userStore.saveUser(user);
        }
        return userStore.flush(users);
    }

    function deleteUserImmediate(user) {
        if (typeof userStore.deleteUser === 'function') {
            return userStore.deleteUser(user);
        }
        const remainingUsers = new Map(users);
        remainingUsers.delete(user.id);
        return userStore.flush(remainingUsers);
    }

    async function persistFocusCompletionImmediate(user, payload) {
        if (typeof userStore.persistFocusCompletion === 'function') {
            return userStore.persistFocusCompletion(user, payload);
        }
        await persistUserImmediate(user);
        if (typeof userStore.logFocusSession === 'function' && payload.acceptedMinutes > 0) {
            await userStore.logFocusSession({
                userId: user.id,
                minutes: payload.acceptedMinutes,
                dayKey: payload.dayKey,
                completionId: payload.completionId
            });
        }
        return { duplicate: false };
    }

    async function loadPersistedUsers() {
        const hydrator = typeof userStore.initialize === 'function'
            ? () => userStore.initialize()
            : typeof userStore.hydrate === 'function'
                ? () => userStore.hydrate()
                : () => userStore.loadUsers({ strict: true });
        const persistedUsers = await hydrator();
        if (!Array.isArray(persistedUsers)) throw new Error('User persistence initialization returned invalid data.');
        const hydratedUsers = new Map();
        const hydratedUsersByEmail = new Map();
        persistedUsers.forEach((user) => {
            if (hydratedUsers.has(user.id) || hydratedUsersByEmail.has(user.email)) {
                throw new Error('User persistence initialization returned duplicate identities.');
            }
            hydratedUsers.set(user.id, user);
            hydratedUsersByEmail.set(user.email, user.id);
        });
        users.clear();
        usersByEmail.clear();
        hydratedUsers.forEach((user, userId) => {
            users.set(userId, user);
        });
        hydratedUsersByEmail.forEach((userId, email) => {
            usersByEmail.set(email, userId);
        });
        readinessState.userStore = true;
        logger.info({
            event: 'user_store_hydrated',
            backend: userStore.isSupabase ? 'supabase' : 'file',
            count: persistedUsers.length
        });
        return persistedUsers.length;
    }

    /** Public projection — never expose passwordHash/tokenEpoch. */
    function publicUser(user) {
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            avatarColor: user.avatarColor,
            bio: user.bio,
            createdAt: user.createdAt,
            authMethods: {
                password: user.passwordEnabled !== false && !!user.passwordHash,
                google: !!user.googleSub
            },
            streak: { ...user.streak }
        };
    }

    function setAuthCookie(req, res, user) {
        const token = createSessionToken({
            userId: user.id,
            tokenEpoch: user.tokenEpoch,
            secret: config.sessionSecret
        });
        const cookieParts = [
            `${AUTH_COOKIE_NAME}=${token}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${SESSION_COOKIE_MAX_AGE}`
        ];
        if (req.secure) {
            cookieParts.push('Secure');
        }
        appendSetCookie(res, cookieParts.join('; '));
    }

    function clearAuthCookie(req, res) {
        const cookieParts = [
            `${AUTH_COOKIE_NAME}=`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=0'
        ];
        if (req.secure) {
            cookieParts.push('Secure');
        }
        appendSetCookie(res, cookieParts.join('; '));
    }

    function rotateAnonymousIdentity(req, res) {
        const sessionId = crypto.randomUUID();
        const token = createAnonSessionToken({ sessionId, secret: config.sessionSecret });
        const cookieParts = [
            `${SESSION_COOKIE_NAME}=${token}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax'
        ];
        if (req.secure) {
            cookieParts.push('Secure');
        }
        appendSetCookie(res, cookieParts.join('; '));
        req.sessionId = sessionId;
        return sessionId;
    }

    /** Resolves a verified, live (not banned, epoch-current) user from an
     *  auth token string, or null. Shared by HTTP middleware and sockets. */
    function resolveUserFromToken(token) {
        const verified = verifySessionToken(token, {
            secret: config.sessionSecret,
            maxAgeMs: AUTH_COOKIE_MAX_AGE_MS
        });
        if (!verified || verified.userId === ADMIN_USER_ID) return null;
        const user = users.get(verified.userId);
        if (!user || user.banned || user.tokenEpoch !== verified.tokenEpoch) return null;
        return user;
    }

    function attachUser(req, _res, next) {
        const cookies = parseCookies(req.headers.cookie || '');
        const user = resolveUserFromToken(cookies[AUTH_COOKIE_NAME]);
        if (user) {
            req.user = user;
            req.userId = user.id;
        }
        next();
    }

    function requireUser(req, res, next) {
        if (!req.user) {
            res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
            return;
        }
        next();
    }

    function getDefaultRoomVideoPolicy(policy = {}) {
        const basePolicy = buildVideoPolicy(config.video);
        return {
            maxParticipants: Number.isInteger(policy.maxParticipants) && policy.maxParticipants > 0
                ? Math.min(policy.maxParticipants, config.video.maxRoomParticipants)
                : config.video.maxRoomParticipants,
            recordingEnabled: false,
            screenshareEnabled: !!basePolicy.screenshareEnabled,
            micDefaultEnabled: false,
            chatEnabled: !!basePolicy.chatEnabled
        };
    }

    function getClientVideoPolicy(room) {
        const roomPolicy = getDefaultRoomVideoPolicy(room?.videoPolicy);
        return {
            micDefaultEnabled: false,
            recordingEnabled: false,
            screenshareEnabled: !!roomPolicy.screenshareEnabled,
            chatEnabled: !!roomPolicy.chatEnabled,
            maxRoomParticipants: isLobbyRoom(room) ? LOBBY_PARTICIPANT_LIMIT : roomPolicy.maxParticipants,
            maxGlobalParticipants: config.video.maxGlobalParticipants,
            maxRoomDurationMinutes: config.video.maxRoomDurationMinutes
        };
    }

    function getRoomVideoProvider(room) {
        try {
            return normalizeVideoProvider(room?.videoProvider || config.video.provider);
        } catch (_error) {
            return config.video.provider;
        }
    }

    function applyRoomVideoDefaults(room) {
        if (!room) return room;
        room.videoProvider = getRoomVideoProvider(room);
        room.videoProviderMeetingId = typeof room.videoProviderMeetingId === 'string' && room.videoProviderMeetingId.trim()
            ? room.videoProviderMeetingId.trim()
            : null;
        room.videoProviderMeetingCreatedAt = Number.isFinite(room.videoProviderMeetingCreatedAt)
            ? room.videoProviderMeetingCreatedAt
            : null;
        room.videoProviderStatus = ['active', 'closed', 'error'].includes(room.videoProviderStatus)
            ? room.videoProviderStatus
            : (room.videoProviderMeetingId ? 'active' : null);
        room.videoPolicy = getDefaultRoomVideoPolicy(room.videoPolicy);
        return room;
    }

    function buildVideoCapacityPayload(roomId) {
        const normalizedRoom = normalizeRoom(roomId);
        return {
            roomId: normalizedRoom,
            activeRoomVideoParticipants: videoSessionRegistry.countActiveRoomVideoParticipants(normalizedRoom),
            activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
            maxRoomVideoParticipants: config.video.maxRoomParticipants,
            maxGlobalVideoParticipants: config.video.maxGlobalParticipants
        };
    }

    function emitVideoCapacity(roomId) {
        io.to(roomId).emit('video-capacity-updated', buildVideoCapacityPayload(roomId));
    }

    function emitVideoSessionEnded(session) {
        if (!session?.roomId) return;
        io.to(session.roomId).emit('video-session-ended', {
            roomId: session.roomId,
            reason: session.leaveReason || 'left'
        });
        emitVideoCapacity(session.roomId);
    }

    function emitEndedVideoSessions(sessions = []) {
        sessions.forEach(emitVideoSessionEnded);
    }

    function requestIpKey(requestIp) {
        return crypto.createHmac('sha256', config.sessionSecret)
            .update(String(requestIp || 'unknown'))
            .digest('base64url');
    }

    async function persistVideoSessionsImmediate() {
        try {
            await videoSessionStore.flush(videoSessionRegistry.exportPersistentState());
        } catch (error) {
            const persistenceError = new Error('Video session state could not be persisted.');
            /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
            persistenceError.cause = error;
            throw persistenceError;
        }
    }

    function runVideoCleanupOperation(videoSessionId, operation) {
        const previous = videoCleanupLocks.get(videoSessionId) || Promise.resolve();
        const attempt = previous.catch(() => {}).then(operation);
        videoCleanupLocks.set(videoSessionId, attempt);
        return attempt.finally(() => {
            if (videoCleanupLocks.get(videoSessionId) === attempt) {
                videoCleanupLocks.delete(videoSessionId);
            }
        });
    }

    async function requestProviderSessionEnd(session, reason = 'client_leave') {
        if (!session?.videoSessionId) return { cleanupPending: false };
        return runVideoCleanupOperation(session.videoSessionId, async () => {
            let current = videoSessionRegistry.findStoredSession({ videoSessionId: session.videoSessionId });
            if (!current) return { cleanupPending: false, providerIdentityRevoked: true };
            if (!current.revoked) {
                current = videoSessionRegistry.revokeVideoSession(
                    { videoSessionId: current.videoSessionId },
                    reason
                );
            }
            let persistenceUnavailable = false;
            try {
                await persistVideoSessionsImmediate();
            } catch (error) {
                persistenceUnavailable = true;
                logger.error({
                    event: 'video_revocation_persist_failed',
                    roomId: current.roomId,
                    videoSessionId: current.videoSessionId,
                    reason,
                    error: error?.cause?.message || error?.message
                });
            }
            if (!current.cleanupPending) {
                return {
                    cleanupPending: !!videoSessionRegistry.findSession({ videoSessionId: current.videoSessionId }),
                    persistenceUnavailable,
                    providerIdentityRevoked: !!current.participantDeletedAt || !current.providerParticipantId
                };
            }
            if (
                current.provider !== VIDEO_PROVIDER_REALTIMEKIT
                || !current.providerMeetingId
                || typeof videoProvider.kickParticipant !== 'function'
            ) return {
                cleanupPending: true,
                persistenceUnavailable,
                providerIdentityRevoked: false
            };

            try {
                await videoProvider.kickParticipant({
                    meetingId: current.providerMeetingId,
                    customParticipantId: current.videoSessionId
                });
                if (current.providerParticipantId) {
                    if (typeof videoProvider.deleteParticipant !== 'function') {
                        throw new Error('RealtimeKit participant deletion is unavailable.');
                    }
                    await videoProvider.deleteParticipant({
                        meetingId: current.providerMeetingId,
                        participantId: current.providerParticipantId
                    });
                }
                const ended = videoSessionRegistry.markCleanupComplete(
                    { videoSessionId: current.videoSessionId },
                    reason === 'client_leave' ? 'provider_identity_deleted' : reason
                );
                try {
                    await persistVideoSessionsImmediate();
                } catch (_error) {
                    persistenceUnavailable = true;
                }
                if (ended?.state === 'ended') emitVideoSessionEnded(ended);
                return {
                    cleanupPending: !!videoSessionRegistry.findSession({
                        videoSessionId: current.videoSessionId
                    }),
                    persistenceUnavailable,
                    providerIdentityRevoked: true
                };
            } catch (error) {
                videoSessionRegistry.markCleanupFailed({ videoSessionId: current.videoSessionId }, error);
                try {
                    await persistVideoSessionsImmediate();
                } catch (persistError) {
                    logger.error({
                        event: 'video_cleanup_tombstone_persist_failed',
                        roomId: current.roomId,
                        videoSessionId: current.videoSessionId,
                        error: persistError?.cause?.message || persistError?.message
                    });
                    return {
                        cleanupPending: true,
                        persistenceUnavailable: true,
                        providerIdentityRevoked: false
                    };
                }
                logger.warn({
                    event: 'video_provider_identity_cleanup_failed',
                    roomId: current.roomId,
                    videoSessionId: current.videoSessionId,
                    reason,
                    error: error?.message
                });
                return {
                    cleanupPending: true,
                    persistenceUnavailable,
                    providerIdentityRevoked: false
                };
            }
        });
    }

    async function retryPendingProviderSessionCleanup() {
        const pending = videoSessionRegistry.listCleanupPending();
        let succeeded = true;
        for (const session of pending) {
            const result = await requestProviderSessionEnd(
                session,
                session.endingReason || 'provider_cleanup_retry'
            );
            if (result.cleanupPending || result.persistenceUnavailable) succeeded = false;
        }
        return succeeded;
    }

    async function revokeSocketVideoSessions(socketId, reason) {
        const endingSessions = videoSessionRegistry.markSocketSessionsEnding(socketId, reason);
        let persistenceUnavailable = false;
        let providerIdentityRevoked = true;
        for (const endingSession of endingSessions) {
            emitVideoCapacity(endingSession.roomId);
            const result = await requestProviderSessionEnd(endingSession, reason);
            if (result.persistenceUnavailable) persistenceUnavailable = true;
            if (!result.providerIdentityRevoked) providerIdentityRevoked = false;
        }
        return {
            sessions: endingSessions,
            persistenceUnavailable,
            providerIdentityRevoked
        };
    }

    async function performRealtimeKitReconciliation() {
        if (config.video.provider !== VIDEO_PROVIDER_REALTIMEKIT) return true;
        if (!videoProvider.isConfigured?.()) {
            realtimeKitProviderAvailable = false;
            return false;
        }

        try {
            if (!realtimeKitProviderInitialized) {
                await videoProvider.initialize();
                realtimeKitProviderInitialized = true;
            }

            const cleanupSucceeded = await retryPendingProviderSessionCleanup();
            /** @type {any[]} */
            const meetingSnapshots = [];
            for (const room of rooms.values()) {
                if (roomIsClosed(room) || !room.videoProviderMeetingId) continue;
                if (getRoomVideoProvider(room) !== VIDEO_PROVIDER_REALTIMEKIT) continue;
                meetingSnapshots.push({
                    room,
                    meetingId: room.videoProviderMeetingId,
                    lifecycleEpoch: room.lifecycleEpoch,
                    providerGeneration: videoSessionRegistry.getProviderGeneration(room.videoProviderMeetingId),
                    activeSession: null,
                    error: null
                });
            }

            // Bound provider concurrency so one slow room cannot turn a
            // five-minute reconciliation into hundreds of serial requests.
            let nextSnapshotIndex = 0;
            let fetchFailed = false;
            const workers = Array.from({ length: Math.min(3, meetingSnapshots.length) }, async () => {
                while (nextSnapshotIndex < meetingSnapshots.length) {
                    const index = nextSnapshotIndex;
                    nextSnapshotIndex += 1;
                    const snapshot = meetingSnapshots[index];
                    try {
                        snapshot.activeSession = await videoProvider.getActiveMeetingSession({
                            meetingId: snapshot.meetingId
                        });
                    } catch (error) {
                        snapshot.error = error;
                        fetchFailed = true;
                    }
                }
            });
            await Promise.all(workers);

            let cleanupAfterReconciliationSucceeded = true;
            for (const snapshot of meetingSnapshots) {
                const { room, meetingId, lifecycleEpoch, activeSession, error } = snapshot;
                if (error || !activeSession) {
                    logger.warn({
                        event: 'video_provider_meeting_reconciliation_failed',
                        roomId: room.id,
                        meetingId,
                        error: error?.message
                    });
                    continue;
                }
                if (
                    videoSessionRegistry.getProviderGeneration(meetingId) !== snapshot.providerGeneration
                ) {
                    logger.info({
                        event: 'video_provider_reconciliation_skipped_newer_event',
                        meetingId
                    });
                    continue;
                }
                if (
                    rooms.get(room.id) !== room
                    || roomIsClosed(room)
                    || room.lifecycleEpoch !== lifecycleEpoch
                    || room.videoProviderMeetingId !== meetingId
                ) continue;
                const reconciliation = videoSessionRegistry.reconcileMeeting({
                    roomId: room.id,
                    provider: VIDEO_PROVIDER_REALTIMEKIT,
                    providerMeetingId: meetingId,
                    providerSessionId: activeSession.sessionId,
                    liveParticipants: activeSession.active ? activeSession.liveParticipants : 0,
                    participants: activeSession.active ? activeSession.participants : []
                });
                try {
                    await persistVideoSessionsImmediate();
                } catch (persistError) {
                    fetchFailed = true;
                    logger.error({
                        event: 'video_reconciliation_persist_failed',
                        meetingId,
                        error: persistError?.cause?.message || persistError?.message
                    });
                    continue;
                }
                for (const cleanupSession of reconciliation.cleanupSessions) {
                    const cleanup = await requestProviderSessionEnd(
                        cleanupSession,
                        cleanupSession.endingReason || 'provider_reconciliation'
                    );
                    if (cleanup.cleanupPending || cleanup.persistenceUnavailable) {
                        cleanupAfterReconciliationSucceeded = false;
                    }
                }
                emitVideoCapacity(room.id);
            }
            realtimeKitProviderAvailable = !!(
                cleanupSucceeded
                && cleanupAfterReconciliationSucceeded
                && !fetchFailed
            );
            logger.info({
                event: 'video_provider_reconciled',
                meetingCount: meetingSnapshots.length,
                activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants()
            });
            return realtimeKitProviderAvailable;
        } catch (error) {
            realtimeKitProviderAvailable = false;
            logger.warn({
                event: 'video_provider_reconciliation_failed',
                error: error?.message
            });
            return false;
        }
    }

    function reconcileRealtimeKitMeetings() {
        if (realtimeKitReconciliationPromise) return realtimeKitReconciliationPromise;
        const attempt = performRealtimeKitReconciliation();
        realtimeKitReconciliationPromise = attempt;
        const clearAttempt = () => {
            if (realtimeKitReconciliationPromise === attempt) {
                realtimeKitReconciliationPromise = null;
            }
        };
        void attempt.then(clearAttempt, clearAttempt);
        return attempt;
    }

    function roomSnapshot(roomId) {
        const normalized = normalizeRoom(roomId);
        const room = rooms.get(normalized);
        if (!room) {
            return {
                roomId: normalized,
                name: normalized,
                requirePassword: false,
                mediaMode: MEDIA_MODE_MESH,
                videoProvider: config.video.provider,
                videoPolicy: getClientVideoPolicy(null),
                activeVideoParticipantCount: 0,
                maxGlobalVideoParticipants: config.video.maxGlobalParticipants,
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
        applyRoomVideoDefaults(room);
        const board = cloneBoard(ensureRoomBoard(room));
        return {
            roomId: normalized,
            name: room.name || normalized,
            isLobby: isLobbyRoom(room),
            requirePassword: !!room.requirePassword,
            mediaMode: normalizeMediaMode(room.mediaMode),
            videoProvider: getRoomVideoProvider(room),
            videoProviderStatus: room.videoProviderStatus || null,
            videoPolicy: getClientVideoPolicy(room),
            activeVideoParticipantCount: videoSessionRegistry.countActiveRoomVideoParticipants(normalized),
            maxGlobalVideoParticipants: config.video.maxGlobalParticipants,
            participantCount: room.users.size,
            participantLimit: isLobbyRoom(room)
                ? LOBBY_PARTICIPANT_LIMIT
                : (normalizeMediaMode(room.mediaMode) === MEDIA_MODE_MESH ? config.meshParticipantLimit : null),
            participants: Array.from(room.users.values()).map((user) => ({
                id: user.socketId,
                name: user.name,
                joinedAt: user.joinedAt,
                cameraOn: !!user.cameraOn,
                status: user.status || null,
                avatarColor: user.avatarColor || null,
                streakCurrent: Number.isInteger(user.streakCurrent) ? user.streakCurrent : null
            })),
            messages: room.messages,
            board,
            schedule: buildScheduleSummary(room.schedule)
        };
    }

    // Safe pre-join view for a protected room. The public GET /api/rooms/:roomId
    // endpoint must never leak protected-room internals (messages, board,
    // participant details, schedule/private metadata, video provider/session
    // state) to an unauthenticated reader. Full state is delivered only through
    // the password-gated socket join-room flow. Fail closed.
    function roomPreview(normalizedRoomId, room) {
        return {
            ok: true,
            room: {
                roomId: normalizedRoomId,
                name: room.name || normalizedRoomId,
                protected: true,
                status: 'active',
                participantCount: room.users.size,
                requiresPassword: true
            }
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
        return applyRoomVideoDefaults({
            schemaVersion: room.schemaVersion === ROOM_SCHEMA_VERSION ? ROOM_SCHEMA_VERSION : 1,
            id: normalizeRoom(room.id || room.roomId || room.code || ''),
            name: sanitizeRoomName(room.name || room.id || '') || normalizeRoom(room.id || room.roomId || room.code || ''),
            ownerUserId: typeof room.ownerUserId === 'string' && room.ownerUserId.trim()
                ? room.ownerUserId.trim()
                : null,
            expiresAt: Number.isFinite(room.expiresAt)
                ? room.expiresAt
                : (schedule ? getScheduleExpiryAt(schedule) : null),
            lifecycleEpoch: Number.isInteger(room.lifecycleEpoch) && room.lifecycleEpoch >= 0
                ? room.lifecycleEpoch
                : 0,
            closedAt: Number.isFinite(room.closedAt) ? room.closedAt : null,
            closureReason: typeof room.closureReason === 'string' ? room.closureReason : null,
            cleanupPending: !!room.cleanupPending,
            providerCleanupLastError: typeof room.providerCleanupLastError === 'string'
                ? room.providerCleanupLastError
                : null,
            requirePassword: !!room.requirePassword,
            passwordHash: room.passwordHash || null,
            mediaMode: normalizeMediaMode(room.mediaMode),
            videoProvider: room.videoProvider || config.video.provider,
            videoProviderMeetingId: typeof room.videoProviderMeetingId === 'string' ? room.videoProviderMeetingId : null,
            videoProviderMeetingCreatedAt: Number.isFinite(room.videoProviderMeetingCreatedAt) ? room.videoProviderMeetingCreatedAt : null,
            videoProviderStatus: typeof room.videoProviderStatus === 'string' ? room.videoProviderStatus : null,
            videoPolicy: room.videoPolicy,
            createdAt: typeof room.createdAt === 'number' ? room.createdAt : Date.now(),
            users: new Map(),
            messages: Array.isArray(room.messages) ? room.messages.map((message) => ({ ...message })) : [],
            board: cloneBoard(room.board),
            reports: Array.isArray(room.reports) ? room.reports.map((report) => ({ ...report })) : [],
            schedule,
            roomEventOutbox: Array.isArray(room.roomEventOutbox)
                ? room.roomEventOutbox.map((event) => ({ ...event }))
                : [],
            identities: new Map(),
            cleanupTimer: null
        });
    }

    function getRoomMediaMode(room) {
        return normalizeMediaMode(room?.mediaMode);
    }

    function roomHasSchedule(room) {
        return !!(room?.schedule);
    }

    function roomIsClosed(room) {
        return !!(room?.closedAt);
    }

    function isLobbyRoom(room) {
        return !!room && room.id === LOBBY_ROOM_CODE;
    }

    function roomUsesMesh(room) {
        return getRoomMediaMode(room) === MEDIA_MODE_MESH;
    }

    function roomSupportsDevMeshSignaling(room) {
        return config.video.devMeshEnabled === true
            && config.video.provider === VIDEO_PROVIDER_MESH
            && getRoomVideoProvider(room) === VIDEO_PROVIDER_MESH
            && roomUsesMesh(room);
    }

    function roomUsesSfu(room) {
        return getRoomMediaMode(room) === MEDIA_MODE_SFU;
    }

    function persistRoomsSoon() {
        return roomStore.scheduleSave(rooms);
    }

    function roomEventUserId(identityId) {
        return typeof identityId === 'string' && identityId.startsWith('user:')
            ? identityId.slice('user:'.length) || null
            : null;
    }

    function roomEventOccurrenceId(room, occurredAt) {
        if (!roomHasSchedule(room)) return null;
        const { currentOccurrenceAt } = findOpenOccurrence(room.schedule, occurredAt);
        return Number.isFinite(currentOccurrenceAt)
            ? new Date(currentOccurrenceAt).toISOString()
            : null;
    }

    function buildRoomLifecycleEvent(room, eventType, options = {}) {
        const occurredAt = Number.isFinite(options.occurredAt) ? options.occurredAt : Date.now();
        return {
            eventId: options.eventId || crypto.randomUUID(),
            roomCode: room.id,
            userId: options.userId || null,
            nickname: typeof options.nickname === 'string' ? options.nickname : null,
            eventType,
            roomSchemaVersion: Number.isInteger(room.schemaVersion) ? room.schemaVersion : 1,
            ownerUserId: room.ownerUserId || null,
            roomExpiresAt: Number.isFinite(room.expiresAt) ? new Date(room.expiresAt).toISOString() : null,
            occurrenceId: roomEventOccurrenceId(room, occurredAt),
            lifecycleEpoch: Number.isInteger(room.lifecycleEpoch) ? room.lifecycleEpoch : 0,
            occurredAt: new Date(occurredAt).toISOString()
        };
    }

    function getRoomEventOutbox() {
        const lobby = rooms.get(LOBBY_ROOM_CODE);
        if (!lobby) {
            const error = new Error('The durable room event outbox is unavailable.');
            /** @type {any} */ (error).code = 'PERSISTENCE_UNAVAILABLE';
            throw error;
        }
        if (!Array.isArray(lobby.roomEventOutbox)) lobby.roomEventOutbox = [];
        return lobby.roomEventOutbox;
    }

    function stageRoomLifecycleEvents(events) {
        if (typeof userStore.logRoomEvent !== 'function' || events.length === 0) return [];
        const outbox = getRoomEventOutbox();
        if (outbox.length + events.length > ROOM_EVENT_OUTBOX_LIMIT) {
            const error = new Error('The durable room event outbox is full.');
            /** @type {any} */ (error).code = 'PERSISTENCE_UNAVAILABLE';
            throw error;
        }
        outbox.push(...events);
        return events;
    }

    function unstageRoomLifecycleEvents(events) {
        if (!events.length) return;
        const eventIds = new Set(events.map((event) => event.eventId));
        const outbox = getRoomEventOutbox();
        for (let index = outbox.length - 1; index >= 0; index -= 1) {
            if (eventIds.has(outbox[index].eventId)) outbox.splice(index, 1);
        }
    }

    let roomEventDrainPromise = null;
    function drainRoomEvents() {
        if (roomEventDrainPromise) return roomEventDrainPromise;
        roomEventDrainPromise = (async () => {
            if (typeof userStore.logRoomEvent !== 'function') return { delivered: 0, pending: 0 };
            const outbox = getRoomEventOutbox();
            let delivered = 0;
            while (outbox.length > 0) {
                const event = outbox[0];
                await userStore.logRoomEvent(event);
                outbox.shift();
                try {
                    // Removing an event is durable before the next one is sent.
                    // A failed removal is restored in memory; replay uses the
                    // same eventId and is therefore harmless at Supabase.
                    await roomStore.flush(rooms);
                } catch (error) {
                    outbox.unshift(event);
                    throw error;
                }
                delivered += 1;
            }
            return { delivered, pending: outbox.length };
        })().finally(() => {
            roomEventDrainPromise = null;
        });
        return roomEventDrainPromise;
    }

    function syncRoomSchedule(room, now = Date.now()) {
        if (!roomHasSchedule(room)) {
            return false;
        }
        return rollScheduleAttendance(room.schedule, now);
    }

    function clearRoomCleanupTimer(room) {
        if (!room?.cleanupTimer) return;
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
    }

    function runRoomLifecycleOperation(roomId, operation) {
        const normalizedRoom = normalizeRoom(roomId);
        const previous = roomLifecycleLocks.get(normalizedRoom) || Promise.resolve();
        const attempt = previous.catch(() => {}).then(operation);
        roomLifecycleLocks.set(normalizedRoom, attempt);
        return attempt.finally(() => {
            if (roomLifecycleLocks.get(normalizedRoom) === attempt) {
                roomLifecycleLocks.delete(normalizedRoom);
            }
        });
    }

    function runRoomLifecycleOperations(roomIds, operation) {
        const normalizedRooms = [...new Set(roomIds.map((roomId) => normalizeRoom(roomId)).filter(Boolean))].sort();
        const acquireAt = (index) => index >= normalizedRooms.length
            ? operation()
            : runRoomLifecycleOperation(normalizedRooms[index], () => acquireAt(index + 1));
        return acquireAt(0);
    }

    function runSocketMembershipOperation(socketId, operation) {
        const previous = socketMembershipLocks.get(socketId) || Promise.resolve();
        const attempt = previous.catch(() => {}).then(operation);
        socketMembershipLocks.set(socketId, attempt);
        return attempt.finally(() => {
            if (socketMembershipLocks.get(socketId) === attempt) {
                socketMembershipLocks.delete(socketId);
            }
        });
    }

    async function performCloseRoomLifecycle(roomId, options = {}) {
        const normalizedRoom = normalizeRoom(roomId);
        const room = rooms.get(normalizedRoom);
        if (!room || isLobbyRoom(room)) return null;
        const reason = typeof options.reason === 'string' ? options.reason : 'closed';

        if (!roomIsClosed(room)) {
            let stagedEvents = [];
            const previousLifecycle = {
                lifecycleEpoch: room.lifecycleEpoch,
                closedAt: room.closedAt,
                closureReason: room.closureReason,
                cleanupPending: room.cleanupPending,
                providerCleanupLastError: room.providerCleanupLastError
            };
            room.lifecycleEpoch = (Number.isInteger(room.lifecycleEpoch) ? room.lifecycleEpoch : 0) + 1;
            room.closedAt = Date.now();
            room.closureReason = reason;
            room.cleanupPending = !!(
                room.videoProviderMeetingId
                && typeof videoProvider.closeRoomMeeting === 'function'
            );
            room.providerCleanupLastError = null;
            try {
                stagedEvents = stageRoomLifecycleEvents([
                    buildRoomLifecycleEvent(room, 'close', {
                        userId: options.actorUserId || null,
                        nickname: options.actorNickname || null,
                        occurredAt: room.closedAt
                    })
                ]);
                // The closure epoch must be durable before identities are
                // revoked or a provider participant is kicked. The event
                // outbox shares this same atomic room snapshot.
                await roomStore.flush(rooms);
            } catch (error) {
                unstageRoomLifecycleEvents(stagedEvents);
                Object.assign(room, previousLifecycle);
                const persistenceError = new Error('Room closure could not be persisted.');
                /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
                persistenceError.cause = error;
                throw persistenceError;
            }
        }

        clearRoomCleanupTimer(room);
        for (const [pendingKey, pendingRecord] of pendingLeaveTimers.entries()) {
            if (!pendingKey.startsWith(`${normalizedRoom}:`)) continue;
            clearTimeout(pendingRecord.timeoutId);
            pendingLeaveTimers.delete(pendingKey);
        }
        io.to(normalizedRoom).emit('room-closed', {
            reason: room.closureReason,
            lifecycleEpoch: room.lifecycleEpoch
        });
        const memberSocketIds = Array.from(room.users.keys());
        for (const [socketId, record] of room.users.entries()) {
            invalidateMembershipToken(record.membershipToken);
            const socketRef = io.sockets.sockets.get(socketId);
            if (socketRef) {
                invalidateSocketMembership(socketRef);
                skippedDisconnects.add(socketId);
                socketRef.disconnect(true);
            }
            videoSessionRegistry.markSocketSessionsEnding(socketId, 'room_closed');
        }
        room.users.clear();
        room.identities.clear();
        try {
            await persistVideoSessionsImmediate();
        } catch (error) {
            const persistenceError = new Error('Room video revocations could not be persisted.');
            /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
            persistenceError.cause = error;
            throw persistenceError;
        }

        if (room.cleanupPending && options.deferProviderCleanup) {
            // Account deletion has already made the closure epoch and every
            // local media revocation durable. Do not hold its HTTP response
            // open on a provider deadline; the same lifecycle lock resumes
            // exact meeting cleanup immediately and the periodic retry worker
            // remains the durable fallback.
            setImmediate(() => {
                void closeRoomLifecycle(normalizedRoom, {
                    reason: room.closureReason || reason
                }).catch((error) => logger.error({
                    event: 'deferred_room_cleanup_failed',
                    roomId: normalizedRoom,
                    error: error?.message
                }));
            });
            return {
                ok: true,
                roomId: normalizedRoom,
                kicked: memberSocketIds.length,
                cleanupPending: true,
                lifecycleEpoch: room.lifecycleEpoch
            };
        }

        if (room.cleanupPending) {
            try {
                await videoProvider.closeRoomMeeting({
                    meetingId: room.videoProviderMeetingId
                });
                room.cleanupPending = false;
                room.providerCleanupLastError = null;
                room.videoProviderStatus = 'closed';
                emitEndedVideoSessions(videoSessionRegistry.retireMeeting(
                    room.videoProviderMeetingId,
                    'provider_meeting_closed'
                ));
                await persistVideoSessionsImmediate();
            } catch (error) {
                room.cleanupPending = true;
                room.providerCleanupLastError = String(error?.message || 'provider cleanup failed').slice(0, 200);
                try {
                    await roomStore.flush(rooms);
                } catch (persistError) {
                    logger.error({
                        event: 'room_cleanup_tombstone_persist_failed',
                        roomId: normalizedRoom,
                        error: persistError?.message
                    });
                }
                return {
                    ok: true,
                    roomId: normalizedRoom,
                    kicked: memberSocketIds.length,
                    cleanupPending: true,
                    lifecycleEpoch: room.lifecycleEpoch
                };
            }
        }

        if (!room.cleanupPending && room.videoProviderMeetingId) {
            emitEndedVideoSessions(videoSessionRegistry.retireMeeting(
                room.videoProviderMeetingId,
                'provider_meeting_closed'
            ));
            await persistVideoSessionsImmediate();
        }

        rooms.delete(normalizedRoom);
        try {
            await roomStore.flush(rooms);
        } catch (error) {
            // The first flush left a durable closed record. Keep the same
            // tombstone in memory so no request can resurrect the room.
            room.cleanupPending = true;
            room.providerCleanupLastError = 'final room deletion persistence failed';
            rooms.set(normalizedRoom, room);
            const persistenceError = new Error('Room deletion could not be persisted.');
            /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
            persistenceError.cause = error;
            throw persistenceError;
        }
        return {
            ok: true,
            roomId: normalizedRoom,
            kicked: memberSocketIds.length,
            cleanupPending: false,
            lifecycleEpoch: room.lifecycleEpoch
        };
    }

    function closeRoomLifecycle(roomId, options = {}) {
        return runRoomLifecycleOperation(roomId, () => performCloseRoomLifecycle(roomId, options));
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
                schemaVersion: ROOM_SCHEMA_VERSION,
                id: normalized,
                name: meta.name || normalized,
                ownerUserId: meta.ownerUserId || null,
                expiresAt: Number.isFinite(meta.expiresAt) ? meta.expiresAt : null,
                lifecycleEpoch: 0,
                requirePassword: !!meta.requirePassword,
                passwordHash: meta.passwordHash || null,
                mediaMode: normalizeMediaMode(meta.mediaMode),
                videoProvider: meta.videoProvider || config.video.provider,
                createdAt: meta.createdAt || Date.now(),
                schedule,
                board: {
                    goal: sanitizeBoardGoal(
                        (meta.board?.goal)
                        || (schedule?.boardGoalTemplate)
                    ),
                    tasks: Array.isArray(meta.board?.tasks)
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
        applyRoomVideoDefaults(room);
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
        if (!room || room.cleanupTimer || isLobbyRoom(room) || roomIsClosed(room)) return;

        if (roomHasSchedule(room)) {
            room.expiresAt = Number.isFinite(room.expiresAt)
                ? room.expiresAt
                : getScheduleExpiryAt(room.schedule);
        } else if (room.users.size > 0) {
            room.expiresAt = null;
            return;
        } else if (!Number.isFinite(room.expiresAt)) {
            room.expiresAt = Date.now() + ROOM_TTL_MS;
        }

        if (!Number.isFinite(room.expiresAt)) return;
        const delayMs = Math.max(0, Math.min(room.expiresAt - Date.now(), MAX_LIFECYCLE_TIMER_MS));
        room.cleanupTimer = setTimeout(() => {
            room.cleanupTimer = null;
            if (room.expiresAt > Date.now()) {
                scheduleRoomCleanup(roomId);
                return;
            }
            void closeRoomLifecycle(roomId, { reason: 'expired' }).catch((error) => {
                logger.error({ event: 'room_expiry_failed', roomId, error: error?.message });
                setTimeout(() => scheduleRoomCleanup(roomId), ROOM_CLEANUP_RETRY_MS).unref?.();
            });
        }, delayMs);
        room.cleanupTimer.unref?.();
    }

    function invalidateMembershipToken(token) {
        if (!token) return;
        membershipTokens.delete(token);
    }

    function invalidateSocketMembership(socketRef) {
        if (!socketRef) return;
        invalidateMembershipToken(socketRef.data.membershipToken);
        socketRef.data.membershipToken = null;
    }

    function invalidateSocketConnection(socketRef) {
        if (!socketRef) return;
        socketRef.data.connectionGeneration = Number.isInteger(socketRef.data.connectionGeneration)
            ? socketRef.data.connectionGeneration + 1
            : 1;
        invalidateSocketMembership(socketRef);
    }

    /** @param {{ userId?: string|null, sessionId?: string|null }} [browserSession] */
    function disconnectAuthenticatedBrowserSessionSockets(browserSession = {}) {
        const { userId, sessionId } = browserSession;
        if (typeof userId !== 'string' || !userId || typeof sessionId !== 'string' || !sessionId) {
            return 0;
        }
        const matchingSockets = Array.from(io.sockets.sockets.values()).filter((socketRef) => (
            socketRef.data.userId === userId
            && socketRef.data.sessionId === sessionId
        ));
        for (const socketRef of matchingSockets) {
            // Bump liveness before disconnecting so an already-running async
            // join observes revocation even if its next continuation runs in
            // the same event-loop turn as Socket.IO's disconnect callback.
            invalidateSocketConnection(socketRef);
            socketRef.disconnect(true);
        }
        return matchingSockets.length;
    }

    function issueMembershipToken(socketRef, roomId) {
        invalidateSocketMembership(socketRef);
        const token = crypto.randomBytes(32).toString('base64url');
        membershipTokens.set(token, {
            socketId: socketRef.id,
            roomId,
            identityId: socketRef.data.identityId,
            issuedAt: Date.now()
        });
        socketRef.data.membershipToken = token;
        return token;
    }

    function removeUserFromRoom(room, socketId, normalizedRoom, existingRecord = null, options = {}) {
        if (!room || !socketId) return false;
        const record = existingRecord || room.users.get(socketId);
        if (!record) return false;

        room.users.delete(socketId);

        const identityKey = record.identityKey || buildIdentityKey(normalizedRoom, record.identityId);
        if (identityKey && room.identities && room.identities.get(identityKey) === socketId) {
            room.identities.delete(identityKey);
        }

        invalidateMembershipToken(record.membershipToken);

        const socketRef = io.sockets.sockets.get(socketId);
        if (socketRef) {
            invalidateSocketMembership(socketRef);
            socketRef.leave(normalizedRoom);
            socketRef.data.roomId = null;
        } else {
            skippedDisconnects.add(socketId);
        }
        if (!options.videoAlreadyRevoked) {
            void revokeSocketVideoSessions(socketId, 'room_membership_revoked').then((result) => {
                if (result.persistenceUnavailable || !result.providerIdentityRevoked) {
                    realtimeKitProviderAvailable = false;
                }
            });
        }
        return true;
    }

    async function cascadeDeletedUser(userId) {
        const authenticatedIdentityId = `user:${userId}`;
        let cleanupPending = false;

        const ownedRoomIds = Array.from(rooms.values())
            .filter((room) => !isLobbyRoom(room) && room.ownerUserId === userId)
            .map((room) => room.id);
        for (const ownedRoomId of ownedRoomIds) {
            try {
                const result = await closeRoomLifecycle(ownedRoomId, {
                    reason: 'owner_account_deleted',
                    deferProviderCleanup: true,
                    actorUserId: userId
                });
                cleanupPending = cleanupPending || !!result?.cleanupPending;
            } catch (error) {
                cleanupPending = true;
                logger.error({
                    event: 'deleted_owner_room_close_failed',
                    userId,
                    roomId: ownedRoomId,
                    error: error?.message
                });
                setTimeout(() => {
                    void closeRoomLifecycle(ownedRoomId, { reason: 'owner_account_deleted_retry' })
                        .catch((retryError) => logger.error({
                            event: 'deleted_owner_room_close_retry_failed',
                            userId,
                            roomId: ownedRoomId,
                            error: retryError?.message
                        }));
                }, ROOM_CLEANUP_RETRY_MS).unref?.();
            }
        }

        const ownedRoomSet = new Set(ownedRoomIds);
        const activeUserVideoSessions = videoSessionRegistry.listActive()
            .filter((session) => (
                session.userId === authenticatedIdentityId
                && !ownedRoomSet.has(session.roomId)
            ));
        for (const session of activeUserVideoSessions) {
            videoSessionRegistry.markVideoSessionEnding(
                { videoSessionId: session.videoSessionId },
                'account_deleted'
            );
        }
        if (activeUserVideoSessions.length > 0) {
            await persistVideoSessionsImmediate();
            cleanupPending = true;
        }

        for (const [token, membership] of membershipTokens.entries()) {
            if (membership.identityId === authenticatedIdentityId) {
                invalidateMembershipToken(token);
            }
        }

        const userSockets = Array.from(io.sockets.sockets.values())
            .filter((socketRef) => socketRef.data.userId === userId);
        for (const socketRef of userSockets) {
            const normalizedRoom = socketRef.data.roomId;
            const room = normalizedRoom ? rooms.get(normalizedRoom) : null;
            if (room) {
                const member = room.users.get(socketRef.id);
                if (removeUserFromRoom(room, socketRef.id, normalizedRoom, member, { videoAlreadyRevoked: true })) {
                    io.to(normalizedRoom).emit('camera-status', { userId: socketRef.id, camera: false });
                    io.to(normalizedRoom).emit('presence', roomSnapshot(normalizedRoom).participants);
                    scheduleRoomCleanup(normalizedRoom);
                }
            } else {
                invalidateSocketMembership(socketRef);
            }
            skippedDisconnects.add(socketRef.id);
            socketRef.disconnect(true);
        }

        if (activeUserVideoSessions.length > 0) {
            setImmediate(() => {
                void Promise.allSettled(activeUserVideoSessions.map(async (session) => {
                    const current = videoSessionRegistry.findStoredSession({
                        videoSessionId: session.videoSessionId
                    });
                    if (!current) return;
                    await requestProviderSessionEnd(current, 'account_deleted');
                    emitVideoCapacity(current.roomId);
                })).then((results) => {
                    results.forEach((result) => {
                        if (result.status === 'rejected') {
                            logger.error({
                                event: 'deferred_account_video_cleanup_failed',
                                userId,
                                error: result.reason?.message
                            });
                        }
                    });
                });
            });
        }

        return { cleanupPending };
    }

    function loadPersistedRooms() {
        const persistedRooms = roomStore.loadRooms({ strict: true });
        persistedRooms.forEach((persistedRoom) => {
            if (persistedRoom.schemaVersion !== ROOM_SCHEMA_VERSION) {
                compatibilityTelemetry.record('room_schema_v1_read');
            }
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
        const header = (socket.handshake?.headers?.cookie) || '';
        const cookies = parseCookies(header);
        return verifyAnonSessionToken(cookies[SESSION_COOKIE_NAME], { secret: config.sessionSecret });
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

    function applyHttpRateLimit(_req, res, limiter, key) {
        const result = limiter.consume(key);
        if (result.allowed) return true;
        res.status(429).json({
            errorCode: 'RATE_LIMITED',
            retryAfterMs: result.retryAfterMs
        });
        return false;
    }

    function sendVideoError(res, status, errorCode) {
        res.status(status).json({
            ok: false,
            errorCode,
            error: errorCode
        });
    }

    function resolveRoomMembership(req, room, roomId) {
        const rawHeader = req.headers['x-halastudy-membership'];
        const token = normalizeOpaqueId(Array.isArray(rawHeader) ? rawHeader[0] : rawHeader);
        const membership = token ? membershipTokens.get(token) : null;
        if (!membership || membership.roomId !== roomId) return null;

        const socketRef = io.sockets.sockets.get(membership.socketId);
        const member = room.users.get(membership.socketId);
        if (!socketRef || !member) return null;
        if (socketRef.data.membershipToken !== token || member.membershipToken !== token) return null;
        if (socketRef.data.roomId !== roomId || member.identityId !== membership.identityId) return null;
        const requestIdentityId = req.user
            ? `user:${req.user.id}`
            : (req.sessionId ? `anon:${req.sessionId}` : null);
        if (!requestIdentityId || requestIdentityId !== membership.identityId) return null;
        return { membership, member, socketRef };
    }

    function resolveVideoSessionRequestId(req, roomId, resolvedMembership, legacySignal) {
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        const legacyShapePresent = Object.hasOwn(body, 'clientSessionId') || Object.hasOwn(body, 'displayName');
        if (legacyShapePresent) compatibilityTelemetry.record(legacySignal);

        const videoSessionId = normalizeOpaqueId(body.videoSessionId);
        if (videoSessionId) return videoSessionId;
        if (!legacyShapePresent
            || !normalizeClientId(body.clientSessionId)
            || !sanitizeNickname(body.displayName)) {
            return null;
        }

        // Transitional legacy fields are shape-checked only. Authorization and
        // lookup use the signed membership's room, socket, and identity; caller
        // IDs and display names never select or replace a video session.
        const matches = videoSessionRegistry.listActive().filter((session) => (
            session.roomId === roomId
            && session.socketId === resolvedMembership.member.socketId
            && session.userId === resolvedMembership.member.identityId
        ));
        return matches.length === 1 ? matches[0].videoSessionId : null;
    }

    async function ensureRealtimeKitMeeting(roomId, room) {
        applyRoomVideoDefaults(room);
        if (room.videoProviderMeetingId && room.videoProviderStatus !== 'closed') {
            return {
                provider: getRoomVideoProvider(room),
                meetingId: room.videoProviderMeetingId,
                reused: true
            };
        }

        const existingLock = meetingCreationLocks.get(roomId);
        if (existingLock) return existingLock;

        const createPromise = (async () => {
            const previousMeetingState = {
                videoProviderMeetingId: room.videoProviderMeetingId,
                videoProviderMeetingCreatedAt: room.videoProviderMeetingCreatedAt,
                videoProviderStatus: room.videoProviderStatus
            };
            const meeting = await videoProvider.ensureRoomMeeting({
                roomId,
                roomName: room.name || roomId
            });
            room.videoProviderMeetingId = meeting.meetingId;
            room.videoProviderMeetingCreatedAt = Date.now();
            room.videoProviderStatus = 'active';
            try {
                // The meeting identifier must survive a process crash before
                // any reusable participant credential is created.
                await roomStore.flush(rooms);
            } catch (error) {
                Object.assign(room, previousMeetingState);
                try {
                    await videoProvider.closeRoomMeeting({ meetingId: meeting.meetingId });
                } catch (cleanupError) {
                    logger.error({
                        event: 'orphan_video_meeting_cleanup_failed',
                        roomId,
                        meetingId: meeting.meetingId,
                        error: cleanupError?.message
                    });
                }
                const persistenceError = new Error('RealtimeKit meeting metadata could not be persisted.');
                /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
                persistenceError.cause = error;
                throw persistenceError;
            }
            logger.info({
                event: 'video_meeting_ready',
                provider: getRoomVideoProvider(room),
                roomId,
                meetingId: room.videoProviderMeetingId,
                reused: !!meeting.reused
            });
            return meeting;
        })();

        meetingCreationLocks.set(roomId, createPromise);
        try {
            return await createPromise;
        } catch (error) {
            if (error?.code !== 'PERSISTENCE_UNAVAILABLE') {
                room.videoProviderStatus = 'error';
                persistRoomsSoon();
            }
            throw error;
        } finally {
            meetingCreationLocks.delete(roomId);
        }
    }

    async function refreshExpiredRoomMeetingIfIdle(roomId, room) {
        if (!room?.videoProviderMeetingCreatedAt) return true;
        const meetingAgeMs = Date.now() - room.videoProviderMeetingCreatedAt;
        const maxMeetingAgeMs = config.video.maxRoomDurationMinutes * 60 * 1000;
        if (meetingAgeMs <= maxMeetingAgeMs) return true;

        const activeRoomVideoParticipants = videoSessionRegistry.countActiveRoomVideoParticipants(roomId);
        if (activeRoomVideoParticipants > 0) {
            return false;
        }

        const oldMeetingId = room.videoProviderMeetingId;
        if (oldMeetingId && typeof videoProvider.closeRoomMeeting === 'function') {
            try {
                await videoProvider.closeRoomMeeting({ meetingId: oldMeetingId });
                emitEndedVideoSessions(
                    videoSessionRegistry.retireMeeting(oldMeetingId, 'provider_meeting_recycled')
                );
                await persistVideoSessionsImmediate();
            } catch (error) {
                room.videoProviderStatus = 'error';
                room.providerCleanupLastError = String(error?.message || 'provider cleanup failed').slice(0, 200);
                realtimeKitProviderAvailable = false;
                try {
                    await roomStore.flush(rooms);
                } catch (persistError) {
                    const persistenceError = new Error('Meeting cleanup retry state could not be persisted.');
                    /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
                    persistenceError.cause = persistError;
                    throw persistenceError;
                }
                logger.warn({
                    event: 'video_meeting_recycle_cleanup_failed',
                    roomId,
                    meetingId: oldMeetingId,
                    error: error?.message
                });
                return false;
            }
        }

        const previousMeetingCreatedAt = room.videoProviderMeetingCreatedAt;
        room.videoProviderMeetingId = null;
        room.videoProviderMeetingCreatedAt = null;
        room.videoProviderStatus = 'closed';
        room.providerCleanupLastError = null;
        try {
            await roomStore.flush(rooms);
        } catch (error) {
            room.videoProviderMeetingId = oldMeetingId;
            room.videoProviderMeetingCreatedAt = previousMeetingCreatedAt;
            room.videoProviderStatus = 'error';
            room.providerCleanupLastError = 'meeting recycle state persistence failed';
            const persistenceError = new Error('Meeting recycle state could not be persisted.');
            /** @type {any} */ (persistenceError).code = 'PERSISTENCE_UNAVAILABLE';
            persistenceError.cause = error;
            throw persistenceError;
        }
        logger.info({
            event: 'video_meeting_recycled',
            provider: getRoomVideoProvider(room),
            roomId,
            oldMeetingId,
            maxRoomDurationMinutes: config.video.maxRoomDurationMinutes
        });
        return true;
    }

    function createRealtimeKitVideoTokenOperation(options) {
        const {
            req,
            res,
            room,
            normalizedRoom,
            member,
            requestIp,
            displayName,
            role,
            roomVideoProvider
        } = options;
        const membershipRemainsValid = () => {
            if (rooms.get(normalizedRoom) !== room || roomIsClosed(room)) return false;
            const current = resolveRoomMembership(req, room, normalizedRoom);
            return !!(
                current
                && current.member === member
                && current.member.name === displayName
            );
        };
        const releaseUnissuedReservation = async (session, reason) => {
            if (!session) return { cleanupPending: false };
            const current = videoSessionRegistry.findStoredSession({ videoSessionId: session.videoSessionId });
            if (!current) return { cleanupPending: false };
            let result = { cleanupPending: false };
            if (current.providerParticipantId) {
                const revoked = videoSessionRegistry.revokeVideoSession(
                    { videoSessionId: current.videoSessionId },
                    reason
                );
                result = await requestProviderSessionEnd(revoked, reason);
            } else {
                videoSessionRegistry.markVideoSessionLeft(
                    { videoSessionId: current.videoSessionId },
                    reason,
                    { providerIdentityRetired: true }
                );
                try {
                    await persistVideoSessionsImmediate();
                } catch (_error) {
                    result = { cleanupPending: false, persistenceUnavailable: true };
                }
            }
            emitVideoCapacity(normalizedRoom);
            return result;
        };

        const userId = member.identityId;
        const roomPolicy = getDefaultRoomVideoPolicy(room.videoPolicy);
        const roomParticipantCap = isLobbyRoom(room) ? LOBBY_PARTICIPANT_LIMIT : roomPolicy.maxParticipants;
        let registeredSession;
        let meeting;

        async function handleFailure(error) {
            const released = await releaseUnissuedReservation(
                registeredSession,
                error?.code === 'PERSISTENCE_UNAVAILABLE' ? 'persistence_failure' : 'provider_failure'
            );
            if (error?.code === 'PERSISTENCE_UNAVAILABLE' || released.persistenceUnavailable) {
                logger.error({
                    event: 'video_token_persistence_failed',
                    roomId: normalizedRoom,
                    error: error?.cause?.message || error?.message
                });
                sendVideoError(res, 503, 'PERSISTENCE_UNAVAILABLE');
                return;
            }
            realtimeKitProviderAvailable = false;
            logger.warn({
                event: 'video_token_rejected',
                reason: 'VIDEO_PROVIDER_UNAVAILABLE',
                provider: roomVideoProvider,
                roomId: normalizedRoom,
                activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
                message: error.message
            });
            sendVideoError(res, error.status || 502, 'VIDEO_PROVIDER_UNAVAILABLE');
        }

        async function prepare() {
            if (!membershipRemainsValid()) {
                sendVideoError(res, 403, 'ROOM_MEMBERSHIP_REQUIRED');
                return false;
            }
            if (!realtimeKitProviderAvailable) {
                sendVideoError(res, 503, 'VIDEO_PROVIDER_UNAVAILABLE');
                return false;
            }

            try {
                if (!await refreshExpiredRoomMeetingIfIdle(normalizedRoom, room)) {
                    sendVideoError(
                        res,
                        realtimeKitProviderAvailable ? 409 : 503,
                        realtimeKitProviderAvailable ? 'ROOM_DURATION_LIMIT_REACHED' : 'VIDEO_PROVIDER_UNAVAILABLE'
                    );
                    return false;
                }
            } catch (error) {
                if (error?.code === 'PERSISTENCE_UNAVAILABLE') {
                    sendVideoError(res, 503, 'PERSISTENCE_UNAVAILABLE');
                    return false;
                }
                throw error;
            }
            if (!membershipRemainsValid()) {
                sendVideoError(res, 403, 'ROOM_MEMBERSHIP_REQUIRED');
                return false;
            }

            try {
                registeredSession = videoSessionRegistry.reserveVideoSession({
                    roomId: normalizedRoom,
                    userId,
                    socketId: member.socketId,
                    requestIpKey: requestIpKey(requestIp),
                    provider: roomVideoProvider,
                    providerMeetingId: room.videoProviderMeetingId,
                    displayName,
                    role,
                    maxGlobalParticipants: config.video.maxGlobalParticipants,
                    maxRoomParticipants: roomParticipantCap,
                    maxIpParticipants: MAX_IP_VIDEO_PARTICIPANTS
                });
            } catch (error) {
                const errorCode = [
                    'VIDEO_SESSION_ALREADY_ACTIVE',
                    'GLOBAL_VIDEO_LIMIT_REACHED',
                    'ROOM_FULL',
                    'IP_VIDEO_LIMIT_REACHED'
                ].includes(error?.code)
                    ? error.code
                    : 'VIDEO_REQUEST_INVALID';
                logger.warn({
                    event: 'video_token_rejected',
                    reason: errorCode,
                    roomId: normalizedRoom,
                    activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
                    activeRoomVideoParticipants: videoSessionRegistry.countActiveRoomVideoParticipants(normalizedRoom)
                });
                sendVideoError(res, errorCode === 'VIDEO_REQUEST_INVALID' ? 400 : 409, errorCode);
                return false;
            }

            try {
                meeting = await ensureRealtimeKitMeeting(normalizedRoom, room);
                videoSessionRegistry.updateVideoSession({ videoSessionId: registeredSession.videoSessionId }, {
                    providerMeetingId: meeting.meetingId
                });
                if (!membershipRemainsValid()) {
                    const released = await releaseUnissuedReservation(
                        registeredSession,
                        'membership_revoked_before_token'
                    );
                    sendVideoError(
                        res,
                        released.persistenceUnavailable ? 503 : 403,
                        released.persistenceUnavailable ? 'PERSISTENCE_UNAVAILABLE' : 'ROOM_MEMBERSHIP_REQUIRED'
                    );
                    return false;
                }
                return true;
            } catch (error) {
                await handleFailure(error);
                return false;
            }
        }

        function issueProviderToken() {
            const presetName = role === 'viewer'
                ? config.video.viewerPresetName
                : config.video.defaultPresetName;
            return videoProvider.createParticipantToken({
                roomId: normalizedRoom,
                meetingId: meeting.meetingId,
                userId: registeredSession.videoSessionId,
                displayName,
                presetName
            });
        }

        async function finalize(tokenPayload) {
            try {
                // A switch or closure may have retired the pending reservation
                // while the provider request was in flight. Attaching the late
                // participant identity re-opens only its cleanup tombstone.
                videoSessionRegistry.updateVideoSession({ videoSessionId: registeredSession.videoSessionId }, {
                    providerMeetingId: tokenPayload.meetingId,
                    providerParticipantId: tokenPayload.participantId,
                    lastSeenAt: Date.now()
                });
                // This is the acknowledgement boundary: the provider participant
                // and its revocation metadata must be durable before its reusable
                // auth token can leave the process.
                await persistVideoSessionsImmediate();
                if (!membershipRemainsValid()) {
                    const released = await releaseUnissuedReservation(
                        registeredSession,
                        'membership_revoked_before_response'
                    );
                    sendVideoError(
                        res,
                        released.persistenceUnavailable ? 503 : 403,
                        released.persistenceUnavailable ? 'PERSISTENCE_UNAVAILABLE' : 'ROOM_MEMBERSHIP_REQUIRED'
                    );
                    return;
                }
                emitVideoCapacity(normalizedRoom);
                logger.info({
                    event: 'video_token_issued',
                    provider: roomVideoProvider,
                    roomId: normalizedRoom,
                    userId,
                    videoSessionId: registeredSession.videoSessionId,
                    activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
                    activeRoomVideoParticipants: videoSessionRegistry.countActiveRoomVideoParticipants(normalizedRoom)
                });

                res.json({
                    ok: true,
                    provider: roomVideoProvider,
                    roomId: normalizedRoom,
                    role,
                    videoSessionId: registeredSession.videoSessionId,
                    meetingId: tokenPayload.meetingId,
                    participantId: tokenPayload.participantId,
                    authToken: tokenPayload.authToken,
                    expiresAt: tokenPayload.expiresAt || null,
                    policy: getClientVideoPolicy(room)
                });
            } catch (error) {
                await handleFailure(error);
            }
        }

        return {
            prepare,
            issueProviderToken,
            finalize,
            handleFailure
        };
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
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Halastudy-Membership');
                res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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

    function securityHeaders(_req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', contentSecurityPolicy);
        res.setHeader('Permissions-Policy', permissionsPolicy);
        next();
    }

    function sessionMiddleware(req, res, next) {
        const cookies = parseCookies(req.headers.cookie || '');
        // Only trust a session id the server itself signed; a forged/bare value
        // verifies to null and we mint a fresh signed one.
        let sessionId = verifyAnonSessionToken(cookies[SESSION_COOKIE_NAME], { secret: config.sessionSecret });
        if (!sessionId) {
            sessionId = rotateAnonymousIdentity(req, res);
        }
        req.sessionId = sessionId;
        next();
    }

    function evaluateReadiness({ logFailures = false } = {}) {
        const checks = {
            roomStore: readinessState.roomStore,
            userStore: readinessState.userStore,
            videoSessionStore: readinessState.videoSessionStore,
            // @ts-expect-error internal socket.io flag for closed state
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

    function seedLobbyRoom() {
        // Ensure the reserved public Lobby always exists (fresh boot or after a
        // persisted snapshot that predates it). ensureRoom is idempotent and
        // clears any cleanup timer; the RealtimeKit meeting is still created
        // lazily on first video-token request.
        const lobby = ensureRoom(LOBBY_ROOM_CODE, { name: LOBBY_ROOM_NAME });
        if (lobby) {
            lobby.name = LOBBY_ROOM_NAME;
            clearRoomCleanupTimer(lobby);
        }
        return lobby;
    }

    let loadedRoomCount = 0;
    let loadedUserCount = 0;
    let initialized = false;
    let initializationPromise = null;
    let videoSweepTimer = null;
    let videoReconcileTimer = null;
    let videoCleanupRetryTimer = null;
    let roomCleanupRetryTimer = null;
    let roomEventDrainTimer = null;
    let runtimeWorkersStarted = false;

    function resetHydratedRuntimeState() {
        readinessState.roomStore = false;
        readinessState.userStore = false;
        readinessState.videoSessionStore = false;
        for (const room of rooms.values()) clearRoomCleanupTimer(room);
        rooms.clear();
        users.clear();
        usersByEmail.clear();
        videoSessionRegistry.hydratePersistentState({ schemaVersion: 1, sessions: [] });
        loadedRoomCount = 0;
        loadedUserCount = 0;
    }

    async function hydratePersistenceState() {
        const results = await Promise.allSettled([
            Promise.resolve().then(() => realtimeKitWebhookDeduplicator.initialize()),
            Promise.resolve().then(async () => {
                const state = await videoSessionStore.initialize();
                const count = videoSessionRegistry.hydratePersistentState(state);
                readinessState.videoSessionStore = true;
                return count;
            }),
            Promise.resolve().then(() => {
                const count = loadPersistedRooms();
                seedLobbyRoom();
                return count;
            }),
            Promise.resolve().then(() => loadPersistedUsers())
        ]);
        const rejected = results.find((result) => result.status === 'rejected');
        if (rejected) throw rejected.reason;
        const roomResult = results[2];
        const userResult = results[3];
        if (roomResult.status !== 'fulfilled' || userResult.status !== 'fulfilled') {
            throw new Error('Persistence hydration did not complete.');
        }
        loadedRoomCount = roomResult.value;
        loadedUserCount = userResult.value;
    }

    function initialize() {
        if (!initializationPromise) {
            initializationPromise = (async () => {
                for (let attempt = 0; ; attempt += 1) {
                    resetHydratedRuntimeState();
                    try {
                        await hydratePersistenceState();
                        break;
                    } catch (error) {
                        resetHydratedRuntimeState();
                        if (attempt >= startupBackoffMs.length) throw error;
                        logger.warn({
                            event: 'startup_hydration_retry',
                            attempt: attempt + 1,
                            retryAfterMs: startupBackoffMs[attempt],
                            error: error?.message
                        });
                        await sleep(startupBackoffMs[attempt]);
                    }
                }
                await reconcileRealtimeKitMeetings();
                initialized = true;
                return { loadedRoomCount, loadedUserCount };
            })();
        }
        return initializationPromise;
    }

    function startRuntimeWorkers() {
        if (runtimeWorkersStarted) return;
        runtimeWorkersStarted = true;
        backupScheduler.start();
        videoSweepTimer = setInterval(() => {
            const changed = videoSessionRegistry.sweepStaleVideoSessions();
            if (!changed.length) return;
            void persistVideoSessionsImmediate()
                .then(() => Promise.all(changed
                    .filter((session) => session.cleanupPending)
                    .map((session) => requestProviderSessionEnd(
                        session,
                        session.endingReason || 'pending_reservation_expired'
                    ))))
                .then(() => emitEndedVideoSessions(changed.filter((session) => session.state === 'ended')))
                .catch((error) => logger.error({
                    event: 'video_session_sweep_persist_failed',
                    error: error?.cause?.message || error?.message
                }));
        }, VIDEO_SESSION_SWEEP_MS);
        videoSweepTimer.unref();
        if (config.video.provider === VIDEO_PROVIDER_REALTIMEKIT) {
            videoReconcileTimer = setInterval(() => {
                void reconcileRealtimeKitMeetings();
            }, VIDEO_RECONCILE_MS);
            videoReconcileTimer.unref();
            videoCleanupRetryTimer = setInterval(() => {
                void retryPendingProviderSessionCleanup().then((succeeded) => {
                    if (!succeeded) realtimeKitProviderAvailable = false;
                });
            }, VIDEO_CLEANUP_RETRY_MS);
            videoCleanupRetryTimer.unref();
        }
        const retryPendingClosures = () => {
            for (const room of rooms.values()) {
                if (!roomIsClosed(room) || !room.cleanupPending) continue;
                void closeRoomLifecycle(room.id, { reason: room.closureReason || 'cleanup_retry' })
                    .catch((error) => logger.warn({
                        event: 'room_cleanup_retry_failed',
                        roomId: room.id,
                        error: error?.message
                    }));
            }
        };
        retryPendingClosures();
        roomCleanupRetryTimer = setInterval(retryPendingClosures, ROOM_CLEANUP_RETRY_MS);
        roomCleanupRetryTimer.unref();
        if (typeof userStore.logRoomEvent === 'function') {
            roomEventDrainTimer = setInterval(() => {
                void drainRoomEvents().catch((error) => logger.warn({
                    event: 'room_event_outbox_drain_failed',
                    pending: getRoomEventOutbox().length,
                    error: error?.message
                }));
            }, ROOM_EVENT_DRAIN_RETRY_MS);
            roomEventDrainTimer.unref();
        }
    }

    let isShuttingDown = false;
    let inFlightMutations = 0;
    const drainWaiters = new Set();

    function finishMutation() {
        inFlightMutations = Math.max(0, inFlightMutations - 1);
        if (inFlightMutations !== 0) return;
        for (const resolve of drainWaiters) resolve();
        drainWaiters.clear();
    }

    function waitForMutationDrain() {
        if (inFlightMutations === 0) return Promise.resolve();
        return new Promise((resolve) => drainWaiters.add(resolve));
    }

    async function waitForVideoCleanupDrain() {
        while (videoCleanupLocks.size > 0) {
            await Promise.allSettled(Array.from(videoCleanupLocks.values()));
        }
    }

    function mutationDrainMiddleware(req, res, next) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            next();
            return;
        }
        if (isShuttingDown) {
            res.status(503).json({ errorCode: 'SERVER_SHUTTING_DOWN' });
            return;
        }
        inFlightMutations += 1;
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            finishMutation();
        };
        res.once('finish', finish);
        res.once('close', finish);
        next();
    }

    async function flushRoomStateAndExit(signal) {
        if (isShuttingDown) return;
        isShuttingDown = true;
        const hardExitTimer = setTimeout(() => {
            console.error('Graceful shutdown exceeded 15 seconds.');
            process.exit(1);
        }, 15_000);
        if (videoSweepTimer) clearInterval(videoSweepTimer);
        if (videoReconcileTimer) clearInterval(videoReconcileTimer);
        if (videoCleanupRetryTimer) clearInterval(videoCleanupRetryTimer);
        if (roomCleanupRetryTimer) clearInterval(roomCleanupRetryTimer);
        if (roomEventDrainTimer) clearInterval(roomEventDrainTimer);
        backupScheduler.stop();
        console.log(`Received ${signal}. Draining mutations and persisting state...`);
        const serverClosed = new Promise((resolve) => {
            if (!server.listening) {
                resolve();
                return;
            }
            server.close(() => resolve());
        });
        await waitForMutationDrain();
        await new Promise((resolve) => io.close(() => resolve()));
        await waitForVideoCleanupDrain();
        if (typeof videoProvider.close === 'function') {
            try {
                await videoProvider.close();
            } catch (error) {
                logger.warn({ event: 'video_provider_shutdown_failed', error: error?.message });
            }
        }
        const flushResults = await Promise.allSettled([
            roomStore.flush(rooms),
            userStore.flush(users),
            videoSessionStore.flush(videoSessionRegistry.exportPersistentState())
        ]);
        let exitCode = 0;
        flushResults.forEach((result) => {
            if (result.status === 'rejected') {
                exitCode = 1;
                console.error('Final state flush failed:', result.reason);
            }
        });
        await serverClosed;
        clearTimeout(hardExitTimer);
        process.exit(exitCode);
    }

    if (options.registerSignalHandlers !== false) {
        process.once('SIGINT', () => {
            void flushRoomStateAndExit('SIGINT');
        });

        process.once('SIGTERM', () => {
            void flushRoomStateAndExit('SIGTERM');
        });
    }

    app.use(securityHeaders);
    app.use(originGuard);
    app.post(
        '/api/webhooks/realtimekit',
        express.raw({ type: 'application/json', limit: WEBHOOK_BODY_LIMIT }),
        mutationDrainMiddleware,
        async (req, res) => {
            const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
            const signatureHeader = req.headers['rtk-signature'];
            const deliveryHeader = req.headers['rtk-uuid'];
            const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
            const deliveryId = Array.isArray(deliveryHeader) ? deliveryHeader[0] : deliveryHeader;
            const publicKey = videoProvider.getWebhookPublicKey?.();

            if (!publicKey || !realtimeKitProviderInitialized) {
                res.status(503).json({ errorCode: 'WEBHOOK_UNAVAILABLE' });
                return;
            }
            if (!rawBody || !verifyRealtimeKitWebhookSignature({ publicKey, signature, rawBody })) {
                res.status(401).json({ errorCode: 'WEBHOOK_SIGNATURE_INVALID' });
                return;
            }

            let event;
            try {
                event = JSON.parse(rawBody.toString('utf8'));
            } catch (_error) {
                res.status(400).json({ errorCode: 'WEBHOOK_EVENT_INVALID' });
                return;
            }

            try {
                const outcome = await realtimeKitWebhookDeduplicator.runOnce(deliveryId, async () => {
                    const processed = processRealtimeKitWebhook({
                        event,
                        rooms,
                        registry: videoSessionRegistry
                    });
                    // Accept the provider delivery only after its state
                    // transition is durable; a failed write leaves the UUID
                    // unconsumed so RealtimeKit can retry it.
                    await persistVideoSessionsImmediate();
                    return processed;
                });
                const result = outcome.result;
                const cleanupSessions = result?.cleanupSessions || (
                    result?.endingSession ? [result.endingSession] : []
                );
                for (const cleanupSession of cleanupSessions) {
                    const cleanup = await requestProviderSessionEnd(
                        cleanupSession,
                        cleanupSession.endingReason || 'provider_event_revocation'
                    );
                    if (cleanup.cleanupPending || cleanup.persistenceUnavailable) {
                        realtimeKitProviderAvailable = false;
                    }
                }
                if (result?.endedSessions?.length) {
                    emitEndedVideoSessions(result.endedSessions);
                } else if (result?.changed && result.roomId) {
                    emitVideoCapacity(result.roomId);
                }
                res.json({
                    ok: true,
                    duplicate: outcome.duplicate,
                    handled: outcome.duplicate ? true : !!result?.handled
                });
            } catch (error) {
                if (['WEBHOOK_DELIVERY_ID_INVALID', 'WEBHOOK_EVENT_INVALID'].includes(error?.code)) {
                    res.status(400).json({ errorCode: error.code });
                    return;
                }
                if (error?.code === 'WEBHOOK_DEDUP_CAPACITY_EXHAUSTED') {
                    res.status(503).json({ errorCode: error.code });
                    return;
                }
                if (error?.code === 'PERSISTENCE_UNAVAILABLE') {
                    res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
                    return;
                }
                logger.error({
                    event: 'realtimekit_webhook_failed',
                    deliveryId: typeof deliveryId === 'string' ? deliveryId.slice(0, 128) : null,
                    error: error?.message
                });
                res.status(500).json({ errorCode: 'WEBHOOK_PROCESSING_FAILED' });
            }
        }
    );
    app.use(express.json());
    app.use(sessionMiddleware);
    app.use(attachUser);
    app.use(mutationDrainMiddleware);
    app.get([...COMPRESSED_AMBIENT_AUDIO_ALIASES.keys()], (req, res) => {
        const fileName = COMPRESSED_AMBIENT_AUDIO_ALIASES.get(req.path.toLowerCase());
        if (!fileName) {
            res.status(404).end();
            return;
        }
        res.type('audio/mpeg');
        res.sendFile(path.join(__dirname, 'audio', fileName), {
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
    });
    app.use('/audio', express.static(path.join(__dirname, 'audio'), { maxAge: '7d' }));
    app.use('/images', express.static(path.join(__dirname, 'images'), { maxAge: '1d' }));
    // Raw source footage lives beside the published clips (gitignored, but
    // present on rsync-style deploys) — never serve it.
    app.use('/videos/hero/source', (_req, res) => res.status(404).end());
    app.use('/videos', express.static(path.join(__dirname, 'videos'), { maxAge: '1d' }));
    app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '1h' }));
    // The pages only need the stylesheets; the rest of design-system/ is
    // internal documentation and must not be publicly fetchable.
    app.use('/design-system', (req, res, next) => {
        if (req.path.endsWith('.css')) return next();
        res.status(404).end();
    }, express.static(path.join(__dirname, 'design-system'), { maxAge: '1d' }));

    app.use('/api', createAuthRouter({
        users,
        usersByEmail,
        rooms,
        rateLimiters,
        applyHttpRateLimit,
        getRequestIp,
        publicUser,
        setAuthCookie,
        clearAuthCookie,
        rotateAnonymousIdentity,
        appendSetCookie,
        parseCookies,
        oauthSecurity,
        persistUser: persistUserImmediate,
        deleteUser: deleteUserImmediate,
        onUserDeleted: cascadeDeletedUser,
        onSessionLogout: disconnectAuthenticatedBrowserSessionSockets,
        persistFocusCompletion: persistFocusCompletionImmediate,
        runUserMutation,
        flushUsers: () => userStore.flush(users),
        requireUser,
        // Analytics event log (Supabase only) — powers user + admin dashboards.
        logFocusSession: typeof userStore.logFocusSession === 'function'
            ? (payload) => userStore.logFocusSession(payload)
            : null,
        logger
    }));

    // Google OAuth (only mounts real handlers when GOOGLE_* env is set; every
    // route 404s otherwise, exactly like an unknown path).
    app.use('/', createGoogleAuthRouter({
        config: config.google,
        users,
        usersByEmail,
        rateLimiters,
        applyHttpRateLimit,
        getRequestIp,
        setAuthCookie,
        appendSetCookie,
        parseCookies,
        persistUser: persistUserImmediate,
        runUserMutation,
        runGoogleSubjectMutation,
        sessionSecret: config.sessionSecret,
        oauthSecurity,
        logger
    }));

    app.get('/manifest.webmanifest', (_req, res) => {
        res.type('application/manifest+json');
        res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest'));
    });

    app.get('/service-worker.js', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Service-Worker-Allowed', '/');
        res.type('text/javascript');
        res.sendFile(path.join(__dirname, 'public', 'js', 'service-worker.js'));
    });

    app.get('/api/health', (_req, res) => {
        res.json({
            status: 'ok',
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            mode: config.mode,
            version: APP_VERSION
        });
    });

    app.get('/api/ready', (_req, res) => {
        const readiness = evaluateReadiness({ logFailures: true });
        res.status(readiness.ready ? 200 : 503).json({
            status: readiness.ready ? 'ready' : 'not_ready',
            checks: readiness.checks
        });
    });

    // Coarse public metrics for uptime monitors — no per-room or per-user
    // detail (that lives behind the admin API).
    app.get('/api/metrics', (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.metrics, getRequestIp(req))) return;
        let participantCount = 0;
        for (const room of rooms.values()) {
            participantCount += room.users ? room.users.size : 0;
        }
        res.json({
            status: 'ok',
            uptimeSeconds: Math.round(process.uptime()),
            roomCount: rooms.size,
            participantCount,
            activeVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
            videoSessionCounts: videoSessionRegistry.getVideoSessionCounts(),
            realtimeKitProviderAvailable,
            realtimeKitWebhookDedupEntries: realtimeKitWebhookDeduplicator.entries.size,
            compatibilityTelemetry: compatibilityTelemetry.snapshot(),
            memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
            mode: config.mode
        });
    });

    app.get('/api/runtime-config', (_req, res) => {
        res.json({
            iceServers: cloneIceServerList(config.runtimeIceServers),
            sfuBaseUrl: config.sfuBaseUrl,
            sfuAvailable: config.sfuAvailable,
            supportedMediaModes: [...config.supportedMediaModes],
            meshParticipantLimit: config.meshParticipantLimit,
            videoProvider: config.video.provider,
            devMeshEnabled: config.video.devMeshEnabled === true,
            videoPolicy: getClientVideoPolicy(null),
            activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
            maxGlobalVideoParticipants: config.video.maxGlobalParticipants,
            videoJoinDisabled: isVideoJoinDisabled(),
            publicApiBaseUrl: config.video.publicApiBaseUrl,
            googleAuthEnabled: config.google.enabled
        });
    });

    app.post('/api/rooms/:roomId/video-token', async (req, res) => {
        const { roomId } = req.params;
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.videoToken, requestIp)) {
            return;
        }

        const normalizedRoom = normalizeRoom(roomId);
        const room = rooms.get(normalizedRoom);
        if (!normalizedRoom || !room || roomIsClosed(room)) {
            sendVideoError(res, 404, 'ROOM_NOT_FOUND');
            return;
        }

        const displayName = sanitizeNickname(req.body?.displayName);
        const rawRole = typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : '';
        const legacyClientSessionIdPresent = Object.hasOwn(req.body || {}, 'clientSessionId');
        // 'student' is the legacy publisher role sent by normal mesh/private rooms
        // and stays a publisher. The Lobby sends explicit 'viewer' | 'publisher'.
        let role;
        if (rawRole === 'viewer') {
            role = 'viewer';
        } else if (rawRole === 'publisher' || rawRole === 'student' || rawRole === '') {
            role = 'publisher';
        } else {
            role = null;
        }

        if (!displayName || !role) {
            sendVideoError(res, 400, 'VIDEO_REQUEST_INVALID');
            return;
        }
        if (isVideoJoinDisabled()) {
            logger.warn({
                event: 'video_token_rejected',
                reason: 'VIDEO_JOIN_DISABLED',
                roomId: normalizedRoom,
                activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants()
            });
            sendVideoError(res, 503, 'VIDEO_JOIN_DISABLED');
            return;
        }

        applyRoomVideoDefaults(room);
        const roomVideoProvider = getRoomVideoProvider(room);
        if (roomVideoProvider !== VIDEO_PROVIDER_REALTIMEKIT) {
            sendVideoError(res, 409, 'VIDEO_PROVIDER_UNAVAILABLE');
            return;
        }

        const resolvedMembership = resolveRoomMembership(req, room, normalizedRoom);
        if (!resolvedMembership || resolvedMembership.member.name !== displayName) {
            sendVideoError(res, 403, 'ROOM_MEMBERSHIP_REQUIRED');
            return;
        }
        if (legacyClientSessionIdPresent) {
            compatibilityTelemetry.record('video_token_client_session_id');
        }
        if (rawRole === 'student') {
            compatibilityTelemetry.record('video_token_student_role');
        }
        const { member } = resolvedMembership;

        // The Lobby is public: anyone may watch (viewer preset), but going on
        // camera (publisher preset) requires a signed-in, ban-able account.
        const authedUser = resolveUserFromToken(parseCookies(req.headers.cookie || '')[AUTH_COOKIE_NAME]);
        if (isLobbyRoom(room) && role === 'publisher' && !authedUser) {
            sendVideoError(res, 403, 'AUTH_REQUIRED');
            return;
        }
        if (!realtimeKitProviderAvailable) {
            sendVideoError(res, 503, 'VIDEO_PROVIDER_UNAVAILABLE');
            return;
        }
        const tokenOperation = createRealtimeKitVideoTokenOperation({
            req,
            res,
            room,
            normalizedRoom,
            member,
            requestIp,
            displayName,
            role,
            roomVideoProvider
        });
        const prepared = await runRoomLifecycleOperation(normalizedRoom, tokenOperation.prepare);
        if (!prepared) return;

        let tokenPayload;
        try {
            // Do not hold the lifecycle lock while waiting on the provider.
            // A validated room switch or durable room closure must be able to
            // revoke this pending reservation before any token is acknowledged.
            tokenPayload = await tokenOperation.issueProviderToken();
        } catch (error) {
            await runRoomLifecycleOperation(normalizedRoom, () => tokenOperation.handleFailure(error));
            return;
        }
        await runRoomLifecycleOperation(normalizedRoom, () => tokenOperation.finalize(tokenPayload));
    });

    app.post('/api/rooms/:roomId/video-heartbeat', (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.videoHeartbeat, requestIp)) {
            return;
        }

        const normalizedRoom = normalizeRoom(req.params.roomId);
        const room = rooms.get(normalizedRoom);
        if (!room || roomIsClosed(room)) {
            sendVideoError(res, 404, 'ROOM_NOT_FOUND');
            return;
        }
        const resolvedMembership = resolveRoomMembership(req, room, normalizedRoom);
        if (!resolvedMembership) {
            sendVideoError(res, 403, 'ROOM_MEMBERSHIP_REQUIRED');
            return;
        }
        const videoSessionId = resolveVideoSessionRequestId(
            req,
            normalizedRoom,
            resolvedMembership,
            'video_heartbeat_legacy_shape'
        );
        if (!videoSessionId) {
            sendVideoError(res, 400, 'VIDEO_REQUEST_INVALID');
            return;
        }
        const activeSession = videoSessionRegistry.findSession({ videoSessionId });
        if (!activeSession
            || activeSession.roomId !== normalizedRoom
            || activeSession.socketId !== resolvedMembership.member.socketId
            || activeSession.userId !== resolvedMembership.member.identityId) {
            sendVideoError(res, 403, 'VIDEO_SESSION_FORBIDDEN');
            return;
        }
        const session = videoSessionRegistry.touchVideoSession({ videoSessionId });
        if (!session) {
            sendVideoError(res, 404, 'VIDEO_SESSION_NOT_FOUND');
            return;
        }
        res.json({
            ok: true,
            ...buildVideoCapacityPayload(normalizedRoom)
        });
    });

    app.post('/api/rooms/:roomId/video-leave', async (req, res) => {
        const normalizedRoom = normalizeRoom(req.params.roomId);
        const room = rooms.get(normalizedRoom);
        if (!room || roomIsClosed(room)) {
            sendVideoError(res, 404, 'ROOM_NOT_FOUND');
            return;
        }
        const resolvedMembership = resolveRoomMembership(req, room, normalizedRoom);
        if (!resolvedMembership) {
            sendVideoError(res, 403, 'ROOM_MEMBERSHIP_REQUIRED');
            return;
        }
        const videoSessionId = resolveVideoSessionRequestId(
            req,
            normalizedRoom,
            resolvedMembership,
            'video_leave_legacy_shape'
        );
        if (!videoSessionId) {
            sendVideoError(res, 400, 'VIDEO_REQUEST_INVALID');
            return;
        }
        const activeSession = videoSessionRegistry.findSession({ videoSessionId });
        if (!activeSession
            || activeSession.roomId !== normalizedRoom
            || activeSession.socketId !== resolvedMembership.member.socketId
            || activeSession.userId !== resolvedMembership.member.identityId) {
            sendVideoError(res, 403, 'VIDEO_SESSION_FORBIDDEN');
            return;
        }
        const ending = videoSessionRegistry.markVideoSessionEnding({ videoSessionId }, 'client_leave');
        const providerResult = await requestProviderSessionEnd(ending, 'client_leave');
        emitVideoCapacity(normalizedRoom);
        if (providerResult.persistenceUnavailable) {
            sendVideoError(res, 503, 'PERSISTENCE_UNAVAILABLE');
            return;
        }
        res.json({
            ok: true,
            cleanupPending: providerResult.cleanupPending,
            ...buildVideoCapacityPayload(normalizedRoom)
        });
    });

    app.delete('/api/rooms/:roomId', requireUser, async (req, res) => {
        const normalizedRoom = normalizeRoom(req.params.roomId);
        const room = rooms.get(normalizedRoom);
        if (!room || roomIsClosed(room) || isLobbyRoom(room)) {
            res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
            return;
        }
        if (!room.ownerUserId || room.ownerUserId !== req.user.id) {
            res.status(403).json({ errorCode: 'ROOM_OWNER_REQUIRED' });
            return;
        }
        try {
            const result = await closeRoomLifecycle(normalizedRoom, {
                reason: 'owner_delete',
                actorUserId: req.user.id
            });
            if (!result) {
                res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
                return;
            }
            res.json(result);
        } catch (error) {
            if (error?.code === 'PERSISTENCE_UNAVAILABLE') {
                res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
                return;
            }
            logger.error({ event: 'owner_room_delete_failed', roomId: normalizedRoom, error: error?.message });
            res.status(500).json({ errorCode: 'ROOM_DELETE_FAILED' });
        }
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

        const normalizedRoom = normalizeRoom(roomId);
        const room = rooms.get(normalizedRoom);
        if (!room || roomIsClosed(room)) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        if (Number.isFinite(room.expiresAt) && room.expiresAt <= Date.now()) {
            void closeRoomLifecycle(normalizedRoom, { reason: 'expired' }).catch((error) => {
                logger.error({ event: 'expired_room_close_failed', roomId: normalizedRoom, error: error?.message });
            });
            res.status(404).json({ error: 'Room not found' });
            return;
        }

        // Protected rooms leak nothing before a verified, password-gated join.
        if (room.requirePassword) {
            res.json(roomPreview(normalizedRoom, room));
            return;
        }

        res.json(roomSnapshot(roomId));
    });

    app.get('/', (_req, res) => {
        res.sendFile(path.join(__dirname, 'landing.html'));
    });

    app.get(['/open.html', '/open'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'open.html'));
    });

    app.get(['/privacy.html', '/privacy'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'privacy.html'));
    });

    app.get(['/terms.html', '/terms'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'terms.html'));
    });

    app.get(['/blog.html', '/blog'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'blog.html'));
    });

    // Individual blog posts — explicit slug→file map (no dynamic path lookup, so
    // no traversal surface). Add a line here per new article.
    app.get('/blog/best-online-group-study-rooms-saudi', (_req, res) => {
        res.sendFile(path.join(__dirname, 'blog-best-study-rooms.html'));
    });
    app.get('/blog/study-with-me-online-arabic', (_req, res) => {
        res.sendFile(path.join(__dirname, 'blog-study-with-me.html'));
    });

    app.get(['/account.html', '/account'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'account.html'));
    });

    app.get(['/index.html', '/study', '/workspace', '/room'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    app.get(['/lobby', '/lobby.html'], (_req, res) => {
        res.sendFile(path.join(__dirname, 'lobby.html'));
    });

    if (config.admin.enabled) {
        app.use(config.admin.path, createAdminRouter({
            config,
            rooms,
            users,
            io,
            rateLimiters,
            applyHttpRateLimit,
            getRequestIp,
            runtimeFlags,
            isVideoJoinDisabled,
            errorBuffer,
            backupScheduler,
            videoSessionRegistry,
            announcementState,
            buildScheduleSummary,
            closeRoom: closeRoomLifecycle,
            revokeSocketVideoSessions,
            persistUser: persistUserImmediate,
            runUserMutation,
            persistRoomsSoon,
            dashboard: typeof userStore.readAdminOverview === 'function'
                ? {
                    overview: () => userStore.readAdminOverview(),
                    userStats: () => userStore.readUserStats(),
                    dailyActive: () => userStore.readDailyActive()
                }
                : null,
            logger
        }));
    }

    // Announcement is also surfaced to pages that poll runtime config.
    app.get('/api/announcement', (_req, res) => {
        res.json({ ok: true, announcement: getActiveAnnouncement() });
    });

    // ---- Terminal handlers: keep these registered after every route ----
    app.use((req, res) => {
        if (req.path.startsWith('/api')) {
            res.status(404).json({ errorCode: 'NOT_FOUND' });
            return;
        }
        res.status(404).sendFile(path.join(__dirname, '404.html'));
    });

    // Express identifies error middleware by arity — the 4th param must stay.
    app.use((err, req, res, _next) => {
        const status = err?.type === 'entity.too.large'
            ? 413
            : err?.status === 400
                ? 400
                : 500;
        logger.error({
            event: 'unhandled_request_error',
            method: req.method,
            path: req.path,
            message: err?.message
        });
        if (res.headersSent) return;
        res.status(status).json({
            errorCode: status === 413
                ? 'REQUEST_TOO_LARGE'
                : status === 400
                    ? 'BAD_REQUEST'
                    : 'INTERNAL_ERROR'
        });
    });

    io.on('connection', (socket) => {
        const auth = socket.handshake?.auth;
        const handshakeClientId = normalizeClientId(auth?.clientId);
        const signedSessionId = getSessionIdFromSocket(socket);
        const sessionId = signedSessionId || crypto.randomUUID();
        const ip = getSocketRequestIp(socket.request, config.trustProxy);

        // Same-origin pages send cookies on the Socket.IO handshake, so a
        // signed-in browser gets its account attached to the socket.
        const handshakeCookies = parseCookies(socket.handshake?.headers?.cookie || '');
        // Account-authorized sockets must be bound to a server-signed browser
        // session. An auth cookie copied without that companion cookie remains
        // usable for HTTP reauthentication but cannot create an unrevokable
        // long-lived socket.
        const authedUser = signedSessionId
            ? resolveUserFromToken(handshakeCookies[AUTH_COOKIE_NAME])
            : null;

        socket.data.sessionId = sessionId;
        socket.data.clientId = handshakeClientId || sessionId;
        socket.data.ip = ip;
        socket.data.userId = authedUser ? authedUser.id : null;
        socket.data.identityId = authedUser ? `user:${authedUser.id}` : `anon:${sessionId}`;
        socket.data.membershipToken = null;
        socket.data.connectionGeneration = 0;

        // Late joiners still see an active admin broadcast.
        const currentAnnouncement = getActiveAnnouncement();
        if (currentAnnouncement) {
            socket.emit('announcement', currentAnnouncement);
        }

        function getSocketUser() {
            if (!socket.data.userId) return null;
            const user = users.get(socket.data.userId);
            return user && !user.banned ? user : null;
        }

        function getAuthenticatedSocketUser(socketRef) {
            const userId = socketRef?.data?.userId;
            if (!userId) return null;
            const user = users.get(userId);
            return user && !user.banned ? user : null;
        }

        function resolveMeshSignalRoom(ack) {
            if (config.video.devMeshEnabled !== true || config.video.provider !== VIDEO_PROVIDER_MESH) {
                ackError(ack, 'MESH_SIGNALING_DISABLED');
                return null;
            }
            if (!getSocketUser()) {
                ackError(ack, 'AUTH_REQUIRED');
                return null;
            }
            const roomId = socket.data.roomId;
            const room = roomId ? rooms.get(roomId) : null;
            if (!room?.users.has(socket.id)) {
                ackError(ack, 'ROOM_NOT_JOINED');
                return null;
            }
            if (!roomSupportsDevMeshSignaling(room)) {
                ackError(ack, 'MESH_SIGNALING_DISABLED');
                return null;
            }
            return room;
        }

        function resolveAuthenticatedMeshTarget(room, targetId) {
            if (!targetId || targetId === socket.id || !room.users.has(targetId)) return null;
            const targetSocket = io.sockets.sockets.get(targetId);
            if (!targetSocket || targetSocket.data.roomId !== room.id) return null;
            return getAuthenticatedSocketUser(targetSocket) ? targetSocket : null;
        }

        function emitToAuthenticatedMeshRoom(room, eventName, payload) {
            for (const targetId of room.users.keys()) {
                const targetSocket = io.sockets.sockets.get(targetId);
                if (targetSocket && getAuthenticatedSocketUser(targetSocket)) {
                    targetSocket.emit(eventName, payload);
                }
            }
        }

        function onRequest(eventName, handler) {
            socket.on(eventName, (payload, ack) => {
                const hasAck = typeof ack === 'function';
                let acknowledged = false;
                const safeAck = (response) => {
                    if (!hasAck || acknowledged) return;
                    acknowledged = true;
                    ack(response);
                };
                const fail = (errorCode) => {
                    const response = { ok: false, errorCode };
                    if (hasAck) safeAck(response);
                    else socket.emit('request-error', response);
                };

                if (!validateSocketRequest(eventName, payload)) {
                    fail('REQUEST_INVALID');
                    return;
                }

                if (isShuttingDown) {
                    fail('SERVER_SHUTTING_DOWN');
                    return;
                }

                const runHandler = () => handler(payload, safeAck);
                const runSerializedHandler = eventName === 'join-room'
                    ? () => runSocketMembershipOperation(socket.id, () => {
                        const requestedRoom = typeof payload.roomId === 'string'
                            ? normalizeRoom(payload.roomId)
                            : '';
                        return runRoomLifecycleOperations(
                            [socket.data.roomId || '', requestedRoom],
                            runHandler
                        );
                    })
                    : runHandler;

                inFlightMutations += 1;
                Promise.resolve()
                    .then(runSerializedHandler)
                    .catch((error) => {
                        logger.error({
                            event: 'socket_request_failed',
                            socketEvent: eventName,
                            message: error?.message
                        });
                        if (!acknowledged) fail('INTERNAL_ERROR');
                    })
                    .finally(finishMutation);
            });
        }

        onRequest('create-room', async (payload, ack) => {
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
            // Scheduled rooms attach attendance/streak commitments — those need
            // a real account. Instant rooms stay guest-open.
            if (schedule && !getSocketUser()) {
                return ackError(ack, 'AUTH_REQUIRED_FOR_SCHEDULED');
            }
            const creator = getSocketUser();

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

            const createdRoom = ensureRoom(roomCode, {
                name: cleanName,
                ownerUserId: creator?.id || null,
                requirePassword: shouldProtect,
                passwordHash,
                mediaMode,
                videoProvider: config.video.provider,
                createdAt: Date.now(),
                schedule
            });

            scheduleRoomCleanup(roomCode);
            let stagedCreateEvents = [];
            try {
                stagedCreateEvents = stageRoomLifecycleEvents([
                    buildRoomLifecycleEvent(createdRoom, 'create', {
                        userId: creator?.id || null,
                        occurredAt: createdRoom.createdAt
                    })
                ]);
                // A room code is not usable until the complete room record,
                // including its expiry and lifecycle-event outbox entry, has
                // reached the immediate store.
                await roomStore.flush(rooms);
            } catch (error) {
                unstageRoomLifecycleEvents(stagedCreateEvents);
                clearRoomCleanupTimer(createdRoom);
                rooms.delete(roomCode);
                logger.error({
                    event: 'room_create_persist_failed',
                    roomId: roomCode,
                    error: error?.message
                });
                return ackError(ack, 'PERSISTENCE_UNAVAILABLE');
            }

            if (creator) {
                try {
                    await runUserMutation(creator, async () => {
                        const previousMyRooms = structuredClone(creator.myRooms);
                        recordMyRoom(creator, { roomId: roomCode, name: cleanName, role: 'created' });
                        try {
                            await persistUserImmediate(creator);
                        } catch (error) {
                            creator.myRooms = previousMyRooms;
                            throw error;
                        }
                    });
                } catch (error) {
                    try {
                        await closeRoomLifecycle(roomCode, { reason: 'creator_persistence_failed' });
                    } catch (cleanupError) {
                        logger.error({
                            event: 'room_create_rollback_failed',
                            roomId: roomCode,
                            error: cleanupError?.message
                        });
                    }
                    return ackError(
                        ack,
                        error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED'
                            ? 'AUTH_REQUIRED'
                            : 'PERSISTENCE_UNAVAILABLE'
                    );
                }
            }

            const snapshot = roomSnapshot(roomCode);

            return ack({
                ok: true,
                room: {
                    ...snapshot,
                    code: roomCode
                }
            });
        });

        onRequest('join-room', async (payload, ack) => {
            const { roomId, username, clientId: payloadClientId, password } = payload;
            const joinConnectionGeneration = socket.data.connectionGeneration;
            const joinIsLive = () => (
                socket.connected
                && socket.data.connectionGeneration === joinConnectionGeneration
            );
            const cleanName = sanitizeNickname(username);
            const normalizedRoom = normalizeRoom(roomId);

            // A queued membership operation can begin after its socket has
            // already disconnected. Do not perform even its first mutation.
            if (!joinIsLive()) return;
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
            if (!room || roomIsClosed(room)) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }
            const joinNow = Date.now();
            if (Number.isFinite(room.expiresAt) && room.expiresAt <= joinNow) {
                void closeRoomLifecycle(normalizedRoom, { reason: 'expired' }).catch((error) => {
                    logger.error({ event: 'expired_room_close_failed', roomId: normalizedRoom, error: error?.message });
                });
                return ackError(ack, 'ROOM_EXPIRED');
            }
            if (roomHasSchedule(room) && findOpenOccurrence(room.schedule, joinNow).currentOccurrenceAt === null) {
                return ackError(ack, 'ROOM_SCHEDULE_NOT_OPEN');
            }
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
                    if (!joinIsLive()) return;
                    if (!isValid) {
                        rateLimiters.passwordFailures.consume(passwordFailureKey);
                        return ackError(ack, 'ROOM_PASSWORD_INVALID');
                    }
                    rateLimiters.passwordFailures.reset(passwordFailureKey);
                } catch (err) {
                    if (!joinIsLive()) return;
                    console.error('Password verification failed:', err);
                    return ackError(ack, 'ROOM_PASSWORD_VERIFICATION_FAILED');
                }
            }

            // Preflight the complete target-room transition before mutating the
            // source room. This keeps a failed switch from ejecting the caller.
            const previousRoomId = socket.data.roomId;
            const identityId = socket.data.identityId;
            const identityKey = buildIdentityKey(normalizedRoom, identityId);
            const releasableUsers = new Map();

            if (identityKey) {
                const previousSocketId = room.identities.get(identityKey);
                const previousRecord = previousSocketId ? room.users.get(previousSocketId) : null;
                if (previousSocketId && previousRecord) {
                    releasableUsers.set(previousSocketId, previousRecord);
                }
            }

            const userKey = `${normalizedRoom}:${cleanName}`;
            const pendingTimer = pendingLeaveTimers.get(userKey);
            if (pendingTimer) {
                if (!isSameIdentity(pendingTimer, identityId)) {
                    return ackError(ack, 'USERNAME_TAKEN');
                }
            }

            const matchingUsers = Array.from(room.users.entries()).filter(([, user]) => user.name === cleanName);
            let hasConflict = false;

            matchingUsers.forEach(([existingSocketId, user]) => {
                if (isSameIdentity(user, identityId)) {
                    releasableUsers.set(existingSocketId, user);
                } else {
                    hasConflict = true;
                }
            });

            if (hasConflict) {
                return ackError(ack, 'USERNAME_TAKEN');
            }

            const isRejoin = releasableUsers.size > 0 || !!pendingTimer;
            const projectedTargetSize = room.users.size - releasableUsers.size;

            if (getRoomVideoProvider(room) === VIDEO_PROVIDER_MESH
                && roomUsesMesh(room)
                && !isRejoin
                && projectedTargetSize >= config.meshParticipantLimit) {
                return ackError(ack, 'ROOM_FULL');
            }

            // The Lobby is a big SFU room, not mesh — cap present people (watchers
            // + publishers) at its own limit rather than the mesh 4-cap.
            if (isLobbyRoom(room) && !isRejoin && projectedTargetSize >= LOBBY_PARTICIPANT_LIMIT) {
                return ackError(ack, 'ROOM_FULL');
            }

            const joiningUser = getSocketUser();
            let previousMyRooms = null;
            let joinedRoomMetadataPersisted = false;

            const restorePreviousMyRooms = () => {
                if (!joiningUser || !previousMyRooms) return false;
                const currentRooms = Array.isArray(joiningUser.myRooms)
                    ? joiningUser.myRooms.map((entry) => ({ ...entry }))
                    : [];
                const targetIndex = currentRooms.findIndex((entry) => entry.roomId === normalizedRoom);
                const targetEntry = targetIndex >= 0 ? currentRooms[targetIndex] : null;

                // A newer mutation from another live browser session owns the
                // target entry now. Do not erase or rewind that legitimate join.
                if (!targetEntry || targetEntry.lastJoinedAt !== joinNow) return false;

                const rollbackCapacity = Math.max(previousMyRooms.length, currentRooms.length);
                currentRooms.splice(targetIndex, 1);
                for (const previousEntry of previousMyRooms) {
                    if (!currentRooms.some((entry) => entry.roomId === previousEntry.roomId)) {
                        currentRooms.push({ ...previousEntry });
                    }
                }
                currentRooms.sort((left, right) => right.lastJoinedAt - left.lastJoinedAt);
                currentRooms.length = Math.min(currentRooms.length, rollbackCapacity);
                joiningUser.myRooms = currentRooms;
                return true;
            };

            const rollbackUserRoomMetadata = async () => {
                if (!joiningUser || !previousMyRooms || !joinedRoomMetadataPersisted) return true;
                try {
                    await runUserMutation(joiningUser, async () => {
                        const changed = restorePreviousMyRooms();
                        if (changed) await persistUserImmediate(joiningUser);
                        joinedRoomMetadataPersisted = false;
                    });
                    return true;
                } catch (error) {
                    logger.error({
                        event: 'room_join_user_rollback_failed',
                        roomId: normalizedRoom,
                        userId: joiningUser.id,
                        error: error?.message
                    });
                    return false;
                }
            };

            if (joiningUser) {
                try {
                    await runUserMutation(joiningUser, async () => {
                        previousMyRooms = structuredClone(joiningUser.myRooms);
                        recordMyRoom(joiningUser, {
                            roomId: normalizedRoom,
                            name: room.name,
                            role: 'joined',
                            now: joinNow
                        });
                        try {
                            // Persist account metadata before invalidating the
                            // source membership or any provider credential. A
                            // rejected write therefore leaves both rooms and
                            // the old membership token exactly untouched.
                            await persistUserImmediate(joiningUser);
                            joinedRoomMetadataPersisted = true;
                        } catch (error) {
                            joiningUser.myRooms = previousMyRooms;
                            throw error;
                        }
                    });
                } catch (error) {
                    if (!joinIsLive()) {
                        await rollbackUserRoomMetadata();
                        return;
                    }
                    return ackError(
                        ack,
                        error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED'
                            ? 'AUTH_REQUIRED'
                            : 'PERSISTENCE_UNAVAILABLE'
                    );
                }
                if (!joinIsLive()) {
                    await rollbackUserRoomMetadata();
                    return;
                }
            }

            // Provider credentials are socket-bound just like membership.
            // Revoke them durably before mutating either room so a successful
            // switch/reconnect can never leave a cached provider token usable.
            const socketsWhoseVideoMustBeRevoked = new Set(releasableUsers.keys());
            if (previousRoomId && previousRoomId !== normalizedRoom) {
                socketsWhoseVideoMustBeRevoked.add(socket.id);
            }
            for (const socketId of socketsWhoseVideoMustBeRevoked) {
                const revoked = await revokeSocketVideoSessions(
                    socketId,
                    'room_membership_revoked'
                );
                if (!joinIsLive()) {
                    await rollbackUserRoomMetadata();
                    return;
                }
                if (revoked.persistenceUnavailable) {
                    const rolledBack = await rollbackUserRoomMetadata();
                    if (!joinIsLive()) return;
                    if (!rolledBack) return ackError(ack, 'PERSISTENCE_UNAVAILABLE');
                    return ackError(ack, 'PERSISTENCE_UNAVAILABLE');
                }
                if (!revoked.providerIdentityRevoked) {
                    realtimeKitProviderAvailable = false;
                    const rolledBack = await rollbackUserRoomMetadata();
                    if (!joinIsLive()) return;
                    return ackError(ack, rolledBack
                        ? 'VIDEO_PROVIDER_UNAVAILABLE'
                        : 'PERSISTENCE_UNAVAILABLE');
                }
            }

            let stagedMembershipEvents = [];
            try {
                const membershipEvents = [];
                if (previousRoomId && previousRoomId !== normalizedRoom) {
                    const previousRoom = rooms.get(previousRoomId);
                    const previousRecord = previousRoom?.users.get(socket.id);
                    if (previousRoom && previousRecord) {
                        membershipEvents.push(buildRoomLifecycleEvent(previousRoom, 'leave', {
                            userId: roomEventUserId(previousRecord.identityId),
                            nickname: previousRecord.name,
                            occurredAt: joinNow
                        }));
                    }
                }
                membershipEvents.push(buildRoomLifecycleEvent(room, 'join', {
                    userId: joiningUser?.id || null,
                    nickname: cleanName,
                    occurredAt: joinNow
                }));
                stagedMembershipEvents = stageRoomLifecycleEvents(membershipEvents);
                if (stagedMembershipEvents.length > 0) {
                    // The source leave and target join are one durable outbox
                    // snapshot. No source membership changes until it lands.
                    await roomStore.flush(rooms);
                }
            } catch (_error) {
                unstageRoomLifecycleEvents(stagedMembershipEvents);
                const rolledBack = await rollbackUserRoomMetadata();
                if (!joinIsLive()) return;
                if (!rolledBack) return ackError(ack, 'PERSISTENCE_UNAVAILABLE');
                return ackError(ack, 'PERSISTENCE_UNAVAILABLE');
            }

            if (!joinIsLive()) {
                // The durable outbox snapshot may have completed just before
                // disconnect. Remove its uncommitted join/leave intent and
                // persist that compensation before releasing the room locks.
                unstageRoomLifecycleEvents(stagedMembershipEvents);
                if (stagedMembershipEvents.length > 0) {
                    try {
                        await roomStore.flush(rooms);
                    } catch (error) {
                        logger.error({
                            event: 'room_join_outbox_rollback_failed',
                            roomId: normalizedRoom,
                            error: error?.message
                        });
                    }
                }
                await rollbackUserRoomMetadata();
                return;
            }

            if (!roomHasSchedule(room)) {
                clearRoomCleanupTimer(room);
                room.expiresAt = null;
            }

            if (previousRoomId && previousRoomId !== normalizedRoom) {
                const previousRoom = rooms.get(previousRoomId);
                if (previousRoom && removeUserFromRoom(
                    previousRoom,
                    socket.id,
                    previousRoomId,
                    null,
                    { videoAlreadyRevoked: true }
                )) {
                    io.to(previousRoomId).emit('presence', roomSnapshot(previousRoomId).participants);
                    scheduleRoomCleanup(previousRoomId);
                }
            }

            if (pendingTimer) {
                clearTimeout(pendingTimer.timeoutId);
                pendingLeaveTimers.delete(userKey);
            }

            releasableUsers.forEach((userRecord, oldSocketId) => {
                removeUserFromRoom(
                    room,
                    oldSocketId,
                    normalizedRoom,
                    userRecord,
                    { videoAlreadyRevoked: true }
                );
            });

            const scheduleChanged = !!(
                joiningUser
                && room.ownerUserId
                && joiningUser.id === room.ownerUserId
                && recordScheduleJoin(room.schedule, joinNow)
            );
            const userRecord = {
                socketId: socket.id,
                name: cleanName,
                sessionId,
                clientId,
                identityId,
                identityKey,
                joinedAt: joinNow,
                cameraOn: false,
                status: null,
                // Profile perks relayed to peers via presence (user content,
                // not chrome — single-accent rule stays intact client-side).
                avatarColor: joiningUser ? joiningUser.avatarColor : null,
                streakCurrent: joiningUser ? joiningUser.streak.current : null
            };

            // No await is allowed between this final liveness check and the
            // synchronous membership/token commit below.
            if (!joinIsLive()) {
                await rollbackUserRoomMetadata();
                return;
            }

            room.users.set(socket.id, userRecord);
            if (identityKey) {
                room.identities.set(identityKey, socket.id);
            }

            socket.data.username = cleanName;
            socket.data.roomId = normalizedRoom;
            socket.join(normalizedRoom);

            const membershipToken = issueMembershipToken(socket, normalizedRoom);
            userRecord.membershipToken = membershipToken;

            const snapshot = roomSnapshot(normalizedRoom);
            ack({ ok: true, room: snapshot, membershipToken });
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

        onRequest('send-message', (payload, ack) => {
            const { text } = payload;
            const currentRoom = socket.data.roomId;
            const cleanText = sanitizeChatMessage(text);

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

        onRequest('board-set-goal', (payload, ack) => {
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

        onRequest('board-add-task', (payload, ack) => {
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

            if (boardTaskTextExceedsLimit(payload.text)) {
                return ackError(ack, 'BOARD_TASK_TOO_LARGE');
            }
            const cleanText = sanitizeBoardTaskText(payload.text);
            if (!cleanText) {
                return ackError(ack, 'BOARD_TASK_REQUIRED');
            }

            const board = ensureRoomBoard(room);
            if (board.tasks.length >= BOARD_TASK_LIMIT) {
                return ackError(ack, 'BOARD_TASK_LIMIT_REACHED');
            }
            const nextTask = {
                id: crypto.randomUUID(),
                text: cleanText,
                priority: normalizeBoardPriority(payload.priority),
                done: false
            };
            const prospectiveBoard = {
                goal: board.goal,
                tasks: [...board.tasks, nextTask]
            };
            if (!boardFitsSerializedLimit(prospectiveBoard)) {
                return ackError(ack, 'BOARD_STATE_TOO_LARGE');
            }
            board.tasks.push(nextTask);
            emitBoardState(currentRoom, room);
            persistRoomsSoon();
            ack({ ok: true, board: cloneBoard(board) });
        });

        onRequest('board-toggle-task', (payload, ack) => {
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

        onRequest('board-delete-task', (payload, ack) => {
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

        onRequest('board-reorder-tasks', (payload, ack) => {
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

        onRequest('camera-status', (payload, ack) => {
            const room = resolveMeshSignalRoom(ack);
            if (!room) return;
            const user = room.users.get(socket.id);
            if (!user) return ackError(ack, 'ROOM_NOT_JOINED');
            user.cameraOn = !!payload.camera;
            emitToAuthenticatedMeshRoom(room, 'camera-status', { userId: socket.id, camera: user.cameraOn });
            ack({ ok: true });
        });

        onRequest('rtc-offer', (payload, ack) => {
            const { targetId, sdp } = payload;
            const room = resolveMeshSignalRoom(ack);
            if (!room) return;
            const targetSocket = resolveAuthenticatedMeshTarget(room, targetId);
            if (!targetSocket) return ackError(ack, 'RTC_TARGET_INVALID');
            targetSocket.emit('rtc-offer', { from: socket.id, sdp });
            ack({ ok: true });
        });

        onRequest('rtc-answer', (payload, ack) => {
            const { targetId, sdp } = payload;
            const room = resolveMeshSignalRoom(ack);
            if (!room) return;
            const targetSocket = resolveAuthenticatedMeshTarget(room, targetId);
            if (!targetSocket) return ackError(ack, 'RTC_TARGET_INVALID');
            targetSocket.emit('rtc-answer', { from: socket.id, sdp });
            ack({ ok: true });
        });

        onRequest('rtc-ice', (payload, ack) => {
            const { targetId, candidate } = payload;
            const room = resolveMeshSignalRoom(ack);
            if (!room) return;
            const targetSocket = resolveAuthenticatedMeshTarget(room, targetId);
            if (!targetSocket) return ackError(ack, 'RTC_TARGET_INVALID');
            targetSocket.emit('rtc-ice', { from: socket.id, candidate });
            ack({ ok: true });
        });

        onRequest('user-status', (payload, ack) => {
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

        // Reports are silent: stored on the room for admin review, never
        // broadcast, never exposed through client-facing snapshots.
        onRequest('report-user', (payload, ack) => {
            const currentRoom = socket.data.roomId;
            if (!currentRoom) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            const room = rooms.get(currentRoom);
            if (!room) {
                return ackError(ack, 'ROOM_NOT_FOUND');
            }
            const reporter = room.users.get(socket.id);
            if (!reporter) {
                return ackError(ack, 'ROOM_NOT_JOINED');
            }
            const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
            const target = room.users.get(targetId);
            if (!target) {
                return ackError(ack, 'PARTICIPANT_NOT_FOUND');
            }
            if (targetId === socket.id || isSameIdentity(target, socket.data.identityId)) {
                return ackError(ack, 'CANNOT_REPORT_SELF');
            }
            if (!checkSocketRateLimit(socket, rateLimiters.reports, getJoinSessionKey(socket), ack)) {
                return;
            }
            const reason = REPORT_REASONS.includes(payload.reason) ? payload.reason : 'other';
            const report = {
                id: `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                reporterName: reporter.name || '',
                reporterSessionIdPrefix: (socket.data.sessionId || '').slice(0, 8),
                targetSocketId: targetId,
                targetSessionIdPrefix: (target.sessionId || '').slice(0, 8),
                targetClientId: target.clientId || '',
                targetName: target.name || '',
                reason,
                detail: sanitizeUserText(payload.detail, REPORT_DETAIL_MAX_LENGTH),
                createdAt: Date.now(),
                status: 'open'
            };
            if (!Array.isArray(room.reports)) room.reports = [];
            room.reports.push(report);
            if (room.reports.length > ROOM_REPORTS_LIMIT) {
                room.reports.splice(0, room.reports.length - ROOM_REPORTS_LIMIT);
            }
            logger.warn({
                event: 'user_reported',
                roomId: currentRoom,
                reportId: report.id,
                reason,
                targetName: report.targetName
            });
            persistRoomsSoon();
            ack({ ok: true, reportId: report.id });
        });

        socket.on('disconnect', () => {
            invalidateSocketConnection(socket);
            if (skippedDisconnects.has(socket.id)) {
                skippedDisconnects.delete(socket.id);
                return;
            }

            const endingVideoSessions = videoSessionRegistry.markSocketSessionsEnding(
                socket.id,
                'socket_disconnect'
            );
            for (const session of endingVideoSessions) {
                emitVideoCapacity(session.roomId);
                void requestProviderSessionEnd(session, 'socket_disconnect');
            }
            const { roomId, sessionId: userSessionId, clientId: userClientId } = socket.data;
            if (!roomId) return;
            const room = rooms.get(roomId);
            if (!room) return;

            const user = room.users.get(socket.id);
            room.users.delete(socket.id);

            if (user) {
                const identityKey = user.identityKey || buildIdentityKey(roomId, user.identityId);
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
                    identityId: user.identityId || socket.data.identityId,
                    sessionId: user.sessionId || userSessionId,
                    clientId: user.clientId || userClientId || socket.data.clientId || null,
                    disconnectedAt: Date.now(),
                    event: null,
                    systemMessage: null,
                    timeoutId: null
                };

                const finalizeLeave = () => {
                    inFlightMutations += 1;
                    void runRoomLifecycleOperation(roomId, async () => {
                        const activeRecord = pendingLeaveTimers.get(userKey);
                        if (activeRecord !== timerRecord) return;

                        const currentRoom = rooms.get(roomId);
                        if (!currentRoom || roomIsClosed(currentRoom)) {
                            pendingLeaveTimers.delete(userKey);
                            return;
                        }
                        timerRecord.event ||= buildRoomLifecycleEvent(currentRoom, 'leave', {
                            userId: roomEventUserId(timerRecord.identityId),
                            nickname: user.name,
                            occurredAt: timerRecord.disconnectedAt
                        });
                        timerRecord.systemMessage ||= createSystemMessage(
                            `${user.name} left the room`,
                            user.name,
                            'leave'
                        );
                        const previousMessages = currentRoom.messages.map((message) => ({ ...message }));
                        let stagedEvents = [];
                        try {
                            stagedEvents = stageRoomLifecycleEvents([timerRecord.event]);
                            currentRoom.messages.push(timerRecord.systemMessage);
                            if (currentRoom.messages.length > ROOM_HISTORY_LIMIT) currentRoom.messages.shift();
                            if (stagedEvents.length > 0) {
                                await roomStore.flush(rooms);
                            } else {
                                persistRoomsSoon();
                            }
                        } catch (error) {
                            currentRoom.messages = previousMessages;
                            unstageRoomLifecycleEvents(stagedEvents);
                            logger.warn({
                                event: 'room_leave_outbox_persist_failed',
                                roomId,
                                error: error?.message
                            });
                            timerRecord.timeoutId = setTimeout(finalizeLeave, 3000);
                            timerRecord.timeoutId.unref?.();
                            return;
                        }
                        pendingLeaveTimers.delete(userKey);
                        io.to(roomId).emit('chat-message', timerRecord.systemMessage);
                    }).catch((error) => logger.error({
                        event: 'room_leave_finalize_failed',
                        roomId,
                        error: error?.message
                    })).finally(finishMutation);
                };

                timerRecord.timeoutId = setTimeout(finalizeLeave, 3000);
                timerRecord.timeoutId.unref?.();

                pendingLeaveTimers.set(userKey, timerRecord);
            }

            scheduleRoomCleanup(roomId);
        });
    });

    function listen(callback) {
        if (!initialized) {
            throw new Error('Server persistence must initialize before listen().');
        }
        startRuntimeWorkers();
        server.listen(config.port, config.host, () => {
            const startupSummary = {
                event: 'startup',
                mode: config.mode,
                host: config.host,
                port: config.port,
                roomStateFile: roomStore.filePath,
                userStateFile: userStore.filePath,
                loadedRoomCount,
                loadedUserCount,
                sessionSecretEphemeral: !!config.sessionSecretEphemeral,
                adminEnabled: !!config.admin.enabled,
                iceMode: config.iceMode,
                sfuAvailable: config.sfuAvailable,
                meshParticipantLimit: config.meshParticipantLimit,
                devMeshEnabled: config.video.devMeshEnabled === true,
                videoProvider: config.video.provider,
                maxGlobalVideoParticipants: config.video.maxGlobalParticipants,
                maxRoomVideoParticipants: config.video.maxRoomParticipants,
                videoJoinDisabled: !!config.video.joinDisabled
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
        userStore,
        videoSessionStore,
        videoSessionRegistry,
        compatibilityTelemetry,
        rooms,
        users,
        drainRoomEvents,
        initialize,
        listen,
        evaluateReadiness,
        getLoadedRoomCount() {
            return loadedRoomCount;
        },
        getLoadedUserCount() {
            return loadedUserCount;
        }
    };
}

module.exports = {
    createCoStudyServer,
    DEFAULT_ICE_SERVERS,
    resolveBackupConfig,
    resolveSupabaseConfig
};
