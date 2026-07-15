const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const express = require('express');

const { createGoogleAuthRouter } = require('../../services/auth/google-routes');
const { hashPassword } = require('../../services/auth/password');
const { createUser } = require('../../user-store');

function appendSetCookie(res, value) {
    const existing = res.getHeader('Set-Cookie');
    if (!existing) {
        res.setHeader('Set-Cookie', value);
    } else if (Array.isArray(existing)) {
        res.setHeader('Set-Cookie', [...existing, value]);
    } else {
        res.setHeader('Set-Cookie', [existing, value]);
    }
}

function parseCookies(raw) {
    return String(raw || '')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separator = part.indexOf('=');
            if (separator > 0) cookies[part.slice(0, separator)] = part.slice(separator + 1);
            return cookies;
        }, {});
}

function getSetCookies(headers) {
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
    const combined = headers.get('set-cookie');
    return combined ? [combined] : [];
}

function makePasswordUser(email, overrides = {}) {
    return {
        ...createUser({
            email,
            passwordHash: '0123456789abcdef:0123456789abcdef',
            displayName: 'Existing User'
        }),
        ...overrides
    };
}

async function makeAuthenticatedPasswordUser(email, password = 'correct-password') {
    return createUser({
        email,
        passwordHash: await hashPassword(password),
        displayName: 'Existing User'
    });
}

async function startHarness(t, { users: initialUsers = [], profile, persistError = null }) {
    const users = new Map(initialUsers.map((user) => [user.id, user]));
    const usersByEmail = new Map(initialUsers.map((user) => [user.email, user.id]));
    const usersByGoogleSub = new Map(
        initialUsers.filter((user) => user.googleSub).map((user) => [user.googleSub, user.id])
    );
    const authSessions = [];
    let persistCount = 0;
    let providerRequestCount = 0;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        const testUserId = parseCookies(req.headers.cookie || '').testAuth;
        if (testUserId && users.has(testUserId)) req.user = users.get(testUserId);
        next();
    });
    app.use(createGoogleAuthRouter({
        config: {
            enabled: true,
            clientId: 'test-client',
            clientSecret: 'test-secret',
            redirectUri: 'http://127.0.0.1/auth/google/callback'
        },
        users,
        usersByEmail,
        usersByGoogleSub,
        rateLimiters: { authLogin: {} },
        applyHttpRateLimit: () => true,
        getRequestIp: () => '127.0.0.1',
        setAuthCookie: (_req, res, user) => {
            authSessions.push(user.id);
            appendSetCookie(res, `coStudyAuth=session-${user.id}; Path=/; HttpOnly`);
        },
        appendSetCookie,
        parseCookies,
        persistUsersSoon: () => {
            persistCount += 1;
        },
        persistUser: async () => {
            persistCount += 1;
            if (persistError) throw persistError;
        },
        sessionSecret: 'google-harness-session-secret-at-least-32-bytes',
        logger: { info() {}, warn() {}, error() {} },
        fetchImpl: async (url) => {
            providerRequestCount += 1;
            if (url === 'https://oauth2.googleapis.com/token') {
                return { ok: true, json: async () => ({ access_token: 'test-access-token' }) };
            }
            if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
                return { ok: true, json: async () => profile };
            }
            throw new Error(`Unexpected Google test URL: ${url}`);
        }
    }));

    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    t.after(() => new Promise((resolve) => server.close(() => resolve())));

    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server address.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    return {
        users,
        usersByEmail,
        usersByGoogleSub,
        authSessions,
        get persistCount() {
            return persistCount;
        },
        get providerRequestCount() {
            return providerRequestCount;
        },
        authCookie(user) {
            return `testAuth=${user.id}`;
        },
        async request(pathname, options = {}) {
            return fetch(`${baseUrl}${pathname}`, {
                ...options,
                headers: {
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...(options.headers || {})
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                redirect: options.redirect || 'manual'
            });
        },
        async startGoogleFlow(pathname = '/auth/google', cookie = '') {
            const start = await fetch(`${baseUrl}${pathname}`, {
                headers: cookie ? { Cookie: cookie } : {},
                redirect: 'manual'
            });
            assert.equal(start.status, 302);
            const state = new URL(start.headers.get('location')).searchParams.get('state');
            const stateCookie = getSetCookies(start.headers)
                .map((cookie) => cookie.split(';')[0])
                .find((cookie) => cookie.startsWith('hala_oauth='));
            assert.ok(state);
            assert.ok(stateCookie);
            return { start, state, stateCookie };
        },
        async completeGoogleFlow(options = {}) {
            const flow = await this.startGoogleFlow(options.pathname, options.cookie);
            const response = await fetch(`${baseUrl}/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`, {
                headers: { Cookie: [options.callbackCookie || options.cookie, flow.stateCookie].filter(Boolean).join('; ') },
                redirect: 'manual'
            });
            return { ...flow, response };
        }
    };
}

