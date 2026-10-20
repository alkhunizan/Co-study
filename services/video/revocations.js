const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Store identifiers, never bearer tokens. Every grant is recorded before delivery.
// After restart no old socket owns a grant, so all persisted grants are revoked.
function createVideoRevocations({ file, provider, logger, start = Promise.resolve() }) {
    const grants = new Map();
    let writes = Promise.resolve();
    let draining = null;
    let healthy = true;
    function persist() {
        const operation = writes.catch(() => {}).then(async () => {
            if (file) {
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(`${file}.tmp`, JSON.stringify([...grants.values()]), { mode: 0o600 });
                await fs.rename(`${file}.tmp`, file);
            }
            healthy = true;
        });
        writes = operation;
        return operation.catch((error) => {
            healthy = false;
            logger.error({ event: 'video_revocation_persist_failed' });
            throw error;
        });
    }
    const ready = (async () => {
        await start;
        if (!file) return;
        let rows;
        try { rows = JSON.parse(await fs.readFile(file, 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return; throw error; }
        if (!Array.isArray(rows) || rows.some((row) => !row.id || !row.meetingId || !row.participantId)) {
            throw new Error('VIDEO_REVOCATION_JOURNAL_INVALID');
        }
        for (const row of rows) grants.set(row.id, { ...row, pending: true });
        await persist();
    })();
    void ready.catch(() => { healthy = false; logger.error({ event: 'video_revocation_start_failed' }); });
    async function drain() {
        if (draining) return draining;
        draining = (async () => {
            await ready;
            await persist();
            // Bounded concurrency; failed entries remain durable for the next tick.
            const pending = [...grants.values()].filter((row) => row.pending).slice(0, 20);
            for (let offset = 0; offset < pending.length; offset += 4) {
                await Promise.all(pending.slice(offset, offset + 4).map(async (row) => {
                    try {
                        if (row.participantId === '*') {
                            const result = await provider.closeRoomMeeting(row);
                            if (!result.ok) throw new Error('VIDEO_CLOSE_FAILED');
                        } else await provider.revokeParticipant(row);
                        grants.delete(row.id);
                    } catch {
                        // Move failed work behind other grants so a prolonged
                        // provider failure cannot starve later revocations.
                        grants.delete(row.id);
                        grants.set(row.id, row);
                        logger.error({ event: 'video_revocation_failed', roomId: row.roomId });
                    }
                }));
            }
            await persist();
        })().finally(() => { draining = null; });
        return draining;
    }
    async function track({ meetingId, participantId, roomId, socketId }) {
        await ready;
        if (grants.size >= 10000) throw new Error('VIDEO_REVOCATION_CAPACITY');
        const id = `${meetingId}:${participantId === '*' ? randomUUID() : participantId}`;
        grants.set(id, { id, meetingId, participantId, roomId, socketId, pending: false });
        await persist();
        return id;
    }
    function revokeWhere(predicate) {
        for (const row of grants.values()) if (predicate(row)) row.pending = true;
        return drain();
    }
    const timer = setInterval(() => { void drain().catch(() => {}); }, 30000);
    timer.unref();
    return {
        ready, track, drain, revokeWhere,
        async forget(id) { grants.delete(id); await persist(); },
        status: () => ({ healthy, pending: [...grants.values()].filter((row) => row.pending).length, tracked: grants.size }),
        async close() { clearInterval(timer); await revokeWhere(() => true); }
    };
}

module.exports = { createVideoRevocations };
