const assert = require('node:assert/strict');
const test = require('node:test');

const {
    OAUTH_STATE_MAX_AGE_MS,
    createOAuthSecurity,
    normalizeLocalNext
} = require('../../services/auth/oauth-security');

const TEST_SECRET = 'oauth-test-secret-that-is-at-least-thirty-two-bytes-long';

test('OAuth next paths stay same-origin and reject encoded path escapes', () => {
    assert.equal(normalizeLocalNext('/room/ABC?from=account#focus'), '/room/ABC?from=account#focus');
    assert.equal(normalizeLocalNext('/account'), '/account');

    const rejected = [
        'https://evil.example/account',
        'javascript:alert(1)',
        '//evil.example/account',
        '///evil.example/account',
        '\\evil.example\\account',
        '/\\evil.example/account',
        '/%5cevil.example/account',
        '/%5Cevil.example/account',
        '/%255cevil.example/account',
        '/%2f%2fevil.example/account',
        '/%252f%252fevil.example/account',
        '/..//evil.example/account',
        '/%2e%2e//evil.example/account',
        '/.%2e//evil.example/account',
        ' /account',
        '/account\nSet-Cookie:x=y'
    ];
    for (const candidate of rejected) {
        assert.equal(normalizeLocalNext(candidate), '/account', candidate);
    }
    assert.equal(normalizeLocalNext('https://evil.example', '/%2e%2e//fallback.evil'), '/account');
});

test('OAuth state is signed with an intent-specific HKDF key and bound to its nonce', () => {
    const now = 1_700_000_000_000;
    const security = createOAuthSecurity({ secret: TEST_SECRET, now: () => now });
    const issued = security.issueState({
        intent: 'signin',
        next: '/room/ABC?from=google'
    });

    assert.notEqual(issued.token, issued.nonce);
    assert.deepEqual(security.consumeState({ token: issued.token, nonce: 'wrong-browser-nonce' }), null);
    assert.deepEqual(security.consumeState({ token: issued.token, nonce: issued.nonce }), {
        intent: 'signin',
        issuedAt: now,
        next: '/room/ABC?from=google',
        nonce: issued.nonce,
        userId: null
    });
    assert.equal(security.consumeState({ token: issued.token, nonce: issued.nonce }), null);

    const linkState = security.issueState({ intent: 'link', userId: 'user-1', next: '/account' });
    const [version, encodedPayload, signature] = linkState.token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    payload.intent = 'reauth_delete';
    const tampered = `${version}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;
    assert.equal(security.consumeState({ token: tampered, nonce: linkState.nonce }), null);
});

test('OAuth state expires after five minutes and rejects future-issued tokens', () => {
    let now = 1_700_000_000_000;
    const security = createOAuthSecurity({ secret: TEST_SECRET, now: () => now });
    const expired = security.issueState({ intent: 'signin', next: '/account' });
    now += OAUTH_STATE_MAX_AGE_MS + 1;
    assert.equal(security.consumeState({ token: expired.token, nonce: expired.nonce }), null);

    now = 1_700_000_060_001;
    const future = security.issueState({ intent: 'signin', next: '/account' });
    now = 1_700_000_000_000;
    assert.equal(security.consumeState({ token: future.token, nonce: future.nonce }), null);
});

test('OAuth proofs are purpose-bound, user-bound, expiring, and single-use', () => {
    let now = 1_700_000_000_000;
    const security = createOAuthSecurity({ secret: TEST_SECRET, now: () => now });
    const proof = security.issueProof({ purpose: 'delete_grant', userId: 'user-1' });

    assert.equal(security.consumeProof({ purpose: 'link_preauth', token: proof, userId: 'user-1' }), false);
    assert.equal(security.consumeProof({ purpose: 'delete_grant', token: proof, userId: 'user-2' }), false);
    assert.equal(security.consumeProof({ purpose: 'delete_grant', token: proof, userId: 'user-1' }), true);
    assert.equal(security.consumeProof({ purpose: 'delete_grant', token: proof, userId: 'user-1' }), false);

    const expired = security.issueProof({ purpose: 'link_preauth', userId: 'user-1' });
    now += OAUTH_STATE_MAX_AGE_MS + 1;
    assert.equal(security.consumeProof({ purpose: 'link_preauth', token: expired, userId: 'user-1' }), false);
});
