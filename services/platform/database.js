const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

/** @param {{url?: string, directory?: string, migrate?: boolean}} options */
async function createDatabase({ url = '', directory, migrate = false } = {}) {
    let driver;
    let query;
    let transaction;
    let close;
    if (url) {
        const { Pool } = require('pg');
        driver = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000 });
        // The current application keeps account and socket state in one runtime.
        // Refuse a second runtime until that cache is replaced by shared services.
        const lease = await driver.connect();
        const locked = await lease.query('SELECT pg_try_advisory_lock(190221, 1) AS acquired');
        if (!locked.rows[0].acquired) {
            lease.release();
            await driver.end();
            throw new Error('PLATFORM_ALREADY_RUNNING');
        }
        let leaseLost = false;
        lease.on('error', () => { leaseLost = true; });
        const checkLease = () => { if (leaseLost) throw new Error('PLATFORM_LEASE_LOST'); };
        query = (sql, values = []) => { checkLease(); return driver.query(sql, values); };
        transaction = async (operation) => {
            checkLease();
            const client = await driver.connect();
            try {
                await client.query('BEGIN');
                const result = await operation(client);
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        };
        close = async () => { lease.release(true); await driver.end(); };
    } else {
        const { PGlite } = require('@electric-sql/pglite');
        let lockPath = null;
        if (directory && directory !== 'memory://') {
            await fs.mkdir(directory, { recursive: true });
            lockPath = path.join(directory, '.halastudy-runtime.lock');
            const lock = await fs.open(lockPath, 'wx').catch(() => { throw new Error('PLATFORM_LOCKED: stop the other runtime; inspect the lock before recovery'); });
            await lock.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() }));
            await lock.close();
        }
        try {
            driver = new PGlite(directory || 'memory://');
            await driver.waitReady;
        } catch (error) {
            if (lockPath) await fs.unlink(lockPath);
            throw error;
        }
        query = (sql, values = []) => driver.query(sql, values);
        transaction = (operation) => driver.transaction(operation);
        close = async () => {
            await driver.close();
            if (lockPath) await fs.unlink(lockPath);
        };
    }
    try {
        if (!url || migrate) {
            const migration = await fs.readFile(path.join(__dirname, '../../db/migrations/001-platform.sql'), 'utf8');
            if (url) await transaction((tx) => tx.query(migration));
            else await driver.exec(migration);
        }
        const version = await query('SELECT version FROM halastudy.migrations WHERE version = 1');
        if (!version.rows.length) throw new Error('PLATFORM_MIGRATION_REQUIRED');
    } catch (error) {
        await close();
        throw error;
    }
    return { query, transaction, close };
}

module.exports = { createDatabase };
