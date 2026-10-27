const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createResendMail, sanitizeDelivery } = require('../../services/auth/recovery-delivery');
const { createRecoveryQueue } = require('../../services/auth/recovery-queue');
const { createDatabase } = require('../../services/platform/database');
const { createUser, sanitizeUser } = require('../../user-store');

function config() {
    return { NODE_ENV: 'production', AUTH_MAIL_MODE: 'resend', RESEND_API_KEY: 'synthetic-test-only', AUTH_MAIL_FROM: 'Halastudy <info@halastudy.com>',
        AUTH_PUBLIC_ORIGIN: 'https://halastudy.com', AUTH_MAIL_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
}
const platformStub = { enabled: true, ready: Promise.resolve() };

test('Resend mail requires SQL, HTTPS, sender and a separate valid encryption key', () => {
    const env = config();
    assert.equal(createResendMail({ env, platform: platformStub }).enabled, true);
    for (const patch of [{ AUTH_PUBLIC_ORIGIN: 'http://halastudy.com' }, { AUTH_PUBLIC_ORIGIN: 'https://halastudy.com/unsafe' },
        { AUTH_MAIL_FROM: 'wrong@example.invalid' }, { AUTH_MAIL_ENCRYPTION_KEY: '' }, { RESEND_API_KEY: '' }]) {
        assert.equal(createResendMail({ env: { ...env, ...patch }, platform: platformStub }).enabled, false);
    }
    assert.equal(createResendMail({ env, platform: { enabled: false } }).enabled, false);
    assert.equal(createResendMail({ env: { ...env, NODE_ENV: 'test' }, platform: platformStub }).enabled, false);
});

test('Resend sends immutable bilingual fragment links with stable provider idempotency and encrypted jobs', async () => {
    const calls = [], env = config();
    const mail = createResendMail({ env, platform: platformStub, fetchImpl: async (url, options) => {
        calls.push({ url, options }); return new Response(JSON.stringify({ id: 'fake-receipt' }));
    } });
    const token = `${crypto.randomUUID()}.PRIVATE-RECOVERY-TOKEN`;
    const job = mail.prepare({ email: 'test@example.invalid', purpose: 'reset', token });
    assert.ok(sanitizeDelivery(job));
    assert.ok(!JSON.stringify(job).includes(token));
    assert.equal(mail.open(job).token, token);
    const corrupt = { ...job, id: crypto.randomUUID() };
    assert.throws(() => mail.open(corrupt));
    await mail.deliver(job); await mail.deliver(structuredClone(job));
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.body, calls[1].options.body);
    assert.equal(calls[0].options.headers['Idempotency-Key'], `recovery/${job.id}`);
    const message = JSON.parse(calls[0].options.body);
    assert.match(message.text, /إعادة تعيين كلمة المرور/); assert.match(message.text, /Reset your password/);
    assert.match(message.text, /https:\/\/halastudy.com\/recover#purpose=reset&token=/);
    assert.doesNotMatch(message.text, /recover\?token=/);
});

test('Resend failures, malformed receipts, headers/body stalls and oversized bodies stay bounded and redacted', async () => {
    const implementations = [
        async () => new Response('PRIVATE-PROVIDER-BODY', { status: 500 }),
        async () => new Response('PRIVATE-PROVIDER-BODY', { status: 400 }),
        async () => new Response('PRIVATE-PROVIDER-BODY'),
        async () => new Response('x'.repeat(20000)),
        () => new Promise(() => {}),
        async () => new Response(new ReadableStream({ start() {} }))
    ];
    for (const fetchImpl of implementations) {
        const mail = createResendMail({ env: config(), platform: platformStub, fetchImpl, timeoutMs: 40 });
        const job = mail.prepare({ email: 'private@example.invalid', purpose: 'verify', token: 'PRIVATE-TOKEN' });
        const start = Date.now();
        await assert.rejects(mail.deliver(job), error => error instanceof Error && error.message === 'MAIL_DELIVERY_FAILED' && !JSON.stringify(error).includes('PRIVATE'));
        assert.ok(Date.now() - start < 1500);
    }
});

test('accepted recovery survives restart; retries retain the same message and obsolete jobs never send', async (t) => {
    const db = await createDatabase(); t.after(() => db.close());
    const env = config(), sent = [], users = new Map();
    let fail = true;
    /** @type {any} */ let durable;
    const platform = { enabled: true, db, ready: Promise.resolve() };
    const mail = createResendMail({ env, platform, fetchImpl: async (_url, options) => {
        sent.push(options.body); if (fail) throw new Error('PRIVATE FAILURE');
        return new Response(JSON.stringify({ id: 'fake-receipt' }));
    } });
    const user = createUser({ email: 'durable@example.invalid', passwordHash: 'synthetic:hash', displayName: 'Durable' });
    users.set(user.id, user);
    const mutateAccount = async ({ user: target }, _res, _fields, change) => {
        const finish = change(target); durable = structuredClone(target); return finish();
    };
    let queue = createRecoveryQueue({ users, mail, mutateAccount, logger: { error() {} } });
    t.after(() => queue.close());
    await mail.accept(user, user.email, 'reset');
    assert.equal((await db.query("SELECT count(*)::integer AS count FROM halastudy.outbox WHERE kind='recovery_request'")).rows[0].count, 1);
    await queue.close(); // restart before the token has even reached the account
    queue = createRecoveryQueue({ users, mail, mutateAccount, logger: { error() {} } });
    await queue.drain();
    assert.equal(sent.length, 1);
    assert.ok(durable.recovery.reset.delivery);
    const restored = sanitizeUser(durable); users.set(user.id, restored);
    restored.recovery.reset.delivery.nextAt = 0;
    fail = false; await queue.drain();
    assert.equal(sent.length, 2); assert.equal(sent[0], sent[1]);
    assert.equal(restored.recovery.reset.delivery, undefined);
    await mail.accept(restored, restored.email, 'verify');
    restored.tokenEpoch++; await queue.drain();
    assert.equal(sent.length, 2, 'revoked intent must not send');
    assert.equal(await mail.reserveBudget(), true);
});

test('recovery queue caps concurrent accepted requests and persists the daily provider budget', async (t) => {
    const db = await createDatabase(); t.after(() => db.close());
    const mail = createResendMail({ env: { ...config(), AUTH_MAIL_DAILY_LIMIT: '2' }, platform: { ...platformStub, db } });
    const outcomes = await Promise.allSettled(Array.from({ length: 105 }, () => mail.accept(null, 'unknown@example.invalid', 'reset')));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 100);
    assert.equal(await mail.reserveBudget(), true); assert.equal(await mail.reserveBudget(), true);
    assert.equal(await mail.reserveBudget(), false);
});
