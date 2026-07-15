const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sanitizeUserText, normalizeEmail, normalizeAvatarColor } = require('./services/auth');
const { createDebouncedAtomicJsonStore } = require('./services/persistence/debounced-atomic-json-store');

const SAVE_DEBOUNCE_MS = 250;
const DISPLAY_NAME_MAX_LENGTH = 20;
const BIO_MAX_LENGTH = 160;
const FOCUS_DAY_KEY_LIMIT = 370;
const FOCUS_MINUTES_DAY_CAP = 1440;
const MY_ROOMS_LIMIT = 12;
const GOOGLE_SUB_MAX_LENGTH = 255;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // fixed UTC+3, no DST (same convention as schedule-utils)

function riyadhDayKey(timestamp = Date.now()) {
    const shifted = new Date(timestamp + RIYADH_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function previousRiyadhDayKey(dayKey) {
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - 1);
    return riyadhDayKey(date.getTime() - RIYADH_OFFSET_MS);
}

/** @param {Record<string, any>} raw */
function sanitizeFocusDay(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const focusMinutes = Number.isFinite(raw.focusMinutes)
        ? Math.min(Math.max(Math.round(raw.focusMinutes), 0), FOCUS_MINUTES_DAY_CAP)
        : 0;
    const sessions = Number.isInteger(raw.sessions) && raw.sessions > 0 ? Math.min(raw.sessions, 500) : 0;
    if (focusMinutes === 0 && sessions === 0) return null;
    return { focusMinutes, sessions };
}

function normalizeCompletionId(raw) {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    return /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : null;
}

/** @param {Record<string, any>} raw */
function sanitizeFocusCompletion(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const completionId = normalizeCompletionId(raw.completionId);
    const dayKey = typeof raw.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dayKey)
        ? raw.dayKey
        : null;
    if (!completionId || !dayKey) return null;
    return {
        completionId,
        acceptedMinutes: Number.isFinite(raw.acceptedMinutes)
            ? Math.min(Math.max(Math.round(raw.acceptedMinutes), 0), 240)
            : 0,
        dayKey,
        completedAt: Number.isFinite(raw.completedAt) ? raw.completedAt : Date.now()
    };
}

/** @param {Record<string, any>} raw */
function sanitizeFocusStats(raw = {}) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const days = {};
    if (source.days && typeof source.days === 'object' && !Array.isArray(source.days)) {
        const keys = Object.keys(source.days)
            .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
            .sort()
            .slice(-FOCUS_DAY_KEY_LIMIT);
        for (const key of keys) {
            const day = sanitizeFocusDay(source.days[key]);
            if (day) days[key] = day;
        }
    }
    let retainedFocusMinutes = 0;
    let retainedSessions = 0;
    for (const day of Object.values(days)) {
        retainedFocusMinutes += day.focusMinutes;
        retainedSessions += day.sessions;
    }
    const totalFocusMinutes = Number.isFinite(source.totalFocusMinutes)
        ? Math.max(Math.round(source.totalFocusMinutes), retainedFocusMinutes)
        : retainedFocusMinutes;
    const totalSessions = Number.isFinite(source.totalSessions)
        ? Math.max(Math.round(source.totalSessions), retainedSessions)
        : retainedSessions;
    const seenCompletionIds = new Set();
    const completions = (Array.isArray(source.completions) ? source.completions : [])
        .map(sanitizeFocusCompletion)
        .filter((completion) => {
            if (!completion || seenCompletionIds.has(completion.completionId)) return false;
            seenCompletionIds.add(completion.completionId);
            return true;
        })
        .sort((a, b) => a.completedAt - b.completedAt);
    return { days, totalFocusMinutes, totalSessions, completions };
}

/**
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} focusStats
 */
function sanitizeStreak(raw = {}, focusStats = { days: {} }) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const lastActiveDay = typeof source.lastActiveDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.lastActiveDay)
        ? source.lastActiveDay
        : null;
    const current = Number.isInteger(source.current) && source.current > 0 && lastActiveDay ? source.current : 0;
    const best = Math.max(Number.isInteger(source.best) && source.best > 0 ? source.best : 0, current);
    if (!lastActiveDay && Object.keys(focusStats.days).length === 0) {
        return { current: 0, best, lastActiveDay: null };
    }
    return { current, best, lastActiveDay };
}

/** @param {Record<string, any>} raw */
function sanitizeMyRoom(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const roomId = typeof raw.roomId === 'string' ? raw.roomId.trim().toUpperCase() : '';
    if (!roomId || roomId.length > 12) return null;
    return {
        roomId,
        name: sanitizeUserText(raw.name, 48) || roomId,
        role: raw.role === 'created' ? 'created' : 'joined',
        lastJoinedAt: Number.isFinite(raw.lastJoinedAt) ? raw.lastJoinedAt : Date.now()
    };
}

