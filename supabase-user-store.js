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

const { sanitizeUser } = require('./user-store');

const SAVE_DEBOUNCE_MS = 250;
const AUTH_PROVIDERS = new Set(['password', 'google']);

/** DB row (snake_case) -> in-memory user (camelCase), sanitized. */
function rowToUser(row) {
    if (!row || typeof row !== 'object') return null;
    const createdAtMs = row.created_at ? Date.parse(row.created_at) : Date.now();
    const candidate = {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
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
    // Supabase-only fields the shared sanitizer doesn't carry.
    user.isAdmin = !!row.is_admin;
    user.authProvider = AUTH_PROVIDERS.has(row.auth_provider) ? row.auth_provider : 'password';
    user.googleSub = typeof row.google_sub === 'string' && row.google_sub ? row.google_sub : null;
    return user;
}

/** In-memory user -> DB row for upsert. */
function userToRow(user) {
    return {
        id: user.id,
        email: user.email,
        password_hash: user.passwordHash,
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
 * @param {{ client?: any, logger?: any }} [options]
 */
function createSupabaseUserStore(options = {}) {
    const { client, logger = console } = options;
    if (!client) throw new Error('createSupabaseUserStore requires a Supabase client.');

    let knownIds = new Set();
    let hydrated = false;
    let saveTimer = null;
    let queuedMap = null;
    let writePromise = Promise.resolve();

    function warn(event, error) {
        const payload = { event, error: error && error.message ? error.message : String(error || '') };
        (logger && typeof logger.warn === 'function' ? logger.warn : console.warn).call(logger || console, payload);
    }

    /** Load all profiles into memory. Called once at boot; the factory awaits it. */
    async function hydrate() {
        const rows = await client.select('profiles', 'select=*');
        const users = (Array.isArray(rows) ? rows : []).map(rowToUser).filter(Boolean);
        knownIds = new Set(users.map((u) => u.id));
        hydrated = true;
        return users;
    }

    async function persistDiff(map) {
        const currentIds = new Set(map.keys());
        const rows = Array.from(map.values()).map(userToRow);
        // Deletions only propagate once hydrated (before that, knownIds is empty
        // and an upsert-only pass can never wrongly delete a not-yet-loaded row).
        const toDelete = hydrated ? [...knownIds].filter((id) => !currentIds.has(id)) : [];
        if (rows.length) await client.upsert('profiles', rows);
        if (toDelete.length) await client.remove('profiles', 'id', toDelete);
        knownIds = currentIds;
    }

    function enqueue(map) {
        writePromise = writePromise
            .then(() => persistDiff(map))
            .catch((error) => warn('user_persist_failed', error));
        return writePromise;
    }

    function scheduleSave(map) {
        queuedMap = map;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const m = queuedMap;
            queuedMap = null;
            saveTimer = null;
            if (m) void enqueue(m);
        }, SAVE_DEBOUNCE_MS);
        return writePromise;
    }

    function flush(map) {
        if (map) queuedMap = map;
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        const m = queuedMap;
        queuedMap = null;
        if (!m) return writePromise;
        return enqueue(m);
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
    async function logFocusSession({ userId, minutes, dayKey }) {
        try {
            await flush();
            await client.insert('focus_sessions', [{ user_id: userId, minutes, day_key: dayKey }]);
        } catch (error) {
            warn('focus_session_log_failed', error);
        }
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
        loadUsers,
        hydrate,
        scheduleSave,
        flush,
        logFocusSession,
        logRoomEvent,
        // Dashboard reads (service_role bypasses RLS on the views).
        readAdminOverview: () => client.select('admin_overview', 'select=*'),
        readUserStats: (query = 'select=*&order=total_focus_minutes.desc') => client.select('user_stats', query),
        readDailyActive: (query = 'select=*&limit=30') => client.select('daily_active', query)
    };
}

module.exports = { createSupabaseUserStore };
