const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { createDatabase } = require('../../services/platform/database');
const { createDigetPayClient } = require('../../services/platform/digetpay-client');
const { createDigetPayBilling } = require('../../services/platform/digetpay-billing');
const { createEntitlements } = require('../../services/platform/catalog');
const { backupDatabase, restoreDatabase } = require('../../services/platform/maintenance');
const { hash } = require('../../services/platform/common');
const { sandboxEnv, paymentFixture } = require('../helpers/digetpay-fixture');

test('DigetPay sandbox payment lifecycle and trust boundaries', { timeout: 120000 }, async (t) => {
    const db = await createDatabase();
    let timestamp = Date.parse('2026-10-20T10:00:00Z');
    const now = () => timestamp;
    const fixture = paymentFixture();
    const client = createDigetPayClient(sandboxEnv, fixture.fetchImpl);
    const billing = createDigetPayBilling(db, client, now);
    const entitlements = createEntitlements(db, 'test', now);
    t.after(async () => { await billing.close(); await db.close(); });
    async function user() {
        const id = crypto.randomUUID();
        await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [id, 'Payment test', now()]);
        return id;
    }
    const customer = { name: 'Payment test', phone: '0501234567', email: 'test@example.invalid' };
    async function payment(order) {
        const row = (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1', [order.id])).rows[0];
        return { row, remote: fixture.sessions.get(row.session_id) };
    }
    await t.test('configuration fails closed in production, without USD approval or with unsafe origins', async () => {
        for (const change of [
            { NODE_ENV: 'production' }, { DIGETPAY_ENVIRONMENT: 'live' }, { DIGETPAY_API_KEY: '' },
            { DIGETPAY_USD_ENABLED: 'false' }, { DIGETPAY_PUBLIC_ORIGIN: 'http://public.example' },
            { DIGETPAY_PUBLIC_ORIGIN: 'https://user:password@example.com' }, { DIGETPAY_STATUS_LOOKUP: '' },
            { BILLING_MODE: 'disabled' }
        ]) {
            const disabled = createDigetPayClient({ ...sandboxEnv, ...change }, fixture.fetchImpl);
            assert.equal(disabled.enabled, false);
            const disabledBilling = createDigetPayBilling(db, disabled, now);
            await assert.rejects(disabledBilling.checkout('unused', customer), /CHECKOUT_UNCONFIGURED/);
        }
        assert.equal(fixture.calls.length, 0);
    });
    await t.test('repeated checkout reuses the persisted order and cannot change the price', async () => {
        const id = await user();
        await assert.rejects(billing.checkout(id, { ...customer, phone: 'bad' }), /PAYMENT_PHONE_INVALID/);
        const first = await billing.checkout(id, customer);
        const second = await billing.checkout(id, customer);
        assert.equal(first.id, second.id);
        assert.equal(first.redirectUrl, second.redirectUrl);
        const request = JSON.parse(fixture.calls.at(-1).body);
        assert.equal(request.amount, 4.99);
        assert.equal(request.currency, 'USD');
        assert.equal(request.customerPhone, '501234567');
        assert.match(request.successUrl, new RegExp(first.id));
        assert.equal(request.successUrl, request.failureUrl);
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        await assert.rejects(billing.complete(id, first.id, 'forged', 'success'), /BILLING_RENEWAL_UNAVAILABLE/);
        await assert.rejects(billing.status(await user(), first.id), /CHECKOUT_NOT_FOUND/);
    });
    await t.test('forged notifications cannot grant VIP; verified duplicate events grant exactly one month', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const { remote } = await payment(order);
        await billing.notify({ orderId: order.id, transactionId: remote.transactionId, status: 'Approved', amount: 4.99, currencyCode: '840' });
        await billing.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        remote.transactionStatus = 'SUCCESS';
        remote.paymentStatus = 'APPROVED';
        // The documented session response omits order/currency. In explicitly
        // selected session mode, only the server-stored session is queried.
        delete remote.orderId;
        delete remote.currency;
        const verified = await Promise.all([billing.status(id, order.id), billing.status(id, order.id)]);
        assert.equal(verified[0].status, 'completed');
        await billing.notify({ orderId: order.id, transactionId: crypto.randomUUID(), status: 'Approved' });
        await billing.drain();
        const subscriptions = await db.query('SELECT * FROM halastudy.subscriptions WHERE user_id=$1', [id]);
        assert.equal(subscriptions.rows.length, 1);
        assert.equal(subscriptions.rows[0].cancel_at_period_end, true);
        assert.equal(Number(subscriptions.rows[0].period_end), Date.parse('2026-11-20T10:00:00Z'));
        assert.equal((await createEntitlements(db, 'live', now).resolve(id)).plan.id, 'free');
        await assert.rejects(billing.cancel(id, false), /BILLING_RENEWAL_UNAVAILABLE/);
        await assert.rejects(billing.checkout(id, customer), /ALREADY_SUBSCRIBED/);
    });
    await t.test('concurrent checkout requests create only one provider session', async () => {
        const id = await user();
        const before = fixture.calls.filter((call) => call.method === 'POST').length;
        const results = await Promise.allSettled([billing.checkout(id, customer), billing.checkout(id, customer)]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length >= 1, true);
        assert.equal(fixture.calls.filter((call) => call.method === 'POST').length - before, 1);
        assert.equal((await db.query('SELECT id FROM halastudy.digetpay_orders WHERE user_id=$1', [id])).rows.length, 1);
    });
    await t.test('amount, currency, order and authorization mismatches never activate access', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const { remote } = await payment(order);
        const baseline = { ...remote, transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' };
        for (const patch of [
            { amount: '0.01' }, { currency: 'SAR' }, { orderId: crypto.randomUUID() },
            { paymentStatus: 'DECLINED' }, { transactionStatus: 'PENDING' },
            { refundStatus: undefined }, { totalRefundAmount: undefined }, { amount: '4.9901' }
        ]) {
            Object.assign(remote, baseline, patch);
            const result = await billing.status(id, order.id);
            assert.notEqual(result.status, 'completed');
            assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        }
    });
    await t.test('transaction lookup requires authenticated order and currency binding', async () => {
        const transactionClient = createDigetPayClient({ ...sandboxEnv, DIGETPAY_STATUS_LOOKUP: 'transaction' }, fixture.fetchImpl);
        const transactionBilling = createDigetPayBilling(db, transactionClient, now);
        const id = await user();
        const order = await transactionBilling.checkout(id, customer);
        const { remote } = await payment(order);
        remote.transactionStatus = 'SUCCESS';
        remote.paymentStatus = 'APPROVED';
        delete remote.orderId;
        await transactionBilling.notify({ orderId: order.id, transactionId: remote.transactionId });
        await transactionBilling.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        remote.orderId = order.id;
        await transactionBilling.notify({ orderId: order.id, transactionId: remote.transactionId });
        await transactionBilling.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'free', 'notification cannot bypass verification cooldown');
        timestamp += 300001;
        await transactionBilling.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'vip');
        await transactionBilling.close();
    });
    await t.test('a declined attempt does not bind the session to its old transaction ID', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const { remote } = await payment(order);
        Object.assign(remote, { transactionStatus: 'FAILED', paymentStatus: 'DECLINED' });
        await billing.status(id, order.id);
        assert.equal((await payment(order)).row.transaction_id, null);
        Object.assign(remote, { transactionId: crypto.randomUUID(), transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
        assert.equal((await billing.status(id, order.id)).status, 'completed');
    });
    await t.test('unknown create outcomes and untrusted redirect URLs block duplicate attempts', async () => {
        for (const failure of ['failCreate', 'badRedirect']) {
            const id = await user();
            fixture.controls[failure] = true;
            await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
            fixture.controls[failure] = false;
            const count = fixture.calls.length;
            await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
            assert.equal(fixture.calls.length, count);
            assert.equal((await billing.latest(id)).status, 'unknown');
        }
    });
    await t.test('persistent webhook work survives a worker restart and retries upstream failures', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const { remote } = await payment(order);
        remote.transactionStatus = 'SUCCESS';
        remote.paymentStatus = 'APPROVED';
        await billing.notify({ orderId: order.id, transactionId: remote.transactionId });
        fixture.controls.failStatus = true;
        await billing.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        fixture.controls.failStatus = false;
        timestamp += 3600000;
        const replacement = createDigetPayBilling(db, client, now);
        await replacement.drain();
        assert.equal((await entitlements.resolve(id)).plan.id, 'vip');
        await replacement.close();
    });
    await t.test('refunds revoke only their membership and stale success cannot resurrect it', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const { remote } = await payment(order);
        Object.assign(remote, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
        await billing.status(id, order.id);
        Object.assign(remote, { refundStatus: 'FULL', totalRefundAmount: '4.99' });
        assert.equal((await billing.status(id, order.id)).status, 'refunded');
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
        Object.assign(remote, { refundStatus: 'NONE', totalRefundAmount: '0.00' });
        assert.equal((await billing.status(id, order.id)).status, 'refunded');
        assert.equal((await entitlements.resolve(id)).plan.id, 'free');
    });
    await t.test('payment orders and verification work are included in backup; v1 snapshots still restore', async () => {
        const file = path.resolve('docs/payments/2026-10-20-digetpay/evidence/test-backup.json');
        await backupDatabase(db, file);
        const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
        const restored = await createDatabase();
        const legacy = await createDatabase();
        try {
            await restoreDatabase(restored, snapshot);
            assert.equal((await restored.query('SELECT count(*) AS count FROM halastudy.digetpay_orders')).rows[0].count,
                (await db.query('SELECT count(*) AS count FROM halastudy.digetpay_orders')).rows[0].count);
            delete snapshot.tables.digetpay_orders;
            for (const table of Object.keys(snapshot.tables).filter(name => name.startsWith('study_'))) delete snapshot.tables[table];
            snapshot.format = 'halastudy-platform-v1';
            snapshot.checksum = hash(JSON.stringify(snapshot.tables));
            await restoreDatabase(legacy, snapshot);
            assert.equal((await legacy.query('SELECT * FROM halastudy.digetpay_orders')).rows.length, 0);
        } finally { await restored.close(); await legacy.close(); }
    });
});

