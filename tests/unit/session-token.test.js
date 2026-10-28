const assert = require('node:assert/strict');
const test = require('node:test');

const { createSessionToken, verifySessionToken } = require('../../services/auth');

const SECRET = 'session-binding-test-secret-0123456789abcdef';

test('user session tokens verify only with the anonymous session used at issuance', () => {
    const token = createSessionToken({
        userId: 'user-1',
        tokenEpoch: 3,
        sessionId: 'browser-session-1',
        secret: SECRET,
        now: 1000
    });

    assert.deepEqual(verifySessionToken(token, {
        secret: SECRET,
        sessionId: 'browser-session-1',
        now: 1000
    }), {
        userId: 'user-1',
        tokenEpoch: 3,
        issuedAt: 1000,
        sessionId: 'browser-session-1'
    });
    assert.equal(verifySessionToken(token, {
        secret: SECRET,
        sessionId: 'browser-session-2',
        now: 1000
    }), null);
    assert.equal(verifySessionToken(token, { secret: SECRET, now: 1000 }), null);
});

test('unbound admin-compatible tokens retain the v1 verification contract', () => {
    const token = createSessionToken({
        userId: 'admin',
        tokenEpoch: 1,
        secret: SECRET,
        now: 2000
    });

    assert.match(token, /^v1\./);
    assert.deepEqual(verifySessionToken(token, { secret: SECRET, now: 2000 }), {
        userId: 'admin',
        tokenEpoch: 1,
        issuedAt: 2000
    });
    assert.equal(verifySessionToken(token, {
        secret: SECRET,
        sessionId: 'browser-session-1',
        now: 2000
    }), null);
});
