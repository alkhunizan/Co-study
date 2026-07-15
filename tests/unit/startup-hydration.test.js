const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { createCoStudyServer } = require('../../co-study-server');

/** @returns {{ promise: Promise<any>, resolve: (value: any) => void, reject: (reason?: any) => void }} */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function testEnv() {
    return {
        NODE_ENV: 'test',
        PORT: '39871',
        SESSION_SECRET: 'startup-hydration-session-secret-0123456789abcdef',
        ADMIN_SESSION_SECRET: 'startup-hydration-admin-secret-0123456789abcdef',
        ROOM_STATE_FILE: 'startup-test-rooms.json',
        USER_STATE_FILE: 'startup-test-users.json'
    };
}

function roomStore() {
    return {
        filePath: 'startup-test-rooms.json',
        loadRooms() { return []; },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
}

test('server initialization waits for complete user hydration before it can listen', async (t) => {
    const hydration = deferred();
    let hydrateCalls = 0;
    const userStore = {
        filePath: 'startup-test-users.json',
        hydrate() {
            hydrateCalls += 1;
            return hydration.promise;
        },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
    const appServer = createCoStudyServer({
        env: testEnv(),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore: roomStore(),
        userStore,
        registerSignalHandlers: false,
        startupBackoffMs: [1, 1, 1]
    });
    t.after(() => appServer.io.close());

    const initializing = appServer.initialize();
    await Promise.resolve();
    assert.equal(hydrateCalls, 1);
    assert.equal(appServer.server.listening, false);
    assert.throws(() => appServer.listen(), /initialize/i);

    hydration.resolve([{ id: 'hydrated-user' }]);
    await initializing;
    assert.equal(appServer.getLoadedUserCount(), 1);
});

test('failed hydration retries three times and leaves the server unlistened', async (t) => {
    let hydrateCalls = 0;
    const userStore = {
        filePath: 'startup-test-users.json',
        async hydrate() {
            hydrateCalls += 1;
            throw new Error('provider unavailable');
        },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
    const appServer = createCoStudyServer({
        env: testEnv(),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore: roomStore(),
        userStore,
        registerSignalHandlers: false,
        startupBackoffMs: [1, 1, 1]
    });
    t.after(() => appServer.io.close());

    await assert.rejects(appServer.initialize(), /provider unavailable/);
    assert.equal(hydrateCalls, 4);
    assert.equal(appServer.server.listening, false);
});

test('startup dual-reads legacy rooms without assigning owners or flushing a migration', async (t) => {
    let flushCalls = 0;
    const compatibilitySignals = [];
    const legacyRoomStore = {
        filePath: 'startup-test-rooms.json',
        loadRooms() {
            return [{ id: 'LEGACY', schemaVersion: 1, ownerUserId: null }];
        },
        scheduleSave() { return Promise.resolve(); },
        flush() {
            flushCalls += 1;
            return Promise.resolve();
        }
    };
    const userStore = {
        filePath: 'startup-test-users.json',
        async hydrate() {
            return [{ id: 'candidate-owner', myRooms: [{ roomId: 'LEGACY', role: 'created' }] }];
        },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
    const appServer = createCoStudyServer({
        env: testEnv(),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore: legacyRoomStore,
        userStore,
        compatibilityTelemetry: {
            record(signal) { compatibilitySignals.push(signal); },
            snapshot() { return {}; }
        },
        registerSignalHandlers: false,
        startupBackoffMs: [1, 1, 1]
    });
    t.after(() => appServer.io.close());

    await appServer.initialize();

    assert.equal(flushCalls, 0);
    assert.equal(appServer.rooms.get('LEGACY').schemaVersion, 1);
    assert.equal(appServer.rooms.get('LEGACY').ownerUserId, null);
    assert.deepEqual(compatibilitySignals, ['room_schema_v1_read']);
});

test('startup retries every persistence hydration stage as one clean unit', async (t) => {
    const sleeps = [];
    let roomLoads = 0;
    let userHydrations = 0;
    let videoHydrations = 0;
    let webhookHydrations = 0;
    const retryingRoomStore = {
        ...roomStore(),
        loadRooms() {
            roomLoads += 1;
            return [{
                id: roomLoads === 1 ? 'STALE1' : 'FRESH1',
                name: roomLoads === 1 ? 'Stale room' : 'Fresh room',
                schemaVersion: 2
            }];
        }
    };
    const retryingUserStore = {
        filePath: 'startup-test-users.json',
        async hydrate() {
            userHydrations += 1;
            return [{
                id: userHydrations === 1 ? 'stale-user' : 'fresh-user',
                email: userHydrations === 1 ? 'stale@example.com' : 'fresh@example.com'
            }];
        },
        scheduleSave() { return Promise.resolve(); },
        flush() { return Promise.resolve(); }
    };
    const videoSessionStore = {
        filePath: 'startup-test-video-sessions.json',
        async initialize() {
            videoHydrations += 1;
            if (videoHydrations === 1) throw new Error('transient video hydration failure');
            return { schemaVersion: 1, sessions: [] };
        },
        flush() { return Promise.resolve(); }
    };
    const realtimeKitWebhookDeduplicator = {
        entries: new Map(),
        async initialize() {
            webhookHydrations += 1;
            return 0;
        },
        runOnce() { throw new Error('not used'); },
        flush() { return Promise.resolve(); }
    };
    const appServer = createCoStudyServer({
        env: testEnv(),
        mode: 'http',
        createServer: (app) => http.createServer(app),
        roomStore: retryingRoomStore,
        userStore: retryingUserStore,
        videoSessionStore,
        realtimeKitWebhookDeduplicator,
        registerSignalHandlers: false,
        startupBackoffMs: [1, 2, 4],
        sleep(ms) {
            sleeps.push(ms);
            return Promise.resolve();
        }
    });
    t.after(() => appServer.io.close());

    await appServer.initialize();

    assert.equal(roomLoads, 2);
    assert.equal(userHydrations, 2);
    assert.equal(videoHydrations, 2);
    assert.equal(webhookHydrations, 2);
    assert.deepEqual(sleeps, [1]);
    assert.equal(appServer.rooms.has('STALE1'), false);
    assert.equal(appServer.rooms.has('FRESH1'), true);
    assert.equal(appServer.users.has('stale-user'), false);
    assert.equal(appServer.users.has('fresh-user'), true);
    assert.equal(appServer.getLoadedRoomCount(), 1);
    assert.equal(appServer.getLoadedUserCount(), 1);
});
