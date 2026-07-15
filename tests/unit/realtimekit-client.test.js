const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REALTIMEKIT_CLIENT_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'video', 'realtimekit-client.js'),
    'utf8'
);

/** @param {{ init: (options: any) => Promise<any> }} RealtimeKitClient */
function loadClient(RealtimeKitClient) {
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
