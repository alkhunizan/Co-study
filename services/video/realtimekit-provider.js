const crypto = require('node:crypto');

const { VIDEO_PROVIDER_REALTIMEKIT } = require('../../server-config');

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_WEBHOOK_KEY_RESPONSE_BYTES = 64 * 1024;
const PARTICIPANTS_PER_PAGE = 100;
const MAX_PARTICIPANT_PAGES = 100;
const MAX_PARTICIPANT_RECORDS = PARTICIPANTS_PER_PAGE * MAX_PARTICIPANT_PAGES;

function createProviderError(message, code = 'VIDEO_PROVIDER_UNAVAILABLE', status = 502) {
    /** @type {Error & { code?: string, status?: number }} */
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function createInvalidResponseError(operation) {
    return createProviderError(
        `RealtimeKit returned an invalid ${operation} response.`,
        'VIDEO_PROVIDER_INVALID_RESPONSE',
        502
    );
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, operation, { maxLength = 1024 } = {}) {
    if (typeof value !== 'string') throw createInvalidResponseError(operation);
    const normalized = value.trim();
    if (!normalized || Buffer.byteLength(normalized, 'utf8') > maxLength) {
        throw createInvalidResponseError(operation);
    }
    return normalized;
}

function requireNonNegativeInteger(value, operation, maximum = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
        throw createInvalidResponseError(operation);
    }
    return value;
}

function requireTimestamp(value, operation) {
    const text = requireString(value, operation, { maxLength: 128 });
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) throw createInvalidResponseError(operation);
    return timestamp;
}

function requireSuccessData(payload, operation) {
    if (!isPlainObject(payload) || payload.success !== true || !isPlainObject(payload.data)) {
        throw createInvalidResponseError(operation);
    }
    return payload.data;
}

function isDocumentedNotFound(payload) {
    if (!isPlainObject(payload) || payload.success !== false || !isPlainObject(payload.error)) return false;
    return Number(payload.error.code) === 404 && typeof payload.error.message === 'string';
}

function assertOfficialProductionEndpoint(value, { hostname, pathname, label }) {
    let url;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error(`${label} must use the official Cloudflare HTTPS endpoint in production.`);
    }
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    if (
        url.protocol !== 'https:'
        || url.hostname.toLowerCase() !== hostname
        || url.port
        || url.username
        || url.password
        || url.search
        || url.hash
        || normalizedPath !== pathname
    ) {
        throw new Error(`${label} must use the official Cloudflare HTTPS endpoint in production.`);
    }
}

function assertProductionEndpoints(config, runtimeEnvironment) {
    if (runtimeEnvironment !== 'production') return;
    assertOfficialProductionEndpoint(config.cloudflare.apiBaseUrl, {
        hostname: 'api.cloudflare.com',
        pathname: '/client/v4',
        label: 'CLOUDFLARE_REALTIMEKIT_API_BASE_URL'
    });
    assertOfficialProductionEndpoint(config.cloudflare.webhookPublicKeyUrl, {
        hostname: 'api.realtime.cloudflare.com',
        pathname: '/.well-known/webhooks.json',
        label: 'CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL'
    });
}

function buildRealtimeKitUrl(config, path) {
    const baseUrl = config.cloudflare.apiBaseUrl.replace(/\/$/, '');
    const accountId = encodeURIComponent(config.cloudflare.accountId);
    const appId = encodeURIComponent(config.cloudflare.appId);
    return `${baseUrl}/accounts/${accountId}/realtime/kit/${appId}${path}`;
}

