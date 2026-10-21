const fs = require('node:fs/promises');
const path = require('node:path');
const { hash, requireCondition } = require('./common');

const V2_TABLES = [
    'users', 'accounts', 'room_records', 'store_metadata', 'mfa', 'organizations',
    'organization_members', 'role_assignments', 'cohorts', 'cohort_members', 'invitations',
    'rooms', 'room_hosts', 'scheduled_sessions', 'attendance', 'subscriptions', 'checkout_sessions',
    'focus_sessions', 'xp_ledger', 'achievements', 'cases', 'audit_events', 'outbox', 'digetpay_orders'
];
const TABLES = [...V2_TABLES, 'study_projects', 'study_tasks', 'study_focus_links', 'study_distractions',
    'study_routines', 'study_preferences', 'study_reflections', 'study_bookmarks', 'study_rsvps', 'study_resources'];

async function snapshotDatabase(db) {
    return db.transaction(async (tx) => {
        await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const tables = {};
        for (const table of TABLES) tables[table] = (await tx.query(`SELECT * FROM halastudy.${table}`)).rows;
        return { format: 'halastudy-platform-v3', createdAt: new Date().toISOString(), checksum: hash(JSON.stringify(tables)), tables };
    });
}

async function backupDatabase(db, destination) {
    const snapshot = await snapshotDatabase(db);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(`${destination}.tmp`, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(`${destination}.tmp`, destination);
    return { filePath: destination, entries: Object.values(snapshot.tables).reduce((sum, rows) => sum + rows.length, 0) };
}

async function restoreDatabase(db, snapshot) {
    requireCondition(['halastudy-platform-v1', 'halastudy-platform-v2', 'halastudy-platform-v3'].includes(snapshot?.format) && snapshot.tables
        && snapshot.checksum === hash(JSON.stringify(snapshot.tables)), 'BACKUP_INVALID');
    const sourceTables = snapshot.format === 'halastudy-platform-v1' ? V2_TABLES.filter((name) => name !== 'digetpay_orders')
        : snapshot.format === 'halastudy-platform-v2' ? V2_TABLES : TABLES;
    requireCondition(Object.keys(snapshot.tables).length === sourceTables.length
        && sourceTables.every((table) => Array.isArray(snapshot.tables[table])), 'BACKUP_TABLES_INVALID');
    await db.transaction(async (tx) => {
        for (const table of TABLES) {
            requireCondition(!(await tx.query(`SELECT 1 FROM halastudy.${table} LIMIT 1`)).rows.length, 'RESTORE_REQUIRES_EMPTY_DATABASE', 409);
        }
        for (const table of TABLES) {
            for (const original of snapshot.tables[table] || []) {
                const row = structuredClone(original);
                if (table === 'accounts') row.payload.tokenEpoch = Number(row.payload.tokenEpoch || 1) + 1;
                const columns = Object.keys(row);
                requireCondition(columns.every((column) => /^[a-z][a-z0-9_]*$/.test(column)), 'BACKUP_COLUMNS_INVALID');
                const placeholders = columns.map((_column, index) => `$${index + 1}`).join(',');
                const values = columns.map((column) => typeof row[column] === 'object' && row[column] !== null ? JSON.stringify(row[column]) : row[column]);
                await tx.query(`INSERT INTO halastudy.${table}(${columns.map((column) => `"${column}"`).join(',')}) VALUES(${placeholders})`, values);
            }
        }
    });
}

module.exports = { backupDatabase, restoreDatabase };
