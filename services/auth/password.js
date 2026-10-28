const crypto = require('node:crypto');

const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';
// Fixed valid-format hash used when an account is unknown or passwordless.
// The result is always discarded; performing the same PBKDF2 work prevents a
// cheap timing oracle that distinguishes registered emails.
const DUMMY_PASSWORD_HASH = `${'0'.repeat(32)}:${'0'.repeat(HASH_KEY_LENGTH * 2)}`;

async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST, (err, key) => {
            if (err) return reject(err);
            resolve(`${salt}:${key.toString('hex')}`);
        });
    });
}

async function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const parts = typeof hash === 'string' ? hash.split(':') : [];
        const validHash = parts.length === 2
            && /^[0-9a-f]{32}$/i.test(parts[0])
            && new RegExp(`^[0-9a-f]{${HASH_KEY_LENGTH * 2}}$`, 'i').test(parts[1]);
        const [salt, key] = validHash ? parts : DUMMY_PASSWORD_HASH.split(':');
        crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST, (err, derivedKey) => {
            if (err) return reject(err);
            const keyBuffer = Buffer.from(key, 'hex');
            const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
            if (keyBuffer.length !== derivedBuffer.length) {
                return resolve(false);
            }
            resolve(validHash && crypto.timingSafeEqual(keyBuffer, derivedBuffer));
        });
    });
}

module.exports = {
    hashPassword,
    verifyPassword
};
