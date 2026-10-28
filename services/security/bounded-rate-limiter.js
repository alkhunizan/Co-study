const DEFAULT_MAX_ENTRIES = 10_000;

class SlidingWindowRateLimiter {
    constructor({ limit, windowMs, maxEntries = DEFAULT_MAX_ENTRIES }) {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer.');
        if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('windowMs must be positive.');
        if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('maxEntries must be a positive integer.');
        this.limit = limit;
        this.windowMs = windowMs;
        this.maxEntries = maxEntries;
        this.entries = new Map();
    }

    setActive(key, timestamps) {
        this.entries.delete(key);
        if (timestamps.length > 0) this.entries.set(key, timestamps);
    }

    prune(key, now = Date.now()) {
        const timestamps = this.entries.get(key) || [];
        const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        this.setActive(key, active);
        return active;
    }

    pruneExpired(now = Date.now()) {
        for (const [key, timestamps] of Array.from(this.entries)) {
            const active = timestamps.filter((timestamp) => now - timestamp < this.windowMs);
            this.setActive(key, active);
        }
    }

    reserveEntry(key, now) {
        if (this.entries.has(key) || this.entries.size < this.maxEntries) return;
        this.pruneExpired(now);
        while (this.entries.size >= this.maxEntries) {
            const leastRecentlyUsedKey = this.entries.keys().next().value;
            if (leastRecentlyUsedKey === undefined) break;
            this.entries.delete(leastRecentlyUsedKey);
        }
    }

    check(key, now = Date.now()) {
        if (!key) {
            return { allowed: true, remaining: this.limit, retryAfterMs: 0 };
        }

        const active = this.prune(key, now);
        if (active.length >= this.limit) {
            const retryAfterMs = Math.max(0, this.windowMs - (now - active[0]));
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        return {
            allowed: true,
            remaining: Math.max(0, this.limit - active.length),
            retryAfterMs: 0
        };
    }

    consume(key, now = Date.now()) {
        if (!key) {
            return { allowed: true, remaining: this.limit, retryAfterMs: 0 };
        }

        const active = this.prune(key, now);
        if (active.length >= this.limit) {
            const retryAfterMs = Math.max(0, this.windowMs - (now - active[0]));
            return { allowed: false, remaining: 0, retryAfterMs };
        }

        this.reserveEntry(key, now);
        active.push(now);
        this.setActive(key, active);
        return {
            allowed: true,
            remaining: Math.max(0, this.limit - active.length),
            retryAfterMs: 0
        };
    }

    reset(key) {
        if (!key) return;
        this.entries.delete(key);
    }
}

module.exports = {
    SlidingWindowRateLimiter
};
