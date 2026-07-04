const crypto = require('node:crypto');

const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';

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
        if (!hash?.includes(':')) return resolve(false);
        const [salt, key] = hash.split(':');
        crypto.pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST, (err, derivedKey) => {
            if (err) return reject(err);
            const keyBuffer = Buffer.from(key, 'hex');
            const derivedBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
            if (keyBuffer.length !== derivedBuffer.length) {
                return resolve(false);
            }
            resolve(crypto.timingSafeEqual(keyBuffer, derivedBuffer));
        });
    });
}

module.exports = {
    hashPassword,
    verifyPassword
};
