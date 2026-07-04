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
        persistUsersSoon,
        flushUsers,
        requireUser,
        logger
    } = deps;

    const router = express.Router();

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
        persistUsersSoon();
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

    router.post('/auth/logout', (req, res) => {
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
        if (body.displayName !== undefined) {
            const displayName = sanitizeUserText(body.displayName, DISPLAY_NAME_MAX_LENGTH);
            if (!displayName) {
                res.status(400).json({ errorCode: 'DISPLAY_NAME_REQUIRED' });
                return;
            }
            req.user.displayName = displayName;
        }
        if (body.avatarColor !== undefined) {
            if (normalizeAvatarColor(body.avatarColor) !== body.avatarColor) {
                res.status(400).json({ errorCode: 'AVATAR_COLOR_INVALID' });
                return;
            }
            req.user.avatarColor = body.avatarColor;
        }
        if (body.bio !== undefined) {
            if (typeof body.bio !== 'string' || Array.from(body.bio).length > BIO_MAX_LENGTH) {
                res.status(400).json({ errorCode: 'BIO_TOO_LONG' });
                return;
            }
            req.user.bio = sanitizeUserText(body.bio, BIO_MAX_LENGTH);
        }
        persistUsersSoon();
        res.json({ ok: true, user: publicUser(req.user) });
    });

    router.post('/me/focus-session', requireUser, (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.focusLog, req.user.id)) return;

        const minutes = Number(req.body?.minutes);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > FOCUS_SESSION_MAX_MINUTES) {
            res.status(400).json({ errorCode: 'FOCUS_MINUTES_INVALID' });
            return;
        }
        const result = applyFocusSession(req.user, { minutes });
        persistUsersSoon();
        res.json({ ok: true, focusStats: result.focusStats, streak: result.streak });
    });

    // One-time import of the pre-signup localStorage focus history. Merge is
    // max-per-day, so re-imports never inflate totals.
    router.post('/me/stats/import', requireUser, (req, res) => {
        if (!applyHttpRateLimit(req, res, rateLimiters.profileMutation, req.user.id)) return;

        const imported = sanitizeFocusStats({ days: req.body?.days });
        const stats = req.user.focusStats;
        for (const [dayKey, day] of Object.entries(imported.days)) {
            const existing = stats.days[dayKey];
            if (!existing) {
                stats.days[dayKey] = day;
            } else {
                existing.focusMinutes = Math.max(existing.focusMinutes, day.focusMinutes);
                existing.sessions = Math.max(existing.sessions, day.sessions);
            }
        }
        let totalFocusMinutes = 0;
        let totalSessions = 0;
        for (const day of Object.values(stats.days)) {
            totalFocusMinutes += day.focusMinutes;
            totalSessions += day.sessions;
        }
        stats.totalFocusMinutes = totalFocusMinutes;
        stats.totalSessions = totalSessions;
        persistUsersSoon();
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
        const passwordOk = await verifyPassword(password, req.user.passwordHash);
        if (!passwordOk) {
            res.status(401).json({ errorCode: 'INVALID_CREDENTIALS' });
            return;
        }

        const userId = req.user.id;
        usersByEmail.delete(req.user.email);
        users.delete(userId);
        clearAuthCookie(req, res);
        // PDPL delete-my-data: flush immediately rather than debounced, so the
        // record is gone from disk before we acknowledge.
        await flushUsers();
        logger.info({ event: 'user_deleted', userId });
        res.json({ ok: true });
    });

    return router;
}

module.exports = {
    createAuthRouter
};
