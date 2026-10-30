const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createPlatform } = require('../../services/platform');

test('presence refresh credits early connected members once and never revives deleted users', async (t) => {
    const platform = createPlatform({ userStateFile: 'unused', secret: 'test-only',
        env: { NODE_ENV: 'test', BILLING_PROVIDER: 'simulator', PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
    await platform.ready;
    t.after(() => platform.db.close());
    const owner = { id: crypto.randomUUID(), displayName: 'Early arrival', createdAt: Date.now() };
    await platform.ensureUser(owner);
    const checkout = await platform.billing.checkout(owner.id);
    await platform.billing.complete(owner.id, checkout.id, checkout.token, 'success');
    const circle = await platform.cohorts.create(owner.id, 'Early arrivals');
    await platform.registerRoom('EARLY', owner);
    const startsAt = Date.now() + 30 * 60000;
    const session = await platform.cohorts.schedule(owner.id, circle.id, {
        roomId: 'EARLY', title: 'Early focus', startsAt, durationMinutes: 25
    });
    await platform.recordAttendance('EARLY', owner);
    assert.equal((await platform.db.query('SELECT * FROM halastudy.attendance WHERE session_id=$1', [session.id])).rows.length, 0);
    let timestamp = startsAt - 14 * 60000;
    t.mock.method(Date, 'now', () => timestamp);
    await platform.recordAttendance('EARLY', owner);
    const first = timestamp;
    timestamp += 60000;
    await platform.recordAttendance('EARLY', owner);
    const rows = (await platform.db.query('SELECT * FROM halastudy.attendance WHERE session_id=$1', [session.id])).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].first_joined_at), first);
    assert.equal(Number(rows[0].last_seen_at), timestamp);
    await platform.removeUser(owner.id);
    await platform.recordAttendance('EARLY', owner);
    assert.equal((await platform.db.query('SELECT id FROM halastudy.users WHERE id=$1', [owner.id])).rows.length, 0);
});
