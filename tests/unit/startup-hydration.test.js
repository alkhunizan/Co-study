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
        registerSignalHandlers: false,
        startupBackoffMs: [1, 1, 1]
    });
    t.after(() => appServer.io.close());

    await appServer.initialize();

    assert.equal(flushCalls, 0);
    assert.equal(appServer.rooms.get('LEGACY').schemaVersion, 1);
    assert.equal(appServer.rooms.get('LEGACY').ownerUserId, null);
});
