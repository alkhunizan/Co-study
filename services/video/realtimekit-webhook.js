const crypto = require('node:crypto');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const { createDebouncedAtomicJsonStore } = require('../persistence/debounced-atomic-json-store');

const WEBHOOK_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_DEDUP_MAX_ENTRIES = 10_000;
const WEBHOOK_DEDUP_COMPACT_EVERY = 1_000;
const SUPPORTED_EVENTS = new Set([
    'meeting.participantJoined',
    'meeting.participantLeft',
    'meeting.ended'
]);

function createWebhookError(code) {
    const error = new Error(code);
    /** @type {any} */ (error).code = code;
    return error;
}

/** @param {{ publicKey?: any, signature?: string, rawBody?: Buffer }} [options] */
function verifyRealtimeKitWebhookSignature(options = {}) {
    const { publicKey, signature, rawBody } = options;
    if (!publicKey || typeof signature !== 'string' || !Buffer.isBuffer(rawBody)) return false;
    let signatureBytes;
    try {
        signatureBytes = Buffer.from(signature, 'base64');
        if (signatureBytes.length === 0) return false;
        return crypto.verify('RSA-SHA256', rawBody, publicKey, signatureBytes);
    } catch (_error) {
        return false;
    }
}

function normalizeDeliveryId(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized.length <= 128 ? normalized : null;
}

