const { VIDEO_PROVIDER_REALTIMEKIT } = require('../../server-config');

const REQUEST_TIMEOUT_MS = 10000;

function createProviderError(message, code = 'VIDEO_PROVIDER_UNAVAILABLE', status = 502) {
    /** @type {Error & { code?: string, status?: number }} */
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function buildRealtimeKitUrl(config, path) {
    const baseUrl = config.cloudflare.apiBaseUrl.replace(/\/$/, '');
    const accountId = encodeURIComponent(config.cloudflare.accountId);
    const appId = encodeURIComponent(config.cloudflare.appId);
    return `${baseUrl}/accounts/${accountId}/realtime/kit/${appId}${path}`;
}

function extractResult(payload) {
    if (!payload || typeof payload !== 'object') return {};
    if (payload.result && typeof payload.result === 'object') return payload.result;
    return payload;
}

function extractMeetingId(payload) {
    const result = extractResult(payload);
    return result.id || result.meetingId || result.meeting_id || result.data?.id || null;
}

function extractParticipant(payload) {
    const result = extractResult(payload);
    const nested = result.participant && typeof result.participant === 'object'
        ? result.participant
        : result;
    return {
        participantId: nested.id || nested.participantId || nested.participant_id || result.id || null,
        authToken: nested.authToken || nested.token || result.authToken || result.token || null,
        expiresAt: nested.expiresAt || nested.expires_at || result.expiresAt || result.expires_at || null
    };
}

function sanitizeCloudflareError(payload) {
    if (!payload || typeof payload !== 'object') return 'Cloudflare RealtimeKit request failed.';
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
 * @param {{ config?: Record<string, any>, logger?: any, fetchImpl?: typeof fetch }} [options]
 */
function createRealtimeKitProvider({ config, logger, fetchImpl = fetch } = {}) {
    if (!config) {
        throw new TypeError('createRealtimeKitProvider requires config.');
    }

    async function request(path, options = {}) {
        if (!config.cloudflare.accountId || !config.cloudflare.appId || !config.cloudflare.apiToken) {
            throw createProviderError('RealtimeKit credentials are not configured.', 'VIDEO_PROVIDER_NOT_CONFIGURED', 503);
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const url = buildRealtimeKitUrl(config, path);

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

            const text = await response.text();
            let payload = null;
            if (text) {
                try {
                    payload = JSON.parse(text);
                } catch (_error) {
                    payload = { raw: text };
                }
            }

            if (!response.ok || payload?.success === false) {
                logger?.warn({
                    event: 'video_provider_request_failed',
                    provider: VIDEO_PROVIDER_REALTIMEKIT,
                    path,
                    status: response.status,
                    message: sanitizeCloudflareError(payload)
                });
                throw createProviderError('RealtimeKit request failed.', 'VIDEO_PROVIDER_UNAVAILABLE', response.status || 502);
            }

            return payload || {};
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

    return {
        getProviderName() {
            return VIDEO_PROVIDER_REALTIMEKIT;
        },
        async ensureRoomMeeting({ roomId, roomName }) {
            const payload = await request('/meetings', {
                method: 'POST',
                body: {
                    title: roomName || `Halastudy Room ${roomId}`
                }
            });
            const meetingId = extractMeetingId(payload);
            if (!meetingId) {
                throw createProviderError('RealtimeKit meeting response did not include an id.');
            }
            return {
                provider: VIDEO_PROVIDER_REALTIMEKIT,
                meetingId,
                reused: false
            };
        },
        async createParticipantToken({ roomId, meetingId, userId, displayName, presetName }) {
            const payload = await request(`/meetings/${encodeURIComponent(meetingId)}/participants`, {
                method: 'POST',
                body: {
                    name: displayName,
                    // Caller picks the preset (viewer vs publisher); fall back to
                    // the default student preset when unspecified.
                    preset_name: presetName || config.defaultPresetName,
                    custom_participant_id: userId
                }
            });
            const participant = extractParticipant(payload);
            if (!participant.participantId || !participant.authToken) {
                throw createProviderError('RealtimeKit participant response did not include a token.');
            }
            return {
                provider: VIDEO_PROVIDER_REALTIMEKIT,
                roomId,
                meetingId,
                participantId: participant.participantId,
                authToken: participant.authToken,
                expiresAt: participant.expiresAt || null
            };
        },
        async closeRoomMeeting({ meetingId }) {
            if (!meetingId) return { ok: true };
            try {
                await request(`/meetings/${encodeURIComponent(meetingId)}`, {
                    method: 'PATCH',
                    body: { status: 'INACTIVE' }
                });
                return { ok: true };
            } catch (error) {
                logger?.warn({
                    event: 'video_provider_close_failed',
                    provider: VIDEO_PROVIDER_REALTIMEKIT,
                    meetingId,
                    message: error.message
                });
                return { ok: false };
            }
        }
    };
}

module.exports = {
    createRealtimeKitProvider
};
