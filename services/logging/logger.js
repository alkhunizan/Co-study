function redactValue(value) {
    if (value === null || value === undefined || value === '') return value;
    return '[redacted]';
}

function sanitizeLogPayload(payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {};
    }

    const safe = {};
    for (const [key, value] of Object.entries(payload)) {
        if (/token|secret|password|credential|key/i.test(key)) {
            safe[key] = redactValue(value);
        } else if (Array.isArray(value)) {
            safe[key] = value.map((entry) => entry && typeof entry === 'object' ? sanitizeLogPayload(entry) : entry);
        } else if (value && typeof value === 'object') {
            safe[key] = sanitizeLogPayload(value);
        } else {
            safe[key] = value;
        }
    }
    return safe;
}

/**
 * @param {Record<string, any>} defaults
 * @param {{ onEntry?: (entry: any) => void, onEvent?: (entry: any) => void }} [hooks]
 */
function createLogger(defaults = {}, { onEntry, onEvent } = {}) {
    function write(level, payload = {}) {
        const entry = {
            level,
            timestamp: new Date().toISOString(),
            ...sanitizeLogPayload(defaults),
            ...sanitizeLogPayload(payload)
        };
        const line = JSON.stringify(entry);
        try { onEvent?.(entry); } catch { /* monitoring cannot break requests */ }
        if (level === 'error') {
            console.error(line);
        } else if (level === 'warn') {
            console.warn(line);
        } else {
            console.log(line);
        }
        // Feed warn/error entries (already redacted above) to observers —
        // the admin console's recent-errors view hangs off this.
        if (typeof onEntry === 'function' && (level === 'warn' || level === 'error')) {
            try {
                onEntry(entry);
            } catch (_err) { /* observers must never break logging */ }
        }
    }

    return {
        info(payload) {
            write('info', payload);
        },
        warn(payload) {
            write('warn', payload);
        },
        error(payload) {
            write('error', payload);
        }
    };
}

module.exports = {
    createLogger
};
