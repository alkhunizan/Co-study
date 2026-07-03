const VIDEO_PROVIDER_MESH = 'mesh';
const VIDEO_PROVIDER_REALTIMEKIT = 'realtimekit';
const VIDEO_PROVIDER_RAW_SFU_LATER = 'raw-sfu-later';
const DEFAULT_VIDEO_PRESET_NAME = 'halastudy_student';
const DEFAULT_CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function parsePositiveInteger(value, envName, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${envName} must be a positive integer.`);
    }
    return parsed;
}

function normalizeVideoProvider(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return VIDEO_PROVIDER_REALTIMEKIT;
    const normalized = raw.trim().toLowerCase();
    if ([VIDEO_PROVIDER_MESH, VIDEO_PROVIDER_REALTIMEKIT, VIDEO_PROVIDER_RAW_SFU_LATER].includes(normalized)) {
        return normalized;
    }
    throw new Error(`VIDEO_PROVIDER must be one of ${VIDEO_PROVIDER_REALTIMEKIT}, ${VIDEO_PROVIDER_MESH}, ${VIDEO_PROVIDER_RAW_SFU_LATER}.`);
}

function normalizeUrl(raw, envName, fallback = '') {
    if (raw === undefined || raw === null || raw === '') return fallback;
    try {
        const url = new URL(String(raw).trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('unsupported protocol');
        }
        url.hash = '';
        url.search = '';
        return url.toString().replace(/\/$/, '');
    } catch (_error) {
        throw new Error(`${envName} must be an absolute http(s) URL.`);
    }
}

function buildVideoPolicy(video = {}) {
    return {
        micDefaultEnabled: false,
        recordingEnabled: !!video.recordingEnabled,
        screenshareEnabled: !!video.screenshareEnabled,
        chatEnabled: !!video.chatEnabled,
        maxRoomParticipants: video.maxRoomParticipants,
        maxGlobalParticipants: video.maxGlobalParticipants,
        maxRoomDurationMinutes: video.maxRoomDurationMinutes
    };
}

function resolveVideoConfig(env = process.env) {
    const provider = normalizeVideoProvider(env.VIDEO_PROVIDER);
    if (provider === VIDEO_PROVIDER_RAW_SFU_LATER) {
        throw new Error('VIDEO_PROVIDER=raw-sfu-later is reserved for future work and is not implemented.');
    }

    const nodeEnv = env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';
    const cloudflare = {
        accountId: String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
        appId: String(env.CLOUDFLARE_REALTIMEKIT_APP_ID || '').trim(),
        apiToken: String(env.CLOUDFLARE_REALTIMEKIT_API_TOKEN || '').trim(),
        apiBaseUrl: normalizeUrl(
            env.CLOUDFLARE_REALTIMEKIT_API_BASE_URL,
            'CLOUDFLARE_REALTIMEKIT_API_BASE_URL',
            DEFAULT_CLOUDFLARE_API_BASE_URL
        )
    };

    const video = {
        provider,
        joinDisabled: parseBoolean(env.VIDEO_JOIN_DISABLED, false),
        maxGlobalParticipants: parsePositiveInteger(env.MAX_GLOBAL_VIDEO_PARTICIPANTS, 'MAX_GLOBAL_VIDEO_PARTICIPANTS', 20),
        maxRoomParticipants: parsePositiveInteger(env.MAX_ROOM_VIDEO_PARTICIPANTS, 'MAX_ROOM_VIDEO_PARTICIPANTS', 20),
        maxRoomDurationMinutes: parsePositiveInteger(env.MAX_ROOM_DURATION_MINUTES, 'MAX_ROOM_DURATION_MINUTES', 180),
        recordingEnabled: parseBoolean(env.VIDEO_RECORDING_ENABLED, false),
        screenshareEnabled: parseBoolean(env.VIDEO_SCREENSHARE_ENABLED, false),
        chatEnabled: parseBoolean(env.VIDEO_CHAT_ENABLED, false),
        defaultPresetName: String(env.VIDEO_DEFAULT_PRESET_NAME || DEFAULT_VIDEO_PRESET_NAME).trim() || DEFAULT_VIDEO_PRESET_NAME,
        publicApiBaseUrl: String(env.PUBLIC_API_BASE_URL || '').trim(),
        cloudflare,
        warnings: []
    };

    if (video.recordingEnabled) {
        throw new Error('VIDEO_RECORDING_ENABLED must remain false for the RealtimeKit launch MVP.');
    }

    if (provider === VIDEO_PROVIDER_REALTIMEKIT) {
        const missing = [];
        if (!cloudflare.accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
        if (!cloudflare.appId) missing.push('CLOUDFLARE_REALTIMEKIT_APP_ID');
        if (!cloudflare.apiToken) missing.push('CLOUDFLARE_REALTIMEKIT_API_TOKEN');

        if (missing.length) {
            const message = `RealtimeKit is selected but missing server-only env vars: ${missing.join(', ')}.`;
            if (isProduction) {
                throw new Error(message);
            }
            video.warnings.push(message);
        }
    }

    return video;
}

module.exports = {
    VIDEO_PROVIDER_MESH,
    VIDEO_PROVIDER_REALTIMEKIT,
    buildVideoPolicy,
    normalizeVideoProvider,
    resolveVideoConfig
};
