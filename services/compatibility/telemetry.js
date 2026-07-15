const MINIMUM_ZERO_USE_DAYS = 14;
const COMPATIBILITY_SIGNALS = Object.freeze([
    'auth_provider_fallback',
    'room_schema_v1_read',
    'video_token_client_session_id',
    'video_token_student_role',
    'video_heartbeat_legacy_shape',
    'video_leave_legacy_shape'
]);

function isoTimestamp(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) throw new Error('Compatibility telemetry clock is invalid.');
    return date.toISOString();
}

function createCompatibilityTelemetry(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const logger = options.logger || null;
    const startedAt = isoTimestamp(now());
    const counters = new Map(COMPATIBILITY_SIGNALS.map((signal) => [signal, {
        count: 0,
        lastUsedAt: null
    }]));

    function record(signal) {
        const current = counters.get(signal);
        if (!current) throw new Error(`Unsupported compatibility signal: ${signal}`);
        current.count = Math.min(current.count + 1, Number.MAX_SAFE_INTEGER);
        current.lastUsedAt = isoTimestamp(now());
        logger?.info({
            event: 'compatibility_path_used',
            signal,
            count: current.count
        });
    }

    function snapshot() {
        const signals = {};
        let totalUses = 0;
        for (const [signal, value] of counters.entries()) {
            signals[signal] = { ...value };
            totalUses = Math.min(totalUses + value.count, Number.MAX_SAFE_INTEGER);
        }
        return {
            windowStartedAt: startedAt,
            minimumZeroUseDays: MINIMUM_ZERO_USE_DAYS,
            totalUses,
            signals
        };
    }

    return Object.freeze({ record, snapshot });
}

module.exports = {
    COMPATIBILITY_SIGNALS,
    createCompatibilityTelemetry
};
