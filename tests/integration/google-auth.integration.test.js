const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const express = require('express');

const { createAuthRouter } = require('../../services/auth/auth-routes');
const { createGoogleAuthRouter } = require('../../services/auth/google-routes');
const { createOAuthSecurity } = require('../../services/auth/oauth-security');
const {
    createKeyedMutationCoordinator,
    createUserMutationCoordinator
} = require('../../services/auth/user-mutation-coordinator');
const { hashPassword } = require('../../services/auth/password');
const { createUser } = require('../../user-store');

function deferred() {
    /** @type {() => void} */
    let resolve = () => {};
    /** @type {Promise<void>} */
    const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

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

/** @returns {Record<string, string>} */
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

async function startHarness(t, {
    users: initialUsers = [],
    profile,
    persistError = null,
    deleteError = null,
    persistProfile = null,
    persistFocus = null,
    deleteUserImpl = null,
    beforeUserInfo = null,
    onAuthenticatedRequest = null
}) {
    const users = new Map(initialUsers.map((user) => [user.id, user]));
    const usersByEmail = new Map(initialUsers.map((user) => [user.email, user.id]));
    const usersByGoogleSub = new Map(
        initialUsers.filter((user) => user.googleSub).map((user) => [user.googleSub, user.id])
    );
    const authSessions = [];
    let persistCount = 0;
    let providerRequestCount = 0;
    let deleteCount = 0;
    let anonymousRotationCount = 0;
    const oauthSecurity = createOAuthSecurity({
        secret: 'google-harness-session-secret-at-least-32-bytes'
    });
    const userMutationCoordinator = createUserMutationCoordinator({
        getUser: (userId) => users.get(userId) || null
    });
    const googleSubjectMutationCoordinator = createKeyedMutationCoordinator();
    const runUserMutation = (user, operation) => userMutationCoordinator.run(user, operation);
    const runGoogleSubjectMutation = (googleSub, operation) =>
        googleSubjectMutationCoordinator.run(googleSub, operation);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        const testUserId = parseCookies(req.headers.cookie || '').testAuth;
        if (testUserId && users.has(testUserId)) {
            req.user = users.get(testUserId);
            onAuthenticatedRequest?.(req);
        }
        next();
    });
    app.use('/api', createAuthRouter({
        users,
        usersByEmail,
        rooms: new Map(),
        rateLimiters: {
            authLogin: {},
            authSignup: {},
            authFailure: { check: () => ({ allowed: true }), consume() {}, reset() {} },
            profileMutation: {},
            focusLog: {}
        },
        applyHttpRateLimit: () => true,
        getRequestIp: () => '127.0.0.1',
        publicUser: (user) => ({ id: user.id, email: user.email }),
        setAuthCookie: () => {},
        clearAuthCookie: (_req, res) => appendSetCookie(res, 'coStudyAuth=; Path=/; Max-Age=0'),
        rotateAnonymousIdentity: (_req, res) => {
            anonymousRotationCount += 1;
            appendSetCookie(res, `coStudySessionId=rotated-${anonymousRotationCount}; Path=/; HttpOnly`);
        },
        appendSetCookie,
        parseCookies,
        oauthSecurity,
        persistUser: async (user) => persistProfile?.(user),
        deleteUser: async (user) => {
            deleteCount += 1;
            if (deleteError) throw deleteError;
            return deleteUserImpl?.(user);
        },
        persistFocusCompletion: persistFocus || (async () => {}),
        runUserMutation,
        requireUser: (req, res, next) => {
            if (!req.user) {
                res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
                return;
            }
            next();
        },
        logger: { info() {}, warn() {}, error() {} }
    }));
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
        persistUser: async () => {
            persistCount += 1;
            if (persistError) throw persistError;
        },
        runUserMutation,
        runGoogleSubjectMutation,
        sessionSecret: 'google-harness-session-secret-at-least-32-bytes',
        oauthSecurity,
        logger: { info() {}, warn() {}, error() {} },
        fetchImpl: async (url) => {
            providerRequestCount += 1;
            if (url === 'https://oauth2.googleapis.com/token') {
                return { ok: true, json: async () => ({ access_token: 'test-access-token' }) };
            }
            if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
                await beforeUserInfo?.();
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
        get deleteCount() {
            return deleteCount;
        },
        get anonymousRotationCount() {
            return anonymousRotationCount;
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

    const invalidIntent = await harness.request('/auth/google?intent=link&intent=signin');
    assert.equal(invalidIntent.status, 400);
    assert.deepEqual(await invalidIntent.json(), { errorCode: 'OAUTH_INTENT_INVALID' });
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

test('Google reauthentication issues a one-time deletion grant for the exact linked subject', async (t) => {
    const googleOnly = createUser({
        email: 'delete-google@example.com',
        passwordHash: null,
        passwordEnabled: false,
        googleSub: 'delete-google-sub',
        displayName: 'Delete Me'
    });
    const harness = await startHarness(t, {
        users: [googleOnly],
        profile: {
            sub: 'delete-google-sub',
            email: 'changed-provider-email@example.com',
            email_verified: true,
            name: 'Delete Me'
        }
    });
    const authCookie = harness.authCookie(googleOnly);
    const flow = await harness.startGoogleFlow(
        '/auth/google?intent=reauth_delete&next=%2Faccount%3Fdelete%3Dready',
        authCookie
    );
    const callback = await harness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${authCookie}; ${flow.stateCookie}` } }
    );

    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get('location'), '/account?delete=ready');
    const grantHeaders = getSetCookies(callback.headers);
    const grantCookie = grantHeaders
        .map((cookie) => cookie.split(';')[0])
        .find((cookie) => cookie.startsWith('hala_delete_grant='));
    assert.ok(grantCookie);
    assert.match(grantHeaders.join('\n'), /Path=\/api\/me/);
    assert.match(grantHeaders.join('\n'), /HttpOnly/);
    assert.match(grantHeaders.join('\n'), /Max-Age=300/);

    const deleted = await harness.request('/api/me', {
        method: 'DELETE',
        headers: { Cookie: `${authCookie}; ${grantCookie}` },
        body: {}
    });
    assert.equal(deleted.status, 200);
    assert.equal(harness.users.has(googleOnly.id), false);
    assert.equal(harness.usersByEmail.has(googleOnly.email), false);
    assert.equal(harness.deleteCount, 1);
    assert.equal(harness.anonymousRotationCount, 1);
    const deletionCookies = getSetCookies(deleted.headers).join('\n');
    assert.match(deletionCookies, /hala_delete_grant=.*Max-Age=0/);
    assert.match(deletionCookies, /coStudyAuth=.*Max-Age=0/);
    assert.match(deletionCookies, /coStudySessionId=rotated-1/);

    const replay = await harness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${authCookie}; ${flow.stateCookie}` } }
    );
    assert.equal(replay.headers.get('location'), '/account?auth=google_failed');
    assert.equal(harness.providerRequestCount, 2);
});

