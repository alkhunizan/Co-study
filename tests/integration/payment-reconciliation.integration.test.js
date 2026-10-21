const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createDatabase } = require('../../services/platform/database');
const { createDigetPayClient } = require('../../services/platform/digetpay-client');
const { createDigetPayBilling } = require('../../services/platform/digetpay-billing');
const { sandboxEnv, paymentFixture } = require('../helpers/digetpay-fixture');

async function setup(t, lookup = 'session', decorate = (fetchImpl) => fetchImpl) {
    const db = await createDatabase();
    let time = Date.parse('2026-10-21T10:00:00Z');
    const fixture = paymentFixture();
    const billing = createDigetPayBilling(db, createDigetPayClient({ ...sandboxEnv, DIGETPAY_STATUS_LOOKUP: lookup }, decorate(fixture.fetchImpl)), () => time);
    t.after(async () => { await billing.close(); await db.close(); });
    const userId = crypto.randomUUID();
    await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [userId, 'Synthetic', time]);
    const checkout = () => billing.checkout(userId, { phone: '0501234567', name: 'Synthetic', email: 'synthetic@example.invalid' });
    const remote = async (order) => fixture.sessions.get((await db.query('SELECT session_id FROM halastudy.digetpay_orders WHERE id=$1', [order.id])).rows[0].session_id);
    return { db, billing, fixture, userId, checkout, remote, advance(ms) { time += ms; } };
}

