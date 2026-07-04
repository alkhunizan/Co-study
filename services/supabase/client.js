// Minimal dependency-free Supabase (PostgREST) client. No SDK — just fetch +
// the service_role key, mirroring the zero-dep R2 client. Server-only: the
// service_role key bypasses RLS, so this must never run in the browser.
//
// Only the verbs the app needs: select / insert / upsert / remove. Errors
// surface as thrown Error with the PostgREST body attached for logging.

const REST_PATH = '/rest/v1/';

/**
 * @param {{ url?: string, serviceKey?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
function createSupabaseClient(options = {}) {
    const {
        url = process.env.SUPABASE_URL,
        serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
        fetchImpl = globalThis.fetch,
        timeoutMs = 10000
    } = options;

    if (!url || !serviceKey) {
        throw new Error('createSupabaseClient requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('createSupabaseClient requires a fetch implementation (Node 18+ global fetch).');
    }

    const base = url.replace(/\/+$/, '') + REST_PATH;

    function authHeaders(extra = {}) {
        return {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            ...extra
        };
    }

    /**
     * @param {string} method
     * @param {string} path
     * @param {{ headers?: Record<string, string>, body?: any }} [opts]
     */
    async function request(method, path, { headers = {}, body } = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetchImpl(`${base}${path}`, {
                method,
                headers: authHeaders(headers),
                body,
                signal: controller.signal
            });
        } finally {
            clearTimeout(timer);
        }
        const text = await res.text();
        if (!res.ok) {
            const error = new Error(`Supabase ${method} ${path} failed: ${res.status} ${text.slice(0, 400)}`);
            // @ts-expect-error attach for callers that want to branch on status
            error.status = res.status;
            throw error;
        }
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    /** GET rows. `query` is a raw PostgREST query string, e.g. "select=*&banned=eq.false". */
    function select(table, query = 'select=*') {
        return request('GET', `${encodeURIComponent(table)}?${query}`);
    }

    /** INSERT rows; returns the inserted rows. */
    function insert(table, rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        return request('POST', encodeURIComponent(table), {
            headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(list)
        });
    }

    /** UPSERT rows on the primary key (merge-duplicates). Minimal return. */
    function upsert(table, rows, { onConflict = 'id' } = {}) {
        const list = Array.isArray(rows) ? rows : [rows];
        if (list.length === 0) return Promise.resolve(null);
        return request('POST', `${encodeURIComponent(table)}?on_conflict=${encodeURIComponent(onConflict)}`, {
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify(list)
        });
    }

    /** DELETE rows where `column` in the given list of ids. No-op on empty. */
    function remove(table, column, ids) {
        const list = Array.isArray(ids) ? ids : [ids];
        if (list.length === 0) return Promise.resolve(null);
        const encoded = list.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',');
        return request('DELETE', `${encodeURIComponent(table)}?${encodeURIComponent(column)}=in.(${encoded})`, {
            headers: { Prefer: 'return=minimal' }
        });
    }

    return { select, insert, upsert, remove };
}

module.exports = { createSupabaseClient };
