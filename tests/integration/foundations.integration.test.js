const assert = require('node:assert/strict');
const test = require('node:test');
const { createUser, applyFocusSession, sanitizeUser } = require('../../user-store');
const { createSupabaseUserStore } = require('../../supabase-user-store');
const { issueReauth, verifyReauth } = require('../../services/auth/reauth');
const { startServer } = require('../helpers/server-control');
const { resetStateFile } = require('../helpers/test-env');
const { signupUser } = require('../helpers/auth-helpers');
const express = require('express');
const { createAuthRouter } = require('../../services/auth/auth-routes');

test('logout retries cannot acknowledge an uncommitted session revocation', async (t) => {
    const user = syntheticUser();
    let unavailable = true;
    const app = express();
    app.use((req, _res, next) => { req.user = req.headers['x-first-attempt'] ? user : null; next(); });
    app.use(createAuthRouter({
        requireUser: (_req, _res, next) => next(), disconnectUser() {}, clearAuthCookie() {},
        flushUsers: async () => { if (unavailable) throw new Error('offline'); }
    }));
    app.use((_error, _req, res, _next) => res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}/auth/logout`;
    assert.equal((await fetch(url, { method: 'POST', headers: { 'x-first-attempt': 'true' } })).status, 503);
    assert.equal((await fetch(url, { method: 'POST' })).status, 503);
    unavailable = false;
    assert.equal((await fetch(url, { method: 'POST' })).status, 200);
});

function syntheticUser() {
    return createUser({ email: 'foundation@example.invalid', passwordHash: 'test:hash', displayName: 'Foundation' });
}

test('daily caps and archived lifetime totals remain identical after reload', () => {
    const user = syntheticUser();
    const now = Date.parse('2026-10-20T09:00:00Z');
    for (let index = 0; index < 7; index += 1) applyFocusSession(user, { minutes: 240, now });
    assert.equal(user.focusStats.totalFocusMinutes, 1440);
    assert.equal(user.focusStats.totalSessions, 6);
    assert.deepEqual(sanitizeUser(user).focusStats, user.focusStats);
    for (let day = 1; day <= 371; day += 1) {
        applyFocusSession(user, { minutes: 25, now: now + day * 86400000 });
    }
    assert.equal(Object.keys(user.focusStats.days).length, 370);
    assert.equal(user.focusStats.totalFocusMinutes, 1440 + 371 * 25);
    assert.deepEqual(sanitizeUser(user).focusStats, user.focusStats);
});

test('both identity fields survive shared persistence sanitization', () => {
    const user = syntheticUser();
    user.authProvider = 'google';
    user.googleSub = 'test-subject';
    const loaded = sanitizeUser(user);
    assert.equal(loaded.authProvider, 'google');
    assert.equal(loaded.googleSub, 'test-subject');
});

test('database hydration paginates, writes only changed profiles and rejects failed deletion', async () => {
    const user = syntheticUser();
    const row = { id: user.id, email: user.email, password_hash: user.passwordHash, display_name: user.displayName };
    const queries = [];
    const writes = [];
    let failDelete = true;
    const store = createSupabaseUserStore({
        client: {
            select: async (_table, query) => {
                queries.push(query);
                return query.endsWith('offset=0') ? [row] : [];
            },
            upsert: async (_table, rows) => writes.push(rows),
            remove: async () => { if (failDelete) throw new Error('Database unavailable'); }
        },
        logger: { warn() {} }
    });
    const loaded = await store.hydrate();
    assert.equal(queries.length, 2);
    assert.match(queries[1], /offset=1$/);
    const map = new Map(loaded.map((entry) => [entry.id, entry]));
    await store.flush(map);
    assert.equal(writes.length, 0);
    loaded[0].bio = 'Changed';
    await store.flush(map);
    assert.equal(writes.length, 1);
    await assert.rejects(store.flush(new Map()), /Database unavailable/);
    failDelete = false;
    await store.flush(new Map());
});

test('provider deletion proof is purpose, account, epoch, session and time bound', () => {
    const user = syntheticUser();
    const token = issueReauth(user, 'session-a', 'test-secret', 1000);
    assert.equal(verifyReauth(token, user, 'session-a', 'test-secret', 2000), true);
    assert.equal(verifyReauth(token, user, 'session-b', 'test-secret', 2000), false);
    assert.equal(verifyReauth(token, { ...user, tokenEpoch: 2 }, 'session-a', 'test-secret', 2000), false);
    assert.equal(verifyReauth(token, user, 'session-a', 'test-secret', 400000), false);
    assert.equal(verifyReauth(`${token}x`, user, 'session-a', 'test-secret', 2000), false);
});

test('logout revokes the old cookie rather than only clearing the browser', async (t) => {
    const server = await startServer();
    t.after(async () => {
        await server.stop();
        resetStateFile(server.roomStateFile);
        resetStateFile(server.userStateFile);
    });
    const { cookie } = await signupUser(server);
    const response = await server.request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const replay = await server.request('/api/auth/me', { headers: { Cookie: cookie } });
    assert.equal(replay.body.user, null);
});
