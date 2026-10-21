const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createPlatformRouter } = require('../../services/platform/routes');
const safeReturn = require('../../public/js/safe-return');
const { createPlatform } = require('../../services/platform');

test('password and OAuth return paths reject external and browser-normalized redirect variants', () => {
    const bad = ['https://example.invalid', '//example.invalid', '/\\example.invalid', '/\\/example.invalid',
        '/%5cexample.invalid', '/%5C/example.invalid', '/\n/example.invalid', '/\t/example.invalid',
        ' //example.invalid', '/%0d%0aLocation:example.invalid', '/..//example.invalid', '/segment/..//example.invalid',
        '/%2e%2e//example.invalid', '/%2E/..//example.invalid', null, {}, 12];
    for (const path of bad) assert.equal(safeReturn(path), '/open', String(path));
    for (const path of ['/app#circles?invite=local-code', '/open?tab=create', '/study?room=ABC123', '/plans', '/']) {
        assert.equal(safeReturn(path), path);
        assert.equal(new URL(safeReturn(path), 'https://halastudy.invalid').origin, 'https://halastudy.invalid');
    }
});

test('compatibility identity projection stays available but cannot survive revocation during a queued transaction', async (t) => {
    const user = { id: 'compatibility-user', displayName: 'Compatibility student', createdAt: Date.now(), tokenEpoch: 0 };
    const users = new Map([[user.id, user]]);
    const platform = createPlatform({ userStateFile: 'synthetic.json', secret: 'synthetic-only',
        env: { NODE_ENV: 'test', PLATFORM_ENABLED: 'true', PLATFORM_DATA_DIR: 'memory://' },
        isCurrentUser: (candidate, epoch) => users.get(candidate.id) === candidate && candidate.tokenEpoch === epoch });
    await platform.ready;
    t.after(() => platform.db.close());
    await platform.ensureUser(user);
    assert.equal((await platform.db.query('SELECT id FROM halastudy.users WHERE id=$1', [user.id])).rows.length, 1);
    await platform.removeUser(user.id);
    let began = () => {};
    let release = () => {};
    const started = new Promise((resolve) => { began = () => resolve(undefined); });
    const gate = new Promise((resolve) => { release = () => resolve(undefined); });
    const occupied = platform.db.transaction(async () => { began(); await gate; });
    await started;
    const pending = platform.ensureUser(user);
    const rejected = assert.rejects(pending, /AUTH_REQUIRED/);
    users.delete(user.id);
    release();
    await occupied;
    await rejected;
    assert.equal((await platform.db.query('SELECT id FROM halastudy.users WHERE id=$1', [user.id])).rows.length, 0);
});

test('platform requests cannot recreate or mutate a deleted, revoked or banned identity after waiting', async (t) => {
    for (const change of ['delete', 'revoke', 'ban']) {
        await t.test(change, async () => {
            const user = { id: 'local-user', tokenEpoch: 0, banned: false };
            const users = new Map([[user.id, user]]);
            let began = () => {};
            let release = () => {};
            const started = new Promise((resolve) => { began = () => resolve(undefined); });
            const gate = new Promise((resolve) => { release = () => resolve(undefined); });
            let writes = 0;
            const platform = { enabled: true, progress: { start: () => { writes++; return {}; } },
                ensureUser: async () => { await platform.ready; writes++; } };
            Object.defineProperty(platform, 'ready', { get() { began(); return gate; } });
            const app = express();
            app.use((req, _res, next) => { req.user = user; next(); });
            app.use(createPlatformRouter({ platform, users, requireUser: (_req, _res, next) => next(),
                applyHttpRateLimit: () => true, rateLimiters: {}, logger: { error() {} } }));
            const server = app.listen(0, '127.0.0.1');
            await new Promise((resolve) => server.once('listening', resolve));
            try {
                const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
                const request = fetch(`http://127.0.0.1:${port}/focus/start`, { method: 'POST' });
                await started;
                if (change === 'delete') users.delete(user.id);
                if (change === 'revoke') user.tokenEpoch++;
                if (change === 'ban') user.banned = true;
                release();
                const response = await request;
                assert.equal(response.status, 401);
                assert.equal(writes, 0, 'a rejected request cannot recreate a user or start focus');
            } finally { await new Promise((resolve) => server.close(resolve)); }
        });
    }
});