test('unsigned transaction hints coalesce without resetting retry budget or bypassing cooldown', async (t) => {
    const h = await setup(t, 'transaction');
    const order = await h.checkout();
    for (let i = 0; i < 20; i++) await h.billing.notify({ orderId: order.id, transactionId: crypto.randomUUID() });
    assert.equal((await h.db.query("SELECT * FROM halastudy.outbox WHERE kind='digetpay.verify'")).rows.length, 1);
    await h.billing.drain();
    assert.equal(h.fixture.calls.filter(c => c.method === 'GET').length, 1);
    const remote = await h.remote(order);
    Object.assign(remote, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
    const event = (await h.db.query('SELECT * FROM halastudy.outbox')).rows[0];
    await h.billing.notify({ orderId: order.id, transactionId: remote.transactionId });
    const changed = (await h.db.query('SELECT * FROM halastudy.outbox')).rows[0];
    assert.equal(changed.attempts, event.attempts);
    assert.equal(Number(changed.available_at), Number(event.available_at));
    await h.billing.drain();
    assert.equal(h.fixture.calls.filter(c => c.method === 'GET').length, 1);
    h.advance(3600000); await h.billing.drain();
    assert.equal((await h.billing.latest(h.userId)).status, 'completed');
    const count = h.fixture.calls.length;
    await h.billing.notify({ orderId: order.id, transactionId: remote.transactionId }); await h.billing.drain();
    assert.equal(h.fixture.calls.length, count, 'duplicate completed notification cannot force an immediate lookup');
    await h.db.query("UPDATE halastudy.outbox SET attempts=20,status='failed'");
    await h.billing.notify({ orderId: order.id, transactionId: crypto.randomUUID() });
    assert.equal((await h.db.query('SELECT status FROM halastudy.outbox')).rows[0].status, 'failed', 'callbacks cannot revive exhausted work');
});

test('out-of-order paid approvals retain review orders alongside a newer pending checkout', async (t) => {
    const h = await setup(t);
    const a = await h.checkout(); h.advance(49 * 3600000);
    const b = await h.checkout(); h.advance(49 * 3600000);
    const c = await h.checkout();
    for (const order of [a, b]) Object.assign(await h.remote(order), { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
    assert.equal((await h.billing.status(h.userId, a.id)).status, 'completed');
    assert.equal((await h.billing.status(h.userId, b.id)).status, 'review');
    assert.equal((await h.db.query('SELECT status FROM halastudy.digetpay_orders WHERE id=$1', [c.id])).rows[0].status, 'pending');
    assert.equal((await h.db.query('SELECT * FROM halastudy.subscriptions')).rows.length, 1);
    h.advance(32 * 86400000);
    assert.equal((await h.billing.status(h.userId, b.id)).status, 'review', 'review cannot silently turn into a second entitlement later');
    assert.equal((await h.billing.review(h.userId, b.id, { reason: 'Recheck overlap', activateReview: false })).status, 'review');
    assert.equal((await h.billing.review(h.userId, b.id, { reason: 'Approve verified month after investigation', activateReview: true })).status, 'completed');
    assert.equal((await h.db.query("SELECT * FROM halastudy.subscriptions WHERE status='active'")).rows.length, 1);
    await h.billing.review(h.userId, b.id, { reason: 'Repeat investigation', activateReview: true });
    assert.equal((await h.db.query('SELECT * FROM halastudy.subscriptions')).rows.length, 2, 'operator retry is idempotent');
});

test('operator review records failures and never accepts a foreign transaction as payment proof', async (t) => {
    const h = await setup(t, 'transaction');
    const order = await h.checkout();
    const remote = await h.remote(order);
    Object.assign(remote, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED', orderId: crypto.randomUUID() });
    await assert.rejects(h.billing.review(h.userId, order.id, { reason: 'Investigate provider receipt', transactionId: remote.transactionId, activateReview: true }), /PAYMENT_VERIFICATION_INCOMPLETE/);
    assert.equal((await h.db.query('SELECT * FROM halastudy.subscriptions')).rows.length, 0);
    const listed = await h.billing.listReview();
    assert.equal(listed.orders[0].last_error, 'PAYMENT_VERIFICATION_INCOMPLETE');
    assert.equal(listed.orders[0].redirect_url, undefined);
    assert.equal(listed.orders[0].session_id, undefined);
    const audit = (await h.db.query("SELECT * FROM halastudy.audit_events WHERE action LIKE 'payment.review.%' ORDER BY action")).rows;
    assert.equal(audit.length, 2);
    assert.equal(audit[0].action, 'payment.review.failed');
    assert.equal(audit[1].detail.reason, 'Investigate provider receipt');
    assert.equal(audit[1].actor_id, h.userId);
    await assert.rejects(h.billing.review(h.userId, order.id, { reason: '', activateReview: true }), /ACTION_INVALID/);
});

test('unresolved payment pages are bounded, cursor validated and complete', async (t) => {
    const h = await setup(t);
    for (let i = 0; i < 53; i++) await h.db.query(`INSERT INTO halastudy.digetpay_orders
        (id,user_id,mode,status,amount_minor,currency,created_at,expires_at,next_check_at)
        VALUES($1,$2,'test','review',499,'USD',$3,$3,$3)`, [crypto.randomUUID(), h.userId, i]);
    const first = await h.billing.listReview();
    const second = await h.billing.listReview(first.nextCursor);
    assert.equal(first.orders.length, 50); assert.equal(second.orders.length, 3);
    assert.equal(new Set([...first.orders, ...second.orders].map(o => o.id)).size, 53);
    assert.equal(second.nextCursor, null);
    await assert.rejects(h.billing.listReview('broken'), /CURSOR_INVALID/);
});

test('a notification arriving during verification remains queued with its cooldown', async (t) => {
    let release = () => {};
    let entered = false;
    const gate = new Promise(resolve => { release = () => resolve(undefined); });
    const h = await setup(t, 'transaction', original => async (url, options) => {
        if (options.method === 'GET') { entered = true; await gate; }
        return original(url, options);
    });
    const order = await h.checkout();
    await h.billing.notify({ orderId: order.id, transactionId: crypto.randomUUID() });
    const draining = h.billing.drain();
    while (!entered) await new Promise(resolve => setImmediate(resolve));
    const remote = await h.remote(order);
    await h.billing.notify({ orderId: order.id, transactionId: remote.transactionId });
    release(); await draining;
    const event = (await h.db.query('SELECT * FROM halastudy.outbox')).rows[0];
    assert.equal(event.status, 'pending');
    assert.equal(event.payload.transactionId, remote.transactionId);
    const calls = h.fixture.calls.length;
    await h.billing.drain(); assert.equal(h.fixture.calls.length, calls);
    h.advance(3600000); Object.assign(remote, { transactionStatus: 'SUCCESS', paymentStatus: 'APPROVED' });
    await h.billing.drain(); assert.equal((await h.billing.latest(h.userId)).status, 'completed');
});

test('legacy per-hint work coalesces without deleting its audit evidence', async (t) => {
    const h = await setup(t, 'transaction');
    const order = await h.checkout();
    for (let i = 0; i < 3; i++) await h.db.query(`INSERT INTO halastudy.outbox(id,kind,payload,status,available_at,created_at,attempts)
        VALUES($1,'digetpay.verify',$2,'pending',0,0,7)`, [`legacy-${i}`, JSON.stringify({ orderId: order.id, transactionId: crypto.randomUUID() })]);
    await h.billing.drain();
    const events = (await h.db.query('SELECT * FROM halastudy.outbox')).rows;
    assert.equal(events.length, 4);
    assert.equal(events.filter(e => e.status === 'pending').length, 1);
    assert.equal(events.find(e => e.status === 'pending').attempts, 7);
    assert.equal(h.fixture.calls.filter(c => c.method === 'GET').length, 0);
});
