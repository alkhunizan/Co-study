const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { verifyLoginPassword } = require('../../services/auth/auth-routes');
const { verifyPassword } = require('../../services/auth/password');

test('invalid password hashes still perform the PBKDF2 verification work', async () => {
    const originalPbkdf2 = crypto.pbkdf2;
    let calls = 0;
    crypto.pbkdf2 = (...args) => {
        calls += 1;
        return originalPbkdf2(...args);
    };

    try {
        assert.equal(await verifyPassword('guess', null), false);
        assert.equal(calls, 1);
    } finally {
        crypto.pbkdf2 = originalPbkdf2;
    }
});

test('unknown and passwordless accounts use the same dummy verifier path', async () => {
    const hashes = [];
    const verifier = async (_password, hash) => {
        hashes.push(hash);
        return false;
    };

    assert.equal(await verifyLoginPassword(null, 'guess', verifier), false);
    assert.equal(await verifyLoginPassword({
        passwordEnabled: false,
        passwordHash: 'must-not-be-used'
    }, 'guess', verifier), false);
    assert.deepEqual(hashes, [null, null]);
});
