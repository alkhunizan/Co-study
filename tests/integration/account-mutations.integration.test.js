const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createAuthRouter } = require('../../services/auth/auth-routes');
const { createUser } = require('../../user-store');

async function fixture(t, flush) {
    const user = createUser({ email: 'mutation@example.invalid', passwordHash: 'test:hash', displayName: 'Original' });
    const users = new Map([[user.id, user]]);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = users.get(user.id); next(); });
    app.use(createAuthRouter({
        users, usersByEmail: new Map([[user.email, user.id]]), rateLimiters: {}, rooms: new Map(), publicUser: (value) => value,
        requireUser: (_req, _res, next) => next(), applyHttpRateLimit: () => true,
        getRequestIp: () => '127.0.0.1', canDeleteWithProvider: () => true,
        disconnectUser() {}, clearAuthCookie() {}, deletePlatformUser: async () => {},
        flushUsers: () => flush(user, users), logger: { error() {}, info() {} }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
    return { user, users, send: (path, body, method = 'POST') => fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }) };
}

test('profile validates every field before changing or saving any field', async (t) => {
    let saves = 0;
    const f = await fixture(t, async () => { saves++; });
    for (const invalid of [{ avatarColor: 'invalid' }, { bio: 123 }, { bio: 'x'.repeat(161) }]) {
        const response = await f.send('/me/profile', { displayName: 'Changed', ...invalid }, 'PATCH');
        assert.equal(response.status, 400);
        assert.equal(f.user.displayName, 'Original');
    }
    assert.equal(saves, 0);
});

test('profile, focus and import reject failed persistence and restore their fields before retry', async (t) => {
    let fail = true;
    /** @type {any} */
    let durable;
    const f = await fixture(t, async (user) => {
        if (fail) throw new Error('storage offline');
        durable = structuredClone(user);
    });
    const before = structuredClone(f.user);
    /** @type {Array<[string, any, string]>} */
    const cases = [
        ['/me/profile', { displayName: 'Changed' }, 'PATCH'],
        ['/me/focus-session', { minutes: 25 }, 'POST'],
        ['/me/stats/import', { days: { '2026-10-20': { focusMinutes: 50, sessions: 2 } } }, 'POST']
    ];
    for (const [path, body, method] of cases) {
        const response = await f.send(path, body, method);
        assert.equal(response.status, 503);
        assert.deepEqual(f.user, before);
    }
    fail = false;
    assert.equal((await f.send('/me/focus-session', { minutes: 25 })).status, 200);
    assert.equal(durable.focusStats.totalFocusMinutes, 25);
    assert.equal(f.user.focusStats.totalFocusMinutes, 25);
});

test('queued account saves retain later changes and unrelated fields after rollback', async (t) => {
    let started = () => {};
    let release = () => {};
    const began = new Promise((resolve) => { started = () => resolve(undefined); });
    const gate = new Promise((resolve) => { release = () => resolve(undefined); });
    let writes = 0;
    /** @type {any} */
    let durable;
    const f = await fixture(t, async (user) => {
        if (++writes === 1) { started(); await gate; throw new Error('first save failed'); }
        durable = structuredClone(user);
    });
    const first = f.send('/me/profile', { displayName: 'Rejected' }, 'PATCH');
    await began;
    const second = f.send('/me/profile', { bio: 'Later accepted change' }, 'PATCH');
    f.user.myRooms.push({ roomId: 'OTHER', name: 'Concurrent room', role: 'joined', lastVisitedAt: Date.now() });
    release();
    assert.equal((await first).status, 503);
    assert.equal((await second).status, 200);
    assert.equal(durable.displayName, 'Original');
    assert.equal(durable.bio, 'Later accepted change');
    assert.equal(durable.myRooms[0].roomId, 'OTHER');
});

test('a failed pending account save cannot resurrect a deleted account', async (t) => {
    let started = () => {};
    let release = () => {};
    const began = new Promise((resolve) => { started = () => resolve(undefined); });
    const gate = new Promise((resolve) => { release = () => resolve(undefined); });
    let writes = 0;
    const f = await fixture(t, async () => {
        if (++writes === 1) { started(); await gate; throw new Error('offline'); }
    });
    const response = f.send('/me/profile', { displayName: 'Rejected' }, 'PATCH');
    await began;
    f.users.delete(f.user.id);
    release();
    assert.equal((await response).status, 503);
    assert.equal(f.users.has(f.user.id), false);
    assert.equal(f.user.displayName, 'Original');
});

test('a failed concurrent deletion cannot restore rejected profile fields', async (t) => {
    let profileStarted = () => {};
    let deleteStarted = () => {};
    let releaseProfile = () => {};
    let releaseDelete = () => {};
    const profileBegan = new Promise((resolve) => { profileStarted = () => resolve(undefined); });
    const deleteBegan = new Promise((resolve) => { deleteStarted = () => resolve(undefined); });
    const profileGate = new Promise((resolve) => { releaseProfile = () => resolve(undefined); });
    const deleteGate = new Promise((resolve) => { releaseDelete = () => resolve(undefined); });
    let writes = 0;
    let durable = '';
    const f = await fixture(t, async (user, users) => {
        if (++writes === 1) { profileStarted(); await profileGate; throw new Error('profile write failed'); }
        if (writes === 2) { deleteStarted(); await deleteGate; throw new Error('delete write failed'); }
        durable = users.has(user.id) ? user.displayName : '';
    });
    f.user.authProvider = 'google';
    const profile = f.send('/me/profile', { displayName: 'Rejected' }, 'PATCH');
    await profileBegan;
    const deletion = f.send('/me', {}, 'DELETE');
    await deleteBegan;
    releaseProfile();
    assert.equal((await profile).status, 503);
    releaseDelete();
    assert.equal((await deletion).status, 503);
    assert.equal(f.users.get(f.user.id).displayName, 'Original');
    assert.equal(durable, 'Original');
});
