const crypto = require('node:crypto');

const OAUTH_STATE_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MAX_REGISTRY_ENTRIES = 10_000;
const MAX_TOKEN_PAYLOAD_BYTES = 4096;
const MAX_NEXT_LENGTH = 2048;
const STATE_VERSION = 'os1';
const PROOF_VERSION = 'op1';
const HKDF_SALT = Buffer.from('halastudy-oauth-security-v1', 'utf8');
const OAUTH_INTENTS = new Set(['signin', 'link', 'reauth_delete']);
const PROOF_PURPOSES = new Set(['link_preauth', 'delete_grant']);

function containsControlCharacter(value) {
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        if (code <= 31 || code === 127) return true;
    }
    return false;
}

function isUnsafePathForm(value) {
    return value.startsWith('//') || value.includes('\\') || containsControlCharacter(value);
}

function decodePathLayers(value) {
    let decoded = value;
    for (let pass = 0; pass < 4; pass += 1) {
        if (isUnsafePathForm(decoded)) return null;
        let next;
        try {
            next = decodeURIComponent(decoded);
        } catch {
            return null;
        }
        if (next === decoded) return decoded;
        decoded = next;
    }
    return isUnsafePathForm(decoded) ? null : decoded;
}

function normalizeKnownFallback(fallback) {
    if (typeof fallback !== 'string' || !fallback.startsWith('/') || fallback.startsWith('//')) {
        return '/account';
    }
    return fallback;
}

/**
 * Returns a browser-safe, same-origin path or a known local fallback.
 * Backslashes are rejected before and after repeated decoding because browsers
 * and proxies disagree about whether they are path or authority separators.
 */
function normalizeLocalNext(raw, fallback = '/account') {
    const safeFallback = normalizeKnownFallback(fallback);
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return safeFallback;
    if (raw !== raw.trim() || !raw.startsWith('/') || isUnsafePathForm(raw)) return safeFallback;
    if (decodePathLayers(raw) === null) return safeFallback;

    try {
        const parsed = new URL(raw, 'https://halastudy.invalid');
        if (parsed.origin !== 'https://halastudy.invalid') return safeFallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return safeFallback;
    }
}

function deriveKey(secret, purpose) {
    return Buffer.from(crypto.hkdfSync(
        'sha256',
        Buffer.from(secret, 'utf8'),
        HKDF_SALT,
        Buffer.from(`halastudy/${purpose}`, 'utf8'),
        32
    ));
}

function signEncodedPayload(encodedPayload, key) {
    return crypto.createHmac('sha256', key).update(encodedPayload).digest('base64url');
}

