const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createVideoSessionRegistry } = require('../../services/video/video-session-registry');
const {
    createWebhookDeduplicator,
    processRealtimeKitWebhook,
    verifyRealtimeKitWebhookSignature
} = require('../../services/video/realtimekit-webhook');

test('RealtimeKit webhook signatures verify the exact raw body with RSA-SHA256', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rawBody = Buffer.from('{"event":"meeting.ended"}');
    const signature = crypto.sign('RSA-SHA256', rawBody, privateKey).toString('base64');

    assert.equal(verifyRealtimeKitWebhookSignature({
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
        signature,
        rawBody
    }), true);
    assert.equal(verifyRealtimeKitWebhookSignature({
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
        signature,
        rawBody: Buffer.from('{"event": "meeting.ended"}')
    }), false);
});

test('participant and meeting webhook transitions are idempotent and provider-authoritative', () => {
    const registry = createVideoSessionRegistry();
    const pending = registry.reserveVideoSession({
        roomId: 'ROOM01',
        userId: 'user-1',
        providerMeetingId: 'meeting-1',
        maxGlobalParticipants: 20,
        maxRoomParticipants: 20,
        maxIpParticipants: 3
    });
    registry.updateVideoSession({ videoSessionId: pending.videoSessionId }, {
        providerParticipantId: 'participant-1'
    });
    const rooms = new Map([['ROOM01', { id: 'ROOM01', videoProviderMeetingId: 'meeting-1' }]]);
    const joined = {
        event: 'meeting.participantJoined',
        meeting: { id: 'meeting-1', sessionId: 'provider-session-1' },
        participant: {
            peerId: 'peer-1',
            customParticipantId: pending.videoSessionId,
            userDisplayName: 'Student',
            joinedAt: '2026-07-15T06:00:00.000Z'
        }
    };

    assert.equal(processRealtimeKitWebhook({ event: joined, rooms, registry }).handled, true);
    assert.equal(processRealtimeKitWebhook({ event: joined, rooms, registry }).handled, true);
    assert.equal(registry.findSession({ videoSessionId: pending.videoSessionId }).state, 'active');
    processRealtimeKitWebhook({
        event: {
            event: 'meeting.participantLeft',
            meeting: { id: 'meeting-1', sessionId: 'provider-session-1' },
            participant: {
                peerId: 'peer-1',
                customParticipantId: pending.videoSessionId,
                leftAt: '2026-07-15T06:00:01.000Z'
            }
        },
        rooms,
        registry
    });
    processRealtimeKitWebhook({ event: joined, rooms, registry });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    const replayedIdentity = processRealtimeKitWebhook({
        event: {
            ...joined,
            meeting: { ...joined.meeting, sessionId: 'provider-session-2' },
            participant: {
                ...joined.participant,
                peerId: 'peer-2',
                joinedAt: '2026-07-15T06:00:02.000Z'
            }
        },
        rooms,
        registry
    });
    assert.equal(replayedIdentity.cleanupSessions.length, 1);
    assert.equal(registry.findStoredSession({ videoSessionId: pending.videoSessionId }).revoked, true);
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    registry.markCleanupComplete({ videoSessionId: pending.videoSessionId });
    processRealtimeKitWebhook({
        event: {
            event: 'meeting.participantLeft',
            meeting: { id: 'meeting-1', sessionId: 'provider-session-2' },
            participant: {
                peerId: 'peer-2',
                customParticipantId: pending.videoSessionId,
                leftAt: '2026-07-15T06:00:02.500Z'
            }
        },
        rooms,
        registry
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
    const lateJoin = processRealtimeKitWebhook({
        event: {
            ...joined,
            meeting: { ...joined.meeting, sessionId: 'provider-session-3' },
            participant: {
                ...joined.participant,
                peerId: 'peer-3',
                joinedAt: '2026-07-15T06:00:03.000Z'
            }
        },
        rooms,
        registry
    });
    assert.equal(lateJoin.cleanupSessions.length, 1);
    assert.equal(registry.countActiveGlobalVideoParticipants(), 1);
    registry.markCleanupComplete({ videoSessionId: pending.videoSessionId });
    processRealtimeKitWebhook({
        event: {
            event: 'meeting.participantLeft',
            meeting: { id: 'meeting-1', sessionId: 'provider-session-3' },
            participant: {
                peerId: 'peer-3',
                customParticipantId: pending.videoSessionId,
                leftAt: '2026-07-15T06:00:03.500Z'
            }
        },
        rooms,
        registry
    });
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
    const ended = processRealtimeKitWebhook({
        event: {
            event: 'meeting.ended',
            meeting: { id: 'meeting-1', sessionId: 'provider-session-3' }
        },
        rooms,
        registry
    });
    assert.equal(ended.handled, true);
    assert.equal(registry.countActiveGlobalVideoParticipants(), 0);
});

test('supported participant webhooks require a session, peer, and bounded timestamp', () => {
    const registry = createVideoSessionRegistry();
    const rooms = new Map([['ROOM01', { id: 'ROOM01', videoProviderMeetingId: 'meeting-1' }]]);
    const base = {
        event: 'meeting.participantJoined',
        meeting: { id: 'meeting-1', sessionId: 'provider-session-1' },
        participant: {
            peerId: 'peer-1',
            customParticipantId: 'video-session-id-000000000000000001',
            joinedAt: '2026-07-15T06:00:00.000Z'
        }
    };
    assert.throws(() => processRealtimeKitWebhook({
        event: { ...base, meeting: { id: 'meeting-1' } },
        rooms,
        registry
    }), (error) => /** @type {any} */ (error).code === 'WEBHOOK_EVENT_INVALID');
    assert.throws(() => processRealtimeKitWebhook({
        event: { ...base, participant: { ...base.participant, peerId: '' } },
        rooms,
        registry
    }), (error) => /** @type {any} */ (error).code === 'WEBHOOK_EVENT_INVALID');
    assert.throws(() => processRealtimeKitWebhook({
        event: { ...base, participant: { ...base.participant, joinedAt: 'invalid' } },
        rooms,
        registry
    }), (error) => /** @type {any} */ (error).code === 'WEBHOOK_EVENT_INVALID');
});

test('webhook UUID deduplication survives restart for 24 hours', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-webhooks-'));
    const filePath = path.join(directory, 'events.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    let now = 1_000;
    let processed = 0;
    const first = createWebhookDeduplicator({ filePath, now: () => now });
    await first.initialize();
    assert.equal((await first.runOnce('delivery-uuid-1', async () => { processed += 1; })).duplicate, false);

    const restarted = createWebhookDeduplicator({ filePath, now: () => now });
    await restarted.initialize();
    assert.equal((await restarted.runOnce('delivery-uuid-1', async () => { processed += 1; })).duplicate, true);
    assert.equal(processed, 1);

    now += (24 * 60 * 60 * 1000) + 1;
    assert.equal((await restarted.runOnce('delivery-uuid-1', async () => { processed += 1; })).duplicate, false);
    assert.equal(processed, 2);
});

test('failed webhook hydration discards every partially parsed delivery', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-webhook-retry-'));
    const filePath = path.join(directory, 'events.jsonl');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(filePath, [
        JSON.stringify({ schemaVersion: 2, type: 'header' }),
        JSON.stringify({ type: 'accepted', deliveryId: 'stale-delivery', acceptedAt: 1_000 }),
        JSON.stringify({ type: 'invalid' }),
        ''
    ].join('\n'));
    const deduplicator = createWebhookDeduplicator({ filePath, now: () => 1_001 });

    await assert.rejects(deduplicator.initialize(), /malformed/);
    assert.equal(deduplicator.entries.size, 0);

    fs.writeFileSync(filePath, [
        JSON.stringify({ schemaVersion: 2, type: 'header' }),
        JSON.stringify({ type: 'accepted', deliveryId: 'fresh-delivery', acceptedAt: 1_001 }),
        ''
    ].join('\n'));
    assert.equal(await deduplicator.initialize(), 1);
    assert.equal(deduplicator.entries.has('stale-delivery'), false);
    assert.equal(deduplicator.entries.has('fresh-delivery'), true);
});

test('webhook deduplication appends durable records instead of rewriting the full set', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-webhook-journal-'));
    const filePath = path.join(directory, 'events.jsonl');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const deduplicator = createWebhookDeduplicator({ filePath, now: () => 5_000 });
    await deduplicator.initialize();
    for (const deliveryId of ['delivery-a', 'delivery-b', 'delivery-c']) {
        await deduplicator.runOnce(deliveryId, async () => true);
    }
    const records = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(records.map((record) => record.type), [
        'header',
        'accepted',
        'accepted',
        'accepted'
    ]);
    assert.deepEqual(records.slice(1).map((record) => record.deliveryId), [
        'delivery-a',
        'delivery-b',
        'delivery-c'
    ]);
});

test('webhook deduplication never evicts an unexpired delivery id at its memory bound', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-webhook-bound-'));
    const filePath = path.join(directory, 'events.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    let now = 1_000;
    const deduplicator = createWebhookDeduplicator({
        filePath,
        now: () => now,
        ttlMs: 100,
        maxEntries: 2
    });
    await deduplicator.initialize();
    await deduplicator.runOnce('delivery-1', async () => true);
    await deduplicator.runOnce('delivery-2', async () => true);
    await assert.rejects(
        deduplicator.runOnce('delivery-3', async () => true),
        (error) => /** @type {any} */ (error).code === 'WEBHOOK_DEDUP_CAPACITY_EXHAUSTED'
    );
    assert.equal((await deduplicator.runOnce('delivery-1', async () => false)).duplicate, true);

    now += 101;
    assert.equal((await deduplicator.runOnce('delivery-3', async () => true)).duplicate, false);
});
