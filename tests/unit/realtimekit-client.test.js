const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REALTIMEKIT_CLIENT_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'video', 'realtimekit-client.js'),
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

async function settleWithin(promise, timeoutMs, message) {
    let timeout = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
            })
        ]);
    } finally {
        if (timeout !== null) clearTimeout(timeout);
    }
}

/**
 * @param {{ init: (options: any) => Promise<any> }} RealtimeKitClient
 * @param {(document: any) => void} [configureDocument]
 * @param {{ setTimeout?: (callback: (...args: any[]) => void, delay?: number) => any, clearTimeout?: (handle: any) => void }} [timers]
 */
function loadClient(RealtimeKitClient, configureDocument, timers = {}) {
    const loadedCoreScript = {
        dataset: { loaded: 'true' },
        addEventListener() {}
    };
    const document = {
        querySelector(selector) {
            return selector.startsWith('script[src=') ? loadedCoreScript : null;
        },
        getElementById() {
            return null;
        },
        createElement() {
            return {};
        },
        head: {
            appendChild() {}
        }
    };
    configureDocument?.(document);
    const window = { RealtimeKitClient };

    vm.runInNewContext(
        REALTIMEKIT_CLIENT_SOURCE,
        {
            window,
            document,
            customElements: {
                get(name) {
                    return name === 'rtk-meeting' ? function RealtimeKitMeeting() {} : undefined;
                }
            },
            setTimeout: timers.setTimeout || setTimeout,
            clearTimeout: timers.clearTimeout || clearTimeout
        },
        { filename: 'public/js/video/realtimekit-client.js' }
    );

    return window.HalastudyRealtimeKitClient;
}

function createMeetingElement(options = {}) {
    const parent = {
        children: [],
        appendChild(child) {
            child.remove();
            this.children.push(child);
            child.currentParent = this;
            return child;
        },
        insertBefore(child, sibling) {
            child.remove();
            const siblingIndex = this.children.indexOf(sibling);
            const index = siblingIndex >= 0 ? siblingIndex : this.children.length;
            this.children.splice(index, 0, child);
            child.currentParent = this;
            return child;
        }
    };
    let meeting = null;
    const element = {
        currentParent: null,
        removeCount: 0,
        get parentNode() {
            return this.currentParent;
        },
        get nextSibling() {
            const index = this.currentParent ? this.currentParent.children.indexOf(this) : -1;
            return index >= 0 ? this.currentParent.children[index + 1] || null : null;
        },
        get meeting() {
            return meeting;
        },
        set meeting(value) {
            if (value && options.interceptMeeting) {
                throw new Error('custom element rejected meeting');
            }
            meeting = value;
        },
        remove() {
            if (!this.currentParent) return;
            const index = this.currentParent.children.indexOf(this);
            if (index >= 0) this.currentParent.children.splice(index, 1);
            this.currentParent = null;
            this.removeCount += 1;
        }
    };
    parent.appendChild(element);
    element.removeCount = 0;
    return { element, parent };
}

test('RealtimeKit initialization failure removes the custom meeting element', async () => {
    const client = loadClient({
        async init() {
            throw new Error('init failed');
        }
    });
    const { element, parent } = createMeetingElement();

    await assert.rejects(client.join({ authToken: 'token', meetingElement: element }), /init failed/);

    assert.equal(element.removeCount, 1);
    assert.equal(parent.children.includes(element), false);
    assert.equal(element.meeting, null);
});

test('mounted initialization leaves camera capture disabled for the accepted provider UI', async () => {
    /** @type {any} */
    let initializationDefaults = null;
    const client = loadClient({
        async init(options) {
            initializationDefaults = options.defaults;
            return {
                self: {
                    async disableAudio() {},
                    async disableVideo() {},
                    async disableScreenShare() {}
                },
                async join() {},
                async leaveRoom() {}
            };
        }
    });
    const { element } = createMeetingElement();

    const joined = await client.join({
        authToken: 'token',
        meetingElement: element,
        policy: { micDefaultEnabled: true }
    });

    assert.equal(initializationDefaults.audio, true);
    assert.equal(initializationDefaults.video, false);
    await joined.leave();
});