function signaturesMatch(expected, actual) {
    if (typeof actual !== 'string') return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return expectedBuffer.length === actualBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function encodeToken(version, payload, key) {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${version}.${encodedPayload}.${signEncodedPayload(encodedPayload, key)}`;
}

function decodePayload(token, version) {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_PAYLOAD_BYTES * 2) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== version || !parts[1] || !parts[2]) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return null;
    let decoded;
    try {
        const raw = Buffer.from(parts[1], 'base64url');
        if (raw.length > MAX_TOKEN_PAYLOAD_BYTES) return null;
        decoded = JSON.parse(raw.toString('utf8'));
    } catch {
        return null;
    }
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    return { encodedPayload: parts[1], payload: decoded, signature: parts[2] };
}

function validNonce(nonce) {
    return typeof nonce === 'string' && nonce.length >= 24 && nonce.length <= 128
        && /^[A-Za-z0-9_-]+$/.test(nonce);
}

function validUserId(userId) {
    return typeof userId === 'string' && userId.length > 0 && userId.length <= 255;
}

function createOneTimeRegistry({ now, maxEntries }) {
    const entries = new Map();

    function sweep(timestamp) {
        for (const [key, expiresAt] of entries) {
            if (expiresAt >= timestamp) continue;
            entries.delete(key);
        }
    }

    function register(key, expiresAt) {
        const timestamp = now();
        sweep(timestamp);
        while (entries.size >= maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
        entries.set(key, expiresAt);
    }

    function consume(key, timestamp) {
        sweep(timestamp);
        const expiresAt = entries.get(key);
        if (!expiresAt || expiresAt < timestamp) return false;
        entries.delete(key);
        return true;
    }

    return { consume, register };
}

/**
 * Creates process-local OAuth state. Outstanding states intentionally stop
 * working after a restart, and every accepted state/proof is consumed once.
 */
function createOAuthSecurity({
    secret,
    now = Date.now,
    maxEntries = MAX_REGISTRY_ENTRIES
} = /** @type {any} */ ({})) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('OAuth security requires a session secret of at least 32 characters.');
    }
    if (typeof now !== 'function' || !Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new Error('OAuth security configuration is invalid.');
    }

    const stateKeys = new Map(Array.from(OAUTH_INTENTS, (intent) => [
        intent,
        deriveKey(secret, `oauth-state/${intent}`)
    ]));
    const proofKeys = new Map(Array.from(PROOF_PURPOSES, (purpose) => [
        purpose,
        deriveKey(secret, `oauth-proof/${purpose}`)
    ]));
    const registry = createOneTimeRegistry({ now, maxEntries });

    function issueState({ intent, userId = null, next = '/account' }) {
        if (!OAUTH_INTENTS.has(intent)) throw new Error('Unsupported OAuth intent.');
        if (intent !== 'signin' && !validUserId(userId)) {
            throw new Error('Authenticated OAuth intents require a user id.');
        }
        const issuedAt = now();
        const nonce = crypto.randomBytes(24).toString('base64url');
        const payload = {
            intent,
            issuedAt,
            next: normalizeLocalNext(next),
            nonce,
            userId: intent === 'signin' ? null : userId
        };
        const token = encodeToken(STATE_VERSION, payload, stateKeys.get(intent));
        registry.register(`state:${intent}:${nonce}`, issuedAt + OAUTH_STATE_MAX_AGE_MS);
        return { expiresAt: issuedAt + OAUTH_STATE_MAX_AGE_MS, nonce, token };
    }

    function consumeState({ token, nonce }) {
        const decoded = decodePayload(token, STATE_VERSION);
        if (!decoded) return null;
        const { payload } = decoded;
        if (!OAUTH_INTENTS.has(payload.intent) || !Number.isFinite(payload.issuedAt)
            || !validNonce(payload.nonce) || payload.nonce !== nonce
            || normalizeLocalNext(payload.next) !== payload.next) {
            return null;
        }
        if (payload.intent === 'signin') {
            if (payload.userId !== null) return null;
        } else if (!validUserId(payload.userId)) {
            return null;
        }

        const expected = signEncodedPayload(decoded.encodedPayload, stateKeys.get(payload.intent));
        if (!signaturesMatch(expected, decoded.signature)) return null;
        const timestamp = now();
        if (payload.issuedAt > timestamp + MAX_FUTURE_SKEW_MS
            || timestamp - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
            return null;
        }
        if (!registry.consume(`state:${payload.intent}:${payload.nonce}`, timestamp)) return null;
        return {
            intent: payload.intent,
            issuedAt: payload.issuedAt,
            next: payload.next,
            nonce: payload.nonce,
            userId: payload.userId
        };
    }

    function issueProof({ purpose, userId }) {
        if (!PROOF_PURPOSES.has(purpose) || !validUserId(userId)) {
            throw new Error('Unsupported OAuth proof.');
        }
        const issuedAt = now();
        const nonce = crypto.randomBytes(24).toString('base64url');
        const payload = { purpose, issuedAt, nonce, userId };
        registry.register(`proof:${purpose}:${nonce}`, issuedAt + OAUTH_STATE_MAX_AGE_MS);
        return encodeToken(PROOF_VERSION, payload, proofKeys.get(purpose));
    }

    function consumeProof({ purpose, token, userId }) {
        if (!PROOF_PURPOSES.has(purpose) || !validUserId(userId)) return false;
        const decoded = decodePayload(token, PROOF_VERSION);
        if (!decoded) return false;
        const { payload } = decoded;
        if (payload.purpose !== purpose || payload.userId !== userId
            || !Number.isFinite(payload.issuedAt) || !validNonce(payload.nonce)) {
            return false;
        }
        const expected = signEncodedPayload(decoded.encodedPayload, proofKeys.get(purpose));
        if (!signaturesMatch(expected, decoded.signature)) return false;
        const timestamp = now();
        if (payload.issuedAt > timestamp + MAX_FUTURE_SKEW_MS
            || timestamp - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
            return false;
        }
        return registry.consume(`proof:${purpose}:${payload.nonce}`, timestamp);
    }

    return { consumeProof, consumeState, issueProof, issueState };
}

module.exports = {
    OAUTH_STATE_MAX_AGE_MS,
    createOAuthSecurity,
    normalizeLocalNext
};
