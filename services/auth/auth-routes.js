// User auth + account REST endpoints. Pure route logic — every server-bound
// dependency (stores, limiters, cookie helpers) is injected by the factory.
//
// CSRF note: no token needed. originGuard rejects cross-origin non-GET
// requests and the auth cookie is SameSite=Lax, so cross-site POSTs never
// carry a session.
const express = require('express');
const { hashPassword, verifyPassword } = require('./password');
const { GOOGLE_DELETE_GRANT_COOKIE } = require('./oauth-security');
const {
    normalizeEmail,
    validatePassword,
    normalizeAvatarColor,
    sanitizeUserText
} = require('./index');
const {
    createUser,
    applyFocusSession,
    normalizeCompletionId,
    sanitizeFocusStats
} = require('../../user-store');

const DISPLAY_NAME_MAX_LENGTH = 20;
const BIO_MAX_LENGTH = 160;
const FOCUS_SESSION_MAX_MINUTES = 240;

async function verifyLoginPassword(user, password, verifier = verifyPassword) {
    const passwordEnabled = !!user && user.passwordEnabled !== false && !!user.passwordHash;
    const passwordOk = await verifier(password, passwordEnabled ? user.passwordHash : null);
    return passwordEnabled && passwordOk;
}

function createAuthRouter(deps) {
    const {
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
        persistUser,
        deleteUser,
        onUserDeleted,
        persistFocusCompletion,
        runUserMutation,
        requireUser,
        logger
    } = deps;

    if (typeof runUserMutation !== 'function') {
        throw new TypeError('createAuthRouter requires runUserMutation.');
    }

    const router = express.Router();

    function clearDeletionGrantCookie(req, res) {
        if (typeof appendSetCookie !== 'function') return;
        const parts = [
            `${GOOGLE_DELETE_GRANT_COOKIE}=`,
            'Path=/api/me',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=0'
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    router.post('/auth/signup', async (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authSignup, requestIp)) return;

        const email = normalizeEmail(req.body?.email);
        if (!email) {
            res.status(400).json({ errorCode: 'EMAIL_INVALID' });
            return;
        }
        const password = validatePassword(req.body?.password);
        if (!password) {
            res.status(400).json({ errorCode: 'PASSWORD_INVALID' });
            return;
        }
        const displayName = sanitizeUserText(req.body?.displayName, DISPLAY_NAME_MAX_LENGTH);
        if (!displayName) {
            res.status(400).json({ errorCode: 'DISPLAY_NAME_REQUIRED' });
            return;
        }
        if (usersByEmail.has(email)) {
            res.status(409).json({ errorCode: 'EMAIL_TAKEN' });
            return;
        }

        const passwordHash = await hashPassword(password);
        // Re-check after the async hash — two concurrent signups could both
        // have passed the guard above (TOCTOU on the email key).
        if (usersByEmail.has(email)) {
            res.status(409).json({ errorCode: 'EMAIL_TAKEN' });
            return;
        }

        const user = createUser({ email, passwordHash, displayName });
        users.set(user.id, user);
        usersByEmail.set(email, user.id);
        try {
            await persistUser(user);
        } catch (error) {
            users.delete(user.id);
            usersByEmail.delete(email);
            logger.warn({ event: 'user_signup_persist_failed', error: error?.message });
            res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            return;
        }
        setAuthCookie(req, res, user);
        logger.info({ event: 'user_signup', userId: user.id });
        res.json({ ok: true, user: publicUser(user) });
    });

    router.post('/auth/login', async (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;

        const email = normalizeEmail(req.body?.email);
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        // Same errorCode for unknown email and wrong password — no enumeration.
        const failureKey = `${requestIp}:${email || 'invalid'}`;
        const lockout = rateLimiters.authFailure.check(failureKey);
        if (!lockout.allowed) {
            res.status(429).json({ errorCode: 'RATE_LIMITED', retryAfterMs: lockout.retryAfterMs });
            return;
        }

        const userId = email ? usersByEmail.get(email) : null;
        const user = userId ? users.get(userId) : null;
        const passwordOk = await verifyLoginPassword(user, password);
        if (!user || !passwordOk) {
            rateLimiters.authFailure.consume(failureKey);
            res.status(401).json({ errorCode: 'INVALID_CREDENTIALS' });
            return;
        }
        if (user.banned) {
            res.status(403).json({ errorCode: 'ACCOUNT_BANNED' });
            return;
        }

        rateLimiters.authFailure.reset(failureKey);
        setAuthCookie(req, res, user);
        logger.info({ event: 'user_login', userId: user.id });
        res.json({ ok: true, user: publicUser(user) });
    });

    router.post('/auth/logout', (req, res) => {
        clearAuthCookie(req, res);
        rotateAnonymousIdentity?.(req, res);
        res.json({ ok: true });
    });

    // 200 with user:null for guests (not 401) — this probe runs on every page
    // load and a 401 would spam the browser console for every signed-out visitor.
    router.get('/auth/me', (req, res) => {
        res.json({ ok: true, user: req.user ? publicUser(req.user) : null });
    });

    router.patch('/me/profile', requireUser, async (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.profileMutation, req.user.id)) return;

        const body = req.body || {};
        const profilePatch = {};
        if (body.displayName !== undefined) {
            const displayName = sanitizeUserText(body.displayName, DISPLAY_NAME_MAX_LENGTH);
            if (!displayName) {
                res.status(400).json({ errorCode: 'DISPLAY_NAME_REQUIRED' });
                return;
            }
            profilePatch.displayName = displayName;
        }
        if (body.avatarColor !== undefined) {
            if (normalizeAvatarColor(body.avatarColor) !== body.avatarColor) {
                res.status(400).json({ errorCode: 'AVATAR_COLOR_INVALID' });
                return;
            }
            profilePatch.avatarColor = body.avatarColor;
        }
        if (body.bio !== undefined) {
            if (typeof body.bio !== 'string' || Array.from(body.bio).length > BIO_MAX_LENGTH) {
                res.status(400).json({ errorCode: 'BIO_TOO_LONG' });
                return;
            }
            profilePatch.bio = sanitizeUserText(body.bio, BIO_MAX_LENGTH);
        }
        try {
            await runUserMutation(req.user, async () => {
                const previousProfile = {
                    displayName: req.user.displayName,
                    avatarColor: req.user.avatarColor,
                    bio: req.user.bio
                };
                Object.assign(req.user, profilePatch);
                try {
                    await persistUser(req.user);
                } catch (error) {
                    Object.assign(req.user, previousProfile);
                    throw error;
                }
            });
        } catch (error) {
            if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED') {
                res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
                return;
            }
            logger.warn({ event: 'profile_persist_failed', userId: req.user.id, error: error?.message });
            res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            return;
        }
        res.json({ ok: true, user: publicUser(req.user) });
    });

    router.post('/me/focus-session', requireUser, async (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.focusLog, req.user.id)) return;

        const minutes = Number(req.body?.minutes);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > FOCUS_SESSION_MAX_MINUTES) {
            res.status(400).json({ errorCode: 'FOCUS_MINUTES_INVALID' });
            return;
        }
        const completionId = normalizeCompletionId(req.body?.completionId);
        if (!completionId) {
            res.status(400).json({ errorCode: 'FOCUS_COMPLETION_ID_INVALID' });
            return;
        }
        let result;
        try {
            result = await runUserMutation(req.user, async () => {
                const previousFocusStats = structuredClone(req.user.focusStats);
                const previousStreak = structuredClone(req.user.streak);
                const applied = applyFocusSession(req.user, { minutes, completionId });
                if (applied.duplicate) return applied;

                try {
                    const persisted = await persistFocusCompletion(req.user, applied);
                    if (persisted?.duplicate) {
                        req.user.focusStats = persisted.focusStats || previousFocusStats;
                        req.user.streak = persisted.streak || previousStreak;
                        return {
                            ...applied,
                            duplicate: true,
                            acceptedMinutes: persisted.acceptedMinutes,
                            minutes: persisted.acceptedMinutes,
                            dayKey: persisted.dayKey,
                            focusStats: req.user.focusStats,
                            streak: req.user.streak
                        };
                    }
                    return applied;
                } catch (error) {
                    req.user.focusStats = previousFocusStats;
                    req.user.streak = previousStreak;
                    throw error;
                }
            });
        } catch (error) {
            if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED') {
                res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
                return;
            }
            logger.warn({ event: 'focus_persist_failed', userId: req.user.id, error: error?.message });
            res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            return;
        }
        res.json({
            ok: true,
            acceptedMinutes: result.acceptedMinutes,
            duplicate: result.duplicate,
            focusStats: result.focusStats,
            streak: result.streak
        });
    });

    // One-time import of the pre-signup localStorage focus history. Merge is
    // max-per-day, so re-imports never inflate totals.
    router.post('/me/stats/import', requireUser, async (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.profileMutation, req.user.id)) return;

        const imported = sanitizeFocusStats({ days: req.body?.days });
        let stats;
        try {
            stats = await runUserMutation(req.user, async () => {
                const previousFocusStats = structuredClone(req.user.focusStats);
                const nextStats = req.user.focusStats;
                for (const [dayKey, day] of Object.entries(imported.days)) {
                    const existing = nextStats.days[dayKey];
                    if (!existing) {
                        nextStats.days[dayKey] = day;
                    } else {
                        existing.focusMinutes = Math.max(existing.focusMinutes, day.focusMinutes);
                        existing.sessions = Math.max(existing.sessions, day.sessions);
                    }
                }
                let totalFocusMinutes = 0;
                let totalSessions = 0;
                for (const day of Object.values(nextStats.days)) {
                    totalFocusMinutes += day.focusMinutes;
                    totalSessions += day.sessions;
                }
                nextStats.totalFocusMinutes = Math.max(nextStats.totalFocusMinutes, totalFocusMinutes);
                nextStats.totalSessions = Math.max(nextStats.totalSessions, totalSessions);
                try {
                    await persistUser(req.user);
                    return nextStats;
                } catch (error) {
                    req.user.focusStats = previousFocusStats;
                    throw error;
                }
            });
        } catch (error) {
            if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED') {
                res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
                return;
            }
            logger.warn({ event: 'stats_import_persist_failed', userId: req.user.id, error: error?.message });
            res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            return;
        }
        res.json({ ok: true, focusStats: stats, streak: req.user.streak });
    });

    router.get('/me/stats', requireUser, (req, res) => {
        res.json({ ok: true, focusStats: req.user.focusStats, streak: req.user.streak });
    });

    router.get('/me/rooms', requireUser, (req, res) => {
        const roomsList = req.user.myRooms.map((entry) => ({
            ...entry,
            exists: rooms.has(entry.roomId)
        }));
        res.json({ ok: true, rooms: roomsList });
    });

    router.delete('/me', requireUser, async (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;

        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const passwordEnabled = req.user.passwordEnabled !== false && !!req.user.passwordHash;
        const passwordOk = await verifyPassword(password, passwordEnabled ? req.user.passwordHash : null);
        const grantToken = typeof parseCookies === 'function'
            ? parseCookies(req.headers.cookie || '')[GOOGLE_DELETE_GRANT_COOKIE]
            : null;
        const grantOk = !!grantToken && !!oauthSecurity?.consumeProof({
            purpose: 'delete_grant',
            token: grantToken,
            userId: req.user.id
        });
        if (grantToken) clearDeletionGrantCookie(req, res);
        if ((!passwordEnabled || !passwordOk) && !grantOk) {
            res.status(401).json({ errorCode: 'INVALID_CREDENTIALS' });
            return;
        }

        const user = req.user;
        const userId = user.id;
        let cleanupPending = false;
        try {
            cleanupPending = await runUserMutation(user, async () => {
                await deleteUser(user);
                usersByEmail.delete(user.email);
                users.delete(userId);
                let pending = false;
                if (typeof onUserDeleted === 'function') {
                    try {
                        const cleanup = await onUserDeleted(userId);
                        pending = !!cleanup?.cleanupPending;
                    } catch (error) {
                        pending = true;
                        logger.error({ event: 'user_delete_cascade_failed', userId, error: error?.message });
                    }
                }
                return pending;
            });
        } catch (error) {
            if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED') {
                res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
                return;
            }
            logger.warn({ event: 'user_delete_persist_failed', userId, error: error?.message });
            res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            return;
        }
        clearAuthCookie(req, res);
        rotateAnonymousIdentity?.(req, res);
        logger.info({ event: 'user_deleted', userId });
        res.json({ ok: true, cleanupPending });
    });

    return router;
}

module.exports = {
    createAuthRouter,
    verifyLoginPassword
};
