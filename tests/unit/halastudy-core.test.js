const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const CORE_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'halastudy-core.js'),
    'utf8'
);

function deferred() {
    /** @type {(value?: any) => void} */
    let resolve = () => {};
    /** @type {(reason?: any) => void} */
    let reject = () => {};
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        }
    };
}

function createStorage() {
    const entries = new Map();
    return {
        getItem(key) {
            return entries.has(key) ? entries.get(key) : null;
        },
        setItem(key, value) {
            entries.set(key, String(value));
        },
        removeItem(key) {
            entries.delete(key);
        }
    };
}

/**
 * @param {(request: { url: string, options: any }) => any} fetchImpl
 * @param {{ serviceWorker?: any }} [options]
 */
function createHarness(fetchImpl, options = {}) {
    const requests = [];
    const attributes = new Map();
    const document = {
        readyState: 'loading',
        addEventListener() {},
        querySelectorAll() { return []; },
        documentElement: {
            setAttribute(name, value) { attributes.set(name, value); },
            getAttribute(name) { return attributes.get(name) || null; }
        }
    };
    const window = {
        navigator: options.serviceWorker ? { serviceWorker: options.serviceWorker } : undefined
    };

    vm.runInNewContext(CORE_SOURCE, {
        window,
        document,
        localStorage: createStorage(),
        sessionStorage: createStorage(),
        AbortController,
        Date,
        async fetch(url, options) {
            const request = { url: String(url), options };
            requests.push(request);
            return fetchImpl(request);
        }
    }, { filename: 'public/js/halastudy-core.js' });

    return {
        auth: (/** @type {any} */ (window)).HalaAuth,
        core: (/** @type {any} */ (window)).HalaCore,
        requests
    };
}

test('refreshUser aborts and supersedes an older session lookup', async () => {
    const firstLookup = deferred();
    const secondLookup = deferred();
    const harness = createHarness((_request) => harness.requests.length === 1
        ? firstLookup.promise
        : secondLookup.promise);

    const staleUser = harness.auth.getUser();
    const freshUser = harness.auth.refreshUser();

    assert.equal(harness.requests.length, 2);
    assert.equal(harness.requests[0].options.signal.aborted, true);

    secondLookup.resolve(jsonResponse({ user: { id: 'fresh-user' } }));
    firstLookup.resolve(jsonResponse({ user: { id: 'stale-user' } }));

    assert.equal(await staleUser, null);
    assert.equal((await freshUser).id, 'fresh-user');
    assert.equal((await harness.auth.getUser()).id, 'fresh-user');
});

test('a 401 response invalidates the cached authenticated user', async () => {
    const responses = [
        jsonResponse({ user: { id: 'cached-user' } }),
        jsonResponse({ error: 'AUTH_REQUIRED' }, 401)
    ];
    const harness = createHarness(() => responses.shift());

    assert.equal((await harness.auth.getUser()).id, 'cached-user');
    await assert.rejects(
        harness.core.requestJson('GET', '/api/me/stats'),
        (error) => (/** @type {any} */ (error)).status === 401
    );

    assert.equal(await harness.auth.getUser(), null);
    assert.equal(harness.requests.length, 2);
});

test('successful account deletion invalidates the cached authenticated user', async () => {
    const responses = [
        jsonResponse({ user: { id: 'deleted-user' } }),
        jsonResponse({ ok: true })
    ];
    const harness = createHarness(() => responses.shift());

    assert.equal((await harness.auth.getUser()).id, 'deleted-user');
    await harness.core.requestJson('DELETE', '/api/me', { password: 'correct horse battery staple' });

    assert.equal(await harness.auth.getUser(), null);
    assert.equal(harness.requests.length, 2);
});

test('signout immediately aborts a pending session lookup and rejects its stale user', async () => {
    const sessionLookup = deferred();
    const logoutRequest = deferred();
    const harness = createHarness((request) => request.url === '/api/auth/me'
        ? sessionLookup.promise
        : logoutRequest.promise);

    const pendingUser = harness.auth.getUser();
    const signout = harness.auth.signout();

    assert.equal(harness.requests[0].options.signal.aborted, true);
    logoutRequest.resolve(jsonResponse({ ok: true }));
    await signout;
    sessionLookup.resolve(jsonResponse({ user: { id: 'stale-after-logout' } }));

    assert.equal(await pendingUser, null);
    assert.equal(await harness.auth.getUser(), null);
    assert.equal(harness.requests.length, 2);
});

test('shared core registers the root service worker without reusing HTTP-cached worker bytes', () => {
    const registrations = [];
    createHarness(() => jsonResponse({ announcement: null }), {
        serviceWorker: {
            register(url, options) {
                registrations.push({ url, options });
                return Promise.resolve();
            }
        }
    });

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].url, '/service-worker.js');
    assert.equal(registrations[0].options.scope, '/');
    assert.equal(registrations[0].options.updateViaCache, 'none');
});
