// Pure auth primitives: HMAC session tokens + input validators. No I/O.
//
// Token format (stateless, node:crypto only):
//   v1.<userId>.<tokenEpoch>.<issuedAtMs>.<base64url HMAC-SHA256 signature>
// Revocation is per-user via tokenEpoch: ban/delete/password-change bumps the
// epoch and every outstanding cookie stops verifying. Rotating SESSION_SECRET
// signs everyone out.
const crypto = require('node:crypto');

const TOKEN_VERSION = 'v1';
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const AVATAR_COLORS = ['amber', 'sage', 'terracotta', 'dusk', 'sand', 'stone'];
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars deliberately to strip them at the trust boundary
const INVISIBLE_TEXT_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

// Mirrors sanitizeUserText in co-study-server.js (kept local to avoid a
// require cycle: co-study-server -> auth routes -> this module).
function sanitizeUserText(raw, maxLength) {
    if (typeof raw !== 'string') return '';
    const visible = raw.replace(INVISIBLE_TEXT_PATTERN, '').trim();
    return Array.from(visible).slice(0, maxLength).join('');
}

function normalizeEmail(raw) {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || trimmed.length > EMAIL_MAX_LENGTH) return null;
    if (!EMAIL_PATTERN.test(trimmed)) return null;
    return trimmed;
}

function validatePassword(raw) {
    if (typeof raw !== 'string') return null;
    if (raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) return null;
    return raw;
}

function normalizeAvatarColor(raw) {
    return AVATAR_COLORS.includes(raw) ? raw : 'amber';
}

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

/** @param {{ userId: string, tokenEpoch: number, secret: string, now?: number }} options */
function createSessionToken({ userId, tokenEpoch, secret, now = Date.now() }) {
    if (!userId || !Number.isInteger(tokenEpoch) || !secret) {
        throw new Error('createSessionToken requires userId, tokenEpoch, and secret.');
    }
    const payload = `${TOKEN_VERSION}.${userId}.${tokenEpoch}.${now}`;
    return `${payload}.${signPayload(payload, secret)}`;
}

/**
 * @param {string} token
 * @param {{ secret: string, maxAgeMs?: number, now?: number }} options
 */
function verifySessionToken(token, { secret, maxAgeMs, now = Date.now() } = /** @type {any} */ ({})) {
    if (typeof token !== 'string' || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 5 || parts[0] !== TOKEN_VERSION) return null;
    const [version, userId, rawEpoch, rawIssuedAt, signature] = parts;
    const tokenEpoch = Number.parseInt(rawEpoch, 10);
    const issuedAt = Number.parseInt(rawIssuedAt, 10);
    if (!userId || !Number.isInteger(tokenEpoch) || !Number.isFinite(issuedAt)) return null;
    if (Number.isFinite(maxAgeMs) && now - issuedAt > maxAgeMs) return null;
    if (issuedAt > now + 60 * 1000) return null;

    const expected = signPayload(`${version}.${userId}.${rawEpoch}.${rawIssuedAt}`, secret);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length) return null;
    if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

    return { userId, tokenEpoch, issuedAt };
}

module.exports = {
    sanitizeUserText,
    normalizeEmail,
    validatePassword,
    normalizeAvatarColor,
    createSessionToken,
    verifySessionToken
};