function createWebhookDeduplicator(options = {}) {
    const filePath = options.filePath;
    const fsImpl = options.fsImpl || fsPromises;
    const logger = options.logger || console;
    const now = options.now || (() => Date.now());
    const ttlMs = options.ttlMs || WEBHOOK_DEDUP_TTL_MS;
    const maxEntries = options.maxEntries || WEBHOOK_DEDUP_MAX_ENTRIES;
    if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath is required.');
    const entries = new Map();
    const atomicStore = createDebouncedAtomicJsonStore({
        filePath,
        debounceMs: 0,
        fsImpl,
        logger
    });
    let initialized = false;
    let journalAppends = 0;
    /** @type {Promise<any>} */
    let queueTail = Promise.resolve();

    function prune(referenceTime = now()) {
        let removed = 0;
        for (const [deliveryId, acceptedAt] of entries) {
            if (referenceTime - acceptedAt >= ttlMs) {
                entries.delete(deliveryId);
                removed += 1;
            }
        }
        return removed;
    }

    function serializeJournal() {
        const lines = [JSON.stringify({ schemaVersion: 2, type: 'header' })];
        for (const [deliveryId, acceptedAt] of entries) {
            lines.push(JSON.stringify({ type: 'accepted', deliveryId, acceptedAt }));
        }
        return `${lines.join('\n')}\n`;
    }

    function loadLegacySnapshot(parsed) {
        if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.entries)) return false;
        parsed.entries.forEach((entry) => {
            const deliveryId = normalizeDeliveryId(entry?.deliveryId);
            if (deliveryId && Number.isFinite(entry.acceptedAt)) entries.set(deliveryId, entry.acceptedAt);
        });
        return true;
    }

    function loadJournal(raw) {
        const lines = raw.split(/\r?\n/);
        const hasTrailingNewline = /\r?\n$/.test(raw);
        const header = JSON.parse(lines.shift() || 'null');
        if (header?.schemaVersion !== 2 || header.type !== 'header') {
            throw new Error('RealtimeKit webhook delivery state is malformed.');
        }
        lines.forEach((line, index) => {
            if (!line.trim()) return;
            let record;
            try {
                record = JSON.parse(line);
            } catch (error) {
                const isLastPartialLine = !hasTrailingNewline && index === lines.length - 1;
                if (isLastPartialLine) return;
                throw error;
            }
            const deliveryId = normalizeDeliveryId(record?.deliveryId);
            if (record?.type !== 'accepted' || !deliveryId || !Number.isFinite(record.acceptedAt)) {
                throw new Error('RealtimeKit webhook delivery state is malformed.');
            }
            entries.set(deliveryId, record.acceptedAt);
        });
    }

    async function compactJournal() {
        atomicStore.setBaseline(null);
        await atomicStore.flush(entries, serializeJournal);
        journalAppends = 0;
    }

    async function appendAccepted(deliveryId, acceptedAt) {
        await fsImpl.mkdir(path.dirname(atomicStore.filePath), { recursive: true });
        const handle = await fsImpl.open(atomicStore.filePath, 'a');
        try {
            const stat = await handle.stat();
            if (stat.size === 0) {
                await handle.write(`${JSON.stringify({ schemaVersion: 2, type: 'header' })}\n`);
            }
            await handle.write(`${JSON.stringify({ type: 'accepted', deliveryId, acceptedAt })}\n`);
            await handle.sync();
        } finally {
            await handle.close();
        }
        journalAppends += 1;
    }

    async function initialize() {
        if (initialized) return entries.size;
        let raw = '';
        try {
            raw = await fsImpl.readFile(filePath, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (raw.trim()) {
            let legacyLoaded = false;
            try {
                legacyLoaded = loadLegacySnapshot(JSON.parse(raw));
            } catch (_error) {}
            if (!legacyLoaded) {
                loadJournal(raw);
            }
        }
        prune();
        if (entries.size > maxEntries) {
            throw createWebhookError('WEBHOOK_DEDUP_CAPACITY_EXHAUSTED');
        }
        if (raw.trim() || entries.size > 0) {
            await compactJournal();
        } else {
            // Avoid creating runtime state on read-only/empty startup. The
            // first accepted delivery appends the header and fsynced record.
            atomicStore.setBaseline(serializeJournal());
        }
        initialized = true;
        return entries.size;
    }

    function runOnce(rawDeliveryId, processor) {
        const deliveryId = normalizeDeliveryId(rawDeliveryId);
        if (!deliveryId) return Promise.reject(createWebhookError('WEBHOOK_DELIVERY_ID_INVALID'));
        if (typeof processor !== 'function') return Promise.reject(new TypeError('processor is required.'));

        const attempt = queueTail.then(async () => {
            if (!initialized) throw new Error('Webhook deduplicator is not initialized.');
            const prunedCount = prune();
            if (entries.has(deliveryId)) return { duplicate: true, result: null };
            if (entries.size >= maxEntries) {
                throw createWebhookError('WEBHOOK_DEDUP_CAPACITY_EXHAUSTED');
            }

            const result = await processor();
            const acceptedAt = now();
            await appendAccepted(deliveryId, acceptedAt);
            entries.set(deliveryId, acceptedAt);
            prune(acceptedAt);
            if (prunedCount > 0 || journalAppends >= WEBHOOK_DEDUP_COMPACT_EVERY) {
                try {
                    await compactJournal();
                } catch (error) {
                    logger?.warn?.('Failed to compact RealtimeKit webhook delivery journal.', error);
                }
            }
            return { duplicate: false, result };
        });
        queueTail = attempt.catch(() => {});
        return attempt;
    }

    return {
        initialize,
        runOnce,
        entries
    };
}

function parseEventTimestamp(value) {
    if (typeof value !== 'string' || !value.trim()) throw createWebhookError('WEBHOOK_EVENT_INVALID');
    const parsed = Date.parse(value);
    const earliestAccepted = Date.parse('2020-01-01T00:00:00.000Z');
    if (!Number.isFinite(parsed) || parsed < earliestAccepted || parsed > Date.now() + 5 * 60 * 1000) {
        throw createWebhookError('WEBHOOK_EVENT_INVALID');
    }
    return parsed;
}

function resolveKnownRoom(rooms, meetingId) {
    if (!meetingId) return null;
    return Array.from(rooms.values()).find((room) => room.videoProviderMeetingId === meetingId) || null;
}

function normalizeParticipantIdentity(participant) {
    const value = participant?.customParticipantId || participant?.clientSpecificId;
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized && normalized.length <= 128 ? normalized : null;
}

/** @param {any} [options] */
function processRealtimeKitWebhook(options = {}) {
    const { event, rooms, registry } = options;
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.event !== 'string') {
        throw createWebhookError('WEBHOOK_EVENT_INVALID');
    }
    if (!SUPPORTED_EVENTS.has(event.event)) return { handled: false, roomId: null, changed: false };
    const meetingId = typeof event.meeting?.id === 'string' ? event.meeting.id.trim() : '';
    const providerSessionId = typeof event.meeting?.sessionId === 'string'
        ? event.meeting.sessionId.trim()
        : '';
    if (!meetingId || !providerSessionId) throw createWebhookError('WEBHOOK_EVENT_INVALID');
    const room = resolveKnownRoom(rooms, meetingId);
    if (!room) return { handled: true, roomId: null, changed: false, ignored: true };

    if (event.event === 'meeting.ended') {
        const ended = registry.markMeetingEnded(
            meetingId,
            'provider_meeting_ended',
            providerSessionId
        );
        return {
            handled: true,
            roomId: room.id,
            changed: ended.length > 0,
            endedSessions: ended.filter((session) => session.state === 'ended'),
            cleanupSessions: ended.filter((session) => session.cleanupPending)
        };
    }

    const videoSessionId = normalizeParticipantIdentity(event.participant);
    const providerPeerId = typeof event.participant?.peerId === 'string'
        ? event.participant.peerId.trim()
        : '';
    if (!videoSessionId || !providerPeerId) throw createWebhookError('WEBHOOK_EVENT_INVALID');
    if (event.event === 'meeting.participantLeft') {
        const ended = registry.markProviderLeft({
            videoSessionId,
            providerMeetingId: meetingId,
            providerSessionId,
            providerPeerId,
            leftAt: parseEventTimestamp(event.participant?.leftAt)
        }, 'provider_participant_left');
        return {
            handled: true,
            roomId: room.id,
            changed: !!ended,
            endedSessions: ended?.state === 'ended' ? [ended] : [],
            cleanupSessions: ended?.cleanupPending ? [ended] : []
        };
    }

    let session = registry.markProviderJoined({
        videoSessionId,
        providerMeetingId: meetingId,
        providerSessionId,
        providerPeerId,
        joinedAt: parseEventTimestamp(event.participant?.joinedAt)
    });
    if (!session) {
        registry.registerVideoSession({
            roomId: room.id,
            userId: `provider:${videoSessionId}`,
            videoSessionId,
            provider: 'realtimekit',
            providerMeetingId: meetingId,
            providerSessionId,
            displayName: typeof event.participant?.userDisplayName === 'string'
                ? event.participant.userDisplayName.slice(0, 80)
                : '',
            joinedAt: parseEventTimestamp(event.participant?.joinedAt),
            state: 'active',
            reconciled: true
        });
        session = registry.markProviderJoined({
            videoSessionId,
            providerMeetingId: meetingId,
            providerSessionId,
            providerPeerId,
            joinedAt: parseEventTimestamp(event.participant?.joinedAt)
        });
    }
    return {
        handled: true,
        roomId: room.id,
        changed: !!session,
        endingSession: session?.state === 'ending' ? session : null,
        cleanupSessions: session?.cleanupPending ? [session] : []
    };
}

module.exports = {
    createWebhookDeduplicator,
    processRealtimeKitWebhook,
    verifyRealtimeKitWebhookSignature
};
