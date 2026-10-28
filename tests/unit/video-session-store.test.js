const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createVideoSessionStore } = require('../../services/video/video-session-store');

test('video session store atomically persists acknowledged provider identities', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-video-sessions-'));
    const filePath = path.join(directory, 'sessions.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = createVideoSessionStore({ filePath });
    assert.deepEqual(await store.initialize(), { schemaVersion: 1, sessions: [] });
    const state = {
        schemaVersion: 1,
        sessions: [{
            videoSessionId: 'session-id-0000000000000000000001',
            roomId: 'ROOM01',
            providerMeetingId: 'meeting-1',
            providerParticipantId: 'participant-1',
            requestIpKey: 'opaque-ip-key'
        }]
    };
    await store.flush(state);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), state);

    const restarted = createVideoSessionStore({ filePath });
    assert.deepEqual(await restarted.initialize(), state);
    assert.deepEqual(await restarted.initialize(), state);
});

test('a failed video session write does not poison a later immediate write', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-video-session-retry-'));
    const filePath = path.join(directory, 'sessions.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    let failRename = true;
    const fsImpl = {
        ...fsPromises,
        async rename(source, destination) {
            if (failRename) {
                failRename = false;
                const error = new Error('injected rename failure');
                /** @type {any} */ (error).code = 'EIO';
                throw error;
            }
            return fsPromises.rename(source, destination);
        }
    };
    const store = createVideoSessionStore({
        filePath,
        fsImpl,
        logger: { warn() {} }
    });
    await store.initialize();
    const failed = { schemaVersion: 1, sessions: [{ videoSessionId: 'failed' }] };
    await assert.rejects(store.flush(failed), /injected rename failure/);
    const recovered = { schemaVersion: 1, sessions: [{ videoSessionId: 'recovered' }] };
    await store.flush(recovered);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), recovered);
});

test('video session store rejects malformed startup state', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-video-session-invalid-'));
    const filePath = path.join(directory, 'sessions.json');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(filePath, '{"schemaVersion":999,"sessions":[]}', 'utf8');
    await assert.rejects(createVideoSessionStore({ filePath }).initialize(), /malformed/);
});
