const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// A grant the provider keeps rejecting is retried on every tick but, after
// this many failures, is parked as "stalled": it stays in the journal and is
// still retried, yet no longer counts as pending work that blocks new video
// tokens in every room (A-02).
const STALL_ATTEMPTS = 5;

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
            // A corrupt journal must not keep video down until someone edits
            // the file by hand. Keep the bytes beside it for inspection and
            // start empty; the loss is logged as an incident (A-02).
            const quarantine = `${file}.corrupt-${Date.now()}`;
            await fs.rename(file, quarantine);
            logger.error({ event: 'video_revocation_journal_quarantined', quarantine });
            return;
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
                        row.attempts = (row.attempts || 0) + 1;
                        grants.set(row.id, row);
                        logger.error({ event: row.attempts === STALL_ATTEMPTS ? 'video_revocation_stalled' : 'video_revocation_failed',
                            roomId: row.roomId, attempts: row.attempts });
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
        status: () => {
            const rows = [...grants.values()];
            return {
                healthy,
                pending: rows.filter((row) => row.pending && (row.attempts || 0) < STALL_ATTEMPTS).length,
                stalled: rows.filter((row) => row.pending && (row.attempts || 0) >= STALL_ATTEMPTS).length,
                tracked: grants.size
            };
        },
        async close() { clearInterval(timer); await revokeWhere(() => true); }
    };
}

module.exports = { createVideoRevocations };
