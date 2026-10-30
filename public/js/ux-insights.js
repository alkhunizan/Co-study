/* Voluntary on-device counters. No identifiers, raw events, URLs or network transport. */
(function attachInsights(global) {
    const KEY = 'halastudyUx:v1';
    const TTL = 7 * 86400000;
    const contract = {
        entry: { action: ['create', 'join'] },
        join: { outcome: ['success', 'invalid', 'full', 'denied', 'network'], duration: ['under5s', 'under30s', 'longer'] },
        focus: { action: ['start', 'complete'], surface: ['room', 'workspace'], credit: ['none', 'under1m', '1to24m', '25plus'] },
        return: { age: ['sameDay', 'later'] }
    };
    let seen = new Set();
    function read() {
        try {
            const value = JSON.parse(global.localStorage.getItem(KEY));
            if (value?.consent === true && Number.isFinite(value.expires) && value.expires > Date.now() && value.expires <= Date.now() + TTL) {
                const counts = {};
                for (const [key, count] of Object.entries(value.counts || {})) {
                    const [name, ...values] = key.split(':');
                    const fields = Object.values(contract[name] || {});
                    if (fields.length && fields.length === values.length && fields.every((allowed, i) => allowed.includes(values[i])) && Number.isInteger(count) && count > 0 && count <= 1000) counts[key] = count;
                }
                return { consent: true, expires: value.expires, counts };
            }
            global.localStorage.removeItem(KEY);
        } catch { /* Storage failure must not affect study. */ }
        return null;
    }
    function save(value) { try { global.localStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; } }
    function consent(enabled) {
        seen = new Set();
        if (enabled) return save({ consent: true, expires: Date.now() + TTL, counts: {} });
        try { global.localStorage.removeItem(KEY); global.sessionStorage?.removeItem(`${KEY}:visit`); } catch { /* unavailable */ }
        return true;
    }
    function record(name, payload, transition) {
        const state = read();
        const schema = contract[name];
        if (!state || !Object.hasOwn(contract, name) || !schema || !payload || typeof payload !== 'object') return false;
        const fields = Object.keys(schema);
        if (Object.keys(payload).length !== fields.length || !fields.every((key) => Object.hasOwn(payload, key) && schema[key].includes(payload[key]))) return false;
        // Transition keys remain in page memory only. They never enter storage.
        const token = transition || `${name}:${fields.map((key) => payload[key]).join(':')}`;
        if (seen.has(token)) return false;
        seen.add(token);
        if (seen.size > 500) seen.delete(seen.values().next().value);
        const key = `${name}:${fields.map((field) => payload[field]).join(':')}`;
        state.counts[key] = Math.min(1000, (state.counts[key] || 0) + 1);
        return save(state);
    }
    const api = { consent, enabled: () => !!read(), summary: () => read()?.counts || {}, record,
        duration: (ms) => ms < 5000 ? 'under5s' : ms < 30000 ? 'under30s' : 'longer',
        credit: (ms) => ms <= 0 ? 'none' : ms < 60000 ? 'under1m' : ms < 1500000 ? '1to24m' : '25plus' };
    global.HalaInsights = api;
    if (global.document) {
        global.document.addEventListener('click', (event) => {
            const link = event.target instanceof Element ? event.target.closest('[data-ux-entry]') : null;
            if (link) record('entry', { action: link.getAttribute('data-ux-entry') }, `entry:${event.timeStamp}`);
        });
        const state = read();
        if (state) {
            try {
                if (global.sessionStorage.getItem(`${KEY}:visit`) !== String(state.expires)) {
                    record('return', { age: Date.now() - (state.expires - TTL) < 86400000 ? 'sameDay' : 'later' }, 'tab-return');
                    global.sessionStorage.setItem(`${KEY}:visit`, String(state.expires));
                }
            } catch { /* Unavailable optional counters do not interrupt study. */ }
        }
    }
})(typeof window === 'undefined' ? globalThis : window);
