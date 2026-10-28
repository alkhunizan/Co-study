const crypto = require('node:crypto');

const SECRET_MIN_LENGTH = 32;
const ADMIN_SECRET_INFO = Buffer.from('halastudy/admin-session/v1', 'utf8');
const PRODUCTION_SECRET_BYTES = 32;
const MIN_UNIQUE_SECRET_BYTES = 8;

function isPlaceholderSecret(secret) {
    const normalized = String(secret || '').trim().toLowerCase();
    if (!normalized) return false;
    const compact = normalized.replace(/[\s_-]/g, '');
    return compact.includes('replaceme')
        || compact.includes('changeme')
        || compact.startsWith('example')
        || compact.startsWith('yoursecret')
        || /^<[^>]+>$/.test(normalized);
}

function decodeProductionSecret(secret) {
    if (/^[0-9a-f]{64}$/i.test(secret)) {
        return Buffer.from(secret, 'hex');
    }
    if (/^[A-Za-z0-9_-]{43}$/.test(secret)) {
        const decoded = Buffer.from(secret, 'base64url');
        if (decoded.toString('base64url') === secret) return decoded;
    }
    if (/^[A-Za-z0-9+/]{43}=$/.test(secret)) {
        const decoded = Buffer.from(secret, 'base64');
        if (decoded.toString('base64') === secret) return decoded;
    }
    return null;
}

function validateConfiguredSecret(secret, envName, { production = false } = {}) {
    if (secret.length < SECRET_MIN_LENGTH) {
        throw new Error(`${envName} must be at least ${SECRET_MIN_LENGTH} characters.`);
    }
    if (isPlaceholderSecret(secret)) {
        throw new Error(`${envName} must not use an example or placeholder value.`);
    }
    if (!production) return null;

    const decoded = decodeProductionSecret(secret);
    if (!decoded || decoded.length !== PRODUCTION_SECRET_BYTES) {
        throw new Error(
            `${envName} must encode exactly 32 random bytes as 64 hex, 43 base64url, or padded base64.`
        );
    }
    if (new Set(decoded).size < MIN_UNIQUE_SECRET_BYTES) {
        throw new Error(`${envName} must be generated from random bytes, not a repeated or low-entropy value.`);
    }
    return decoded;
}

function deriveAdminSessionSecret(sessionSecret) {
    return Buffer.from(crypto.hkdfSync(
        'sha256',
        Buffer.from(sessionSecret, 'utf8'),
        Buffer.alloc(0),
        ADMIN_SECRET_INFO,
        32
    )).toString('hex');
}

function resolveSessionSecrets(env = {}) {
    const isProduction = env.NODE_ENV === 'production';
    let sessionSecret = typeof env.SESSION_SECRET === 'string' ? env.SESSION_SECRET.trim() : '';
    let sessionSecretEphemeral = false;

    let sessionSecretBytes = null;
    if (sessionSecret) {
        sessionSecretBytes = validateConfiguredSecret(sessionSecret, 'SESSION_SECRET', { production: isProduction });
    } else if (isProduction) {
        throw new Error('SESSION_SECRET is required in production (min 32 chars). Generate a 32-byte random value.');
    } else {
        sessionSecret = crypto.randomBytes(32).toString('hex');
        sessionSecretEphemeral = true;
    }

    const configuredAdminSecret = typeof env.ADMIN_SESSION_SECRET === 'string'
        ? env.ADMIN_SESSION_SECRET.trim()
        : '';
    if (configuredAdminSecret) {
        const adminSecretBytes = validateConfiguredSecret(
            configuredAdminSecret,
            'ADMIN_SESSION_SECRET',
            { production: isProduction }
        );
        const secretsMatch = isProduction && sessionSecretBytes && adminSecretBytes
            ? crypto.timingSafeEqual(sessionSecretBytes, adminSecretBytes)
            : configuredAdminSecret === sessionSecret;
        if (secretsMatch) {
            throw new Error('ADMIN_SESSION_SECRET must be distinct from SESSION_SECRET.');
        }
        return {
            sessionSecret,
            adminSessionSecret: configuredAdminSecret,
            sessionSecretEphemeral,
            adminSessionSecretDerived: false
        };
    }

    if (isProduction) {
        throw new Error('ADMIN_SESSION_SECRET is required in production and must be distinct from SESSION_SECRET.');
    }

    return {
        sessionSecret,
        adminSessionSecret: deriveAdminSessionSecret(sessionSecret),
        sessionSecretEphemeral,
        adminSessionSecretDerived: true
    };
}

module.exports = {
    resolveSessionSecrets
};