test('DigetPay stuck orders recover and late approvals are reconciled (A-04, A-06)', { timeout: 120000 }, async (t) => {
    const db = await createDatabase();
    let timestamp = Date.parse('2026-10-20T10:00:00Z');
    const now = () => timestamp;
    const fixture = paymentFixture();
    const client = createDigetPayClient(sandboxEnv, fixture.fetchImpl);
    const billing = createDigetPayBilling(db, client, now);
    const entitlements = createEntitlements(db, 'test', now);
    t.after(async () => { await billing.close(); await db.close(); });
    async function user() {
        const id = crypto.randomUUID();
        await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [id, 'Recovery test', now()]);
        return id;
    }
    const customer = { name: 'Recovery test', phone: '0501234567' };
    const row = async (orderId) => (await db.query('SELECT * FROM halastudy.digetpay_orders WHERE id=$1', [orderId])).rows[0];
    const rowsFor = async (userId) => (await db.query(
        'SELECT * FROM halastudy.digetpay_orders WHERE user_id=$1 ORDER BY created_at', [userId])).rows;

    await t.test('a failed create blocks retries briefly, then expires so the user can pay again', async () => {
        const id = await user();
        fixture.controls.failCreate = true;
        await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
        fixture.controls.failCreate = false;
        await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
        timestamp += 10 * 60000 + 1000;
        const retry = await billing.checkout(id, customer);
        assert.equal(retry.status, 'pending');
        assert.ok(retry.redirectUrl);
        const orders = await rowsFor(id);
        assert.deepEqual(orders.map((order) => order.status), ['expired', 'pending']);
    });
    await t.test('an untrusted redirect keeps the provider session so staff recheck and the drain can verify it', async () => {
        const id = await user();
        const staffId = await user();
        fixture.controls.badRedirect = true;
        await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
        fixture.controls.badRedirect = false;
        const [stuck] = await rowsFor(id);
        assert.equal(stuck.status, 'unknown');
        assert.ok(fixture.sessions.has(stuck.session_id), 'provider session id must be persisted');
        const checked = await billing.review(staffId, stuck.id, { reason: 'operator recheck', activateReview: false });
        assert.notEqual(checked.status, 'completed');
        Object.assign(fixture.sessions.get(stuck.session_id), { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
        timestamp += 300001;
        await billing.drain();
        assert.equal((await row(stuck.id)).status, 'completed');
        assert.equal((await entitlements.resolve(id)).plan.id, 'vip');
    });
    await t.test('a crash between commit and provider create does not leave a permanent creating row', async () => {
        const id = await user();
        await db.query(`INSERT INTO halastudy.digetpay_orders
            (id,user_id,mode,status,amount_minor,currency,created_at,expires_at,next_check_at)
            VALUES($1,$2,'test','creating',499,'USD',$3,$4,$3)`, [crypto.randomUUID(), id, now(), now() + 48 * 3600000]);
        await assert.rejects(billing.checkout(id, customer), /PAYMENT_REVIEW_REQUIRED/);
        timestamp += 10 * 60000 + 1000;
        const retry = await billing.checkout(id, customer);
        assert.equal(retry.status, 'pending');
        assert.deepEqual((await rowsFor(id)).map((order) => order.status), ['expired', 'pending']);
    });
    await t.test('a payment approved just before expiry with a lost webhook is still reconciled', async () => {
        const id = await user();
        const order = await billing.checkout(id, customer);
        const session = fixture.sessions.get((await row(order.id)).session_id);
        timestamp += 48 * 3600000 - 60000;
        Object.assign(session, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
        // Webhook lost; the user returns after expiry and starts a new checkout.
        timestamp += 120000;
        await billing.checkout(id, customer);
        assert.equal((await row(order.id)).status, 'expired');
        await billing.drain();
        await billing.drain();
        assert.equal((await row(order.id)).status, 'completed');
        assert.equal((await entitlements.resolve(id)).plan.id, 'vip');
    });
});
