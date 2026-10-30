const crypto = require('node:crypto');

const COOKIE_NAME = 'coStudyReauth';
const TTL_MS = 5 * 60 * 1000;

function binding(token) {
    return crypto.createHash('sha256').update(token || '').digest('hex');
}

function issueReauth(user, sessionToken, secret, now = Date.now(), purpose = 'delete-account') {
    const payload = Buffer.from(JSON.stringify({
        userId: user.id, epoch: user.tokenEpoch, session: binding(sessionToken),
        purpose, expires: now + TTL_MS
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`reauth:${payload}`).digest('base64url');
    return `${payload}.${signature}`;
}

function verifyReauth(token, user, sessionToken, secret, now = Date.now(), purpose = 'delete-account') {
    if (typeof token !== 'string' || token.length > 2048) return false;
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return false;
    const expected = crypto.createHmac('sha256', secret).update(`reauth:${payload}`).digest('base64url');
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)
        || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
    try {
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return value.userId === user.id && value.epoch === user.tokenEpoch
            && value.session === binding(sessionToken) && value.purpose === purpose
            && Number.isFinite(value.expires) && value.expires > now && value.expires <= now + TTL_MS;
    } catch {
        return false;
    }
}

module.exports = { COOKIE_NAME, TTL_MS, issueReauth, verifyReauth };