test('Google sign-in never auto-links an existing password account by matching email', async (t) => {
    const existing = makePasswordUser('victim@example.com');
    const originalGoogleSub = existing.googleSub;
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'attacker-google-sub',
            email: 'victim@example.com',
            email_verified: true,
            name: 'Attacker'
        }
    });

    const { response } = await harness.completeGoogleFlow();

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/account?auth=link_required');
    assert.deepEqual(harness.authSessions, []);
    assert.equal(harness.persistCount, 0);
    assert.equal(existing.googleSub, originalGoogleSub);
    assert.equal(harness.users.size, 1);
    assert.equal(getSetCookies(response.headers).some((cookie) => cookie.startsWith('coStudyAuth=')), false);
});

test('Google sign-in resolves an existing account by matching subject, not provider email', async (t) => {
    const existing = makePasswordUser('old-address@example.com', {
        googleSub: 'stable-google-sub',
        passwordEnabled: true
    });
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'stable-google-sub',
            email: 'new-address@example.com',
            email_verified: true,
            name: 'Existing User'
        }
    });

    const { response } = await harness.completeGoogleFlow();

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/account?auth=google');
    assert.deepEqual(harness.authSessions, [existing.id]);
    assert.equal(harness.users.size, 1);
    assert.equal(harness.usersByEmail.has('new-address@example.com'), false);
});

test('Google sign-in rejects a different subject for an existing Google email', async (t) => {
    const existing = makePasswordUser('linked@example.com', {
        googleSub: 'original-google-sub',
        passwordEnabled: true
    });
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'different-google-sub',
            email: 'linked@example.com',
            email_verified: true,
            name: 'Different Subject'
        }
    });

    const { response } = await harness.completeGoogleFlow();

    assert.equal(response.headers.get('location'), '/account?auth=link_required');
    assert.deepEqual(harness.authSessions, []);
    assert.equal(harness.persistCount, 0);
    assert.equal(existing.googleSub, 'original-google-sub');
});

test('Google sign-in creates a new Google-only account without a synthetic password', async (t) => {
    const harness = await startHarness(t, {
        profile: {
            sub: 'new-google-sub',
            email: 'new-google@example.com',
            email_verified: true,
            name: 'New Google User'
        }
    });

    const { response } = await harness.completeGoogleFlow();
    const [created] = harness.users.values();

    assert.equal(response.headers.get('location'), '/account?auth=google');
    assert.equal(harness.users.size, 1);
    assert.equal(created.email, 'new-google@example.com');
    assert.equal(created.googleSub, 'new-google-sub');
    assert.equal(created.passwordEnabled, false);
    assert.equal(created.passwordHash, null);
    assert.equal(created.authProvider, 'google');
    assert.deepEqual(harness.authSessions, [created.id]);
    assert.equal(harness.persistCount, 1);
});

