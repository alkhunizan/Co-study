const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizeEmail, validatePassword } = require('./index');
const { hashPassword } = require('./password');
const { createResendMail } = require('./recovery-delivery');
const { createRecoveryQueue } = require('./recovery-queue');

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

function createRecoveryMail({ env, directory, platform = null, isReady = () => true }) {
    if (env.AUTH_MAIL_MODE === 'resend') return createResendMail({ env, platform, isReady });
    // Local outbox is explicitly opt-in and impossible in production. It is
    // private operator data, never exposed through HTTP or application logs.
    const enabled = env.NODE_ENV !== 'production' && env.AUTH_MAIL_MODE === 'local';
    return {
        enabled, mode: 'local',
        async send({ email, purpose, token }) {
            if (!enabled) throw new Error('MAIL_UNAVAILABLE');
            const origin = new URL(env.AUTH_PUBLIC_ORIGIN || 'http://localhost:3000');
            if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.username || origin.password) {
                throw new Error('LOCAL_MAIL_REQUIRES_LOOPBACK_ORIGIN');
            }
            const url = new URL('/recover', origin);
            url.hash = new URLSearchParams({ purpose, token }).toString();
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(path.join(directory, `${crypto.randomUUID()}.json`),
                JSON.stringify({ email, purpose, url: url.href, createdAt: new Date().toISOString() }),
                { flag: 'wx', mode: 0o600 });
        }
    };
}

function registerRecoveryRoutes(router, deps, mutateAccount) {
    const { users, usersByEmail, recoveryMail: mail, rateLimiters, applyHttpRateLimit,
        getRequestIp, requireUser, disconnectUser, clearAuthCookie, logger } = deps;
    let jobs = 0;
    const available = !!mail?.enabled;
    const queue = available && mail.durable ? createRecoveryQueue({ users, mail, mutateAccount, logger }) : null;
    if (queue) mail.close = queue.close;
    router.get('/auth/recovery/config', (_req, res) => res.json({ enabled: available, mode: available ? (queue ? 'email' : 'local') : 'disabled' }));

    function limited(req, res, key) {
        return !applyHttpRateLimit(req, res, rateLimiters.recoveryIp, getRequestIp(req))
            || !applyHttpRateLimit(req, res, rateLimiters.recoveryAccount, digest(key));
    }
    function enqueue(user, purpose) {
        jobs++;
        // Respond before account lookup/write/delivery work can reveal existence.
        setImmediate(() => {
            const sink = { status() { return this; }, json() {} };
            void (async () => {
                if (!user || user.banned || (purpose === 'reset' && user.authProvider === 'google')) return;
                if (purpose === 'verify' && user.emailVerifiedAt) return;
                await mutateAccount({ user }, sink, ['recovery'], (target) => {
                    const token = `${target.id}.${crypto.randomBytes(32).toString('base64url')}`;
                    const delivery = queue ? mail.prepare({ email: target.email, purpose, token }) : undefined;
                    target.recovery = { ...target.recovery, [purpose]: {
                        hash: digest(token), expiresAt: Date.now() + 30 * 60000,
                        epoch: target.tokenEpoch, email: target.email, ...(delivery ? { delivery } : {})
                    } };
                    return () => queue ? undefined : mail.send({ email: target.email, purpose, token });
                });
            })().catch(() => logger.error({ event: 'account_recovery_delivery_failed' })).finally(() => { jobs--; });
        });
    }
    async function accept(req, res, email, purpose, user) {
        if (queue) {
            try {
                await mail.accept(user, email, purpose, queue.size);
                return res.status(202).json({ ok: true });
            } catch { return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' }); }
        }
        res.status(202).json({ ok: true });
        enqueue(user, purpose);
    }
    router.post('/auth/recovery/request', (req, res) => {
        if (!available) return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' });
        const email = normalizeEmail(req.body?.email);
        if (limited(req, res, email || 'invalid')) return;
        if (jobs + (queue?.size() || 0) >= 100) return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' });
        return accept(req, res, email, 'reset', users.get(usersByEmail.get(email)));
    });
    router.post('/me/email-verification', requireUser, (req, res) => {
        if (!available) return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' });
        if (limited(req, res, req.user.email)) return;
        if (jobs + (queue?.size() || 0) >= 100) return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' });
        return accept(req, res, req.user.email, 'verify', req.user);
    });
    router.post('/auth/recovery/complete', async (req, res) => {
        if (!available) return res.status(503).json({ errorCode: 'RECOVERY_UNAVAILABLE' });
        if (!applyHttpRateLimit(req, res, rateLimiters.recoveryComplete, getRequestIp(req))) return;
        const token = typeof req.body?.token === 'string' ? req.body.token : '';
        const purpose = req.body?.purpose;
        const id = token.split('.')[0];
        const user = users.get(id);
        function valid(target) {
            const record = target?.recovery?.[purpose];
            return ['reset', 'verify'].includes(purpose) && token.length < 150 && !target?.banned
                && record?.hash === digest(token) && record.expiresAt > Date.now()
                && record.epoch === target.tokenEpoch && record.email === target.email;
        }
        if (!valid(user)) return res.status(400).json({ errorCode: 'RECOVERY_LINK_INVALID' });
        const password = purpose === 'reset' ? validatePassword(req.body?.password) : null;
        if (purpose === 'reset' && !password) return res.status(400).json({ errorCode: 'PASSWORD_INVALID' });
        const passwordHash = password ? await hashPassword(password) : null;
        req.user = user;
        return mutateAccount(req, res, ['recovery', 'passwordHash', 'emailVerifiedAt'], (target) => {
            // Check again inside the shared per-account queue after hashing.
            if (!valid(target)) return () => res.status(400).json({ errorCode: 'RECOVERY_LINK_INVALID' });
            target.recovery = {};
            target.emailVerifiedAt = Date.now();
            if (purpose === 'reset') {
                target.passwordHash = passwordHash;
                // Epoch is intentionally monotonic, even if persistence fails.
                // A rollback must never resurrect sessions invalidated concurrently.
                target.tokenEpoch++;
                disconnectUser(target.id);
            }
            return () => {
                if (purpose === 'reset') clearAuthCookie(req, res);
                logger.info({ event: 'account_recovery_completed', purpose, userId: target.id });
                return res.json({ ok: true });
            };
        });
    });
}

module.exports = { createRecoveryMail, registerRecoveryRoutes };
