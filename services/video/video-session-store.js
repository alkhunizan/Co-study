const fsPromises = require('node:fs/promises');

const { createDebouncedAtomicJsonStore } = require('../persistence/debounced-atomic-json-store');

const EMPTY_STATE = Object.freeze({ schemaVersion: 1, sessions: [] });

function validateState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Video session persistence state is malformed.');
    }
    if (value.schemaVersion !== 1 || !Array.isArray(value.sessions)) {
        throw new Error('Video session persistence state is malformed.');
    }
    return value;
}

function serializeState(value) {
    return `${JSON.stringify(validateState(value), null, 2)}\n`;
}

function createVideoSessionStore(options = {}) {
    const filePath = options.filePath;
    const fsImpl = options.fsImpl || fsPromises;
    if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath is required.');
    const atomicStore = createDebouncedAtomicJsonStore({
        filePath,
        debounceMs: 0,
        fsImpl,
        logger: options.logger || console
    });
    let initialized = false;

    async function initialize() {
        let raw = '';
        try {
            raw = await fsImpl.readFile(atomicStore.filePath, 'utf8');
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        const state = raw.trim() ? validateState(JSON.parse(raw)) : { ...EMPTY_STATE, sessions: [] };
        atomicStore.setBaseline(serializeState(state));
        initialized = true;
        return state;
    }

    function flush(state) {
        if (!initialized) return Promise.reject(new Error('Video session store is not initialized.'));
        return atomicStore.flush(state, serializeState);
    }

    return {
        filePath: atomicStore.filePath,
        initialize,
        flush
    };
}

module.exports = {
    createVideoSessionStore
};