test('custom element meeting interception disconnects media and removes the element', async () => {
    let disconnects = 0;
    const client = loadClient({
        async init() {
            return {
                async disconnect() {
                    disconnects += 1;
                }
            };
        }
    });
    const { element, parent } = createMeetingElement({ interceptMeeting: true });

    await assert.rejects(
        client.join({ authToken: 'token', meetingElement: element }),
        /custom element rejected meeting/
    );

    assert.equal(disconnects, 1);
    assert.equal(element.removeCount, 1);
    assert.equal(parent.children.includes(element), false);
});

test('leave is idempotent, removes the custom element, and permits reusing the same mount point', async () => {
    let leaves = 0;
    const client = loadClient({
        async init() {
            return {
                async join() {},
                async leaveRoom() {
                    leaves += 1;
                }
            };
        }
    });
    const { element, parent } = createMeetingElement();

    const first = await client.join({ authToken: 'first', meetingElement: element });
    await Promise.all([first.leave(), first.leave()]);

    assert.equal(leaves, 1);
    assert.equal(element.meeting, null);
    assert.equal(parent.children.includes(element), false);

    const second = await client.join({ authToken: 'second', meetingElement: element });
    assert.equal(parent.children.includes(element), true);
    await second.leave();

    assert.equal(leaves, 2);
    assert.equal(element.removeCount, 2);
    assert.equal(parent.children.includes(element), false);
});

test('cancelling a never-settling join releases local media and UI before a later join proceeds', async () => {
    const firstJoinStarted = deferred();
    const neverSettles = new Promise(() => {});
    const stoppedTracks = [];
    let initCalls = 0;
    let fullscreenExits = 0;
    /** @type {any} */
    let testDocument;
    const client = loadClient({
        async init() {
            initCalls += 1;
            if (initCalls === 1) {
                return {
                    self: {
                        audioTrack: { kind: 'audio', stop() { stoppedTracks.push('audio'); } },
                        videoTrack: { kind: 'video', stop() { stoppedTracks.push('video'); } },
                        screenShareTrack: { kind: 'video', stop() { stoppedTracks.push('screen'); } },
                        async disableAudio() {},
                        async disableVideo() {},
                        async disableScreenShare() {}
                    },
                    join() {
                        firstJoinStarted.resolve();
                        return neverSettles;
                    },
                    async leaveRoom() {}
                };
            }
            return {
                self: {
                    async disableAudio() {},
                    async disableVideo() {},
                    async disableScreenShare() {}
                },
                async join() {},
                async leaveRoom() {}
            };
        }
    }, (document) => {
        testDocument = document;
        document.exitFullscreen = async () => {
            fullscreenExits += 1;
            document.fullscreenElement = null;
        };
    });
    const { element, parent } = createMeetingElement();
    const controller = new AbortController();
    const firstJoin = client.join({
        authToken: 'first-token',
        meetingElement: element,
        signal: controller.signal
    });
    await firstJoinStarted.promise;
    // Model the provider UI entering fullscreen while meeting.join() is still pending.
    // Cancellation must remove that interception without waiting for join().
    testDocument.fullscreenElement = element;

    controller.abort();

    await assert.rejects(
        settleWithin(firstJoin, 500, 'cancelled join did not settle'),
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_CANCELLED'
    );
    assert.deepEqual(new Set(stoppedTracks), new Set(['audio', 'video', 'screen']));
    assert.equal(element.meeting, null);
    assert.equal(parent.children.length, 0);
    assert.equal(testDocument.fullscreenElement, null);

    const second = await client.join({ authToken: 'second-token', meetingElement: element });
    assert.equal(parent.children.includes(element), true);
    await second.leave();
    assert.equal(initCalls, 2);
    assert.equal(fullscreenExits, 1);
});

