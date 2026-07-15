const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const express = require('express');

const { createGoogleAuthRouter } = require('../../services/auth/google-routes');
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

async function startHarness(t, { users: initialUsers = [], profile }) {
    const users = new Map(initialUsers.map((user) => [user.id, user]));
    const usersByEmail = new Map(initialUsers.map((user) => [user.email, user.id]));
    const usersByGoogleSub = new Map(
        initialUsers.filter((user) => user.googleSub).map((user) => [user.googleSub, user.id])
    );
    const authSessions = [];
    let persistCount = 0;
    let providerRequestCount = 0;

    const app = express();
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
        async startGoogleFlow(pathname = '/auth/google') {
            const start = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual' });
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
            const flow = await this.startGoogleFlow(options.pathname);
            const response = await fetch(`${baseUrl}/auth/google/callback?code=test-code&state=${encodeURIComponent(flow.state)}`, {
                headers: { Cookie: flow.stateCookie },
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
