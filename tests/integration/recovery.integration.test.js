const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { startServer, delay } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { createRecoveryMail } = require('../../services/auth/recovery');
const express = require('express');
const { createAuthRouter } = require('../../services/auth/auth-routes');
const { createUser } = require('../../user-store');

async function message(server, purpose) {
    for (let i = 0; i < 100; i++) {
        const folder = `${server.userStateFile}.mail`;
        for (const name of await fs.readdir(folder).catch(() => [])) {
            const mail = JSON.parse(await fs.readFile(path.join(folder, name), 'utf8'));
            if (mail.purpose === purpose) return mail;
        }
        await delay(20);
    }
    throw new Error('Local recovery message did not arrive');
}

test('recovery survives restart, is single use, verifies email and invalidates old sessions', async (t) => {
    let server = await startServer({ env: { AUTH_MAIL_MODE: 'local' } });
    t.after(() => server.stop());
    const owner = await signupUser(server);
    const known = await server.request('/api/auth/recovery/request', { method: 'POST', body: { email: owner.user.email } });
    const unknown = await server.request('/api/auth/recovery/request', { method: 'POST', body: { email: 'unknown@example.invalid' } });
    assert.equal(known.status, 202);
    assert.deepEqual(known.body, unknown.body);
    const mail = await message(server, 'reset');
    const token = new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token');
    assert.ok(token);
    const disk = await fs.readFile(server.userStateFile, 'utf8');
    assert.ok(!disk.includes(token), 'only a hash is stored in account data');
    const state = { roomStateFile: server.roomStateFile, userStateFile: server.userStateFile };
    await server.stop();
    server = await startServer({ ...state, resetStateFileOnStart: false, env: { AUTH_MAIL_MODE: 'local' } });
    const wrongPurpose = await server.request('/api/auth/recovery/complete', {
        method: 'POST', body: { token, purpose: 'verify' }
    });
    assert.equal(wrongPurpose.status, 400);
    const reset = { token, purpose: 'reset', password: 'new-password-123' };
    const results = await Promise.all([1, 2].map(() => server.request('/api/auth/recovery/complete', { method: 'POST', body: reset })));
    assert.equal(results.filter((response) => response.status === 200).length, 1);
    assert.equal((await server.request('/api/auth/me', { headers: { Cookie: owner.cookie } })).body.user, null);
    assert.equal((await server.request('/api/auth/login', { method: 'POST', body: owner.credentials })).status, 401);
    const login = await server.request('/api/auth/login', { method: 'POST', body: { email: owner.user.email, password: reset.password } });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.emailVerified, true);
    assert.equal(login.body.user.recovery, undefined);
    assert.ok(!JSON.stringify(server.logs()).includes(token));
});

test('failed reset persistence restores password, keeps epoch revoked and never acknowledges success', async (t) => {
    const user = createUser({ email: 'rollback@example.invalid', passwordHash: 'original:hash', displayName: 'Test' });
    let token;
    let fail = false;
    const app = express();
    app.use(express.json());
    app.use(createAuthRouter({
        users: new Map([[user.id, user]]), usersByEmail: new Map([[user.email, user.id]]),
        recoveryMail: { enabled: true, async send(message) { token = message.token; } },
        rateLimiters: {}, applyHttpRateLimit: () => true, getRequestIp: () => 'local',
        requireUser: (_req, _res, next) => next(), logger: { info() {}, error() {} },
        disconnectUser() {}, clearAuthCookie() {},
        async flushUsers() { if (fail) throw new Error('disk unavailable'); }
    }));
    const http = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => http.once('listening', resolve));
    t.after(() => new Promise((resolve) => http.close(resolve)));
    const base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (http.address()).port}`;
    const send = (route, body) => fetch(`${base}${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    await send('/auth/recovery/request', { email: user.email });
    for (let i = 0; i < 100 && !token; i++) await delay(10);
    assert.ok(token);
    fail = true;
    const response = await send('/auth/recovery/complete', { token, purpose: 'reset', password: 'replacement-password' });
    assert.equal(response.status, 503);
    assert.equal(user.passwordHash, 'original:hash');
    assert.equal(user.tokenEpoch, 2);
    fail = false;
    assert.equal((await send('/auth/recovery/complete', { token, purpose: 'reset', password: 'replacement-password' })).status, 400);
});

test('verification preserves password and session, expiry is rejected, local mail is disabled in production', async (t) => {
    let server = await startServer({ env: { AUTH_MAIL_MODE: 'local' } });
    t.after(() => server.stop());
    const owner = await signupUser(server);
    assert.equal((await server.request('/api/me/email-verification', { method: 'POST', body: {}, headers: { Cookie: owner.cookie } })).status, 202);
    const mail = await message(server, 'verify');
    const token = new URLSearchParams(new URL(mail.url).hash.slice(1)).get('token');
    assert.equal((await server.request('/api/auth/recovery/complete', { method: 'POST', body: { token, purpose: 'verify' } })).status, 200);
    assert.equal((await server.request('/api/auth/me', { headers: { Cookie: owner.cookie } })).body.user.emailVerified, true);
    await server.request('/api/auth/recovery/request', { method: 'POST', body: { email: owner.user.email } });
    const resetMail = await message(server, 'reset');
    const resetToken = new URLSearchParams(new URL(resetMail.url).hash.slice(1)).get('token');
    await server.stop();
    const users = JSON.parse(await fs.readFile(server.userStateFile, 'utf8'));
    users[0].recovery.reset.expiresAt = Date.now() - 1;
    await fs.writeFile(server.userStateFile, JSON.stringify(users));
    server = await startServer({ roomStateFile: server.roomStateFile, userStateFile: server.userStateFile,
        resetStateFileOnStart: false, env: { AUTH_MAIL_MODE: 'local' } });
    assert.equal((await server.request('/api/auth/recovery/complete', { method: 'POST',
        body: { token: resetToken, purpose: 'reset', password: 'unused-password' } })).status, 400);
    const production = createRecoveryMail({ env: { NODE_ENV: 'production', AUTH_MAIL_MODE: 'local' }, directory: 'never-created' });
    assert.equal(production.enabled, false);
    await assert.rejects(production.send({ email: '', purpose: '', token: '' }), /MAIL_UNAVAILABLE/);
});
