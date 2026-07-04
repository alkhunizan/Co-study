function redactValue(value) {
    if (typeof value !== 'string') return value;
    if (!value) return value;
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
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            safe[key] = sanitizeLogPayload(value);
        } else {
            safe[key] = value;
        }
    }
    return safe;
}

function createLogger(defaults = {}) {
    function write(level, payload = {}) {
        const entry = {
            level,
            timestamp: new Date().toISOString(),
            ...sanitizeLogPayload(defaults),
            ...sanitizeLogPayload(payload)
        };
        const line = JSON.stringify(entry);
        if (level === 'error') {
            console.error(line);
        } else if (level === 'warn') {
            console.warn(line);
        } else {
            console.log(line);
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
