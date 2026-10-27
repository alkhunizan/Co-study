const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

// Jobs live inside the existing durable account record, in the same save as the
// token hash. This avoids a cross-store transaction and requires no new schema.
function createRecoveryQueue({ users, mail, mutateAccount, logger }) {
    let closed = false, active = null;
    const sink = { status() { return this; }, json() {} };
    function valid(user, purpose, record) {
        return users.get(user.id) === user && !user.banned && record
            && record.expiresAt > Date.now() && record.epoch === user.tokenEpoch
            && record.email === user.email && (purpose !== 'reset' || user.authProvider !== 'google');
    }
    async function consumeIntent() {
        const intent = await mail.nextRequest();
        if (intent) {
            let request;
            try { request = mail.open(intent.payload); } catch {
                logger.error({ event: 'account_recovery_delivery_failed' });
                if (Number(intent.created_at) + 30 * 60000 > Date.now()) { await mail.deferRequest(intent.id); return; }
            }
            const user = users.get(request?.userId), purpose = request?.purpose;
            if (!request || !user || user.banned || request.epoch !== user.tokenEpoch || request.email !== user.email
                || request.expiresAt <= Date.now() || !['reset', 'verify'].includes(purpose)
                || (purpose === 'reset' && user.authProvider === 'google') || (purpose === 'verify' && user.emailVerifiedAt)) {
                await mail.finishRequest(intent.id);
                return;
            }
            let committed = false;
            await mutateAccount({ user }, sink, ['recovery'], target => {
                if (target.banned || target.tokenEpoch !== request.epoch || target.email !== request.email) return () => { committed = true; };
                const current = target.recovery?.[purpose];
                if (!current || (current.hash !== digest(request.token) && current.expiresAt <= request.expiresAt)) {
                    target.recovery = { ...target.recovery, [purpose]: { hash: digest(request.token), expiresAt: request.expiresAt,
                        epoch: target.tokenEpoch, email: target.email,
                        delivery: mail.prepare({ email: target.email, purpose, token: request.token, id: intent.id }) } };
                }
                return () => { committed = true; };
            });
            if (committed) await mail.finishRequest(intent.id);
            return;
        }
    }
    async function run() {
        if (closed || !mail.isReady()) return;
        await consumeIntent();
        for (const user of users.values()) for (const purpose of ['reset', 'verify']) {
            const record = user.recovery?.[purpose], job = record?.delivery;
            if (!job || job.nextAt > Date.now()) continue;
            let payload;
            try { payload = mail.open(job); } catch {
                logger.error({ event: 'account_recovery_delivery_failed' });
                if (valid(user, purpose, record)) {
                    await mutateAccount({ user }, sink, ['recovery'], target => {
                        if (target.recovery?.[purpose]?.delivery?.id === job.id) target.recovery[purpose].delivery.nextAt = Date.now() + 60000;
                        return () => {};
                    });
                    continue;
                }
            }
            const allowed = valid(user, purpose, record) && job.attempts < 5 && payload
                && payload.email === user.email && payload.purpose === purpose && digest(payload.token) === record.hash;
            if (!allowed) {
                await mutateAccount({ user }, sink, ['recovery'], target => {
                    if (target.recovery?.[purpose]?.delivery?.id === job.id) delete target.recovery[purpose].delivery;
                    return () => {};
                });
                continue;
            }
            if (!(await mail.reserveBudget())) return;
            let committed = false;
            await mutateAccount({ user }, sink, ['recovery'], target => {
                const current = target.recovery?.[purpose];
                if (!valid(target, purpose, current) || current.delivery?.id !== job.id) return () => {};
                current.delivery.attempts++;
                current.delivery.nextAt = Date.now() + Math.min(300000, 10000 * 2 ** current.delivery.attempts);
                return () => { committed = true; };
            });
            if (!committed || !valid(user, purpose, user.recovery?.[purpose]) || user.recovery[purpose].delivery?.id !== job.id) return;
            let done = false;
            try { await mail.deliver(job); done = true; }
            catch (error) {
                done = error.retryable === false;
                logger.error({ event: 'account_recovery_delivery_failed' });
            }
            if (done) await mutateAccount({ user }, sink, ['recovery'], target => {
                if (target.recovery?.[purpose]?.delivery?.id === job.id) delete target.recovery[purpose].delivery;
                return () => {};
            });
            return; // one attempt per tick, including provider failures
        }
    }
    function drain() {
        if (!active && !closed) {
            active = run().catch(() => logger.error({ event: 'account_recovery_delivery_failed' })).finally(() => { active = null; });
        }
        return active;
    }
    const timer = setInterval(drain, 1000);
    timer.unref();
    return { drain, async close() { closed = true; clearInterval(timer); await active; },
        size() { let count = 0; for (const user of users.values()) for (const purpose of ['reset', 'verify']) if (user.recovery?.[purpose]?.delivery) count++; return count; } };
}

module.exports = { createRecoveryQueue };
