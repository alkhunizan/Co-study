const assert = require('node:assert/strict');
const test = require('node:test');

const { SlidingWindowRateLimiter } = require('../../services/security/bounded-rate-limiter');
const { createVideoSessionRegistry } = require('../../services/video/video-session-registry');

test('rate limiter evicts expired and least-recently-used keys at its hard bound', () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 100, maxEntries: 3 });

    limiter.consume('old', 0);
    limiter.consume('recent-a', 50);
    limiter.consume('recent-b', 50);
    limiter.check('recent-a', 75);
    limiter.consume('recent-c', 75);

    assert.equal(limiter.entries.size, 3);
    assert.equal(limiter.entries.has('old'), false);
    assert.equal(limiter.entries.has('recent-a'), true);
    assert.equal(limiter.entries.has('recent-b'), true);
    assert.equal(limiter.entries.has('recent-c'), true);

    limiter.consume('after-expiry', 200);
    assert.equal(limiter.entries.size, 1);
    assert.equal(limiter.entries.has('after-expiry'), true);
});

test('video registry retains at most the configured ended-session diagnostics', () => {
    let now = 1_000;
    const registry = createVideoSessionRegistry({ now: () => now, endedCapacity: 2 });

    for (const suffix of ['a', 'b', 'c']) {
        const session = registry.registerVideoSession({
            roomId: 'ROOM01',
            userId: `user-${suffix}`,
            videoSessionId: `${suffix.repeat(32)}`,
            joinedAt: now
        });
        now += 1_000;
        registry.markVideoSessionLeft({ videoSessionId: session.videoSessionId }, 'test');
    }

    assert.equal(registry.listActive().length, 0);
    assert.equal(registry.sessions.size, 2);
    assert.equal(registry.sessions.has('ROOM01:user-a:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), false);
});

test('video reservations are atomic, expire after 30 seconds, and enforce a per-IP cap', () => {
    let now = 1_000;
    const registry = createVideoSessionRegistry({ now: () => now, pendingTtlMs: 30_000 });

    for (let index = 0; index < 3; index += 1) {
        registry.reserveVideoSession({
            roomId: `ROOM0${index}`,
            userId: `user-${index}`,
            socketId: `socket-${index}`,
            requestIp: '127.0.0.1',
            maxGlobalParticipants: 20,
            maxRoomParticipants: 20,
            maxIpParticipants: 3
        });
    }
    assert.equal(registry.countActiveGlobalVideoParticipants(), 3);
    assert.throws(() => registry.reserveVideoSession({
        roomId: 'ROOM04',
        userId: 'user-4',
        socketId: 'socket-4',
        requestIp: '127.0.0.1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    }), (error) => /** @type {any} */ (error).code === 'IP_VIDEO_LIMIT_REACHED');

    now += 30_001;
    assert.equal(registry.countActiveGlobalVideoParticipants(), 3);
    assert.equal(registry.exportPersistentState().sessions.length, 3);
    const ended = registry.sweepStaleVideoSessions();
    assert.equal(ended.length, 3);
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
});

test('provider events, not heartbeats or leave hints, control active capacity', () => {
    let now = 1_000;
    const registry = createVideoSessionRegistry({ now: () => now });
    const pending = registry.reserveVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        socketId: 'socket-1',
        requestIp: '127.0.0.1',
        providerMeetingId: 'meeting-1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    });

    registry.touchVideoSession({ videoSessionId: pending.videoSessionId });
    assert.equal(registry.findSession({ videoSessionId: pending.videoSessionId }).state, 'pending');
    now += 1_000;
    registry.markVideoSessionEnding({ videoSessionId: pending.videoSessionId }, 'client_leave');
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    assert.deepEqual(registry.getVideoSessionCounts(), {
        pending: 0,
        active: 0,
        ending: 1,
        total: 1
    });
    const active = registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerPeerId: 'peer-1'
    });
    assert.equal(active.state, 'ending');
    assert.equal(registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerPeerId: 'peer-1'
    }).state, 'ending');
    registry.markProviderLeft({
        videoSessionId: pending.videoSessionId,
        providerPeerId: 'peer-1'
    }, 'provider_left');
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
    assert.equal(registry.markProviderLeft({
        videoSessionId: pending.videoSessionId,
        providerPeerId: 'peer-1'
    }), null);
});

test('reconciliation restores unknown provider participants and removes stale local occupancy', () => {
    const registry = createVideoSessionRegistry();
    const local = registry.registerVideoSession({
        roomId: 'ROOM01',
        userId: 'local-user',
        videoSessionId: 'local-session-id-0000000000000000',
        providerMeetingId: 'meeting-1'
    });

    const result = registry.reconcileMeeting({
        roomId: 'ROOM01',
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        liveParticipants: 3,
        participants: Array.from({ length: 3 }, (_, index) => ({
            customParticipantId: `provider-session-id-00000000000${index}`,
            providerPeerId: `peer-${index}`,
            displayName: `Restored ${index}`
        }))
    });

    assert.equal(result.activeCount, 3);
    assert.equal(registry.findSession({ videoSessionId: local.videoSessionId }), null);
    assert.equal(registry.findSession({ videoSessionId: 'provider-session-id-000000000000' }).state, 'active');
    assert.throws(() => registry.reserveVideoSession({
        roomId: 'ROOM02',
        userId: 'new-user',
        requestIp: '127.0.0.1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    }), (error) => /** @type {any} */ (error).code === 'IP_VIDEO_LIMIT_REACHED');
});

test('provider token reuse counts every peer and remains revoked after late joins', () => {
    const registry = createVideoSessionRegistry();
    const pending = registry.reserveVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        requestIpKey: 'ip-key',
        provider: 'realtimekit',
        providerMeetingId: 'meeting-1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    });
    registry.updateVideoSession({ videoSessionId: pending.videoSessionId }, {
        providerParticipantId: 'participant-1'
    });
    registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        providerPeerId: 'peer-1',
        joinedAt: Date.now()
    });
    const reused = registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        providerPeerId: 'peer-2',
        joinedAt: Date.now() + 1
    });
    assert.equal(reused.state, 'ending');
    assert.equal(reused.revoked, true);
    assert.deepEqual(new Set(reused.providerPeerIds), new Set(['peer-1', 'peer-2']));
    assert.equal(registry.countActiveGlobalVideoParticipants(), 2);

    registry.markProviderLeft({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        providerPeerId: 'peer-2',
        leftAt: Date.now() + 2
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    registry.markCleanupComplete({ videoSessionId: pending.videoSessionId });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    assert.equal(registry.listCleanupPending().length, 1);
    registry.markProviderLeft({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        providerPeerId: 'peer-1',
        leftAt: Date.now() + 3
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);

    const late = registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-2',
        providerPeerId: 'peer-late',
        joinedAt: Date.now() + 4
    });
    assert.equal(late.state, 'ending');
    assert.equal(late.revoked, true);
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    registry.markCleanupComplete({ videoSessionId: pending.videoSessionId });
    assert.equal(registry.listCleanupPending().length, 1);
    registry.markProviderLeft({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-2',
        providerPeerId: 'peer-late',
        leftAt: Date.now() + 5
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
});

test('successful reconciliation releases a deleted identity whose peer-left webhook was missed', () => {
    const registry = createVideoSessionRegistry();
    const pending = registry.reserveVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        provider: 'realtimekit',
        providerMeetingId: 'meeting-1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    });
    registry.updateVideoSession({ videoSessionId: pending.videoSessionId }, {
        providerParticipantId: 'participant-1'
    });
    registry.markProviderJoined({
        videoSessionId: pending.videoSessionId,
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        providerPeerId: 'peer-1'
    });
    registry.revokeVideoSession({ videoSessionId: pending.videoSessionId }, 'client_leave');
    registry.markCleanupComplete({ videoSessionId: pending.videoSessionId });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    registry.reconcileMeeting({
        roomId: 'ROOM01',
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        liveParticipants: 0,
        participants: []
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
    assert.equal(registry.listCleanupPending().length, 0);
});

test('durable video sessions hydrate as revoked cleanup tombstones', () => {
    const first = createVideoSessionRegistry();
    const pending = first.reserveVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        requestIpKey: 'opaque-ip-key',
        provider: 'realtimekit',
        providerMeetingId: 'meeting-1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    });
    first.updateVideoSession({ videoSessionId: pending.videoSessionId }, {
        providerParticipantId: 'participant-1'
    });

    const restarted = createVideoSessionRegistry();
    assert.equal(restarted.hydratePersistentState(first.exportPersistentState()), 1);
    const hydrated = restarted.findStoredSession({ videoSessionId: pending.videoSessionId });
    assert.equal(hydrated.state, 'ending');
    assert.equal(hydrated.revoked, true);
    assert.equal(hydrated.cleanupPending, true);
    assert.equal(hydrated.socketId, null);
    assert.equal(hydrated.requestIpKey, 'opaque-ip-key');
    assert.equal(restarted.countActiveGlobalVideoParticipants(), 1);
});

test('video hydration atomically replaces prior state and preserves it on invalid input', () => {
    const registry = createVideoSessionRegistry();
    registry.registerVideoSession({
        roomId: 'OLD001',
        userId: 'old-user',
        videoSessionId: 'old-session-id-0000000000000000',
        providerMeetingId: 'old-meeting'
    });
    const replacement = {
        schemaVersion: 1,
        sessions: [{
            roomId: 'NEW001',
            userId: 'new-user',
            videoSessionId: 'new-session-id-0000000000000000',
            providerMeetingId: 'new-meeting',
            providerParticipantId: 'new-participant'
        }]
    };

    assert.equal(registry.hydratePersistentState(replacement), 1);
    assert.equal(registry.findStoredSession({ videoSessionId: 'old-session-id-0000000000000000' }), null);
    assert.ok(registry.findStoredSession({ videoSessionId: 'new-session-id-0000000000000000' }));

    assert.throws(() => registry.hydratePersistentState({
        schemaVersion: 1,
        sessions: [replacement.sessions[0], { roomId: 'BROKEN' }]
    }), (error) => /** @type {any} */ (error).code === 'VIDEO_SESSION_STATE_INVALID');
    assert.ok(registry.findStoredSession({ videoSessionId: 'new-session-id-0000000000000000' }));
});

test('reconciliation rejects provider live-count mismatches without releasing capacity', () => {
    const registry = createVideoSessionRegistry();
    registry.registerVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        videoSessionId: 'local-session-id-0000000000000000',
        providerMeetingId: 'meeting-1'
    });
    assert.throws(() => registry.reconcileMeeting({
        roomId: 'ROOM01',
        providerMeetingId: 'meeting-1',
        providerSessionId: 'provider-session-1',
        liveParticipants: 2,
        participants: [{
            customParticipantId: 'provider-session-id-000000000000',
            providerPeerId: 'peer-1'
        }]
    }), (error) => /** @type {any} */ (error).code === 'PROVIDER_RECONCILIATION_INVALID');
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
});