test('Google deletion reauthentication rejects a different subject and an unauthenticated start', async (t) => {
    const linked = await makeAuthenticatedPasswordUser('linked@example.com');
    linked.googleSub = 'expected-sub';
    const harness = await startHarness(t, {
        users: [linked],
        profile: {
            sub: 'different-sub',
            email: linked.email,
            email_verified: true,
            name: 'Different Google Account'
        }
    });

    const unauthenticated = await harness.request('/auth/google?intent=reauth_delete');
    assert.equal(unauthenticated.status, 302);
    assert.equal(unauthenticated.headers.get('location'), '/account?auth=reauth_required');

    const result = await harness.completeGoogleFlow({
        pathname: '/auth/google?intent=reauth_delete',
        cookie: harness.authCookie(linked),
        callbackCookie: harness.authCookie(linked)
    });
    assert.equal(result.response.headers.get('location'), '/account?auth=google_reauth_failed');
    assert.equal(getSetCookies(result.response.headers)
        .some((cookie) => cookie.startsWith('hala_delete_grant=')), false);
    assert.equal(harness.deleteCount, 0);
});

test('failed durable deletion with a Google grant leaves the account and auth identity live', async (t) => {
    const googleOnly = createUser({
        email: 'durable-google@example.com',
        passwordHash: null,
        passwordEnabled: false,
        googleSub: 'durable-google-sub',
        displayName: 'Durable User'
    });
    const harness = await startHarness(t, {
        users: [googleOnly],
        profile: {
            sub: 'durable-google-sub',
            email: googleOnly.email,
            email_verified: true
        },
        deleteError: new Error('persistence unavailable')
    });
    const authCookie = harness.authCookie(googleOnly);
    const flow = await harness.startGoogleFlow('/auth/google?intent=reauth_delete', authCookie);
    const callback = await harness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${authCookie}; ${flow.stateCookie}` } }
    );
    const grantCookie = getSetCookies(callback.headers)
        .map((cookie) => cookie.split(';')[0])
        .find((cookie) => cookie.startsWith('hala_delete_grant='));
    assert.ok(grantCookie);

    const failed = await harness.request('/api/me', {
        method: 'DELETE',
        headers: { Cookie: `${authCookie}; ${grantCookie}` },
        body: {}
    });
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { errorCode: 'PERSISTENCE_UNAVAILABLE' });
    assert.equal(harness.users.get(googleOnly.id), googleOnly);
    assert.equal(harness.usersByEmail.get(googleOnly.email), googleOnly.id);
    assert.equal(harness.deleteCount, 1);
    assert.equal(harness.anonymousRotationCount, 0);
    assert.equal(getSetCookies(failed.headers)
        .some((cookie) => cookie.startsWith('coStudyAuth=')), false);
});

test('a profile request authenticated before deletion cannot persist after deletion wins', async (t) => {
    const existing = await makeAuthenticatedPasswordUser('profile-race@example.com');
    const deletionStarted = deferred();
    const releaseDeletion = deferred();
    const staleRequestAuthenticated = deferred();
    let profilePersistCount = 0;
    const harness = await startHarness(t, {
        users: [existing],
        profile: {},
        deleteUserImpl: async () => {
            deletionStarted.resolve();
            await releaseDeletion.promise;
        },
        persistProfile: async () => {
            profilePersistCount += 1;
        },
        onAuthenticatedRequest: (req) => {
            if (req.method === 'PATCH') staleRequestAuthenticated.resolve();
        }
    });
    const authCookie = harness.authCookie(existing);

    const deletion = harness.request('/api/me', {
        method: 'DELETE',
        headers: { Cookie: authCookie },
        body: { password: 'correct-password' }
    });
    await deletionStarted.promise;
    const staleMutation = harness.request('/api/me/profile', {
        method: 'PATCH',
        headers: { Cookie: authCookie },
        body: { bio: 'must not survive deletion' }
    });
    await staleRequestAuthenticated.promise;
    releaseDeletion.resolve();

    const [deleted, stale] = await Promise.all([deletion, staleMutation]);
    assert.equal(deleted.status, 200);
    assert.equal(stale.status, 401);
    assert.deepEqual(await stale.json(), { errorCode: 'AUTH_REQUIRED' });
    assert.equal(profilePersistCount, 0);
    assert.equal(harness.users.has(existing.id), false);
});

test('a provider-reported focus replay replaces the optimistic projection with the durable aggregate', async (t) => {
    const existing = await makeAuthenticatedPasswordUser('focus-replay@example.com');
    const dayKey = '2026-07-15';
    const completionId = 'completion_rpc_0001';
    const durableFocusStats = {
        days: { [dayKey]: { focusMinutes: 20, sessions: 1 } },
        totalFocusMinutes: 20,
        totalSessions: 1,
        completions: [{ completionId, acceptedMinutes: 20, dayKey, completedAt: Date.now() }]
    };
    const durableStreak = { current: 1, best: 1, lastActiveDay: dayKey };
    const harness = await startHarness(t, {
        users: [existing],
        profile: {},
        persistFocus: async () => ({
            duplicate: true,
            acceptedMinutes: 20,
            dayKey,
            focusStats: structuredClone(durableFocusStats),
            streak: structuredClone(durableStreak)
        })
    });

    const response = await harness.request('/api/me/focus-session', {
        method: 'POST',
        headers: { Cookie: harness.authCookie(existing) },
        body: { minutes: 25, completionId }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.duplicate, true);
    assert.equal(payload.acceptedMinutes, 20);
    assert.deepEqual(payload.focusStats, durableFocusStats);
    assert.deepEqual(payload.streak, durableStreak);
    assert.deepEqual(existing.focusStats, durableFocusStats);
});

test('a Google link callback cannot attach identity after the account is deleted', async (t) => {
    const existing = await makeAuthenticatedPasswordUser('google-race@example.com');
    const userInfoStarted = deferred();
    const releaseUserInfo = deferred();
    const harness = await startHarness(t, {
        users: [existing],
        profile: {
            sub: 'stale-link-subject',
            email: existing.email,
            email_verified: true,
            name: 'Stale Link'
        },
        beforeUserInfo: async () => {
            userInfoStarted.resolve();
            await releaseUserInfo.promise;
        }
    });
    const authCookie = harness.authCookie(existing);
    const prepared = await harness.request('/api/auth/google/link', {
        method: 'POST',
        headers: { Cookie: authCookie },
        body: { password: 'correct-password' }
    });
    const preparedBody = await prepared.json();
    const linkCookie = getSetCookies(prepared.headers)[0].split(';')[0];
    const flow = await harness.startGoogleFlow(
        preparedBody.redirectTo,
        `${authCookie}; ${linkCookie}`
    );
    const callback = harness.request(
        `/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`,
        { headers: { Cookie: `${authCookie}; ${flow.stateCookie}` } }
    );
    await userInfoStarted.promise;

    const deleted = await harness.request('/api/me', {
        method: 'DELETE',
        headers: { Cookie: authCookie },
        body: { password: 'correct-password' }
    });
    assert.equal(deleted.status, 200);
    releaseUserInfo.resolve();

    const staleCallback = await callback;
    assert.equal(staleCallback.status, 302);
    assert.equal(staleCallback.headers.get('location'), '/account?auth=google_failed');
    assert.equal(existing.googleSub, null);
    assert.equal(harness.persistCount, 0);
    assert.equal(harness.users.has(existing.id), false);
});
