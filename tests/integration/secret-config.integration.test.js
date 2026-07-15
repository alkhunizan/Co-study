const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveSessionSecrets } = require('../../services/config/secrets');

const SESSION_SECRET = 'session-secret-0123456789abcdef-0123456789abcdef';
const ADMIN_SESSION_SECRET = 'admin-secret-fedcba9876543210-fedcba9876543210';

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

test('production accepts distinct non-placeholder secrets of at least 32 characters', () => {
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

test('development derives a purpose-separated admin secret when it is omitted', () => {
    const resolved = resolveSessionSecrets({
        NODE_ENV: 'development',
        SESSION_SECRET
    });

    assert.equal(resolved.sessionSecret, SESSION_SECRET);
    assert.notEqual(resolved.adminSessionSecret, SESSION_SECRET);
    assert.equal(resolved.adminSessionSecret.length, 64);
    assert.equal(resolved.adminSessionSecretDerived, true);
});
