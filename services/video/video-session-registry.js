const DEFAULT_STALE_AFTER_MS = 150000;

function createSessionKey(roomId, userId, clientSessionId) {
    return `${roomId || ''}:${userId || ''}:${clientSessionId || ''}`;
}

function createVideoSessionRegistry(options = {}) {
    const staleAfterMs = options.staleAfterMs || DEFAULT_STALE_AFTER_MS;
    const now = options.now || (() => Date.now());
    const logger = options.logger || null;
    const sessions = new Map();

    function listActive() {
        return Array.from(sessions.values()).filter((session) => !session.leftAt);
    }

    function registerVideoSession(session = {}) {
        const joinedAt = session.joinedAt || now();
        const key = createSessionKey(session.roomId, session.userId, session.clientSessionId);
        const previous = sessions.get(key);
        const next = {
            ...previous,
            ...session,
            key,
            joinedAt: previous?.joinedAt || joinedAt,
            lastSeenAt: session.lastSeenAt || now(),
            leftAt: null
        };
        sessions.set(key, next);
        return next;
    }

    function updateVideoSession(match = {}, patch = {}) {
        const key = createSessionKey(match.roomId, match.userId, match.clientSessionId);
        const session = sessions.get(key);
        if (!session || session.leftAt) return null;
        const next = {
            ...session,
            ...patch,
            lastSeenAt: patch.lastSeenAt || session.lastSeenAt || now()
        };
        sessions.set(key, next);
        return next;
    }

    function markVideoSessionLeft(match = {}, reason = 'left') {
        const key = createSessionKey(match.roomId, match.userId, match.clientSessionId);
        const session = sessions.get(key);
        if (!session || session.leftAt) return null;
        const leftAt = now();
        const next = {
            ...session,
            leftAt,
            leaveReason: reason,
            durationSeconds: Math.max(0, Math.round((leftAt - session.joinedAt) / 1000))
        };
        sessions.set(key, next);
        logger?.info({
            event: 'video_session_ended',
            provider: next.provider,
            roomId: next.roomId,
            userId: next.userId,
            clientSessionId: next.clientSessionId,
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
        listActive,
        sessions
    };
}

module.exports = {
    createVideoSessionRegistry
};
