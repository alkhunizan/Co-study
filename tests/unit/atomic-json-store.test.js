const assert = require('node:assert/strict');
const test = require('node:test');

const { createDebouncedAtomicJsonStore } = require('../../services/persistence/debounced-atomic-json-store');

function createMemoryFs({ failFirstRename = false } = {}) {
    const calls = { mkdir: 0, writeFile: 0, rename: 0, rm: 0 };
    return {
        calls,
        impl: {
            async mkdir() { calls.mkdir += 1; },
            async writeFile() { calls.writeFile += 1; },
            async rename() {
                calls.rename += 1;
                if (failFirstRename && calls.rename === 1) throw new Error('injected rename failure');
            },
            async rm() { calls.rm += 1; }
        }
    };
}

test('debounced persistence does not serialize snapshots until the debounce fires or flushes', async () => {
    const memoryFs = createMemoryFs();
    const store = createDebouncedAtomicJsonStore({
        filePath: 'C:\\state\\users.json',
        debounceMs: 60_000,
        fsImpl: memoryFs.impl,
        logger: { warn() {} }
    });
    let serializeCalls = 0;
    const source = { version: 1 };

    store.schedule(source, (value) => {
        serializeCalls += 1;
        return JSON.stringify(value);
    });
    source.version = 2;

    assert.equal(serializeCalls, 0);
    await store.flush();
    assert.equal(serializeCalls, 1);
    assert.equal(memoryFs.calls.writeFile, 1);
});

test('a failed atomic replacement rejects its flush without poisoning a later write', async () => {
    const memoryFs = createMemoryFs({ failFirstRename: true });
    const store = createDebouncedAtomicJsonStore({
        filePath: 'C:\\state\\users.json',
        fsImpl: memoryFs.impl,
        logger: { warn() {} }
    });

    await assert.rejects(
        store.flush({ version: 1 }, JSON.stringify),
        /injected rename failure/
    );
    await store.flush({ version: 2 }, JSON.stringify);

    assert.equal(memoryFs.calls.rename, 2);
    assert.equal(memoryFs.calls.rm, 1);
});
