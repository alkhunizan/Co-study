const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createGoogleAuthRouter } = require('../../services/auth/google-routes');
const { createUser } = require('../../user-store');
const { verifyReauth } = require('../../services/auth/reauth');

test('OAuth verifies browser state, PKCE, explicit linking and purpose-bound reauthentication', async (t) => {
    const users = new Map();
    const usersByEmail = new Map();
    let profile = { sub: 'google-subject', email: 'google@example.invalid', email_verified: true, name: 'Google user' };
    let exchangeCount = 0;
    let verifier = '';
    let flushFails = false;
    const secret = 'google-test-session-secret';
    const app = express();
    app.use((req, _res, next) => { req.user = users.get(String(req.headers['x-test-user'] || '')); next(); });
    app.use(createGoogleAuthRouter({
        config: { enabled: true, clientId: 'test-client', clientSecret: 'test-only', redirectUri: 'http://localhost/auth/google/callback' },
        users, usersByEmail, rateLimiters: { authLogin: {} }, applyHttpRateLimit: () => true, getRequestIp: () => '127.0.0.1',
        setAuthCookie: (_req, res, user) => res.append('Set-Cookie', `testAuth=${user.id}; Path=/`),
        appendSetCookie: (res, value) => res.append('Set-Cookie', value),
        parseCookies: (header) => Object.fromEntries(header.split(';').filter(Boolean).map((item) => item.trim().split('='))),
        persistUsersSoon() {}, flushUsers: async () => { if (flushFails) throw new Error('offline'); }, sessionSecret: secret,
        logger: { warn() {}, info() {}, error() {} },
        fetchImpl: async (url, options) => {
            if (url.includes('/token')) {
                exchangeCount++;
                verifier = new URLSearchParams(options.body).get('code_verifier');
                return { ok: true, json: async () => ({ access_token: 'test-only-token' }) };
            }
            return { ok: true, json: async () => profile };
        }
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
    const flow = async (purpose = 'login', userId = '') => {
        const headers = userId ? { 'x-test-user': userId } : {};
        const started = await fetch(`${base}/auth/google?purpose=${purpose}`, { headers, redirect: 'manual' });
        const url = new URL(started.headers.get('location'));
        return { state: url.searchParams.get('state'), challenge: url.searchParams.get('code_challenge'), headers };
    };
    const finish = (attempt, cookie = attempt.state) => fetch(`${base}/auth/google/callback?code=code&state=${attempt.state}`, {
        redirect: 'manual', headers: { ...attempt.headers, Cookie: `hala_oauth=${cookie}; coStudyAuth=test-account-session` }
    });
    const first = await flow();
    assert.equal((await finish(first, 'forged')).headers.get('location'), '/account?auth=google_failed');
    assert.equal(exchangeCount, 0);
    const signedIn = await finish(first);
    assert.equal(signedIn.headers.get('location'), '/account?auth=google');
    assert.equal(require('node:crypto').createHash('sha256').update(verifier).digest('base64url'), first.challenge);
    assert.equal(users.size, 1);
    const googleUser = [...users.values()][0];
    assert.equal(googleUser.googleSub, profile.sub);
    await finish(first);
    assert.equal(exchangeCount, 1, 'callback replay must not exchange another code');
    const proofResponse = await finish(await flow('security', googleUser.id));
    const proofCookie = proofResponse.headers.getSetCookie().find((cookie) => cookie.startsWith('coStudyReauth='));
    const proof = proofCookie.split(';')[0].split('=')[1];
    assert.equal(verifyReauth(proof, googleUser, 'test-account-session', secret, Date.now(), 'setup-mfa'), true);
    assert.equal(verifyReauth(proof, googleUser, 'test-account-session', secret, Date.now(), 'delete-account'), false);
    const passwordUser = createUser({ email: 'password@example.invalid', passwordHash: 'test:hash', displayName: 'Password user' });
    users.set(passwordUser.id, passwordUser); usersByEmail.set(passwordUser.email, passwordUser.id);
    profile = { ...profile, sub: 'second-google-subject', email: passwordUser.email };
    assert.equal((await finish(await flow())).headers.get('location'), '/account?auth=google_failed');
    assert.ok(!passwordUser.googleSub);
    assert.equal((await finish(await flow('login', passwordUser.id))).headers.get('location'), '/account?auth=google');
    assert.equal(passwordUser.googleSub, profile.sub);
    flushFails = true;
    profile = { ...profile, sub: 'third-subject', email: 'offline@example.invalid' };
    assert.equal((await finish(await flow())).headers.get('location'), '/account?auth=google_failed');
    assert.ok(!usersByEmail.has(profile.email), 'failed durable signup must not mint a usable in-memory account');
});
