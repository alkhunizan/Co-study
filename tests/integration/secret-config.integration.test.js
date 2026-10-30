const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveSessionSecrets } = require('../../services/config/secrets');

const SESSION_SECRET = '0123456789abcdef'.repeat(4);
const ADMIN_SESSION_SECRET = 'fedcba9876543210'.repeat(4);
const DEVELOPMENT_SECRET = 'session-secret-0123456789abcdef-0123456789abcdef';

test('production rejects the documented placeholder session secret', () => {
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: 'replace_me_with_32_plus_random_chars',
            ADMIN_SESSION_SECRET
        }),
        /SESSION_SECRET must not use an example or placeholder value/
    );
});

test('production requires a separate admin session secret', () => {
    assert.throws(
        () => resolveSessionSecrets({ NODE_ENV: 'production', SESSION_SECRET }),
        /ADMIN_SESSION_SECRET is required in production/
    );
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET,
            ADMIN_SESSION_SECRET: SESSION_SECRET
        }),
        /ADMIN_SESSION_SECRET must be distinct from SESSION_SECRET/
    );
});

test('production accepts distinct secrets that each encode exactly 32 random bytes', () => {
    const resolved = resolveSessionSecrets({
        NODE_ENV: 'production',
        SESSION_SECRET,
        ADMIN_SESSION_SECRET
    });

    assert.equal(resolved.sessionSecret, SESSION_SECRET);
    assert.equal(resolved.adminSessionSecret, ADMIN_SESSION_SECRET);
    assert.equal(resolved.sessionSecretEphemeral, false);
    assert.equal(resolved.adminSessionSecretDerived, false);
});

test('production rejects prose, short decoded values, and repeated-byte secrets', () => {
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: 'this-is-long-prose-but-it-is-not-a-random-32-byte-secret',
            ADMIN_SESSION_SECRET
        }),
        /encode exactly 32 random bytes/
    );
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: Buffer.alloc(31, 7).toString('base64url'),
            ADMIN_SESSION_SECRET
        }),
        /encode exactly 32 random bytes/
    );
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET: '00'.repeat(32),
            ADMIN_SESSION_SECRET
        }),
        /repeated or low-entropy/
    );
});

test('production detects the same bytes across different supported encodings', () => {
    const secretBytes = Buffer.from(SESSION_SECRET, 'hex');
    assert.throws(
        () => resolveSessionSecrets({
            NODE_ENV: 'production',
            SESSION_SECRET,
            ADMIN_SESSION_SECRET: secretBytes.toString('base64url')
        }),
        /must be distinct/
    );
});

test('development derives a purpose-separated admin secret when it is omitted', () => {
    const resolved = resolveSessionSecrets({
        NODE_ENV: 'development',
        SESSION_SECRET: DEVELOPMENT_SECRET
    });

    assert.equal(resolved.sessionSecret, DEVELOPMENT_SECRET);
    assert.notEqual(resolved.adminSessionSecret, DEVELOPMENT_SECRET);
    assert.equal(resolved.adminSessionSecret.length, 64);
    assert.equal(resolved.adminSessionSecretDerived, true);
});