test('Google OAuth state is opaque, five-minute, single-use, and preserves only safe local next paths', async (t) => {
    const existing = makePasswordUser('linked@example.com', {
        googleSub: 'stable-google-sub',
        passwordEnabled: true
    });
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'stable-google-sub',
            email: 'linked@example.com',
            email_verified: true,
            name: 'Existing User'
        }
    });

    const flow = await harness.startGoogleFlow('/auth/google?next=%2Froom%2FABC%3Ffrom%3Dgoogle');
    const cookieValue = flow.stateCookie.slice(flow.stateCookie.indexOf('=') + 1);
    assert.notEqual(flow.state, cookieValue);
    assert.match(getSetCookies(flow.start.headers).join('\n'), /Max-Age=300/);

    const callbackUrl = `${new URL(flow.start.url).origin}/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`;
    const accepted = await fetch(callbackUrl, {
        headers: { Cookie: flow.stateCookie },
        redirect: 'manual'
    });
    assert.equal(accepted.headers.get('location'), '/room/ABC?from=google');
    assert.equal(harness.providerRequestCount, 2);

    const replay = await fetch(callbackUrl, {
        headers: { Cookie: flow.stateCookie },
        redirect: 'manual'
    });
    assert.equal(replay.headers.get('location'), '/account?auth=google_failed');
    assert.equal(harness.providerRequestCount, 2);

    const unsafe = await harness.completeGoogleFlow({
        pathname: '/auth/google?next=%2F%25255cevil.example%2Faccount'
    });
    assert.equal(unsafe.response.headers.get('location'), '/account?auth=google');
});

test('Google linking requires an authenticated password recheck and links the same verified email', async (t) => {
    const existing = await makeAuthenticatedPasswordUser('owner@example.com');
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'owner-google-sub',
            email: 'OWNER@example.com',
            email_verified: true,
            name: 'Owner'
        }
    });

    const unauthenticated = await harness.request('/api/auth/google/link', {
        method: 'POST',
        body: { password: 'correct-password' }
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).errorCode, 'AUTH_REQUIRED');

    const authCookie = harness.authCookie(existing);
    const wrongPassword = await harness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: authCookie },
        body: { password: 'wrong-password' }
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal((await wrongPassword.json()).errorCode, 'INVALID_CREDENTIALS');

    const prepared = await harness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: authCookie },
        body: { password: 'correct-password', next: '/account?panel=security' }
    });
    assert.equal(prepared.status, 200);
    const preparedBody = await prepared.json();
    assert.equal(preparedBody.ok, true);
    assert.match(preparedBody.redirectTo, /^\/auth\/google\?intent=link&next=/);
    const linkCookie = getSetCookies(prepared.headers)
        .map((cookie) => cookie.split(';')[0])
        .find((cookie) => cookie.startsWith('hala_google_link='));
    assert.ok(linkCookie);
    assert.match(getSetCookies(prepared.headers).join('\n'), /HttpOnly/);
    assert.match(getSetCookies(prepared.headers).join('\n'), /Max-Age=300/);

    const flowCookie = `${authCookie}; ${linkCookie}`;
    const flow = await harness.startGoogleFlow(preparedBody.redirectTo, flowCookie);
    const callback = await harness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${authCookie}; ${flow.stateCookie}` } }
    );
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/account?panel=security');
    assert.equal(existing.googleSub, 'owner-google-sub');
    assert.equal(existing.passwordEnabled, true);
    assert.equal(harness.persistCount, 1);
    assert.deepEqual(harness.authSessions, []);

    const replay = await harness.request(preparedBody.redirectTo, {
        headers: { Cookie: flowCookie }
    });
    assert.equal(replay.headers.get('location'), '/account?auth=reauth_required');
});

test('Google linking rejects email mismatch, a used subject, and cross-user state replay', async (t) => {
    const owner = await makeAuthenticatedPasswordUser('owner@example.com');
    const other = await makeAuthenticatedPasswordUser('other@example.com');
    const subjectOwner = await makeAuthenticatedPasswordUser('subject@example.com');
    subjectOwner.googleSub = 'already-used-sub';

    const mismatchHarness = await startHarness(t, {
        users: [owner, other],
        profile: {
            sub: 'new-sub',
            email: 'other@example.com',
            email_verified: true,
            name: 'Other'
        }
    });
    const ownerCookie = mismatchHarness.authCookie(owner);
    const prepared = await mismatchHarness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: ownerCookie },
        body: { password: 'correct-password' }
    });
    const preparedBody = await prepared.json();
    const proofCookie = getSetCookies(prepared.headers)[0].split(';')[0];
    const flow = await mismatchHarness.startGoogleFlow(preparedBody.redirectTo, `${ownerCookie}; ${proofCookie}`);

    const crossUser = await mismatchHarness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${mismatchHarness.authCookie(other)}; ${flow.stateCookie}` } }
    );
    assert.equal(crossUser.headers.get('location'), '/account?auth=google_failed');
    assert.equal(mismatchHarness.providerRequestCount, 0);
    assert.equal(owner.googleSub, null);

    const mismatchPrepared = await mismatchHarness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: ownerCookie },
        body: { password: 'correct-password' }
    });
    const mismatchBody = await mismatchPrepared.json();
    const mismatchProof = getSetCookies(mismatchPrepared.headers)[0].split(';')[0];
    const mismatch = await mismatchHarness.completeGoogleFlow({
        pathname: mismatchBody.redirectTo,
        cookie: `${ownerCookie}; ${mismatchProof}`,
        callbackCookie: ownerCookie
    });
    assert.equal(mismatch.response.headers.get('location'), '/account?auth=link_email_mismatch');
    assert.equal(mismatchHarness.persistCount, 0);

    const usedSubjectHarness = await startHarness(t, {
        users: [owner, subjectOwner],
        profile: {
            sub: 'already-used-sub',
            email: 'owner@example.com',
            email_verified: true,
            name: 'Owner'
        }
    });
    const usedOwnerCookie = usedSubjectHarness.authCookie(owner);
    const usedPrepared = await usedSubjectHarness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: usedOwnerCookie },
        body: { password: 'correct-password' }
    });
    const usedBody = await usedPrepared.json();
    const usedProof = getSetCookies(usedPrepared.headers)[0].split(';')[0];
    const used = await usedSubjectHarness.completeGoogleFlow({
        pathname: usedBody.redirectTo,
        cookie: `${usedOwnerCookie}; ${usedProof}`,
        callbackCookie: usedOwnerCookie
    });
    assert.equal(used.response.headers.get('location'), '/account?auth=google_subject_in_use');
    assert.equal(owner.googleSub, null);
    assert.equal(usedSubjectHarness.persistCount, 0);
});

