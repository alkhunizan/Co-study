// User auth + account REST endpoints. Pure route logic — every server-bound
// dependency (stores, limiters, cookie helpers) is injected by the factory.
//
// CSRF note: no token needed. originGuard rejects cross-origin non-GET
// requests and the auth cookie is SameSite=Lax, so cross-site POSTs never
// carry a session.
const express = require('express');
const { hashPassword, verifyPassword } = require('./password');
const {
    normalizeEmail,
    validatePassword,
    normalizeAvatarColor,
    sanitizeUserText
} = require('./index');
const { createUser, applyFocusSession, sanitizeFocusStats } = require('../../user-store');

const DISPLAY_NAME_MAX_LENGTH = 20;
const BIO_MAX_LENGTH = 160;
const FOCUS_SESSION_MAX_MINUTES = 240;

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
        flushUsers,
        requireUser,
        disconnectUser,
        canDeleteWithProvider,
        deletePlatformUser,
        preparePlatformDeletion = async () => () => {},
        logFocusSession,
        logger
    } = deps;

    const router = express.Router();
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    const mutations = new Map();
    function mutateAccount(req, res, fields, change) {
        const user = req.user;
        const epoch = user.tokenEpoch;
        const previous = mutations.get(user.id) || Promise.resolve();
        const operation = previous.catch(() => {}).then(async () => {
            if (users.get(user.id) !== user || user.tokenEpoch !== epoch) {
                return res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
            }
            const before = Object.fromEntries(fields.map((field) => [field, structuredClone(user[field])]));
            const result = change(user);
            try {
                await flushUsers();
            } catch {
                // Restore only this operation's fields. Room history, revocations
                // and other accounts may have changed while the store was busy.
                // Also restore the detached object: a concurrent failed delete
                // can restore that same object later. Never reinsert it here.
                Object.assign(user, before);
                // Supersede any whole-map snapshot queued during the failed save.
                try { await flushUsers(); } catch {
                    logger.error({ event: 'account_rollback_persist_failed', userId: user.id });
                }
                return res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            }
            if (users.get(user.id) !== user || user.tokenEpoch !== epoch) {
                return res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
            }
            return result();
        });
        mutations.set(user.id, operation);
        void operation.finally(() => {
            if (mutations.get(user.id) === operation) mutations.delete(user.id);
        }).catch(() => {});
        return operation;
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
            await flushUsers();
        } catch {
            users.delete(user.id);
            usersByEmail.delete(email);
            return res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
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
        const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;
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

    router.post('/auth/logout', async (req, res) => {
        if (req.user) {
            req.user.tokenEpoch += 1;
            disconnectUser(req.user.id);
        }
        // A retry may carry a cookie invalidated in memory by a failed first
        // attempt. Commit pending revocations before acknowledging that retry.
        await flushUsers();
        clearAuthCookie(req, res);
        res.json({ ok: true });
    });

    // 200 with user:null for guests (not 401) — this probe runs on every page
    // load and a 401 would spam the browser console for every signed-out visitor.
    router.get('/auth/me', (req, res) => {
        res.json({ ok: true, user: req.user ? publicUser(req.user) : null });
    });

    router.patch('/me/profile', requireUser, (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.profileMutation, req.user.id)) return;

        const body = req.body || {};
        const patch = {};
        if (body.displayName !== undefined) {
            const displayName = sanitizeUserText(body.displayName, DISPLAY_NAME_MAX_LENGTH);
            if (!displayName) {
                res.status(400).json({ errorCode: 'DISPLAY_NAME_REQUIRED' });
                return;
            }
            patch.displayName = displayName;
        }
        if (body.avatarColor !== undefined) {
            if (normalizeAvatarColor(body.avatarColor) !== body.avatarColor) {
                res.status(400).json({ errorCode: 'AVATAR_COLOR_INVALID' });
                return;
            }
            patch.avatarColor = body.avatarColor;
        }
        if (body.bio !== undefined) {
            if (typeof body.bio !== 'string' || Array.from(body.bio).length > BIO_MAX_LENGTH) {
                res.status(400).json({ errorCode: 'BIO_TOO_LONG' });
                return;
            }
            patch.bio = sanitizeUserText(body.bio, BIO_MAX_LENGTH);
        }
        return mutateAccount(req, res, Object.keys(patch), (user) => {
            Object.assign(user, patch);
            return () => res.json({ ok: true, user: publicUser(user) });
        });
    });

    router.post('/me/focus-session', requireUser, (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.focusLog, req.user.id)) return;

        const minutes = Number(req.body?.minutes);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > FOCUS_SESSION_MAX_MINUTES) {
            res.status(400).json({ errorCode: 'FOCUS_MINUTES_INVALID' });
            return;
        }
        return mutateAccount(req, res, ['focusStats', 'streak'], (user) => {
            const result = applyFocusSession(user, { minutes });
            return () => {
                if (typeof logFocusSession === 'function') {
                    void Promise.resolve().then(() => logFocusSession({
                        userId: user.id, minutes: result.minutes, dayKey: result.dayKey
                    })).catch(() => logger.error({ event: 'focus_analytics_failed' }));
                }
                return res.json({ ok: true, focusStats: result.focusStats, streak: result.streak });
            };
        });
    });

    // One-time import of the pre-signup localStorage focus history. Merge is
    // max-per-day, so re-imports never inflate totals.
    router.post('/me/stats/import', requireUser, (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.profileMutation, req.user.id)) return;

        const imported = sanitizeFocusStats({ days: req.body?.days });
        return mutateAccount(req, res, ['focusStats', 'streak'], (user) => {
        const stats = user.focusStats;
        for (const [dayKey, day] of Object.entries(imported.days)) {
            const existing = stats.days[dayKey];
            if (!existing) {
                stats.days[dayKey] = day;
            } else {
                existing.focusMinutes = Math.max(existing.focusMinutes, day.focusMinutes);
                existing.sessions = Math.max(existing.sessions, day.sessions);
            }
        }
        user.focusStats = sanitizeFocusStats(stats);
        return () => res.json({ ok: true, focusStats: user.focusStats, streak: user.streak });
        });
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
        const passwordOk = req.user.authProvider === 'google'
            ? canDeleteWithProvider(req)
            : await verifyPassword(password, req.user.passwordHash);
        if (!passwordOk) {
            res.status(401).json({
                errorCode: req.user.authProvider === 'google' ? 'REAUTH_REQUIRED' : 'INVALID_CREDENTIALS'
            });
            return;
        }

        const userId = req.user.id;
        const finishPlatformDeletion = await preparePlatformDeletion(userId);
        req.user.tokenEpoch += 1;
        disconnectUser(userId);
        usersByEmail.delete(req.user.email);
        users.delete(userId);
        // PDPL delete-my-data: flush immediately rather than debounced, so the
        // record is gone from disk before we acknowledge.
        try {
            await flushUsers();
            await deletePlatformUser(userId);
        } catch (error) {
            users.set(userId, req.user);
            usersByEmail.set(req.user.email, userId);
            try { await flushUsers(); } catch (_restoreError) {}
            logger.error({ event: 'user_delete_failed', userId });
            return res.status(error.status || 503).json({ errorCode: error.errorCode || 'PERSISTENCE_UNAVAILABLE' });
        }
        finishPlatformDeletion();
        clearAuthCookie(req, res);
        logger.info({ event: 'user_deleted', userId });
        res.json({ ok: true });
    });

    return router;
}

module.exports = {
    createAuthRouter
};