test('a mounted join that fulfills after cancellation is disconnected again without touching a reused mount', async () => {
    const staleJoinStarted = deferred();
    const staleJoinOperation = deferred();
    let initCalls = 0;
    let staleConnected = false;
    let staleLeaves = 0;
    let latestConnected = false;
    let latestLeaves = 0;
    const staleMeeting = {
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        join() {
            staleJoinStarted.resolve();
            return staleJoinOperation.promise.then(() => {
                staleConnected = true;
            });
        },
        async leaveRoom() {
            staleConnected = false;
            staleLeaves += 1;
        }
    };
    const latestMeeting = {
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        async join() {
            latestConnected = true;
        },
        async leaveRoom() {
            latestConnected = false;
            latestLeaves += 1;
        }
    };
    const client = loadClient({
        async init() {
            initCalls += 1;
            return initCalls === 1 ? staleMeeting : latestMeeting;
        }
    });
    const { element, parent } = createMeetingElement();
    const controller = new AbortController();
    const staleJoin = client.join({
        authToken: 'stale-token',
        meetingElement: element,
        signal: controller.signal
    });
    await staleJoinStarted.promise;

    controller.abort();
    await assert.rejects(
        staleJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_CANCELLED'
    );
    const latestJoin = await client.join({
        authToken: 'latest-token',
        meetingElement: element
    });
    assert.equal(staleLeaves, 1);
    assert.equal(element.meeting, latestMeeting);
    assert.equal(parent.children.includes(element), true);

    staleJoinOperation.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(staleConnected, false);
    assert.equal(staleLeaves, 2);
    assert.equal(latestConnected, true);
    assert.equal(latestLeaves, 0);
    assert.equal(element.meeting, latestMeeting);
    assert.equal(parent.children.includes(element), true);
    await latestJoin.leave();
});

