const crypto = require('node:crypto');

const DEFAULT_STALE_AFTER_MS = 150000;

function createSessionKey(roomId, userId, videoSessionId) {
    return `${roomId || ''}:${userId || ''}:${videoSessionId || ''}`;
}

function createVideoSessionRegistry(options = {}) {
    const staleAfterMs = options.staleAfterMs || DEFAULT_STALE_AFTER_MS;
    const now = options.now || (() => Date.now());
    const logger = options.logger || null;
    const sessions = new Map();

    function listActive() {
        return Array.from(sessions.values()).filter((session) => !session.leftAt);
    }

    function findSession(match = {}) {
        if (match.videoSessionId) {
            return listActive().find((session) => {
                return session.videoSessionId === match.videoSessionId;
            }) || null;
        }
        return listActive().find((session) => {
            return (!match.roomId || session.roomId === match.roomId)
                && (!match.userId || session.userId === match.userId)
                && (!match.clientSessionId || session.clientSessionId === match.clientSessionId);
        }) || null;
    }

    function registerVideoSession(session = {}) {
        const joinedAt = session.joinedAt || now();
        const previous = findSession({
            roomId: session.roomId,
            userId: session.userId,
            videoSessionId: session.videoSessionId
        });
        const videoSessionId = previous?.videoSessionId
            || session.videoSessionId
            || crypto.randomBytes(32).toString('base64url');
        const key = previous?.key || createSessionKey(session.roomId, session.userId, videoSessionId);
        const next = {
            ...previous,
            ...session,
            key,
            videoSessionId,
            joinedAt: previous?.joinedAt || joinedAt,
            lastSeenAt: session.lastSeenAt || now(),
            leftAt: null
        };
        sessions.set(key, next);
        return next;
    }

    function updateVideoSession(match = {}, patch = {}) {
        const session = findSession(match);
        if (!session || session.leftAt) return null;
        const next = {
            ...session,
            ...patch,
            lastSeenAt: patch.lastSeenAt || session.lastSeenAt || now()
        };
        sessions.set(session.key, next);
        return next;
    }

    function markVideoSessionLeft(match = {}, reason = 'left') {
        const session = findSession(match);
        if (!session || session.leftAt) return null;
        const leftAt = now();
        const next = {
            ...session,
            leftAt,
            leaveReason: reason,
            durationSeconds: Math.max(0, Math.round((leftAt - session.joinedAt) / 1000))
        };
        sessions.set(session.key, next);
        logger?.info({
            event: 'video_session_ended',
            provider: next.provider,
            roomId: next.roomId,
            userId: next.userId,
            videoSessionId: next.videoSessionId,
            durationSeconds: next.durationSeconds,
            reason
        });
        return next;
    }

    function markSocketSessionsLeft(socketId, reason = 'socket_disconnect') {
        if (!socketId) return [];
        const ended = [];
        for (const session of listActive()) {
            if (session.socketId === socketId) {
                const left = markVideoSessionLeft(session, reason);
                if (left) ended.push(left);
            }
        }
        return ended;
    }

    function touchVideoSession(match = {}) {
        return updateVideoSession(match, { lastSeenAt: now() });
    }

    function countActiveGlobalVideoParticipants() {
        return listActive().length;
    }

    function countActiveRoomVideoParticipants(roomId) {
        return listActive().filter((session) => session.roomId === roomId).length;
    }

    function sweepStaleVideoSessions() {
        const cutoff = now() - staleAfterMs;
        const ended = [];
        for (const session of listActive()) {
            if ((session.lastSeenAt || session.joinedAt) < cutoff) {
                const left = markVideoSessionLeft(session, 'stale');
                if (left) ended.push(left);
            }
        }
        if (ended.length) {
            logger?.info({
                event: 'video_sessions_swept',
                endedCount: ended.length,
                activeGlobalVideoParticipants: countActiveGlobalVideoParticipants()
            });
        }
        return ended;
    }

    return {
        registerVideoSession,
        updateVideoSession,
        markVideoSessionLeft,
        markSocketSessionsLeft,
        touchVideoSession,
        countActiveGlobalVideoParticipants,
        countActiveRoomVideoParticipants,
        sweepStaleVideoSessions,
        findSession,
        listActive,
        sessions
    };
}

module.exports = {
    createVideoSessionRegistry
};