/**
 * Applies one completed focus session to a user record in place.
 * @param {Record<string, any>} user
 * @param {{ minutes: number, completionId: string, now?: number }} options
 */
function applyFocusSession(user, { minutes, completionId, now = Date.now() } = /** @type {any} */ ({})) {
    const safeMinutes = Math.min(Math.max(Math.round(minutes), 1), 240);
    const safeCompletionId = normalizeCompletionId(completionId);
    if (!safeCompletionId) throw new TypeError('completionId is invalid.');
    const dayKey = riyadhDayKey(now);
    const stats = user.focusStats;
    if (!Array.isArray(stats.completions)) stats.completions = [];
    const priorCompletion = stats.completions.find((completion) => completion.completionId === safeCompletionId);
    if (priorCompletion) {
        return {
            focusStats: stats,
            streak: user.streak,
            dayKey: priorCompletion.dayKey,
            requestedMinutes: safeMinutes,
            acceptedMinutes: priorCompletion.acceptedMinutes,
            minutes: priorCompletion.acceptedMinutes,
            duplicate: true,
            completionId: safeCompletionId
        };
    }
    const day = stats.days[dayKey] || { focusMinutes: 0, sessions: 0 };
    const acceptedMinutes = Math.min(safeMinutes, Math.max(0, FOCUS_MINUTES_DAY_CAP - day.focusMinutes));
    if (acceptedMinutes > 0) {
        day.focusMinutes += acceptedMinutes;
        day.sessions += 1;
        stats.days[dayKey] = day;
        stats.totalFocusMinutes += acceptedMinutes;
        stats.totalSessions += 1;
    }

    stats.completions.push({
        completionId: safeCompletionId,
        acceptedMinutes,
        dayKey,
        completedAt: now
    });
    const dayKeys = Object.keys(stats.days).sort();
    if (dayKeys.length > FOCUS_DAY_KEY_LIMIT) {
        for (const staleKey of dayKeys.slice(0, dayKeys.length - FOCUS_DAY_KEY_LIMIT)) {
            delete stats.days[staleKey];
        }
    }

    const streak = user.streak;
    if (acceptedMinutes === 0) {
        // The completion is still remembered for idempotency, but a fully
        // capped request is not a focus session and cannot advance a streak.
    } else if (streak.lastActiveDay === dayKey) {
        // Already counted today.
    } else if (streak.lastActiveDay === previousRiyadhDayKey(dayKey)) {
        streak.current += 1;
        streak.lastActiveDay = dayKey;
        streak.best = Math.max(streak.best, streak.current);
    } else {
        streak.current = 1;
        streak.lastActiveDay = dayKey;
        streak.best = Math.max(streak.best, streak.current);
    }
    return {
        focusStats: stats,
        streak,
        dayKey,
        requestedMinutes: safeMinutes,
        acceptedMinutes,
        minutes: acceptedMinutes,
        duplicate: false,
        completionId: safeCompletionId
    };
}

/**
 * Records room participation in user.myRooms (deduped, capped, newest first).
 * A 'created' entry is never downgraded to 'joined'.
 * @param {Record<string, any>} user
 * @param {{ roomId: string, name?: string, role?: string, now?: number }} options
 */
function recordMyRoom(user, { roomId, name, role, now = Date.now() } = /** @type {any} */ ({})) {
    const entry = sanitizeMyRoom({ roomId, name, role, lastJoinedAt: now });
    if (!entry) return;
    const existing = user.myRooms.find((room) => room.roomId === entry.roomId);
    if (existing) {
        existing.name = entry.name;
        existing.lastJoinedAt = entry.lastJoinedAt;
        if (entry.role === 'created') existing.role = 'created';
    } else {
        user.myRooms.push(entry);
    }
    user.myRooms.sort((a, b) => b.lastJoinedAt - a.lastJoinedAt);
    user.myRooms.length = Math.min(user.myRooms.length, MY_ROOMS_LIMIT);
}

/** The persisted store (users.json OR the Supabase profiles table) is a trust
 *  boundary — everything loaded is re-sanitized, mirroring room-store's
 *  sanitizeRoom. Module-level + pure so both the file store and the Supabase
 *  store share one canonical sanitizer.
 *  @param {Record<string, any>} raw
 *  @param {{ onLegacyAuthProvider?: (provider: string) => void }} [options] */