test('late cancelled initialization cannot clear a newer meeting mounted on the same element', async () => {
    const firstInitStarted = deferred();
    const firstInitialization = deferred();
    let initCalls = 0;
    let staleLeaves = 0;
    const latestMeeting = {
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        async join() {},
        async leaveRoom() {}
    };
    const client = loadClient({
        init() {
            initCalls += 1;
            if (initCalls === 1) {
                firstInitStarted.resolve();
                return firstInitialization.promise;
            }
            return Promise.resolve(latestMeeting);
        }
    });
    const { element, parent } = createMeetingElement();
    const controller = new AbortController();
    const staleJoin = client.join({
        authToken: 'stale-token',
        meetingElement: element,
        signal: controller.signal
    });
    await firstInitStarted.promise;

    controller.abort();
    await assert.rejects(
        staleJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_CANCELLED'
    );

    const latestJoin = await client.join({
        authToken: 'latest-token',
        meetingElement: element
    });
    assert.equal(element.meeting, latestMeeting);
    assert.equal(parent.children.includes(element), true);

    firstInitialization.resolve({
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        async leaveRoom() {
            staleLeaves += 1;
        }
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(staleLeaves, 1);
    assert.equal(element.meeting, latestMeeting);
    assert.equal(parent.children.includes(element), true);
    await latestJoin.leave();
});

test('headless join failure disconnects the initialized meeting', async () => {
    let disconnects = 0;
    const client = loadClient({
        async init() {
            return {
                async join() {
                    throw new Error('headless join failed');
                },
                async disconnect() {
                    disconnects += 1;
                }
            };
        }
    });

    await assert.rejects(client.joinHeadless({ authToken: 'token' }), /headless join failed/);
    assert.equal(disconnects, 1);
});

test('a headless join that fulfills after cancellation is disconnected again without touching a newer join', async () => {
    const staleJoinStarted = deferred();
    const staleJoinOperation = deferred();
    let initCalls = 0;
    let staleConnected = false;
    let staleLeaves = 0;
    let latestConnected = false;
    let latestLeaves = 0;
    const staleMeeting = {
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        join() {
            staleJoinStarted.resolve();
            return staleJoinOperation.promise.then(() => {
                staleConnected = true;
            });
        },
        async leaveRoom() {
            staleConnected = false;
            staleLeaves += 1;
        }
    };
    const latestMeeting = {
        self: {
            async disableAudio() {},
            async disableVideo() {},
            async disableScreenShare() {}
        },
        async join() {
            latestConnected = true;
        },
        async leaveRoom() {
            latestConnected = false;
            latestLeaves += 1;
        }
    };
    const client = loadClient({
        async init() {
            initCalls += 1;
            return initCalls === 1 ? staleMeeting : latestMeeting;
        }
    });
    const controller = new AbortController();
    const staleJoin = client.joinHeadless({
        authToken: 'stale-token',
        signal: controller.signal
    });
    await staleJoinStarted.promise;

    controller.abort();
    await assert.rejects(
        staleJoin,
        (error) => (/** @type {any} */ (error)).code === 'VIDEO_JOIN_CANCELLED'
    );
    const latestJoin = await client.joinHeadless({ authToken: 'latest-token' });
    assert.equal(staleLeaves, 1);

    staleJoinOperation.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(staleConnected, false);
    assert.equal(staleLeaves, 2);
    assert.equal(latestConnected, true);
    assert.equal(latestLeaves, 0);
    await latestJoin.leave();
});

test('leave rejection still disables every local producer, stops tracks, exits fullscreen, and unmounts UI', async () => {
    const calls = [];
    const tracks = {
        audio: { kind: 'audio', stop() { calls.push('stop-audio'); } },
        video: { kind: 'video', stop() { calls.push('stop-video'); } },
        screenAudio: { kind: 'audio', stop() { calls.push('stop-screen-audio'); } },
        screenVideo: { kind: 'video', stop() { calls.push('stop-screen-video'); } }
    };
    const meeting = {
        self: {
            audioTrack: tracks.audio,
            videoTrack: tracks.video,
            screenShareTracks: {
                audio: tracks.screenAudio,
                video: tracks.screenVideo
            },
            async disableAudio() { calls.push('disable-audio'); },
            async disableVideo() { calls.push('disable-video'); },
            async disableScreenShare() {
                calls.push('disable-screen-share');
                throw new Error('screen share disable failed');
            }
        },
        async join() {},
        async leaveRoom() {
            calls.push('leave-room');
            throw new Error('provider leave failed');
        }
    };
    const { element, parent } = createMeetingElement();
    let fullscreenExits = 0;
    const client = loadClient({ async init() { return meeting; } }, (document) => {
        document.fullscreenElement = element;
        document.exitFullscreen = async () => {
            fullscreenExits += 1;
            document.fullscreenElement = null;
        };
    });

    const joined = await client.join({ authToken: 'token', meetingElement: element });
    await assert.rejects(joined.leave(), /provider leave failed/);

    assert.deepEqual(new Set(calls), new Set([
        'disable-audio',
        'disable-video',
        'disable-screen-share',
        'stop-audio',
        'stop-video',
        'stop-screen-audio',
        'stop-screen-video',
        'leave-room'
    ]));
    assert.equal(fullscreenExits, 1);
    assert.equal(element.meeting, null);
    assert.equal(parent.children.includes(element), false);
});

test('headless leave without a provider disconnect method still releases locally held media', async () => {
    let disables = 0;
    let stops = 0;
    const client = loadClient({
        async init() {
            return {
                self: {
                    audioTrack: { kind: 'audio', stop() { stops += 1; } },
                    videoTrack: { kind: 'video', stop() { stops += 1; } },
                    disableAudio() { disables += 1; },
                    disableVideo() { disables += 1; },
                    disableScreenShare() { disables += 1; }
                },
                async join() {}
            };
        }
    });

    const joined = await client.joinHeadless({ authToken: 'token' });
    disables = 0;
    await joined.leave();

    assert.equal(disables, 3);
    assert.equal(stops, 2);
});

test('provider disconnect falls back when the preferred leave method rejects', async () => {
    const attempts = [];
    const client = loadClient({
        async init() {
            return {
                async join() {},
                async leaveRoom() {
                    attempts.push('leaveRoom');
                    throw new Error('leaveRoom failed');
                },
                async disconnect() {
                    attempts.push('disconnect');
                }
            };
        }
    });
    const { element } = createMeetingElement();

    const joined = await client.join({ authToken: 'token', meetingElement: element });
    await joined.leave();

    assert.deepEqual(attempts, ['leaveRoom', 'disconnect']);
});

test('a hung provider teardown releases capture immediately and settles at its deadline', async () => {
    const slowProviderOperation = new Promise((resolve) => setTimeout(resolve, 50));
    let stops = 0;
    const client = loadClient({
        async init() {
            return {
                self: {
                    videoTrack: { kind: 'video', stop() { stops += 1; } },
                    disableAudio() { return slowProviderOperation; },
                    disableVideo() { return slowProviderOperation; },
                    disableScreenShare() { return slowProviderOperation; }
                },
                async join() {},
                leaveRoom() { return slowProviderOperation; }
            };
        }
    }, undefined, {
        setTimeout(callback) {
            Promise.resolve().then(callback);
            return /** @type {any} */ (1);
        },
        clearTimeout() {}
    });
    const { element, parent } = createMeetingElement();
    const joined = await client.join({ authToken: 'token', meetingElement: element });

    const outcome = await Promise.race([
        joined.leave().then(
            () => 'resolved',
            (error) => error.message
        ),
        new Promise((resolve) => setTimeout(() => resolve('still-pending'), 25))
    ]);

    assert.match(outcome, /teardown timed out/i);
    assert.equal(stops, 1);
    assert.equal(parent.children.length, 0);
});
