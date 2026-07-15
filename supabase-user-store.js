// Supabase-backed user store. Drop-in for createUserStore's persistence
// contract ({ loadUsers, scheduleSave, flush }) plus an async hydrate() the
// factory awaits at boot. The app keeps every user in memory and hands this
// store the live Map on each change; we debounce a full upsert and diff the
// id set to propagate account deletions (parity with the file store, which
// rewrites the whole array).
//
// Row shape mirrors the app's in-memory user model. The DB is a trust
// boundary, so every loaded row runs through the shared sanitizeUser before
// entering memory; provider/admin fields are re-attached afterward.

const { sanitizeFocusStats, sanitizeStreak, sanitizeUser } = require('./user-store');

const SAVE_DEBOUNCE_MS = 250;
const HYDRATION_PAGE_SIZE = 1000;
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_PROVIDERS = new Set(['password', 'google']);

/** DB row (snake_case) -> in-memory user (camelCase), sanitized. */
function rowToUser(row) {
    if (!row || typeof row !== 'object') return null;
    const createdAtMs = row.created_at ? Date.parse(row.created_at) : Date.now();
    const candidate = {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        passwordEnabled: typeof row.password_enabled === 'boolean' ? row.password_enabled : undefined,
        googleSub: row.google_sub,
        authProvider: row.auth_provider,
        displayName: row.display_name,
        avatarColor: row.avatar_color,
        bio: row.bio,
        createdAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
        banned: row.banned,
        tokenEpoch: row.token_epoch,
        focusStats: row.focus_stats,
        streak: {
            current: row.current_streak,
            best: row.best_streak,
            lastActiveDay: row.last_active_day || null
        },
        myRooms: Array.isArray(row.my_rooms) ? row.my_rooms : []
    };
    const user = sanitizeUser(candidate);
    if (!user) return null;
    // Supabase-only authorization field the shared sanitizer doesn't carry.
    user.isAdmin = !!row.is_admin;
    return user;
}

/** In-memory user -> DB row for upsert. */
function userToRow(user) {
    return {
        id: user.id,
        email: user.email,
        password_hash: user.passwordEnabled ? user.passwordHash : null,
        password_enabled: !!user.passwordEnabled,
        display_name: user.displayName,
        avatar_color: user.avatarColor,
        bio: user.bio,
        banned: !!user.banned,
        token_epoch: user.tokenEpoch,
        current_streak: user.streak?.current ?? 0,
        best_streak: user.streak?.best ?? 0,
        last_active_day: user.streak?.lastActiveDay || null,
        focus_stats: user.focusStats ?? { days: {}, totalFocusMinutes: 0, totalSessions: 0 },
        my_rooms: Array.isArray(user.myRooms) ? user.myRooms : [],
        is_admin: !!user.isAdmin,
        auth_provider: AUTH_PROVIDERS.has(user.authProvider) ? user.authProvider : 'password',
        google_sub: user.googleSub || null,
        created_at: new Date(Number.isFinite(user.createdAt) ? user.createdAt : Date.now()).toISOString()
    };
}

/**
 * @param {{ client?: any, logger?: any, now?: () => number }} [options]
 */
