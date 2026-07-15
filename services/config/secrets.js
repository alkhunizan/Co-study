const crypto = require('node:crypto');

const SECRET_MIN_LENGTH = 32;
const ADMIN_SECRET_INFO = Buffer.from('halastudy/admin-session/v1', 'utf8');

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

function validateConfiguredSecret(secret, envName) {
    if (secret.length < SECRET_MIN_LENGTH) {
        throw new Error(`${envName} must be at least ${SECRET_MIN_LENGTH} characters.`);
    }
    if (isPlaceholderSecret(secret)) {
        throw new Error(`${envName} must not use an example or placeholder value.`);
    }
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

    if (sessionSecret) {
        validateConfiguredSecret(sessionSecret, 'SESSION_SECRET');
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
        validateConfiguredSecret(configuredAdminSecret, 'ADMIN_SESSION_SECRET');
        if (configuredAdminSecret === sessionSecret) {
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
