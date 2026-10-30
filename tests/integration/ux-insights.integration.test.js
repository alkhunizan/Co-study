const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../../public/js/ux-insights.js'), 'utf8');
function load(storage = new Map()) {
    const context = { localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) } };
    vm.runInNewContext(source, context);
    return { api: context.HalaInsights, storage };
}
test('voluntary counters reject sensitive payloads, deduplicate transitions, expire and revoke', () => {
    const { api, storage } = load();
    assert.equal(api.record('entry', { action: 'create' }), false);
    assert.equal(storage.size, 0);
    assert.equal(api.consent(true), true);
    for (const key of ['name', 'roomCode', 'token', 'text', 'camera', 'audio', 'password', 'phone', 'payment']) {
        assert.equal(api.record('entry', { action: 'create', [key]: 'private-value' }), false);
    }
    assert.equal(api.record('__proto__', {}), false);
    assert.equal(api.record('entry', { action: 'unknown' }), false);
    assert.equal(api.record('join', { outcome: 'success', duration: 1234 }), false);
    assert.equal(api.record('join', { outcome: 'success', duration: 'under5s' }, 'join-transition'), true);
    assert.equal(api.record('join', { outcome: 'success', duration: 'under5s' }, 'join-transition'), false);
    for (let i = 0; i < 1010; i++) api.record('entry', { action: 'create' }, `entry-${i}`);
    const persisted = [...storage.values()].join('');
    assert.doesNotMatch(persisted, /private-value|join-transition|entry-\d/);
    assert.equal(api.summary()['entry:create'], 1000);
    const state = JSON.parse(storage.get('halastudyUx:v1'));
    state.expires = Date.now() - 1;
    storage.set('halastudyUx:v1', JSON.stringify(state));
    assert.equal(api.enabled(), false);
    assert.equal(storage.size, 0);
    api.consent(true); api.consent(false);
    assert.equal(api.enabled(), false);
    assert.equal(storage.size, 0);
});
test('blocked or corrupt browser storage cannot interrupt study', () => {
    const context = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } };
    vm.runInNewContext(source, context);
    assert.equal(context.HalaInsights.consent(true), false);
    assert.equal(context.HalaInsights.record('entry', { action: 'create' }), false);
    assert.equal(load(new Map([['halastudyUx:v1', '{broken']])).api.enabled(), false);
});
