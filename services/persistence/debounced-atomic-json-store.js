const fsPromises = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_DEBOUNCE_MS = 250;

function createDebouncedAtomicJsonStore(options = {}) {
    const {
        filePath,
        debounceMs = DEFAULT_DEBOUNCE_MS,
        fsImpl = fsPromises,
        logger = console
    } = options;
    if (typeof filePath !== 'string' || !filePath) throw new TypeError('filePath is required.');
    if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new TypeError('debounceMs must be non-negative.');

    const resolvedFilePath = path.resolve(filePath);
    let baseline = null;
    let queuedSource;
    let queuedSerializer;
    let hasQueuedSource = false;
    let saveTimer = null;
    let sequence = 0;
    let queueTail = Promise.resolve();
    let lastAttempt = Promise.resolve();

    function warn(error) {
        if (logger && typeof logger.warn === 'function') {
            logger.warn(`Failed to persist state to ${resolvedFilePath}.`, error);
        }
    }

    async function writeSnapshot(json) {
        if (json === baseline) return;
        await fsImpl.mkdir(path.dirname(resolvedFilePath), { recursive: true });
        sequence += 1;
        const tempFilePath = `${resolvedFilePath}.${process.pid}.${sequence}.tmp`;
        try {
            await fsImpl.writeFile(tempFilePath, json, 'utf8');
            await fsImpl.rename(tempFilePath, resolvedFilePath);
            baseline = json;
        } catch (error) {
            if (typeof fsImpl.rm === 'function') {
                try {
                    await fsImpl.rm(tempFilePath, { force: true });
                } catch (_cleanupError) {}
            }
            throw error;
        }
    }

    function enqueue(json) {
        const attempt = queueTail.then(() => writeSnapshot(json));
        queueTail = attempt.catch(() => {});
        lastAttempt = attempt;
        void attempt.catch(warn);
        return attempt;
    }

    function captureQueuedSnapshot() {
        if (!hasQueuedSource) return null;
        const source = queuedSource;
        const serialize = queuedSerializer;
        queuedSource = undefined;
        queuedSerializer = undefined;
        hasQueuedSource = false;
        if (typeof serialize !== 'function') throw new TypeError('A snapshot serializer is required.');
        return serialize(source);
    }

    function schedule(source, serialize) {
        if (typeof serialize !== 'function') throw new TypeError('A snapshot serializer is required.');
        queuedSource = source;
        queuedSerializer = serialize;
        hasQueuedSource = true;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try {
                const json = captureQueuedSnapshot();
                if (json !== null) void enqueue(json);
            } catch (error) {
                lastAttempt = Promise.reject(error);
                void lastAttempt.catch(warn);
            }
        }, debounceMs);
        saveTimer.unref?.();
        return lastAttempt;
    }

    function flush(...args) {
        const [source, serialize] = args;
        if (args.length > 0) {
            if (typeof serialize !== 'function') throw new TypeError('A snapshot serializer is required.');
            queuedSource = source;
            queuedSerializer = serialize;
            hasQueuedSource = true;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        let json;
        try {
            json = captureQueuedSnapshot();
        } catch (error) {
            return Promise.reject(error);
        }
        return json === null ? lastAttempt : enqueue(json);
    }

    function setBaseline(json) {
        baseline = typeof json === 'string' ? json : null;
    }

    return {
        filePath: resolvedFilePath,
        schedule,
        flush,
        setBaseline
    };
}

module.exports = {
    createDebouncedAtomicJsonStore
};
