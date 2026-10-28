const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { buildTestEnvironment, waitForServer } = require('../helpers/server-control');
const { resolveVideoConfig } = require('../../server-config');
const { createVideoProvider } = require('../../services/video');

test('test child environments ignore ambient service credentials and force test mode', () => {
    const env = buildTestEnvironment({
        ambientEnv: {
            PATH: 'safe-path',
            NODE_ENV: 'production',
            SESSION_SECRET: 'ambient-session-secret-that-must-not-cross-the-test-boundary',
            ADMIN_SESSION_SECRET: 'ambient-admin-secret-that-must-not-cross-the-test-boundary',
            SUPABASE_URL: 'https://production-project.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'production-service-role-key',
            GOOGLE_CLIENT_SECRET: 'production-google-secret',
            CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'production-realtimekit-token'
        },
        overrides: {
            VIDEO_PROVIDER: 'mesh',
            ENABLE_DEV_MESH: 'true',
            TRUST_PROXY: '1'
        }
    });

    assert.equal(env.PATH, 'safe-path');
    assert.equal(env.NODE_ENV, 'test');
    assert.equal(env.VIDEO_PROVIDER, 'mesh');
    assert.equal(env.ENABLE_DEV_MESH, 'true');
    assert.equal(env.TRUST_PROXY, '1');
    assert.equal(env.SUPABASE_URL, undefined);
    assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(env.GOOGLE_CLIENT_SECRET, undefined);
    assert.equal(env.CLOUDFLARE_REALTIMEKIT_API_TOKEN, undefined);
    assert.notEqual(env.SESSION_SECRET, 'ambient-session-secret-that-must-not-cross-the-test-boundary');
    assert.notEqual(env.ADMIN_SESSION_SECRET, 'ambient-admin-secret-that-must-not-cross-the-test-boundary');
});

test('test child environments reject unsupported overrides and non-loopback provider URLs', () => {
    assert.throws(
        () => buildTestEnvironment({ overrides: { SUPABASE_URL: 'http://127.0.0.1:54321' } }),
        /SUPABASE_URL is not allowed/
    );
    assert.throws(
        () => buildTestEnvironment({ overrides: { NODE_ENV: 'production' } }),
        /NODE_ENV is fixed to test/
    );
    assert.throws(
        () => buildTestEnvironment({ overrides: { SFU_BASE_URL: 'https://media.example.com' } }),
        /SFU_BASE_URL must use a loopback host/
    );
    assert.throws(
        () => resolveVideoConfig({
            NODE_ENV: 'test',
            VIDEO_PROVIDER: 'realtimekit',
            CLOUDFLARE_ACCOUNT_ID: 'test-account',
            CLOUDFLARE_REALTIMEKIT_APP_ID: 'test-app',
            CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'test-token'
        }),
        /API_BASE_URL must use a loopback host/
    );
    assert.doesNotThrow(() => resolveVideoConfig({
        NODE_ENV: 'test',
        VIDEO_PROVIDER: 'realtimekit',
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'test-app',
        CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'test-token',
        CLOUDFLARE_REALTIMEKIT_API_BASE_URL: 'http://127.0.0.1:4100',
        CLOUDFLARE_REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL: 'http://127.0.0.1:4100/.well-known/webhooks.json'
    }));
    assert.throws(
        () => resolveVideoConfig({ NODE_ENV: 'production', VIDEO_PROVIDER: 'mesh' }),
        /mesh is development-only/
    );
});

test('mesh provider requires the explicit development flag and production forbids it', () => {
    assert.throws(
        () => createVideoProvider({ config: { provider: 'mesh', devMeshEnabled: false } }),
        /explicit development mesh flag/
    );
    for (const nodeEnv of ['development', 'test']) {
        assert.throws(
            () => resolveVideoConfig({ NODE_ENV: nodeEnv, VIDEO_PROVIDER: 'mesh' }),
            /ENABLE_DEV_MESH=true/
        );
        const config = resolveVideoConfig({
            NODE_ENV: nodeEnv,
            VIDEO_PROVIDER: 'mesh',
            ENABLE_DEV_MESH: 'true'
        });
        assert.equal(config.devMeshEnabled, true);
        assert.equal(createVideoProvider({ config }).getProviderName(), 'mesh');
    }

    assert.throws(
        () => resolveVideoConfig({
            NODE_ENV: 'production',
            VIDEO_PROVIDER: 'realtimekit',
            ENABLE_DEV_MESH: 'true'
        }),
        /ENABLE_DEV_MESH.*forbidden in production/
    );
});

test('production rejects static ICE and video policy cannot exceed launch ceilings', () => {
    const productionRealtimeKit = {
        NODE_ENV: 'production',
        VIDEO_PROVIDER: 'realtimekit',
        CLOUDFLARE_ACCOUNT_ID: 'production-account',
        CLOUDFLARE_REALTIMEKIT_APP_ID: 'production-app',
        CLOUDFLARE_REALTIMEKIT_API_TOKEN: 'production-token'
    };
    assert.throws(
        () => resolveVideoConfig({
            ...productionRealtimeKit,
            ICE_SERVERS_JSON: '[{"urls":"turn:static.example.com"}]'
        }),
        /ICE_SERVERS_JSON.*forbidden in production/
    );

    for (const envName of ['MAX_GLOBAL_VIDEO_PARTICIPANTS', 'MAX_ROOM_VIDEO_PARTICIPANTS']) {
        assert.throws(
            () => resolveVideoConfig({
                ...productionRealtimeKit,
                [envName]: '21'
            }),
            new RegExp(`${envName} must be at most 20`)
        );
    }

    for (const envName of ['VIDEO_SCREENSHARE_ENABLED', 'VIDEO_CHAT_ENABLED']) {
        assert.throws(
            () => resolveVideoConfig({
                ...productionRealtimeKit,
                [envName]: 'true'
            }),
            new RegExp(`${envName} must remain false`)
        );
    }

    const locked = resolveVideoConfig({
        ...productionRealtimeKit,
        MAX_GLOBAL_VIDEO_PARTICIPANTS: '20',
        MAX_ROOM_VIDEO_PARTICIPANTS: '20'
    });
    assert.equal(locked.maxGlobalParticipants, 20);
    assert.equal(locked.maxRoomParticipants, 20);
    assert.equal(locked.screenshareEnabled, false);
    assert.equal(locked.chatEnabled, false);
});

test('server startup waits for readiness instead of an earlier runtime endpoint', async (t) => {
    let readinessChecks = 0;
    const fixture = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/runtime-config') {
            res.statusCode = 200;
            res.end('{"status":"configured"}');
            return;
        }
        if (req.url === '/api/ready') {
            readinessChecks += 1;
            res.statusCode = readinessChecks < 3 ? 503 : 200;
            res.end(readinessChecks < 3 ? '{"status":"starting"}' : '{"status":"ready"}');
            return;
        }
        res.statusCode = 404;
        res.end('{}');
    });

    await new Promise((resolve) => fixture.listen(0, '127.0.0.1', () => resolve()));
    t.after(() => new Promise((resolve, reject) => {
        fixture.close((error) => error ? reject(error) : resolve());
    }));

    const address = fixture.address();
    assert.ok(address && typeof address === 'object');
    await waitForServer(`http://127.0.0.1:${address.port}`, 3000);

    assert.equal(readinessChecks, 3);
});