test('Google-only accounts cannot start the password-authenticated link flow', async (t) => {
    const googleOnly = createUser({
        email: 'google-only@example.com',
        passwordHash: null,
        passwordEnabled: false,
        googleSub: 'existing-sub',
        displayName: 'Google Only'
    });
    const harness = await startHarness(t, {
        users: [googleOnly],
        profile: {
            sub: 'existing-sub',
            email: googleOnly.email,
            email_verified: true
        }
    });

    const response = await harness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: harness.authCookie(googleOnly) },
        body: { password: 'irrelevant' }
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).errorCode, 'PASSWORD_AUTH_REQUIRED');
});

test('failed Google link persistence rolls the in-memory identity back', async (t) => {
    const existing = await makeAuthenticatedPasswordUser('owner@example.com');
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'owner-google-sub',
            email: 'owner@example.com',
            email_verified: true,
            name: 'Owner'
        },
        persistError: new Error('persistence unavailable')
    });
    const authCookie = harness.authCookie(existing);
    const prepared = await harness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: authCookie },
        body: { password: 'correct-password' }
    });
    const preparedBody = await prepared.json();
    const proofCookie = getSetCookies(prepared.headers)[0].split(';')[0];
    const result = await harness.completeGoogleFlow({
        pathname: preparedBody.redirectTo,
        cookie: `${authCookie}; ${proofCookie}`,
        callbackCookie: authCookie
    });

    assert.equal(result.response.status, 503);
    assert.deepEqual(await result.response.json(), { errorCode: 'PERSISTENCE_UNAVAILABLE' });
    assert.equal(existing.googleSub, null);
    assert.equal(harness.persistCount, 1);
});
