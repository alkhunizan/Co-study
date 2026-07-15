const crypto = require('node:crypto');

const DEFAULT_PENDING_TTL_MS = 30_000;
const DEFAULT_ENDED_CAPACITY = 200;
const PERSISTENCE_SCHEMA_VERSION = 1;
const OCCUPYING_STATES = new Set(['pending', 'active', 'ending']);

function createSessionKey(roomId, userId, videoSessionId) {
    return `${roomId || ''}:${userId || ''}:${videoSessionId || ''}`;
}

function createRegistryError(code) {
    const error = new Error(code);
    /** @type {any} */ (error).code = code;
    return error;
}

function finiteTimestamp(value, fallback = null) {
    return Number.isFinite(value) ? value : fallback;
}

function normalizePeerIds(session = {}) {
    const values = Array.isArray(session.providerPeerIds)
        ? session.providerPeerIds
        : session.providerPeerId
            ? [session.providerPeerId]
            : [];
    return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function normalizePeerEvents(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([peerId, timestamp]) => (
        typeof peerId === 'string' && peerId.trim() && Number.isFinite(timestamp)
    )));
}

function createVideoSessionRegistry(options = {}) {
    const pendingTtlMs = options.pendingTtlMs || DEFAULT_PENDING_TTL_MS;
    const now = options.now || (() => Date.now());
    const logger = options.logger || null;
    const endedCapacity = options.endedCapacity || DEFAULT_ENDED_CAPACITY;
    const sessions = new Map();
    const endedSessionKeys = [];
    const meetingGenerations = new Map();
    let providerGeneration = 0;

    function incrementProviderGeneration(meetingId = null) {
        providerGeneration += 1;
        if (meetingId) {
            meetingGenerations.set(meetingId, (meetingGenerations.get(meetingId) || 0) + 1);
        }
    }

    function getProviderGeneration(meetingId = null) {
        return meetingId ? (meetingGenerations.get(meetingId) || 0) : providerGeneration;
    }

    function occupancyUnits(session) {
        if (!session || session.leftAt || !OCCUPYING_STATES.has(session.state)) return 0;
        const peerCount = normalizePeerIds(session).length;
        if (peerCount > 0) return peerCount;
        if (session.state === 'pending') {
            // Expiry is a requested transition, not a state transition. Keep
            // the issued credential capacity-bearing and persistable until
            // sweepStaleVideoSessions durably revokes/deletes it.
            return 1;
        }
        // A revoked provider identity stays capacity-bearing until exact kick
        // and participant deletion have succeeded. This prevents a cached
        // provider token from creating occupancy the application cannot see.
        if (session.cleanupPending || session.state === 'active') return 1;
        return 0;
    }

    function isOccupying(session) {
        return occupancyUnits(session) > 0;
    }

    function listActive() {
        return Array.from(sessions.values()).filter(isOccupying);
    }

    function findStoredSession(match = {}) {
        const candidates = Array.from(sessions.values());
        if (match.videoSessionId) {
            return candidates.find((session) => session.videoSessionId === match.videoSessionId) || null;
        }
        return candidates.find((session) => {
            return (!match.roomId || session.roomId === match.roomId)
                && (!match.userId || session.userId === match.userId)
                && (!match.clientSessionId || session.clientSessionId === match.clientSessionId);
        }) || null;
    }

    function findSession(match = {}) {
        const session = findStoredSession(match);
        return isOccupying(session) ? session : null;
    }

    function removeFromEndedRing(key) {
        let index = endedSessionKeys.indexOf(key);
        while (index !== -1) {
            endedSessionKeys.splice(index, 1);
            index = endedSessionKeys.indexOf(key);
        }
    }

    function retainEndedDiagnostic(session) {
        removeFromEndedRing(session.key);
        endedSessionKeys.push(session.key);
        while (endedSessionKeys.length > endedCapacity) {
            const expiredKey = endedSessionKeys.shift();
            if (expiredKey) sessions.delete(expiredKey);
        }
    }

    function registerVideoSession(session = {}) {
        const joinedAt = finiteTimestamp(session.joinedAt, now());
        const videoSessionId = session.videoSessionId || crypto.randomBytes(32).toString('base64url');
        const prior = findStoredSession({ videoSessionId });
        const key = prior?.key || createSessionKey(session.roomId, session.userId, videoSessionId);

        // A provider participant identity is immutable. Never let a late
        // webhook reactivate a terminal/revoked token.
        const terminal = !!(prior?.revoked || prior?.leftAt || prior?.participantDeletedAt);
        if (terminal) return prior;

        removeFromEndedRing(key);
        const state = OCCUPYING_STATES.has(session.state) ? session.state : 'active';
        const requestIpKey = session.requestIpKey || session.requestIp || prior?.requestIpKey || null;
        const providerPeerIds = normalizePeerIds({
            providerPeerIds: session.providerPeerIds || prior?.providerPeerIds,
            providerPeerId: session.providerPeerId || prior?.providerPeerId
        });
        const next = {
            ...prior,
            ...session,
            key,
            videoSessionId,
            requestIpKey,
            providerPeerIds,
            providerPeerId: providerPeerIds[0] || null,
            providerPeerEvents: {
                ...normalizePeerEvents(prior?.providerPeerEvents),
                ...normalizePeerEvents(session.providerPeerEvents)
            },
            state,
            revoked: false,
            cleanupPending: false,
            joinedAt: prior?.joinedAt || joinedAt,
            lastSeenAt: finiteTimestamp(session.lastSeenAt, now()),
            pendingExpiresAt: state === 'pending'
                ? finiteTimestamp(session.pendingExpiresAt, now() + pendingTtlMs)
                : null,
            leftAt: null,
            leaveReason: null
        };
        sessions.set(key, next);
        return next;
    }

    function updateVideoSession(match = {}, patch = {}) {
        const session = findStoredSession(match);
        if (!session) return null;
        if (session.leftAt && !patch.providerParticipantId) return null;
        const providerPeerIds = patch.providerPeerIds || patch.providerPeerId
            ? normalizePeerIds({
                providerPeerIds: patch.providerPeerIds || session.providerPeerIds,
                providerPeerId: patch.providerPeerId
            })
            : normalizePeerIds(session);
        const next = {
            ...session,
            ...patch,
            providerPeerIds,
            providerPeerId: providerPeerIds[0] || null,
            lastSeenAt: finiteTimestamp(patch.lastSeenAt, session.lastSeenAt || now())
        };
        if (session.leftAt && patch.providerParticipantId) {
            // Participant creation can finish after a room switch/disconnect
            // already retired its pending reservation. Re-open only the
            // cleanup tombstone so the newly issued provider credential is
            // durably deleted; it must never become an active app session.
            next.state = 'ending';
            next.revoked = true;
            next.cleanupPending = true;
            next.participantDeletedAt = null;
            next.pendingExpiresAt = null;
            next.leftAt = null;
            next.endingReason = session.endingReason || session.leaveReason || 'membership_revoked_during_issue';
            removeFromEndedRing(session.key);
        }
        if (next.revoked && next.providerParticipantId && !next.participantDeletedAt) {
            next.cleanupPending = true;
            next.state = 'ending';
        }
        sessions.set(session.key, next);
        return next;
    }

    function endVideoSession(session, reason = 'left', metadata = {}) {
        if (!session || session.leftAt) return null;
        const leftAt = now();
        const next = {
            ...session,
            ...metadata,
            state: 'ended',
            revoked: true,
            cleanupPending: false,
            pendingExpiresAt: null,
            providerPeerIds: [],
            providerPeerId: null,
            leftAt,
            leaveReason: reason,
            durationSeconds: Math.max(0, Math.round((leftAt - session.joinedAt) / 1000))
        };
        sessions.set(session.key, next);
        retainEndedDiagnostic(next);
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

    function revokeVideoSession(match = {}, reason = 'revoked', metadata = {}) {
        const session = findStoredSession(match);
        if (!session || session.participantDeletedAt) return session || null;
        if (!session.providerMeetingId) return endVideoSession(session, reason, metadata);
        const next = {
            ...session,
            ...metadata,
            state: 'ending',
            revoked: true,
            cleanupPending: true,
            endingAt: session.endingAt || now(),
            endingReason: reason,
            leaveReason: reason,
            pendingExpiresAt: null,
            leftAt: null,
            lastSeenAt: now()
        };
        sessions.set(session.key, next);
        incrementProviderGeneration(next.providerMeetingId);
        return next;
    }

    function markVideoSessionLeft(match = {}, reason = 'left', metadata = {}) {
        const session = findStoredSession(match);
        if (!session || session.leftAt) return null;
        if (session.providerParticipantId && !metadata.providerIdentityRetired) {
            return revokeVideoSession(match, reason, metadata);
        }
        return endVideoSession(session, reason, metadata);
    }

    function markCleanupComplete(match = {}, reason = 'provider_identity_deleted', metadata = {}) {
        const session = findStoredSession(match);
        if (!session) return null;
        const providerPeerIds = normalizePeerIds(session);
        if (providerPeerIds.length > 0) {
            const next = {
                ...session,
                ...metadata,
                state: 'ending',
                revoked: true,
                // DELETE revokes future joins, but an already-connected peer
                // remains provider-authoritative until a signed left event or
                // reconciliation proves it absent. Keep retrying exact kick.
                cleanupPending: true,
                participantDeletedAt: metadata.participantDeletedAt || now(),
                cleanupLastError: null,
                pendingExpiresAt: null,
                leftAt: null
            };
            sessions.set(session.key, next);
            incrementProviderGeneration(next.providerMeetingId);
            return next;
        }
        const ended = endVideoSession({ ...session, leftAt: null }, reason, {
            ...metadata,
            participantDeletedAt: metadata.participantDeletedAt || now(),
            cleanupLastError: null
        });
        if (ended) incrementProviderGeneration(ended.providerMeetingId);
        return ended;
    }

    function markCleanupFailed(match = {}, error) {
        const session = findStoredSession(match);
        if (!session?.cleanupPending) return session || null;
        const next = {
            ...session,
            cleanupAttempts: (session.cleanupAttempts || 0) + 1,
            cleanupLastAttemptAt: now(),
            cleanupLastError: String(error?.message || error || 'provider cleanup failed').slice(0, 200)
        };
        sessions.set(session.key, next);
        return next;
    }

    function countActiveRoomVideoParticipants(roomId) {
        return Array.from(sessions.values())
            .filter((session) => session.roomId === roomId)
            .reduce((total, session) => total + occupancyUnits(session), 0);
    }

    function countActiveGlobalVideoParticipants() {
        return Array.from(sessions.values()).reduce((total, session) => total + occupancyUnits(session), 0);
    }

    function countActiveIpVideoParticipants(requestIpKey) {
        if (!requestIpKey) return 0;
        // Provider-only participants do not reveal their originating IP. Count
        // unknown-IP occupancy against every requester so restart recovery can
        // never weaken the per-IP cap.
        return Array.from(sessions.values()).reduce((total, session) => {
            if (session.requestIpKey && session.requestIpKey !== requestIpKey) return total;
            return total + occupancyUnits(session);
        }, 0);
    }

    function getVideoSessionCounts(roomId = null) {
        const counts = { pending: 0, active: 0, ending: 0, total: 0 };
        for (const session of sessions.values()) {
            if (roomId && session.roomId !== roomId) continue;
            const units = occupancyUnits(session);
            if (!units) continue;
            if (session.state === 'pending') counts.pending += units;
            if (session.state === 'active') counts.active += units;
            if (session.state === 'ending') counts.ending += units;
            counts.total += units;
        }
        return counts;
    }

    function reserveVideoSession(reservation = {}) {
        sweepStaleVideoSessions();
        const existing = listActive().find((session) => (
            session.roomId === reservation.roomId && session.userId === reservation.userId
        ));
        if (existing) throw createRegistryError('VIDEO_SESSION_ALREADY_ACTIVE');

        if (countActiveGlobalVideoParticipants() >= reservation.maxGlobalParticipants) {
            throw createRegistryError('GLOBAL_VIDEO_LIMIT_REACHED');
        }
        if (countActiveRoomVideoParticipants(reservation.roomId) >= reservation.maxRoomParticipants) {
            throw createRegistryError('ROOM_FULL');
        }
        const requestIpKey = reservation.requestIpKey || reservation.requestIp || null;
        if (
            requestIpKey
            && countActiveIpVideoParticipants(requestIpKey) >= reservation.maxIpParticipants
        ) {
            throw createRegistryError('IP_VIDEO_LIMIT_REACHED');
        }

        return registerVideoSession({
            ...reservation,
            requestIpKey,
            requestIp: undefined,
            state: 'pending',
            joinedAt: now(),
            pendingExpiresAt: now() + pendingTtlMs
        });
    }

    function markProviderJoined(event = {}) {
        const session = findStoredSession({ videoSessionId: event.videoSessionId });
        if (!session) return null;
        if (
            session.providerMeetingId
            && event.providerMeetingId
            && session.providerMeetingId !== event.providerMeetingId
        ) return null;
        const peerId = typeof event.providerPeerId === 'string' ? event.providerPeerId.trim() : '';
        if (!peerId) return null;
        const providerEventAt = finiteTimestamp(event.joinedAt, now());
        const peerEvents = normalizePeerEvents(session.providerPeerEvents);
        if (!event.force && Number.isFinite(peerEvents[peerId]) && providerEventAt <= peerEvents[peerId]) {
            return session;
        }

        const peerIds = normalizePeerIds(session);
        const alreadyPresent = peerIds.includes(peerId);
        if (!alreadyPresent) peerIds.push(peerId);
        peerEvents[peerId] = providerEventAt;
        const reusedAcrossProviderSessions = !!(
            session.providerSessionId
            && event.providerSessionId
            && session.providerSessionId !== event.providerSessionId
        );
        const mustRemainRevoked = !!(
            session.revoked
            || session.leftAt
            || session.participantDeletedAt
            || peerIds.length > 1
            || reusedAcrossProviderSessions
        );
        const next = {
            ...session,
            state: mustRemainRevoked ? 'ending' : 'active',
            revoked: mustRemainRevoked,
            cleanupPending: mustRemainRevoked,
            endingReason: mustRemainRevoked
                ? (session.endingReason || (peerIds.length > 1 ? 'provider_token_reused' : 'provider_rejoin_after_revocation'))
                : null,
            providerMeetingId: event.providerMeetingId || session.providerMeetingId,
            providerSessionId: event.providerSessionId || session.providerSessionId || null,
            providerPeerIds: peerIds,
            providerPeerId: peerIds[0] || null,
            providerPeerEvents: peerEvents,
            providerJoinedAt: session.providerJoinedAt || providerEventAt,
            providerEventAt: providerEventAt,
            pendingExpiresAt: null,
            leftAt: null,
            leaveReason: mustRemainRevoked ? (session.leaveReason || 'provider_identity_revoked') : null,
            lastSeenAt: now()
        };
        removeFromEndedRing(session.key);
        sessions.set(session.key, next);
        incrementProviderGeneration(next.providerMeetingId);
        return next;
    }

    function markVideoSessionEnding(match = {}, reason = 'client_leave') {
        return revokeVideoSession(match, reason);
    }

    function markProviderLeft(match = {}, reason = 'provider_left') {
        const session = findStoredSession(match);
        if (!session) return null;
        if (
            (match.providerMeetingId && session.providerMeetingId && session.providerMeetingId !== match.providerMeetingId)
            || (match.providerSessionId && session.providerSessionId && session.providerSessionId !== match.providerSessionId)
        ) return null;
        const peerId = typeof match.providerPeerId === 'string' ? match.providerPeerId.trim() : '';
        if (!peerId) return null;
        const providerEventAt = finiteTimestamp(match.leftAt, now());
        const peerEvents = normalizePeerEvents(session.providerPeerEvents);
        if (Number.isFinite(peerEvents[peerId]) && providerEventAt < peerEvents[peerId]) return session;
        const peerIds = normalizePeerIds(session).filter((value) => value !== peerId);
        peerEvents[peerId] = providerEventAt;
        const metadata = {
            providerPeerIds: peerIds,
            providerPeerId: peerIds[0] || null,
            providerPeerEvents: peerEvents,
            providerLeftAt: providerEventAt,
            providerEventAt
        };
        const next = session.participantDeletedAt
            ? peerIds.length > 0
                ? updateVideoSession({ videoSessionId: session.videoSessionId }, metadata)
                : endVideoSession(session, reason, { ...metadata, providerIdentityRetired: true })
            : session.providerParticipantId
                ? revokeVideoSession({ videoSessionId: session.videoSessionId }, reason, metadata)
            : peerIds.length > 0
                ? revokeVideoSession({ videoSessionId: session.videoSessionId }, reason, metadata)
                : endVideoSession(session, reason, metadata);
        incrementProviderGeneration(session.providerMeetingId);
        return next;
    }

    function markSocketSessionsLeft(socketId, reason = 'socket_disconnect') {
        if (!socketId) return [];
        const changed = [];
        for (const session of listActive()) {
            if (session.socketId !== socketId) continue;
            const next = markVideoSessionLeft({ videoSessionId: session.videoSessionId }, reason);
            if (next) changed.push(next);
        }
        return changed;
    }

    function markSocketSessionsEnding(socketId, reason = 'socket_disconnect') {
        if (!socketId) return [];
        const ending = [];
        for (const session of listActive()) {
            if (session.socketId !== socketId) continue;
            const next = markVideoSessionEnding({ videoSessionId: session.videoSessionId }, reason);
            if (next) ending.push(next);
        }
        return ending;
    }

    function markMeetingEnded(providerMeetingId, reason = 'meeting_ended', providerSessionId = null) {
        if (!providerMeetingId) return [];
        const changed = [];
        for (const session of Array.from(sessions.values())) {
            if (session.leftAt || session.providerMeetingId !== providerMeetingId) continue;
            if (providerSessionId && session.providerSessionId && session.providerSessionId !== providerSessionId) continue;
            const next = session.participantDeletedAt
                ? endVideoSession(session, reason, {
                    providerPeerIds: [],
                    providerPeerId: null,
                    providerIdentityRetired: true
                })
                : session.providerParticipantId
                    ? revokeVideoSession({ videoSessionId: session.videoSessionId }, reason, {
                        providerPeerIds: [],
                        providerPeerId: null
                    })
                    : endVideoSession(session, reason);
            if (next) changed.push(next);
        }
        incrementProviderGeneration(providerMeetingId);
        return changed;
    }

    function retireMeeting(providerMeetingId, reason = 'meeting_retired') {
        if (!providerMeetingId) return [];
        const ended = [];
        for (const session of Array.from(sessions.values())) {
            if (session.leftAt || session.providerMeetingId !== providerMeetingId) continue;
            const next = endVideoSession(session, reason, {
                providerIdentityRetired: true,
                participantDeletedAt: now()
            });
            if (next) ended.push(next);
        }
        incrementProviderGeneration(providerMeetingId);
        return ended;
    }

    function touchVideoSession(match = {}) {
        return updateVideoSession(match, { lastSeenAt: now() });
    }

    function sweepStaleVideoSessions() {
        const changed = [];
        for (const session of Array.from(sessions.values())) {
            if (
                session.leftAt
                || session.state !== 'pending'
                || !session.pendingExpiresAt
                || session.pendingExpiresAt > now()
            ) continue;
            const next = session.providerParticipantId
                ? revokeVideoSession({ videoSessionId: session.videoSessionId }, 'pending_reservation_expired')
                : endVideoSession(session, 'pending_reservation_expired');
            if (next) changed.push(next);
        }
        return changed;
    }

    function reconcileMeeting(reconciliation = {}) {
        if (!Array.isArray(reconciliation.participants)) {
            throw createRegistryError('PROVIDER_RECONCILIATION_INVALID');
        }
        if (
            !Number.isInteger(reconciliation.liveParticipants)
            || reconciliation.liveParticipants < 0
            || reconciliation.liveParticipants !== reconciliation.participants.length
        ) throw createRegistryError('PROVIDER_RECONCILIATION_INVALID');

        const participants = reconciliation.participants.map((participant) => {
            const customParticipantId = typeof participant?.customParticipantId === 'string'
                ? participant.customParticipantId.trim()
                : '';
            const providerPeerId = typeof participant?.providerPeerId === 'string'
                ? participant.providerPeerId.trim()
                : '';
            if (!customParticipantId || !providerPeerId) throw createRegistryError('PROVIDER_RECONCILIATION_INVALID');
            return { ...participant, customParticipantId, providerPeerId };
        });
        if (new Set(participants.map((participant) => participant.providerPeerId)).size !== participants.length) {
            throw createRegistryError('PROVIDER_RECONCILIATION_INVALID');
        }
        const providerIds = new Set(participants.map((participant) => participant.customParticipantId));

        for (const session of Array.from(sessions.values())) {
            if (session.leftAt || session.providerMeetingId !== reconciliation.providerMeetingId) continue;
            if (session.state === 'pending' && session.pendingExpiresAt > now() && !session.providerJoinedAt) continue;
            if (!providerIds.has(session.videoSessionId)) {
                if (session.participantDeletedAt) {
                    endVideoSession(session, 'provider_reconciliation', {
                        providerIdentityRetired: true,
                        providerPeerIds: [],
                        providerPeerId: null
                    });
                } else if (!session.cleanupPending) {
                    if (session.providerParticipantId) {
                        revokeVideoSession({ videoSessionId: session.videoSessionId }, 'provider_reconciliation');
                    } else {
                        endVideoSession(session, 'provider_reconciliation');
                    }
                }
            }
        }

        participants.forEach((participant) => {
            const videoSessionId = participant.customParticipantId;
            let session = findStoredSession({ videoSessionId });
            if (!session) {
                session = registerVideoSession({
                    roomId: reconciliation.roomId,
                    userId: `provider:${videoSessionId}`,
                    videoSessionId,
                    provider: reconciliation.provider || 'realtimekit',
                    providerMeetingId: reconciliation.providerMeetingId,
                    providerSessionId: reconciliation.providerSessionId,
                    displayName: participant.displayName || '',
                    joinedAt: participant.joinedAt || now(),
                    state: 'active',
                    reconciled: true
                });
            }
            markProviderJoined({
                videoSessionId,
                providerMeetingId: reconciliation.providerMeetingId,
                providerSessionId: reconciliation.providerSessionId,
                providerPeerId: participant.providerPeerId,
                joinedAt: participant.joinedAt,
                force: true
            });
        });

        return {
            roomId: reconciliation.roomId,
            providerMeetingId: reconciliation.providerMeetingId,
            activeCount: countActiveRoomVideoParticipants(reconciliation.roomId),
            cleanupSessions: listCleanupPending().filter((session) => (
                session.providerMeetingId === reconciliation.providerMeetingId
            ))
        };
    }

    function listCleanupPending() {
        return Array.from(sessions.values()).filter((session) => session.cleanupPending);
    }

    function exportPersistentState() {
        const persistentSessions = Array.from(sessions.values())
            .filter((session) => isOccupying(session) || session.cleanupPending)
            .map((session) => ({
                videoSessionId: session.videoSessionId,
                roomId: session.roomId,
                userId: session.userId,
                requestIpKey: session.requestIpKey || null,
                provider: session.provider || null,
                providerMeetingId: session.providerMeetingId || null,
                providerParticipantId: session.providerParticipantId || null,
                providerSessionId: session.providerSessionId || null,
                providerPeerIds: normalizePeerIds(session),
                providerPeerEvents: normalizePeerEvents(session.providerPeerEvents),
                state: session.state,
                revoked: !!session.revoked,
                cleanupPending: !!session.cleanupPending,
                cleanupAttempts: Number.isInteger(session.cleanupAttempts) ? session.cleanupAttempts : 0,
                cleanupLastAttemptAt: finiteTimestamp(session.cleanupLastAttemptAt),
                cleanupLastError: typeof session.cleanupLastError === 'string' ? session.cleanupLastError : null,
                participantDeletedAt: finiteTimestamp(session.participantDeletedAt),
                joinedAt: finiteTimestamp(session.joinedAt, now()),
                lastSeenAt: finiteTimestamp(session.lastSeenAt, now()),
                pendingExpiresAt: finiteTimestamp(session.pendingExpiresAt),
                providerJoinedAt: finiteTimestamp(session.providerJoinedAt),
                providerEventAt: finiteTimestamp(session.providerEventAt),
                role: session.role === 'viewer' ? 'viewer' : 'publisher'
            }));
        return { schemaVersion: PERSISTENCE_SCHEMA_VERSION, sessions: persistentSessions };
    }

    function hydratePersistentState(state = {}) {
        if (state?.schemaVersion !== PERSISTENCE_SCHEMA_VERSION || !Array.isArray(state.sessions)) {
            throw createRegistryError('VIDEO_SESSION_STATE_INVALID');
        }
        const hydratedSessions = [];
        for (const record of state.sessions) {
            if (
                !record
                || typeof record !== 'object'
                || typeof record.videoSessionId !== 'string'
                || typeof record.roomId !== 'string'
                || typeof record.providerMeetingId !== 'string'
            ) throw createRegistryError('VIDEO_SESSION_STATE_INVALID');
            const key = createSessionKey(record.roomId, record.userId, record.videoSessionId);
            const providerPeerIds = normalizePeerIds(record);
            const needsCleanup = !!record.providerParticipantId || providerPeerIds.length > 0;
            const session = {
                ...record,
                key,
                socketId: null,
                providerPeerIds,
                providerPeerId: providerPeerIds[0] || null,
                providerPeerEvents: normalizePeerEvents(record.providerPeerEvents),
                state: needsCleanup ? 'ending' : 'ended',
                revoked: true,
                cleanupPending: needsCleanup,
                endingReason: 'process_restart_membership_invalidated',
                pendingExpiresAt: null,
                leftAt: needsCleanup ? null : now(),
                leaveReason: 'process_restart_membership_invalidated',
                hydrated: true
            };
            hydratedSessions.push(session);
        }
        sessions.clear();
        endedSessionKeys.length = 0;
        meetingGenerations.clear();
        providerGeneration = 0;
        for (const session of hydratedSessions) {
            sessions.set(session.key, session);
            if (!session.cleanupPending) retainEndedDiagnostic(session);
        }
        return state.sessions.length;
    }

    return {
        reserveVideoSession,
        registerVideoSession,
        updateVideoSession,
        revokeVideoSession,
        markVideoSessionLeft,
        markVideoSessionEnding,
        markProviderJoined,
        markProviderLeft,
        markMeetingEnded,
        retireMeeting,
        markCleanupComplete,
        markCleanupFailed,
        markSocketSessionsLeft,
        markSocketSessionsEnding,
        touchVideoSession,
        countActiveGlobalVideoParticipants,
        countActiveRoomVideoParticipants,
        countActiveIpVideoParticipants,
        getVideoSessionCounts,
        getProviderGeneration,
        sweepStaleVideoSessions,
        reconcileMeeting,
        findSession,
        findStoredSession,
        listActive,
        listCleanupPending,
        exportPersistentState,
        hydratePersistentState,
        occupancyUnits,
        sessions
    };
}

module.exports = {
    createVideoSessionRegistry
};
