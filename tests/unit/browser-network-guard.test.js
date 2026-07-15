const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createTestContext,
    gotoTestPage,
    isExternalNetworkUrl,
    waitForTestUrl
} = require('../helpers/playwright-test');

test('browser smoke network guard permits loopback traffic only', () => {
    for (const allowed of [
        'http://127.0.0.1:3460/',
        'https://localhost/test',
        'ws://127.1.2.3/socket.io/',
        'wss://[::1]/socket.io/',
        'data:text/plain,local',
        'blob:http://127.0.0.1:3460/id'
    ]) {
        assert.equal(isExternalNetworkUrl(allowed), false, `${allowed} should remain local`);
    }

    for (const blocked of [
        'https://accounts.google.com/o/oauth2/v2/auth',
        'https://project.supabase.co/rest/v1/profiles',
        'https://api.cloudflare.com/client/v4/accounts/example',
        'https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit/browser.js',
        'https://fonts.googleapis.com/css2?family=Inter',
        'wss://media.example.com/session'
    ]) {
        assert.equal(isExternalNetworkUrl(blocked), true, `${blocked} must be blocked`);
    }
});

test('browser smoke network guard fulfills external requests locally and continues loopback requests', async () => {
    /** @type {((route: any) => Promise<void>) | null} */
    let routeHandler = null;
    const context = {
        async route(pattern, handler) {
            assert.equal(pattern, '**/*');
            routeHandler = handler;
        }
    };
    const browser = {
        async newContext(options) {
            assert.deepEqual(options, { serviceWorkers: 'block', locale: 'en' });
            return context;
        }
    };

    assert.equal(await createTestContext(browser, { locale: 'en' }), context);
    if (typeof routeHandler !== 'function') throw new Error('Expected the network route handler to be installed.');
    const handleRoute = routeHandler;

    /** @type {any} */
    let fulfilled;
    let continued = false;
    await handleRoute({
        request: () => ({
            resourceType: () => 'stylesheet',
            url: () => 'https://api.cloudflare.com/client/v4'
        }),
        fulfill: async (response) => { fulfilled = response; },
        continue: async () => { continued = true; }
    });
    if (!fulfilled) throw new Error('Expected the external request to be fulfilled locally.');
    assert.equal(fulfilled.status, 204);
    assert.equal(fulfilled.headers['Content-Type'], 'text/css; charset=utf-8');
    assert.equal(continued, false);

    fulfilled = undefined;
    continued = false;
    await handleRoute({
        request: () => ({
            resourceType: () => 'fetch',
            url: () => 'http://127.0.0.1:3460/api/ready'
        }),
        fulfill: async (response) => { fulfilled = response; },
        continue: async () => { continued = true; }
    });
    assert.equal(fulfilled, undefined);
    assert.equal(continued, true);
});

test('browser smoke contexts allow only the dedicated worker test to opt in', async () => {
    const observed = [];
    const context = { async route() {} };
    const browser = {
        async newContext(options) {
            observed.push(options);
            return context;
        }
    };

    await createTestContext(browser);
    await createTestContext(browser, { serviceWorkers: 'allow', locale: 'en' });

    assert.deepEqual(observed, [
        { serviceWorkers: 'block' },
        { serviceWorkers: 'allow', locale: 'en' }
    ]);
});

test('browser smoke navigation waits for DOM readiness across engines', async () => {
    const calls = [];
    const page = {
        goto(url, options) {
            calls.push({ url, options });
            return Promise.resolve('response');
        }
    };

    assert.equal(await gotoTestPage(page, '/open.html'), 'response');
    assert.deepEqual(calls[0], {
        url: '/open.html',
        options: { waitUntil: 'domcontentloaded' }
    });

    await gotoTestPage(page, '/ready', { waitUntil: 'networkidle', timeout: 1000 });
    assert.deepEqual(calls[1], {
        url: '/ready',
        options: { waitUntil: 'networkidle', timeout: 1000 }
    });

    page.waitForURL = (url, options) => {
        calls.push({ url, options });
        return Promise.resolve('navigated');
    };
    assert.equal(await waitForTestUrl(page, '**/open.html'), 'navigated');
    assert.deepEqual(calls[2], {
        url: '**/open.html',
        options: { waitUntil: 'domcontentloaded' }
    });
});
