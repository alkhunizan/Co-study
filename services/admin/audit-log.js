// Append-only audit trail of admin console actions. Each entry is one JSON
// line so the file survives restarts and can be read with ordinary tools; the
// newest entries are also kept in memory for the console. Writes go through a
// single promise chain so concurrent actions never interleave lines, and the
// file is capped by rotating it to `<file>.1` (one generation is kept).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AUDIT_MEMORY_LIMIT = 1000;
const AUDIT_FILE_MAX_BYTES = 5 * 1024 * 1024;

function readFileText(filePath, logger) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            logger.warn({ event: 'admin_audit_load_failed', error: error?.message });
        }
        return '';
    }
}

function parseEntries(text) {
    const entries = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            const entry = JSON.parse(line);
            if (entry && typeof entry === 'object' && typeof entry.action === 'string') entries.push(entry);
        } catch (_error) {
            // A torn final line from a crash is skipped rather than failing startup.
        }
    }
    return entries;
}

// The rotated generation is read first so a restart right after rotation
// still shows the recent history it holds.
function readRecentEntries(filePath, limit, logger) {
    const current = readFileText(filePath, logger);
    const entries = [...parseEntries(readFileText(`${filePath}.1`, logger)), ...parseEntries(current)];
    return {
        entries: entries.slice(-limit),
        // A crash can leave a partial last line; the next append must start
        // on a fresh line or it would be glued onto the fragment and lost.
        tailIsTorn: current.length > 0 && !current.endsWith('\n')
    };
}

/**
 * @param {{
 *   filePath: string,
 *   logger: any,
 *   now?: () => number,
 *   memoryLimit?: number,
 *   maxFileBytes?: number
 * }} options
 */
function createAdminAuditLog({
    filePath,
    logger,
    now = () => Date.now(),
    memoryLimit = AUDIT_MEMORY_LIMIT,
    maxFileBytes = AUDIT_FILE_MAX_BYTES
}) {
    const loaded = readRecentEntries(filePath, memoryLimit, logger);
    const entries = loaded.entries;
    let tailIsTorn = loaded.tailIsTorn;
    let writeChain = Promise.resolve();

    async function append(line) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        let size = 0;
        try {
            size = (await fs.promises.stat(filePath)).size;
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
        if (size > 0 && size + Buffer.byteLength(line) > maxFileBytes) {
            await fs.promises.rename(filePath, `${filePath}.1`);
            tailIsTorn = false;
        }
        await fs.promises.appendFile(filePath, tailIsTorn ? `\n${line}` : line, { encoding: 'utf8', mode: 0o600 });
        tailIsTorn = false;
    }

    /**
     * Records one action. The entry is visible in memory immediately; the
     * disk write is queued and a failure is logged, never thrown, because the
     * action it describes has already happened.
     */
    function record({ action, target = null, reason = '', ip = null, details = null }) {
        const entry = {
            id: crypto.randomUUID(),
            at: now(),
            action,
            target,
            reason: reason || '',
            ip: ip || null,
            ...(details ? { details } : {})
        };
        entries.push(entry);
        if (entries.length > memoryLimit) entries.shift();
        const line = `${JSON.stringify(entry)}\n`;
        writeChain = writeChain
            .then(() => append(line))
            .catch((error) => {
                logger.error({ event: 'admin_audit_write_failed', action, error: error?.message });
            });
        return entry;
    }

    /** Newest first, optionally filtered by action. */
    function list({ offset = 0, limit = 50, action = '' } = {}) {
        const newestFirst = [...entries].reverse();
        const filtered = action ? newestFirst.filter((entry) => entry.action === action) : newestFirst;
        return { total: filtered.length, entries: filtered.slice(offset, offset + limit) };
    }

    /** Resolves once every queued write has been attempted. */
    function flush() {
        return writeChain;
    }

    return { record, list, flush };
}

module.exports = {
    createAdminAuditLog
};
