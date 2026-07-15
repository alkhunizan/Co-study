const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REALTIMEKIT_CLIENT_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'video', 'realtimekit-client.js'),
    'utf8'
);

/**
 * @param {{ init: (options: any) => Promise<any> }} RealtimeKitClient
 * @param {(document: any) => void} [configureDocument]
 */
function loadClient(RealtimeKitClient, configureDocument) {
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
            setTimeout,
            clearTimeout
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