function sanitizeUser(raw = {}, options = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null;
    const email = normalizeEmail(raw.email);
    const storedPasswordHash = typeof raw.passwordHash === 'string' && raw.passwordHash.includes(':')
        ? raw.passwordHash.trim()
        : null;
    const googleSub = typeof raw.googleSub === 'string'
        && raw.googleSub.trim()
        && raw.googleSub.length <= GOOGLE_SUB_MAX_LENGTH
        ? raw.googleSub.trim()
        : null;
    // Compatibility: old password rows had no passwordEnabled field, while
    // old Google-only rows carried an inaccessible synthetic password and
    // authProvider="google". Explicit passwordEnabled wins for dual-method
    // accounts; otherwise the legacy provider field determines the migration.
    const hasExplicitPasswordMethod = typeof raw.passwordEnabled === 'boolean';
    if (!hasExplicitPasswordMethod && ['password', 'google'].includes(raw.authProvider)) {
        options.onLegacyAuthProvider?.(raw.authProvider);
    }
    const passwordEnabled = hasExplicitPasswordMethod
        ? raw.passwordEnabled
        : raw.authProvider === 'google'
            ? false
            : !!storedPasswordHash;
    const passwordHash = passwordEnabled ? storedPasswordHash : null;
    const displayName = sanitizeUserText(raw.displayName, DISPLAY_NAME_MAX_LENGTH);
    if (!id || !email || !displayName) return null;
    if ((passwordEnabled && !passwordHash) || (!passwordEnabled && !googleSub)) return null;

    const focusStats = sanitizeFocusStats(raw.focusStats);
    return {
        id,
        email,
        passwordHash,
        passwordEnabled,
        googleSub,
        // Retained temporarily for compatibility with the existing Supabase
        // column. Auth decisions use passwordEnabled/googleSub, never this tag.
        authProvider: passwordEnabled ? 'password' : 'google',
        displayName,
        avatarColor: normalizeAvatarColor(raw.avatarColor),
        bio: sanitizeUserText(raw.bio, BIO_MAX_LENGTH),
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
        banned: !!raw.banned,
        tokenEpoch: Number.isInteger(raw.tokenEpoch) && raw.tokenEpoch > 0 ? raw.tokenEpoch : 1,
        focusStats,
        streak: sanitizeStreak(raw.streak, focusStats),
        myRooms: Array.isArray(raw.myRooms)
            ? raw.myRooms.map(sanitizeMyRoom).filter(Boolean).slice(0, MY_ROOMS_LIMIT)
            : []
    };
}

function createUserStore(options = {}) {
    const {
        filePath = process.env.USER_STATE_FILE || path.join(__dirname, 'data', 'users.json'),
        logger = console,
        onLegacyAuthProvider
    } = options;

    const resolvedFilePath = path.resolve(filePath);
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

    function buildSnapshot(users) {
        const source = users instanceof Map
            ? Array.from(users.values())
            : Array.isArray(users)
                ? users
                : Array.from(users || []);
        return source.map((user) => sanitizeUser(user)).filter(Boolean);
    }

    function toJson(users) {
        return `${JSON.stringify(buildSnapshot(users), null, 2)}\n`;
    }

    function loadUsers(options = {}) {
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
                const error = new Error(`User state file ${resolvedFilePath} must contain a JSON array.`);
                if (strict) throw error;
                warn(`${error.message} Starting with empty state.`);
                return [];
            }

            const sanitizedUsers = parsed.map((raw) => sanitizeUser(raw, { onLegacyAuthProvider })).filter(Boolean);
            atomicStore.setBaseline(`${JSON.stringify(sanitizedUsers, null, 2)}\n`);
            return sanitizedUsers;
        } catch (error) {
            if (strict) {
                throw new Error(`Failed to load user state from ${resolvedFilePath}: ${error.message}`);
            }
            warn(`Failed to load user state from ${resolvedFilePath}. Starting with empty state.`, error);
            return [];
        }
    }

    function scheduleSave(users) {
        return atomicStore.schedule(users, toJson);
    }

    function flush(users) {
        return users ? atomicStore.flush(users, toJson) : atomicStore.flush();
    }

    return {
        filePath: resolvedFilePath,
        loadUsers,
        scheduleSave,
        flush
    };
}

/** @param {{ email: string, passwordHash?: string|null, passwordEnabled?: boolean, googleSub?: string|null, displayName: string, now?: number }} options */
function createUser({
    email,
    passwordHash = null,
    passwordEnabled = typeof passwordHash === 'string' && !!passwordHash,
    googleSub = null,
    displayName,
    now = Date.now()
} = /** @type {any} */ ({})) {
    return {
        id: crypto.randomUUID(),
        email,
        passwordHash: passwordEnabled ? passwordHash : null,
        passwordEnabled,
        googleSub,
        authProvider: passwordEnabled ? 'password' : 'google',
        displayName,
        avatarColor: 'amber',
        bio: '',
        createdAt: now,
        banned: false,
        tokenEpoch: 1,
        focusStats: { days: {}, totalFocusMinutes: 0, totalSessions: 0, completions: [] },
        streak: { current: 0, best: 0, lastActiveDay: null },
        myRooms: []
    };
}

module.exports = {
    createUserStore,
    createUser,
    applyFocusSession,
    normalizeCompletionId,
    recordMyRoom,
    sanitizeFocusStats,
    sanitizeStreak,
    sanitizeUser
};