async function readBoundedText(response, maximumBytes, operation) {
    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined && contentLength !== '') {
        const declaredBytes = Number(contentLength);
        if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) {
            throw createProviderError(
                `RealtimeKit ${operation} response exceeded the size limit.`,
                'VIDEO_PROVIDER_RESPONSE_TOO_LARGE',
                502
            );
        }
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maximumBytes) {
            throw createProviderError(
                `RealtimeKit ${operation} response exceeded the size limit.`,
                'VIDEO_PROVIDER_RESPONSE_TOO_LARGE',
                502
            );
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        totalBytes += chunk.byteLength;
        if (totalBytes > maximumBytes) {
            try {
                await reader.cancel();
            } catch (_error) {
                // The size violation is the authoritative failure.
            }
            throw createProviderError(
                `RealtimeKit ${operation} response exceeded the size limit.`,
                'VIDEO_PROVIDER_RESPONSE_TOO_LARGE',
                502
            );
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8');
}

async function readJsonResponse(response, maximumBytes, operation) {
    const text = await readBoundedText(response, maximumBytes, operation);
    if (!text.trim()) {
        if (response.ok) throw createInvalidResponseError(operation);
        return null;
    }
    try {
        const payload = JSON.parse(text);
        if (response.ok && !isPlainObject(payload)) throw createInvalidResponseError(operation);
        return payload;
    } catch (error) {
        if (/** @type {any} */ (error).code) throw error;
        if (response.ok) throw createInvalidResponseError(operation);
        return null;
    }
}

function validateMeetingResponse(payload, operation, { expectedId = '', expectedStatus = '' } = {}) {
    const data = requireSuccessData(payload, operation);
    const meetingId = requireString(data.id, operation);
    if (expectedId && meetingId !== expectedId) throw createInvalidResponseError(operation);
    if (expectedStatus) {
        const status = requireString(data.status, operation, { maxLength: 32 }).toUpperCase();
        if (status !== expectedStatus) throw createInvalidResponseError(operation);
    }
    return { data, meetingId };
}

function validateParticipantTokenResponse(payload, { expectedCustomParticipantId, expectedPresetName }) {
    const operation = 'participant creation';
    const data = requireSuccessData(payload, operation);
    const participantId = requireString(data.id, operation);
    const authToken = requireString(data.token, operation, { maxLength: 16 * 1024 });
    const customParticipantId = requireString(data.custom_participant_id, operation);
    const presetName = requireString(data.preset_name, operation);
    if (customParticipantId !== expectedCustomParticipantId || presetName !== expectedPresetName) {
        throw createInvalidResponseError(operation);
    }
    return {
        participantId,
        authToken,
        expiresAt: data.expires_at === undefined || data.expires_at === null
            ? null
            : requireString(data.expires_at, operation, { maxLength: 128 })
    };
}

function validateActiveSessionResponse(payload, meetingId) {
    const operation = 'active session';
    const data = requireSuccessData(payload, operation);
    const sessionId = requireString(data.id, operation);
    const associatedMeetingId = requireString(data.associated_id, operation);
    const status = requireString(data.status, operation, { maxLength: 32 }).toUpperCase();
    const liveParticipants = requireNonNegativeInteger(data.live_participants, operation, MAX_PARTICIPANT_RECORDS);
    if (associatedMeetingId !== meetingId || !['LIVE', 'ENDED'].includes(status)) {
        throw createInvalidResponseError(operation);
    }
    if (status === 'ENDED' && liveParticipants !== 0) throw createInvalidResponseError(operation);
    return { sessionId, status, liveParticipants };
}

function validateParticipantPage(payload, expectedTotalCount = null) {
    const operation = 'session participants';
    const data = requireSuccessData(payload, operation);
    if (!Array.isArray(data.participants) || data.participants.length > PARTICIPANTS_PER_PAGE) {
        throw createInvalidResponseError(operation);
    }
    if (!isPlainObject(data.paging)) throw createInvalidResponseError(operation);
    const totalCount = requireNonNegativeInteger(
        data.paging.total_count,
        operation,
        MAX_PARTICIPANT_RECORDS
    );
    if (expectedTotalCount !== null && totalCount !== expectedTotalCount) {
        throw createInvalidResponseError(operation);
    }
    if (data.paging.start_offset !== undefined) {
        requireNonNegativeInteger(data.paging.start_offset, operation, MAX_PARTICIPANT_RECORDS);
    }
    if (data.paging.end_offset !== undefined) {
        requireNonNegativeInteger(data.paging.end_offset, operation, MAX_PARTICIPANT_RECORDS);
    }
    return { participants: data.participants, totalCount };
}

function validateSessionParticipant(participant) {
    const operation = 'session participants';
    if (!isPlainObject(participant)) throw createInvalidResponseError(operation);
    const providerPeerId = requireString(participant.id, operation);
    const customParticipantId = requireString(participant.custom_participant_id, operation);
    const joinedAt = requireTimestamp(participant.joined_at, operation);
    let leftAt = null;
    if (participant.left_at !== undefined && participant.left_at !== null && participant.left_at !== '') {
        leftAt = requireTimestamp(participant.left_at, operation);
        if (leftAt < joinedAt) throw createInvalidResponseError(operation);
    }
    let displayName = '';
    if (participant.display_name !== undefined && participant.display_name !== null) {
        if (typeof participant.display_name !== 'string'
            || Buffer.byteLength(participant.display_name, 'utf8') > 1024) {
            throw createInvalidResponseError(operation);
        }
        displayName = participant.display_name;
    }
    return {
        customParticipantId,
        providerPeerId,
        displayName,
        joinedAt,
        leftAt
    };
}

function validateKickParticipantResponse(payload) {
    const operation = 'participant kick';
    const data = requireSuccessData(payload, operation);
    requireString(data.action, operation);
    if (!Array.isArray(data.participants)) throw createInvalidResponseError(operation);
    data.participants.forEach((participant) => {
        if (!isPlainObject(participant)) throw createInvalidResponseError(operation);
        requireString(participant.id, operation);
    });
    return data.participants.length;
}

function validateKickAllResponse(payload) {
    const operation = 'kick all participants';
    const data = requireSuccessData(payload, operation);
    requireString(data.action, operation);
    return requireNonNegativeInteger(
        data.kicked_participants_count,
        operation,
        MAX_PARTICIPANT_RECORDS
    );
}

function validateDeleteParticipantResponse(payload) {
    const operation = 'participant deletion';
    const data = requireSuccessData(payload, operation);
    requireString(data.custom_participant_id, operation);
    requireString(data.preset_id, operation);
    requireTimestamp(data.created_at, operation);
    requireTimestamp(data.updated_at, operation);
}

function sanitizeCloudflareError(payload) {
    if (!isPlainObject(payload)) return 'Cloudflare RealtimeKit request failed.';
    if (isPlainObject(payload.error)) {
        return String(payload.error.message || payload.error.code || 'Cloudflare RealtimeKit request failed.')
            .slice(0, 240);
    }
    if (Array.isArray(payload.errors) && payload.errors.length) {
        return payload.errors
            .map((error) => error?.message || error?.code)
            .filter(Boolean)
            .join('; ')
            .slice(0, 240) || 'Cloudflare RealtimeKit request failed.';
    }
    return 'Cloudflare RealtimeKit request failed.';
}

/**
 * @param {{
 *   config?: Record<string, any>,
 *   logger?: any,
 *   fetchImpl?: typeof fetch,
 *   runtimeEnvironment?: string
 * }} [options]
 */
function createRealtimeKitProvider({
    config,
    logger,
    fetchImpl = fetch,
    runtimeEnvironment = process.env.NODE_ENV || 'development'
} = {}) {
    if (!config) throw new TypeError('createRealtimeKitProvider requires config.');
    if (!isPlainObject(config.cloudflare)) {
        throw new TypeError('createRealtimeKitProvider requires Cloudflare config.');
    }
    assertProductionEndpoints(config, runtimeEnvironment);

    let webhookPublicKey = null;

    function isConfigured() {
        return !!(config.cloudflare.accountId && config.cloudflare.appId && config.cloudflare.apiToken);
    }

    async function request(path, options = {}) {
        if (!config.cloudflare.accountId || !config.cloudflare.appId || !config.cloudflare.apiToken) {
            throw createProviderError(
                'RealtimeKit credentials are not configured.',
                'VIDEO_PROVIDER_NOT_CONFIGURED',
                503
            );
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const url = buildRealtimeKitUrl(config, path);
        const operation = options.operation || path;

        try {
            const response = await fetchImpl(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.cloudflare.apiToken}`
                },
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                signal: controller.signal
            });
            const payload = await readJsonResponse(response, MAX_RESPONSE_BYTES, operation);

            if (options.allowNotFound && response.status === 404 && isDocumentedNotFound(payload)) return null;
            if (!response.ok || payload?.success === false) {
                logger?.warn({
                    event: 'video_provider_request_failed',
                    provider: VIDEO_PROVIDER_REALTIMEKIT,
                    path,
                    status: response.status,
                    message: sanitizeCloudflareError(payload)
                });
                throw createProviderError(
                    'RealtimeKit request failed.',
                    'VIDEO_PROVIDER_UNAVAILABLE',
                    response.status || 502
                );
            }

            return payload;
        } catch (error) {
            if (error.name === 'AbortError') {
                logger?.warn({
                    event: 'video_provider_request_timeout',
                    provider: VIDEO_PROVIDER_REALTIMEKIT,
                    path
                });
                throw createProviderError('RealtimeKit request timed out.', 'VIDEO_PROVIDER_UNAVAILABLE', 504);
            }
            if (error.code) throw error;
            logger?.warn({
                event: 'video_provider_request_error',
                provider: VIDEO_PROVIDER_REALTIMEKIT,
                path,
                message: error.message
            });
            throw createProviderError('RealtimeKit request failed.', 'VIDEO_PROVIDER_UNAVAILABLE', 502);
        } finally {
            clearTimeout(timeout);
        }
    }

    async function disableMeeting({ meetingId }) {
        if (!meetingId) return { ok: true, skipped: true };
        const payload = await request(`/meetings/${encodeURIComponent(meetingId)}`, {
            method: 'PATCH',
            body: { status: 'INACTIVE' },
            operation: 'meeting disable'
        });
        validateMeetingResponse(payload, 'meeting disable', {
            expectedId: meetingId,
            expectedStatus: 'INACTIVE'
        });
        return { ok: true, skipped: false };
    }

    async function kickAllParticipants({ meetingId }) {
        if (!meetingId) {
            return { ok: true, kickedParticipants: 0, noActiveSession: true };
        }
        const payload = await request(
            `/meetings/${encodeURIComponent(meetingId)}/active-session/kick-all`,
            {
                method: 'POST',
                allowNotFound: true,
                operation: 'kick all participants'
            }
        );
        if (!payload) return { ok: true, kickedParticipants: 0, noActiveSession: true };
        return {
            ok: true,
            kickedParticipants: validateKickAllResponse(payload),
            noActiveSession: false
        };
    }

    return {
        getProviderName() {
            return VIDEO_PROVIDER_REALTIMEKIT;
        },
        isConfigured,
        async initialize() {
            if (!isConfigured()) return { configured: false, webhookVerificationReady: false };
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            try {
                const response = await fetchImpl(config.cloudflare.webhookPublicKeyUrl, {
                    method: 'GET',
                    signal: controller.signal
                });
                const payload = await readJsonResponse(
                    response,
                    MAX_WEBHOOK_KEY_RESPONSE_BYTES,
                    'webhook public key'
                );
                if (!response.ok) {
                    throw createProviderError('RealtimeKit webhook public key is unavailable.');
                }
                const data = requireSuccessData(payload, 'webhook public key');
                const candidate = requireString(data.publicKey, 'webhook public key', { maxLength: 32 * 1024 });
                if (!candidate.includes('BEGIN PUBLIC KEY')) {
                    throw createInvalidResponseError('webhook public key');
                }
                const parsedKey = crypto.createPublicKey(candidate);
                if (!['rsa', 'rsa-pss'].includes(parsedKey.asymmetricKeyType)) {
                    throw createInvalidResponseError('webhook public key');
                }
                webhookPublicKey = parsedKey;
                return { configured: true, webhookVerificationReady: true };
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw createProviderError(
                        'RealtimeKit webhook public key is unavailable.',
                        'VIDEO_PROVIDER_UNAVAILABLE',
                        504
                    );
                }
                if (error?.code) throw error;
                throw createProviderError('RealtimeKit webhook public key is unavailable.');
            } finally {
                clearTimeout(timeout);
            }
        },
        getWebhookPublicKey() {
            return webhookPublicKey;
        },
        async ensureRoomMeeting({ roomId, roomName = '' }) {
            const payload = await request('/meetings', {
                method: 'POST',
                body: { title: roomName || `Halastudy Room ${roomId}` },
                operation: 'meeting creation'
            });
            const { meetingId } = validateMeetingResponse(payload, 'meeting creation');
            return {
                provider: VIDEO_PROVIDER_REALTIMEKIT,
                meetingId,
                reused: false
            };
        },
        async createParticipantToken({ roomId, meetingId, userId, displayName, presetName = '' }) {
            const selectedPresetName = presetName || config.defaultPresetName;
            const payload = await request(`/meetings/${encodeURIComponent(meetingId)}/participants`, {
                method: 'POST',
                body: {
                    name: displayName,
                    preset_name: selectedPresetName,
                    custom_participant_id: userId
                },
                operation: 'participant creation'
            });
            const participant = validateParticipantTokenResponse(payload, {
                expectedCustomParticipantId: userId,
                expectedPresetName: selectedPresetName
            });
            return {
                provider: VIDEO_PROVIDER_REALTIMEKIT,
                roomId,
                meetingId,
                participantId: participant.participantId,
                authToken: participant.authToken,
                expiresAt: participant.expiresAt
            };
        },
        async getActiveMeetingSession({ meetingId }) {
            const activePayload = await request(
                `/meetings/${encodeURIComponent(meetingId)}/active-session`,
                { allowNotFound: true, operation: 'active session' }
            );
            if (!activePayload) {
                return { active: false, meetingId, sessionId: null, participants: [] };
            }
            const active = validateActiveSessionResponse(activePayload, meetingId);
            if (active.status === 'ENDED') {
                return { active: false, meetingId, sessionId: active.sessionId, participants: [] };
            }

            const participants = [];
            const seenPeerIds = new Set();
            let expectedTotalCount = null;
            let recordsSeen = 0;
            for (let page = 1; page <= MAX_PARTICIPANT_PAGES; page += 1) {
                const payload = await request(
                    `/sessions/${encodeURIComponent(active.sessionId)}/participants?page_no=${page}&per_page=${PARTICIPANTS_PER_PAGE}`,
                    { operation: 'session participants' }
                );
                const pageData = validateParticipantPage(payload, expectedTotalCount);
                if (expectedTotalCount === null) expectedTotalCount = pageData.totalCount;
                recordsSeen += pageData.participants.length;
                if (recordsSeen > expectedTotalCount) {
                    throw createInvalidResponseError('session participants');
                }

                pageData.participants.forEach((rawParticipant) => {
                    const participant = validateSessionParticipant(rawParticipant);
                    if (seenPeerIds.has(participant.providerPeerId)) {
                        throw createInvalidResponseError('session participants');
                    }
                    seenPeerIds.add(participant.providerPeerId);
                    if (participant.leftAt !== null) return;
                    participants.push({
                        customParticipantId: participant.customParticipantId,
                        providerPeerId: participant.providerPeerId,
                        displayName: participant.displayName,
                        joinedAt: participant.joinedAt
                    });
                });

                if (recordsSeen === expectedTotalCount) break;
                if (pageData.participants.length < PARTICIPANTS_PER_PAGE) {
                    throw createInvalidResponseError('session participants');
                }
                if (page === MAX_PARTICIPANT_PAGES) {
                    throw createInvalidResponseError('session participants');
                }
            }
            if (recordsSeen !== expectedTotalCount || participants.length !== active.liveParticipants) {
                throw createInvalidResponseError('session participants');
            }
            return {
                active: true,
                meetingId,
                sessionId: active.sessionId,
                liveParticipants: active.liveParticipants,
                participants
            };
        },
        async kickParticipant({ meetingId, customParticipantId }) {
            if (!meetingId || !customParticipantId) return { ok: false };
            const payload = await request(`/meetings/${encodeURIComponent(meetingId)}/active-session/kick`, {
                method: 'POST',
                body: { custom_participant_ids: [customParticipantId] },
                allowNotFound: true,
                operation: 'participant kick'
            });
            if (!payload) return { ok: true, alreadyAbsent: true, kickedParticipants: 0 };
            return {
                ok: true,
                alreadyAbsent: false,
                kickedParticipants: validateKickParticipantResponse(payload)
            };
        },
        disableMeeting,
        kickAllParticipants,
        async deleteParticipant({ meetingId, participantId }) {
            if (!meetingId || !participantId) return { ok: false, alreadyAbsent: false };
            const payload = await request(
                `/meetings/${encodeURIComponent(meetingId)}/participants/${encodeURIComponent(participantId)}`,
                {
                    method: 'DELETE',
                    allowNotFound: true,
                    operation: 'participant deletion'
                }
            );
            if (!payload) return { ok: true, alreadyAbsent: true };
            validateDeleteParticipantResponse(payload);
            return { ok: true, alreadyAbsent: false };
        },
        async closeRoomMeeting({ meetingId }) {
            if (!meetingId) {
                return {
                    ok: true,
                    disabled: false,
                    kickedParticipants: 0,
                    noActiveSession: true
                };
            }
            await disableMeeting({ meetingId });
            const kicked = await kickAllParticipants({ meetingId });
            return {
                ok: true,
                disabled: true,
                kickedParticipants: kicked.kickedParticipants,
                noActiveSession: kicked.noActiveSession
            };
        }
    };
}

module.exports = {
    createRealtimeKitProvider
};
