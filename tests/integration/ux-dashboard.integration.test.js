const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { dashboard } = require('../../services/platform/dashboard');
const { createDatabase } = require('../../services/platform/database');
const { createProgress } = require('../../services/platform/progress');
const { createEntitlements } = require('../../services/platform/catalog');
const { createBilling } = require('../../services/platform/billing');
const { createCohorts } = require('../../services/platform/cohorts');
const { format } = require('../../public/js/schedule-display');

test('return dashboard excludes deleted/private rooms, removed members and other accounts; today splits midnight', { timeout: 120000 }, async (t) => {
    const db = await createDatabase(); t.after(() => db.close());
    let timestamp = Date.parse('2026-10-20T20:59:30Z');
    const now = () => timestamp;
    const owner = { id: crypto.randomUUID(), myRooms: [] };
    const member = { id: crypto.randomUUID(), myRooms: [] };
    const outsider = { id: crypto.randomUUID(), myRooms: [] };
    for (const user of [owner, member, outsider]) await db.query('INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)', [user.id, 'Student', timestamp]);
    const entitlements = createEntitlements(db, 'test', now);
    const billing = createBilling(db, 'test', now);
    const checkout = await billing.checkout(owner.id); await billing.complete(owner.id, checkout.id, checkout.token, 'success');
    const cohorts = createCohorts(db, entitlements, now);
    const circle = await cohorts.create(owner.id, 'Private study');
    await cohorts.accept(member.id, (await cohorts.invite(owner.id, circle.id)).token);
    await db.query('INSERT INTO halastudy.rooms(id,owner_id,created_at) VALUES($1,$2,$3)', ['ABC123', owner.id, timestamp]);
    await cohorts.schedule(owner.id, circle.id, { roomId: 'ABC123', title: 'Tomorrow', startsAt: timestamp + 3600000, durationMinutes: 25 });
    const rooms = new Map([['ABC123', { id: 'ABC123', name: 'Private room' }], ['PUBLIC', { id: 'PUBLIC', name: 'Public room' }]]);
    const platform = { db, canJoin: async (id, user) => {
        if (id === 'PUBLIC') return true;
        try { await cohorts.membership(user.id, circle.id); return true; } catch { return false; }
    } };
    member.myRooms = [{ roomId: 'DELETED', lastJoinedAt: 3 }, { roomId: 'ABC123', lastJoinedAt: 2 }, { roomId: 'PUBLIC', lastJoinedAt: 1 }];
    const progress = createProgress(db, now);
    const focus = await progress.start(member.id);
    timestamp += 30000; await progress.update(member.id, focus.id, 'heartbeat');
    timestamp += 30000; await progress.update(member.id, focus.id, 'heartbeat');
    timestamp += 30000; await progress.update(member.id, focus.id, 'complete');
    const result = await dashboard(platform, rooms, member, timestamp);
    assert.equal(result.recentRoom.id, 'ABC123');
    assert.equal(result.nextSession.title, 'Tomorrow');
    assert.equal(result.today.minutes, 1); // 60 seconds after Riyadh midnight, 30 before.
    assert.equal(result.today.day, '2026-10-21');
    assert.equal((await dashboard(platform, rooms, outsider, timestamp)).nextSession, null);
    assert.equal((await dashboard(platform, rooms, outsider, timestamp)).today.minutes, 0);
    assert.equal((await dashboard(platform, rooms, outsider, timestamp)).recentRoom, null);
    await cohorts.setRole(owner.id, circle.id, member.id, 'remove');
    const removed = await dashboard(platform, rooms, member, timestamp);
    assert.equal(removed.recentRoom.id, 'PUBLIC'); assert.equal(removed.nextSession, null);
    rooms.delete('PUBLIC');
    assert.equal((await dashboard(platform, rooms, member, timestamp)).recentRoom, null);
});
test('named timezones preserve an instant on each side of the London DST boundary', () => {
    assert.match(format(Date.parse('2026-10-25T00:30:00Z'), 'ar', 'Asia/Riyadh'), /٢٠٢٦|2026/);
    for (const instant of [Date.parse('2026-10-25T00:30:00Z'), Date.parse('2026-10-25T01:30:00Z')]) {
        assert.match(format(instant, 'en', 'Asia/Riyadh'), /GMT\+3.*Asia\/Riyadh/);
        assert.match(format(instant, 'en', 'Europe/London'), /01:30.*Europe\/London/);
    }
    assert.match(format(Date.parse('2026-10-25T00:30:00Z'), 'en', 'Europe/London'), /GMT\+1/);
    assert.doesNotMatch(format(Date.parse('2026-10-25T01:30:00Z'), 'en', 'Europe/London'), /GMT\+1/);
});