function createSupabaseUserStore(options = {}) {
    const { client, logger = console, now = () => Date.now() } = options;
    if (!client) throw new Error('createSupabaseUserStore requires a Supabase client.');

    let knownIds = new Set();
    const tombstoneExpiryById = new Map();
    const knownFingerprints = new Map();
    let hydrated = false;
    let saveTimer = null;
    let queuedMap = null;
    /** @type {Promise<any>} */
    let mutationTail = Promise.resolve();
    /** @type {Promise<any>} */
    let lastAttempt = Promise.resolve();

    function warn(event, error) {
        const payload = { event, error: error?.message ? error.message : String(error || '') };
        (logger && typeof logger.warn === 'function' ? logger.warn : console.warn).call(logger || console, payload);
    }

    function rowFingerprint(row) {
        return JSON.stringify(row);
    }

    function isCurrentTombstone(userId) {
        const expiresAt = tombstoneExpiryById.get(userId);
        if (!Number.isFinite(expiresAt)) return false;
        if (expiresAt > now()) return true;
        tombstoneExpiryById.delete(userId);
        return false;
    }

    async function deleteProfileWithTombstone(userId) {
        if (typeof client.rpc !== 'function') {
            throw new Error('Supabase account deletion requires the tombstone RPC.');
        }
        const deletedAt = now();
        await client.rpc('delete_profile_with_tombstone', {
            p_user_id: userId,
            p_deleted_at: new Date(deletedAt).toISOString()
        }, { idempotent: true });
        tombstoneExpiryById.set(userId, deletedAt + TOMBSTONE_RETENTION_MS);
        knownIds.delete(userId);
        knownFingerprints.delete(userId);
    }

    /** Load all profiles into memory. Called once at boot; the factory awaits it. */
    async function hydrate() {
        const rows = [];
        for (let offset = 0; ; offset += HYDRATION_PAGE_SIZE) {
            const page = await client.select(
                'profiles',
                `select=*&order=id.asc&limit=${HYDRATION_PAGE_SIZE}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error('Invalid profiles response: expected an array.');
            rows.push(...page);
            if (page.length < HYDRATION_PAGE_SIZE) break;
        }
        tombstoneExpiryById.clear();
        const hydrationNow = now();
        const currentIso = new Date(hydrationNow).toISOString();
        for (let offset = 0; ; offset += HYDRATION_PAGE_SIZE) {
            const page = await client.select(
                'deletion_tombstones',
                `select=user_id,expires_at&expires_at=gt.${encodeURIComponent(currentIso)}`
                    + `&order=user_id.asc&limit=${HYDRATION_PAGE_SIZE}&offset=${offset}`
            );
            if (!Array.isArray(page)) throw new Error('Invalid deletion tombstones response: expected an array.');
            for (const row of page) {
                const expiresAt = Date.parse(row?.expires_at);
                if (!row || typeof row !== 'object' || typeof row.user_id !== 'string' || !row.user_id.trim()
                    || !Number.isFinite(expiresAt)) {
                    throw new Error('Invalid deletion tombstones response: one or more rows failed validation.');
                }
                if (expiresAt > hydrationNow) tombstoneExpiryById.set(row.user_id, expiresAt);
            }
            if (page.length < HYDRATION_PAGE_SIZE) break;
        }

        const liveRows = rows.filter((row) => {
            const tombstoned = isCurrentTombstone(row?.id);
            if (tombstoned) warn('tombstoned_profile_ignored', new Error(`Profile ${row.id} is tombstoned.`));
            return !tombstoned;
        });
        const users = liveRows.map(rowToUser);
        if (users.some((user) => !user)) throw new Error('Invalid profiles response: one or more rows failed validation.');
        knownFingerprints.clear();
        const ids = new Set();
        const emails = new Set();
        const googleSubjects = new Set();
        for (const [index, user] of users.entries()) {
            if (ids.has(user.id) || emails.has(user.email) || (user.googleSub && googleSubjects.has(user.googleSub))) {
                throw new Error('Invalid profiles response: duplicate identity fields.');
            }
            ids.add(user.id);
            emails.add(user.email);
            if (user.googleSub) googleSubjects.add(user.googleSub);
            // Preserve the provider row fingerprint so the first mutation can
            // normalize legacy/defaulted columns instead of assuming the
            // sanitized in-memory projection was already stored.
            knownFingerprints.set(user.id, rowFingerprint(liveRows[index]));
        }
        knownIds = new Set(users.map((u) => u.id));
        hydrated = true;
        return users;
    }

    async function persistDiff(map) {
        const liveUsers = Array.from(map.values()).filter((user) => !isCurrentTombstone(user.id));
        const currentIds = new Set(liveUsers.map((user) => user.id));
        const rows = liveUsers.map(userToRow);
        // Deletions only propagate once hydrated (before that, knownIds is empty
        // and an upsert-only pass can never wrongly delete a not-yet-loaded row).
        const toDelete = hydrated ? [...knownIds].filter((id) => !currentIds.has(id)) : [];
        for (const row of rows) {
            const fingerprint = rowFingerprint(row);
            if (knownFingerprints.get(row.id) === fingerprint) continue;
            await client.upsert('profiles', [row]);
            knownFingerprints.set(row.id, fingerprint);
        }
        for (const id of toDelete) {
            await deleteProfileWithTombstone(id);
        }
        knownIds = currentIds;
    }

    /**
     * @template T
     * @param {() => T | Promise<T>} operation
     * @param {string} [event]
     * @returns {Promise<T>}
     */
    function enqueue(operation, event = 'user_persist_failed') {
        const attempt = mutationTail.then(operation);
        mutationTail = attempt.catch(() => {});
        lastAttempt = attempt;
        void attempt.catch((error) => warn(event, error));
        return attempt;
    }

    function scheduleSave(map) {
        queuedMap = map;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const m = queuedMap;
            queuedMap = null;
            saveTimer = null;
            if (m) void enqueue(() => persistDiff(m));
        }, SAVE_DEBOUNCE_MS);
        saveTimer.unref?.();
        return lastAttempt;
    }

    function flush(map) {
        if (map) queuedMap = map;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        const m = queuedMap;
        queuedMap = null;
        if (!m) return lastAttempt;
        return enqueue(() => persistDiff(m));
    }

    function saveUser(user) {
        const row = userToRow(user);
        return enqueue(async () => {
            if (isCurrentTombstone(user.id)) {
                throw Object.assign(new Error(`Profile ${user.id} is tombstoned.`), {
                    code: 'ACCOUNT_TOMBSTONED'
                });
            }
            await client.upsert('profiles', [row]);
            knownIds.add(user.id);
            knownFingerprints.set(user.id, rowFingerprint(row));
        });
    }

    function deleteUser(user) {
        return enqueue(async () => {
            await deleteProfileWithTombstone(user.id);
        }, 'user_delete_failed');
    }

    function persistFocusCompletion(user, payload) {
        const row = userToRow(user);
        return enqueue(async () => {
            if (isCurrentTombstone(user.id)) {
                throw Object.assign(new Error(`Profile ${user.id} is tombstoned.`), {
                    code: 'ACCOUNT_TOMBSTONED'
                });
            }
            if (typeof client.rpc !== 'function') {
                throw new Error('Supabase focus persistence requires the atomic focus RPC.');
            }
            const rpcResponse = await client.rpc('record_focus_completion_v2', {
                p_user_id: user.id,
                p_focus_stats: row.focus_stats,
                p_current_streak: row.current_streak,
                p_best_streak: row.best_streak,
                p_last_active_day: row.last_active_day,
                p_completion_id: payload.completionId,
                p_minutes: payload.acceptedMinutes,
                p_day_key: payload.dayKey
            }, { idempotent: true });
            const result = Array.isArray(rpcResponse) ? rpcResponse[0] : rpcResponse;
            if (!result || typeof result.duplicate !== 'boolean'
                || !Number.isInteger(result.accepted_minutes)
                || result.accepted_minutes < 0
                || result.accepted_minutes > 240
                || typeof result.completion_day !== 'string'
                || !/^\d{4}-\d{2}-\d{2}$/.test(result.completion_day)
                || !result.persisted_focus_stats
                || typeof result.persisted_focus_stats !== 'object'
                || Array.isArray(result.persisted_focus_stats)
                || !Number.isInteger(result.persisted_current_streak)
                || result.persisted_current_streak < 0
                || !Number.isInteger(result.persisted_best_streak)
                || result.persisted_best_streak < result.persisted_current_streak
                || (result.persisted_last_active_day !== null
                    && (typeof result.persisted_last_active_day !== 'string'
                        || !/^\d{4}-\d{2}-\d{2}$/.test(result.persisted_last_active_day)))) {
                throw new Error('Invalid record_focus_completion_v2 response.');
            }
            const focusStats = sanitizeFocusStats(result.persisted_focus_stats);
            const streak = sanitizeStreak({
                current: result.persisted_current_streak,
                best: result.persisted_best_streak,
                lastActiveDay: result.persisted_last_active_day
            }, focusStats);
            if (!result.duplicate) {
                knownIds.add(user.id);
                knownFingerprints.set(user.id, rowFingerprint(row));
            }
            return {
                duplicate: result.duplicate,
                acceptedMinutes: result.accepted_minutes,
                dayKey: result.completion_day,
                focusStats,
                streak
            };
        }, 'focus_session_persist_failed');
    }

    // Synchronous no-op: the file store loads from disk here, but Supabase
    // hydration is async (see hydrate()). Returning [] keeps the boot path that
    // calls loadUsers() happy; the factory detects hydrate() and awaits it.
    function loadUsers() {
        return [];
    }

    /** Fire-and-forget analytics event: one row per completed focus session.
     *  Drains the user-write queue first so the profile row (FK target) is
     *  guaranteed present — otherwise a brand-new user's first session can beat
     *  the debounced profile upsert and hit a foreign-key violation. */
    async function logFocusSession({ userId, minutes, dayKey, completionId }) {
        await flush();
        await client.insert('focus_sessions', [{
            user_id: userId,
            minutes,
            day_key: dayKey,
            completion_id: completionId
        }]);
    }

    /** Fire-and-forget analytics event: room create/join/leave/close. user_id
     *  may reference a profile, so drain the write queue first (same FK reason). */
    async function logRoomEvent({ roomCode, userId = null, nickname = null, eventType }) {
        try {
            if (userId) await flush();
            await client.insert('room_events', [{
                room_code: roomCode,
                user_id: userId,
                nickname,
                event_type: eventType
            }]);
        } catch (error) {
            warn('room_event_log_failed', error);
        }
    }

    return {
        isSupabase: true,
        durability: 'immediate',
        loadUsers,
        initialize: hydrate,
        hydrate,
        scheduleSave,
        flush,
        saveUser,
        deleteUser,
        persistFocusCompletion,
        logFocusSession,
        logRoomEvent,
        // Dashboard reads (service_role bypasses RLS on the views).
        readAdminOverview: () => client.select('admin_overview', 'select=*'),
        readUserStats: (query = 'select=*&order=total_focus_minutes.desc') => client.select('user_stats', query),
        readDailyActive: (query = 'select=*&limit=30') => client.select('daily_active', query)
    };
}

module.exports = { createSupabaseUserStore };
