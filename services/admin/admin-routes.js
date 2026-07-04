// Hidden admin ops console — API + page, mounted at the secret ADMIN_PATH
// only when both ADMIN_PATH and ADMIN_PASSWORD_HASH are configured. When not
// mounted, every admin URL 404s exactly like any unknown path.
//
// The path is obscurity, not security: the real controls are the PBKDF2
// password gate, the per-IP + global login lockout, and the 12h Path-scoped
// HMAC cookie.
const path = require('node:path');
const express = require('express');
const { verifyPassword } = require('../auth/password');
const { createSessionToken, verifySessionToken } = require('../auth');
const { sanitizeUserText } = require('../auth');

const ADMIN_COOKIE_NAME = 'coStudyAdmin';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_TOKEN_USER_ID = 'admin';
const ANNOUNCEMENT_MAX_LENGTH = 200;
const ANNOUNCEMENT_MAX_MINUTES = 1440;
const USERS_PAGE_SIZE = 50;

function createAdminRouter(deps) {
    const {
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
        deleteRoom,
        persistUsersSoon,
        persistRoomsSoon,
        dashboard,
        logger
    } = deps;

    const router = express.Router();

    function setAdminCookie(req, res) {
        const token = createSessionToken({
            userId: ADMIN_TOKEN_USER_ID,
            tokenEpoch: 1,
            secret: config.sessionSecret
        });
        const cookieParts = [
            `${ADMIN_COOKIE_NAME}=${token}`,
            `Path=${config.admin.path}`,
            'HttpOnly',
            'SameSite=Strict',
            `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`
        ];
        if (req.secure) cookieParts.push('Secure');
        res.setHeader('Set-Cookie', cookieParts.join('; '));
    }

    function clearAdminCookie(res) {
        res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=${config.admin.path}; HttpOnly; SameSite=Strict; Max-Age=0`);
    }

    function parseCookies(header = '') {
        return header.split(';').reduce((acc, part) => {
            const [rawKey, ...rawValue] = part.split('=');
            const key = rawKey ? rawKey.trim() : '';
            if (key) acc[key] = rawValue.join('=').trim();
            return acc;
        }, /** @type {Record<string, string>} */ ({}));
    }

    function requireAdmin(req, res, next) {
        const token = parseCookies(req.headers.cookie || '')[ADMIN_COOKIE_NAME];
        const verified = verifySessionToken(token, {
            secret: config.sessionSecret,
            maxAgeMs: ADMIN_SESSION_TTL_MS
        });
        if (!verified || verified.userId !== ADMIN_TOKEN_USER_ID) {
            res.status(401).json({ errorCode: 'ADMIN_AUTH_REQUIRED' });
            return;
        }
        next();
    }

    function activeAnnouncement(now = Date.now()) {
        const current = announcementState.current;
        if (!current) return null;
        if (current.expiresAt && current.expiresAt <= now) {
            announcementState.current = null;
            return null;
        }
        return current;
    }

    function countParticipants() {
        let total = 0;
        for (const room of rooms.values()) {
            total += room.users ? room.users.size : 0;
        }
        return total;
    }

    // ---- page + session ----

    router.get('/', (_req, res) => {
        res.sendFile(path.join(__dirname, '..', '..', 'admin.html'));
    });

    router.post('/api/login', async (req, res) => {
        const requestIp = getRequestIp(req);
        // Per-IP lockout plus a global key so distributed guessing is blunted too.
        if (!applyHttpRateLimit(req, res, rateLimiters.adminLogin, requestIp)) return;
        if (!applyHttpRateLimit(req, res, rateLimiters.adminLogin, 'global')) return;

        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        const valid = password ? await verifyPassword(password, config.admin.passwordHash) : false;
        if (!valid) {
            logger.warn({ event: 'admin_login_failed', ip: requestIp });
            res.status(401).json({ errorCode: 'ADMIN_INVALID' });
            return;
        }
        rateLimiters.adminLogin.reset(requestIp);
        rateLimiters.adminLogin.reset('global');
        setAdminCookie(req, res);
        logger.info({ event: 'admin_login', ip: requestIp });
        res.json({ ok: true });
    });

    router.post('/api/logout', requireAdmin, (_req, res) => {
        clearAdminCookie(res);
        res.json({ ok: true });
    });

    // ---- overview ----

    router.get('/api/overview', requireAdmin, (_req, res) => {
        let bannedCount = 0;
        for (const user of users.values()) {
            if (user.banned) bannedCount += 1;
        }
        const memory = process.memoryUsage();
        res.json({
            ok: true,
            uptimeSeconds: Math.round(process.uptime()),
            memory: {
                rssMb: Math.round(memory.rss / (1024 * 1024)),
                heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024))
            },
            roomCount: rooms.size,
            participantCount: countParticipants(),
            activeGlobalVideoParticipants: videoSessionRegistry.countActiveGlobalVideoParticipants(),
            maxGlobalVideoParticipants: config.video.maxGlobalParticipants,
            videoJoinDisabled: isVideoJoinDisabled(),
            videoJoinDisabledDefault: !!config.video.joinDisabled,
            userCount: users.size,
            bannedCount,
            announcement: activeAnnouncement(),
            backup: {
                intervalMinutes: config.backup.intervalMinutes,
                lastRunAt: backupScheduler.status.lastRunAt,
                lastError: backupScheduler.status.lastError
            }
        });
    });

    // ---- dashboard (Supabase views: aggregates + time-series not held in
    // memory). Absent backend → available:false, so the console degrades
    // gracefully to its in-memory overview. ----

    router.get('/api/dashboard', requireAdmin, async (_req, res) => {
        if (!dashboard) {
            res.json({ ok: true, available: false, source: 'memory' });
            return;
        }
        try {
            const [overview, userStats, dailyActive] = await Promise.all([
                dashboard.overview(),
                dashboard.userStats(),
                dashboard.dailyActive()
            ]);
            res.json({
                ok: true,
                available: true,
                source: 'supabase',
                overview: Array.isArray(overview) ? overview[0] || null : null,
                userStats: Array.isArray(userStats) ? userStats : [],
                dailyActive: Array.isArray(dailyActive) ? dailyActive : []
            });
        } catch (error) {
            logger.warn({ event: 'admin_dashboard_failed', error: error && error.message });
            res.status(502).json({ errorCode: 'DASHBOARD_UNAVAILABLE' });
        }
    });

    // ---- rooms ----

    router.get('/api/rooms', requireAdmin, (_req, res) => {
        const summaries = Array.from(rooms.values()).map((room) => ({
            roomId: room.id,
            name: room.name,
            participantCount: room.users ? room.users.size : 0,
            mediaMode: room.mediaMode,
            requirePassword: !!room.requirePassword,
            createdAt: room.createdAt,
            videoProviderStatus: room.videoProviderStatus || null,
            activeVideoParticipants: videoSessionRegistry.countActiveRoomVideoParticipants(room.id),
            schedule: room.schedule ? buildScheduleSummary(room.schedule) : null
        }));
        summaries.sort((a, b) => b.participantCount - a.participantCount || b.createdAt - a.createdAt);
        res.json({ ok: true, rooms: summaries });
    });

    router.get('/api/rooms/:roomId', requireAdmin, (req, res) => {
        const room = rooms.get((req.params.roomId || '').trim().toUpperCase());
        if (!room) {
            res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
            return;
        }
        res.json({
            ok: true,
            room: {
                roomId: room.id,
                name: room.name,
                mediaMode: room.mediaMode,
                requirePassword: !!room.requirePassword,
                createdAt: room.createdAt,
                messageCount: Array.isArray(room.messages) ? room.messages.length : 0,
                board: room.board,
                schedule: room.schedule ? buildScheduleSummary(room.schedule) : null,
                // Chat content is deliberately omitted — inspect shows
                // structure and participants, not private conversation.
                participants: Array.from(room.users ? room.users.values() : []).map((user) => ({
                    socketId: user.socketId,
                    name: user.name,
                    sessionIdPrefix: (user.sessionId || '').slice(0, 8),
                    joinedAt: user.joinedAt,
                    cameraOn: !!user.cameraOn,
                    status: user.status || null
                }))
            }
        });
    });

    router.post('/api/rooms/:roomId/close', requireAdmin, (req, res) => {
        const roomId = (req.params.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
            res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
            return;
        }
        io.to(roomId).emit('room-closed', { reason: 'admin' });
        const memberSocketIds = Array.from(room.users ? room.users.keys() : []);
        for (const socketId of memberSocketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
        }
        deleteRoom(roomId);
        logger.warn({ event: 'admin_room_closed', roomId, kicked: memberSocketIds.length });
        res.json({ ok: true, kicked: memberSocketIds.length });
    });

    router.post('/api/rooms/:roomId/kick', requireAdmin, (req, res) => {
        const roomId = (req.params.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
            res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
            return;
        }
        const socketId = typeof req.body?.socketId === 'string' ? req.body.socketId : '';
        if (!socketId || !room.users || !room.users.has(socketId)) {
            res.status(404).json({ errorCode: 'PARTICIPANT_NOT_FOUND' });
            return;
        }
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.emit('kicked', { reason: 'admin' });
            socket.disconnect(true);
        } else {
            // Stale record — drop it so the room view stays truthful.
            room.users.delete(socketId);
        }
        logger.warn({ event: 'admin_participant_kicked', roomId, socketId });
        res.json({ ok: true });
    });

    // ---- user reports ----

    router.get('/api/reports', requireAdmin, (_req, res) => {
        const reports = [];
        for (const room of rooms.values()) {
            if (!Array.isArray(room.reports)) continue;
            for (const report of room.reports) {
                reports.push({
                    roomId: room.id,
                    roomName: room.name,
                    ...report,
                    targetStillConnected: !!room.users?.has(report.targetSocketId)
                });
            }
        }
        reports.sort((a, b) => b.createdAt - a.createdAt);
        res.json({ ok: true, reports: reports.slice(0, 200) });
    });

    router.post('/api/rooms/:roomId/reports/:reportId/resolve', requireAdmin, (req, res) => {
        const roomId = (req.params.roomId || '').trim().toUpperCase();
        const room = rooms.get(roomId);
        if (!room) {
            res.status(404).json({ errorCode: 'ROOM_NOT_FOUND' });
            return;
        }
        const report = Array.isArray(room.reports)
            ? room.reports.find((entry) => entry.id === req.params.reportId)
            : null;
        if (!report) {
            res.status(404).json({ errorCode: 'REPORT_NOT_FOUND' });
            return;
        }
        report.status = 'resolved';
        if (typeof persistRoomsSoon === 'function') persistRoomsSoon();
        logger.warn({ event: 'admin_report_resolved', roomId, reportId: report.id });
        res.json({ ok: true });
    });

    // ---- video kill-switch ----

    router.get('/api/video-kill-switch', requireAdmin, (_req, res) => {
        res.json({
            ok: true,
            disabled: isVideoJoinDisabled(),
            envDefault: !!config.video.joinDisabled,
            overridden: runtimeFlags.videoJoinDisabled !== null
        });
    });

    router.post('/api/video-kill-switch', requireAdmin, (req, res) => {
        const disabled = req.body?.disabled;
        if (typeof disabled !== 'boolean') {
            res.status(400).json({ errorCode: 'KILL_SWITCH_INVALID' });
            return;
        }
        runtimeFlags.videoJoinDisabled = disabled;
        logger.warn({ event: 'admin_video_kill_switch', disabled });
        res.json({ ok: true, disabled: isVideoJoinDisabled() });
    });

    // ---- users ----

    router.get('/api/users', requireAdmin, (req, res) => {
        const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
        const offset = Number.parseInt(String(req.query.offset || '0'), 10) || 0;
        let list = Array.from(users.values());
        if (query) {
            list = list.filter((user) =>
                user.email.includes(query) || user.displayName.toLowerCase().includes(query));
        }
        list.sort((a, b) => b.createdAt - a.createdAt);
        const page = list.slice(offset, offset + USERS_PAGE_SIZE).map((user) => ({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            createdAt: user.createdAt,
            banned: !!user.banned,
            streakCurrent: user.streak.current,
            totalFocusMinutes: user.focusStats.totalFocusMinutes
        }));
        res.json({ ok: true, total: list.length, offset, users: page });
    });

    function setBanned(req, res, banned) {
        const user = users.get(req.params.userId);
        if (!user) {
            res.status(404).json({ errorCode: 'USER_NOT_FOUND' });
            return;
        }
        user.banned = banned;
        // Epoch bump kills every outstanding cookie for this user immediately.
        user.tokenEpoch += 1;
        persistUsersSoon();
        if (banned) {
            for (const socket of io.sockets.sockets.values()) {
                if (socket.data && socket.data.userId === user.id) {
                    socket.disconnect(true);
                }
            }
        }
        logger.warn({ event: banned ? 'admin_user_banned' : 'admin_user_unbanned', userId: user.id });
        res.json({ ok: true, banned });
    }

    router.post('/api/users/:userId/ban', requireAdmin, (req, res) => setBanned(req, res, true));
    router.post('/api/users/:userId/unban', requireAdmin, (req, res) => setBanned(req, res, false));

    // ---- broadcast announcement ----

    router.post('/api/broadcast', requireAdmin, (req, res) => {
        const messageAr = sanitizeUserText(req.body?.messageAr, ANNOUNCEMENT_MAX_LENGTH);
        const messageEn = sanitizeUserText(req.body?.messageEn, ANNOUNCEMENT_MAX_LENGTH);
        const durationMinutes = Number.parseInt(String(req.body?.durationMinutes ?? '60'), 10);
        if ((!messageAr && !messageEn)
            || !Number.isInteger(durationMinutes)
            || durationMinutes < 0
            || durationMinutes > ANNOUNCEMENT_MAX_MINUTES) {
            res.status(400).json({ errorCode: 'ANNOUNCEMENT_INVALID' });
            return;
        }
        const announcement = {
            id: `ann-${Date.now().toString(36)}`,
            messageAr,
            messageEn,
            createdAt: Date.now(),
            expiresAt: durationMinutes > 0 ? Date.now() + durationMinutes * 60 * 1000 : null
        };
        announcementState.current = announcement;
        io.emit('announcement', announcement);
        logger.info({ event: 'admin_broadcast', id: announcement.id, durationMinutes });
        res.json({ ok: true, announcement });
    });

    router.delete('/api/broadcast', requireAdmin, (_req, res) => {
        const current = announcementState.current;
        announcementState.current = null;
        if (current) {
            io.emit('announcement-clear', { id: current.id });
        }
        res.json({ ok: true });
    });

    // ---- system ----

    router.post('/api/backup', requireAdmin, (_req, res) => {
        try {
            const result = backupScheduler.runBackup();
            res.json({ ok: true, files: result.files.map((file) => path.basename(file)), entries: result.entries });
        } catch (error) {
            res.status(500).json({ errorCode: 'BACKUP_FAILED', message: error.message });
        }
    });

    router.get('/api/errors', requireAdmin, (_req, res) => {
        res.json({ ok: true, errors: errorBuffer.list() });
    });

    router.get('/api/video-sessions', requireAdmin, (_req, res) => {
        res.json({
            ok: true,
            activeGlobal: videoSessionRegistry.countActiveGlobalVideoParticipants(),
            maxGlobal: config.video.maxGlobalParticipants,
            sessions: videoSessionRegistry.listActive()
        });
    });

    return router;
}

module.exports = {
    createAdminRouter
};
