const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const express = require('express');
const { createPlatform } = require('../../services/platform');
const { createPlatformRouter } = require('../../services/platform/routes');

test('private scope survives failed snapshot, schedule retries deduplicate and deleted owners archive circles', async (t) => {
    const platform = createPlatform({ userStateFile: 'unused', secret: 'test-only',
        env: { PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' } });
    await platform.ready;
    t.after(() => platform.db.close());
    const owner = { id: crypto.randomUUID(), displayName: 'Owner', createdAt: Date.now() };
    const member = { id: crypto.randomUUID(), displayName: 'Member', createdAt: Date.now() };
    await platform.ensureUser(owner);
    await platform.ensureUser(member);
    const checkout = await platform.billing.checkout(owner.id);
    await platform.billing.complete(owner.id, checkout.id, checkout.token, 'success');
    const circle = await platform.cohorts.create(owner.id, 'Lifecycle');
    const invite = await platform.cohorts.invite(owner.id, circle.id);
    await platform.cohorts.accept(member.id, invite.token);
    const unusedInvite = await platform.cohorts.invite(owner.id, circle.id);
    await platform.registerRoom('PRIVACY', owner);
    const room = { id: 'PRIVACY', users: new Map([['guest', {}], ['member', {}]]) };
    let guestConnected = true;
    let memberConnected = true;
    const sockets = new Map([
        ['guest', { data: { userId: null }, disconnect: () => { guestConnected = false; } }],
        ['member', { data: { userId: member.id }, disconnect: () => { memberConnected = false; } }]
    ]);
    let unavailable = true;
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = owner; next(); });
    app.use(createPlatformRouter({
        platform, requireUser: (_req, _res, next) => next(),
        applyHttpRateLimit: () => true, rateLimiters: {}, logger: { error() {} },
        rooms: new Map([[room.id, room]]), clearRoomCleanupTimer() {},
        io: { sockets: { sockets } },
        flushRooms: async () => {
            assert.equal(guestConnected, false, 'guest must lose incoming broadcasts before fallible persistence');
            assert.equal(memberConnected, true, 'circle members retain their connection');
            if (unavailable) throw new Error('disk unavailable');
        }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/cohorts/${circle.id}/sessions`;
    const input = { roomId: room.id, title: 'Focus', startsAt: Date.now() + 60000, durationMinutes: 25 };
    const submit = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal((await submit()).status, 503);
    assert.equal(await platform.canJoin(room.id, null), false);
    unavailable = false;
    const responses = await Promise.all([submit(), submit()]);
    const results = await Promise.all(responses.map((response) => response.json()));
    assert.equal(responses.every((response) => response.status === 200), true);
    assert.equal(results[0].id, results[1].id);
    assert.equal((await platform.cohorts.sessions(owner.id, circle.id)).length, 1);
    assert.equal((await platform.db.query("SELECT id FROM halastudy.audit_events WHERE action='cohort.session.created'")).rows.length, 1);
    await platform.cohorts.schedule(owner.id, circle.id, { ...input, title: 'Different' });
    assert.equal((await platform.cohorts.sessions(owner.id, circle.id)).length, 2);
    // Last-super-admin refusal must roll back the entire lifecycle change.
    await platform.db.query(`INSERT INTO halastudy.role_assignments(id,user_id,role,granted_by,created_at)
        VALUES($1,$2,'super_admin',$2,$3)`, [crypto.randomUUID(), owner.id, Date.now()]);
    await assert.rejects(platform.removeUser(owner.id), /LAST_SUPER_ADMIN/);
    assert.equal((await platform.cohorts.list(member.id)).length, 1);
    await platform.db.query('DELETE FROM halastudy.role_assignments WHERE user_id=$1', [owner.id]);
    await platform.removeUser(owner.id);
    assert.equal((await platform.cohorts.list(member.id)).length, 0);
    assert.equal(await platform.canJoin(room.id, member), false);
    await assert.rejects(platform.cohorts.accept(member.id, unusedInvite.token), /INVITE_INVALID/);
    const archived = (await platform.db.query('SELECT archived,owner_id FROM halastudy.cohorts WHERE id=$1', [circle.id])).rows[0];
    assert.equal(archived.archived, true);
    assert.equal(archived.owner_id, null);
    assert.equal((await platform.db.query('SELECT id FROM halastudy.scheduled_sessions WHERE cohort_id=$1', [circle.id])).rows.length, 2);
});
