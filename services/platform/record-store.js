const fs = require('node:fs/promises');
const { requireCondition } = require('./common');

// Compatibility boundary for the existing room and account domain objects.
// Records commit individually with optimistic revisions; the database, not a
// rewritten file, is durable authority. Legacy JSON is imported exactly once.
function createRecordStore({ platform, kind, legacyStore, sanitize, logger }) {
    const table = kind === 'accounts' ? 'accounts' : 'room_records';
    let known = new Map();
    let timer = null;
    let pending = null;
    let tail = Promise.resolve();
    function snapshot(map) {
        return Array.from(map.values()).map(sanitize).filter(Boolean);
    }
    async function write(tx, entries) {
        const next = new Map();
        for (const entry of entries) {
            const id = entry.id;
            const json = JSON.stringify(entry);
            const prior = known.get(id);
            if (prior?.json === json) {
                next.set(id, prior);
                continue;
            }
            if (kind === 'accounts') {
                await tx.query(`INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)
                    ON CONFLICT(id) DO UPDATE SET display_name=$2`, [id, entry.displayName, entry.createdAt]);
            }
            let result;
            if (!prior) {
                result = kind === 'accounts'
                    ? await tx.query(`INSERT INTO halastudy.accounts(id,email,google_subject,payload) VALUES($1,$2,$3,$4) RETURNING revision`,
                        [id, entry.email, entry.googleSub || null, json])
                    : await tx.query('INSERT INTO halastudy.room_records(id,payload) VALUES($1,$2) RETURNING revision', [id, json]);
            } else {
                result = kind === 'accounts'
                    ? await tx.query(`UPDATE halastudy.accounts SET email=$2,google_subject=$3,payload=$4,revision=revision+1
                        WHERE id=$1 AND revision=$5 RETURNING revision`, [id, entry.email, entry.googleSub || null, json, prior.revision])
                    : await tx.query(`UPDATE halastudy.room_records SET payload=$2,revision=revision+1
                        WHERE id=$1 AND revision=$3 RETURNING revision`, [id, json, prior.revision]);
            }
            requireCondition(result.rows.length === 1, 'PERSISTENCE_CONFLICT', 409);
            next.set(id, { json, revision: result.rows[0].revision });
        }
        for (const [id, prior] of known) {
            if (next.has(id)) continue;
            if (kind === 'accounts') {
                const current = (await tx.query('SELECT revision FROM halastudy.accounts WHERE id=$1 FOR UPDATE', [id])).rows[0];
                requireCondition(current?.revision === prior.revision, 'PERSISTENCE_CONFLICT', 409);
                await platform.purgeUser(tx, id);
            } else {
                const result = await tx.query('DELETE FROM halastudy.room_records WHERE id=$1 AND revision=$2 RETURNING id', [id, prior.revision]);
                requireCondition(result.rows.length === 1, 'PERSISTENCE_CONFLICT', 409);
            }
        }
        return next;
    }
    async function hydrate() {
        await platform.ready;
        const marker = `legacy_import_${kind}`;
        await platform.db.transaction(async (tx) => {
            const imported = (await tx.query('SELECT value FROM halastudy.store_metadata WHERE key=$1', [marker])).rows.length;
            if (!imported) {
                const entries = kind === 'accounts' ? legacyStore.loadUsers({ strict: true }) : legacyStore.loadRooms({ strict: true });
                await write(tx, entries);
                await tx.query('INSERT INTO halastudy.store_metadata(key,value) VALUES($1,$2)', [marker, 'complete']);
            }
        });
        const records = [];
        for (;;) {
            const rows = (await platform.db.query(`SELECT id,payload,revision FROM halastudy.${table} ORDER BY id LIMIT 500 OFFSET $1`, [records.length])).rows;
            if (!rows.length) break;
            records.push(...rows);
        }
        known = new Map(records.map((row) => [row.id, { json: JSON.stringify(sanitize(row.payload)), revision: row.revision }]));
        return records.map((row) => sanitize(row.payload)).filter(Boolean);
    }
    function enqueue(entries) {
        tail = tail.catch(() => {}).then(async () => {
            await platform.ready;
            const next = await platform.db.transaction((tx) => write(tx, entries));
            known = next;
        });
        void tail.catch(() => logger.error({ event: `${kind}_persist_failed` }));
        return tail;
    }
    function scheduleSave(map) {
        pending = snapshot(map);
        clearTimeout(timer);
        timer = setTimeout(() => {
            const entries = pending;
            pending = null;
            timer = null;
            if (entries) void enqueue(entries);
        }, 250);
        return tail;
    }
    function flush(map) {
        if (map) pending = snapshot(map);
        clearTimeout(timer);
        timer = null;
        const entries = pending;
        pending = null;
        return entries ? enqueue(entries) : tail;
    }
    async function exportSnapshot(destination) {
        await flush();
        const records = (await platform.db.query(`SELECT payload FROM halastudy.${table} ORDER BY id`)).rows;
        await fs.writeFile(destination, JSON.stringify(records.map((row) => row.payload)), 'utf8');
    }
    return {
        filePath: legacyStore.filePath, isPlatform: true, hydrate, scheduleSave, flush,
        loadUsers: () => [], loadRooms: () => [], exportSnapshot
    };
}

module.exports = { createRecordStore };
