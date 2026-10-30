const VIDEO_PROVIDER_MESH = 'mesh';
const VIDEO_PROVIDER_REALTIMEKIT = 'realtimekit';
const VIDEO_PROVIDER_RAW_SFU_LATER = 'raw-sfu-later';
const DEFAULT_VIDEO_PRESET_NAME = 'halastudy_student';
// Watch-only preset (produce/publish disabled) used for Lobby guests. Falls back
// to the student preset if a viewer preset was never provisioned in Cloudflare.
const DEFAULT_VIEWER_PRESET_NAME = 'halastudy_viewer';
const DEFAULT_CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL = 'https://api.realtime.cloudflare.com/.well-known/webhooks.json';
const MAX_VIDEO_PARTICIPANTS = 20;

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

function parseCappedPositiveInteger(value, envName, fallback, maximum) {
    const parsed = parsePositiveInteger(value, envName, fallback);
    if (parsed > maximum) {
        throw new Error(`${envName} must be at most ${maximum}.`);
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

function isLoopbackUrl(value) {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return hostname === 'localhost'
        || hostname === '::1'
        || /^127(?:\.\d{1,3}){3}$/.test(hostname);
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
    const isDevelopmentMeshEnvironment = nodeEnv === 'development' || nodeEnv === 'test';
    const devMeshRequested = parseBoolean(env.ENABLE_DEV_MESH, false);
    if (isProduction && devMeshRequested) {
        throw new Error('ENABLE_DEV_MESH is forbidden in production.');
    }
    if (isProduction && String(env.ICE_SERVERS_JSON || '').trim()) {
        throw new Error('ICE_SERVERS_JSON is forbidden in production; RealtimeKit manages production media transport.');
    }
    if (isProduction && provider === VIDEO_PROVIDER_MESH) {
        throw new Error('VIDEO_PROVIDER=mesh is development-only; production requires RealtimeKit.');
    }
    if (provider === VIDEO_PROVIDER_MESH) {
        if (!isDevelopmentMeshEnvironment) {
            throw new Error('VIDEO_PROVIDER=mesh is development/test-only.');
        }
        if (!devMeshRequested) {
            throw new Error('VIDEO_PROVIDER=mesh requires ENABLE_DEV_MESH=true.');
        }
    }
    const cloudflare = {
        accountId: String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
        appId: String(env.CLOUDFLARE_REALTIMEKIT_APP_ID || '').trim(),
        apiToken: String(env.CLOUDFLARE_REALTIMEKIT_API_TOKEN || '').trim(),
        apiBaseUrl: normalizeUrl(
            env.CLOUDFLARE_REALTIMEKIT_API_BASE_URL,
            'CLOUDFLARE_REALTIMEKIT_API_BASE_URL',
            DEFAULT_CLOUDFLARE_API_BASE_URL
        ),
        webhookPublicKeyUrl: normalizeUrl(
            env.CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL,
            'CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL',
            DEFAULT_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL
        )
    };

    const video = {
        provider,
        devMeshEnabled: provider === VIDEO_PROVIDER_MESH
            && isDevelopmentMeshEnvironment
            && devMeshRequested,
        joinDisabled: parseBoolean(env.VIDEO_JOIN_DISABLED, false),
        maxGlobalParticipants: parseCappedPositiveInteger(
            env.MAX_GLOBAL_VIDEO_PARTICIPANTS,
            'MAX_GLOBAL_VIDEO_PARTICIPANTS',
            MAX_VIDEO_PARTICIPANTS,
            MAX_VIDEO_PARTICIPANTS
        ),
        maxRoomParticipants: parseCappedPositiveInteger(
            env.MAX_ROOM_VIDEO_PARTICIPANTS,
            'MAX_ROOM_VIDEO_PARTICIPANTS',
            MAX_VIDEO_PARTICIPANTS,
            MAX_VIDEO_PARTICIPANTS
        ),
        maxRoomDurationMinutes: parsePositiveInteger(env.MAX_ROOM_DURATION_MINUTES, 'MAX_ROOM_DURATION_MINUTES', 180),
        recordingEnabled: parseBoolean(env.VIDEO_RECORDING_ENABLED, false),
        screenshareEnabled: parseBoolean(env.VIDEO_SCREENSHARE_ENABLED, false),
        chatEnabled: parseBoolean(env.VIDEO_CHAT_ENABLED, false),
        defaultPresetName: String(env.VIDEO_DEFAULT_PRESET_NAME || DEFAULT_VIDEO_PRESET_NAME).trim() || DEFAULT_VIDEO_PRESET_NAME,
        viewerPresetName: String(env.VIDEO_VIEWER_PRESET_NAME || DEFAULT_VIEWER_PRESET_NAME).trim() || DEFAULT_VIEWER_PRESET_NAME,
        publicApiBaseUrl: String(env.PUBLIC_API_BASE_URL || '').trim(),
        cloudflare,
        warnings: []
    };

    if (video.recordingEnabled) {
        throw new Error('VIDEO_RECORDING_ENABLED must remain false for the RealtimeKit launch MVP.');
    }
    if (video.screenshareEnabled) {
        throw new Error('VIDEO_SCREENSHARE_ENABLED must remain false for the RealtimeKit launch MVP.');
    }
    if (video.chatEnabled) {
        throw new Error('VIDEO_CHAT_ENABLED must remain false for the RealtimeKit launch MVP.');
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
        if (nodeEnv === 'test' && missing.length === 0) {
            if (!isLoopbackUrl(cloudflare.apiBaseUrl)) {
                throw new Error('CLOUDFLARE_REALTIMEKIT_API_BASE_URL must use a loopback host in tests.');
            }
            if (!isLoopbackUrl(cloudflare.webhookPublicKeyUrl)) {
                throw new Error('CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL must use a loopback host in tests.');
            }
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
