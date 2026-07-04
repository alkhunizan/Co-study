// In-memory ring buffer of recent warn/error log entries, surfaced in the
// admin console. Entries arrive pre-redacted (logger sanitizes payloads
// before invoking onEntry), so this never holds secrets.
function createErrorBuffer({ capacity = 200 } = {}) {
    /** @type {any[]} */
    const entries = [];
    let head = 0;

    function push(entry) {
        if (!entry || typeof entry !== 'object') return;
        if (entries.length < capacity) {
            entries.push(entry);
        } else {
            entries[head] = entry;
            head = (head + 1) % capacity;
        }
    }

    /** Newest first. */
    function list() {
        if (entries.length < capacity) {
            return [...entries].reverse();
        }
        return [...entries.slice(head), ...entries.slice(0, head)].reverse();
    }

    return { push, list };
}

module.exports = {
    createErrorBuffer
};
