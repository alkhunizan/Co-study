const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

/** @param {{url?: string, directory?: string, migrate?: boolean, onFailure?: (event: string) => void}} options */
async function createDatabase({ url = '', directory, migrate = false, onFailure = () => {} } = {}) {
    let driver;
    let query;
    let transaction;
    let close;
    let healthy = true;
    if (url) {
        const { Pool } = require('pg');
        driver = new Pool({
            connectionString: url, max: 5, connectionTimeoutMillis: 10000,
            statement_timeout: migrate ? 120000 : 15000,
            query_timeout: migrate ? 125000 : 20000,
            lock_timeout: 5000, idle_in_transaction_session_timeout: 30000
        });
        // Idle clients can emit errors outside query promises. The pool removes
        // them; observing the event prevents an unhandled EventEmitter crash.
        driver.on('error', () => onFailure('database_connection_failed'));
        // The current application keeps account and socket state in one runtime.
        // Refuse a second runtime until that cache is replaced by shared services.
        let lease;
        let leaseLost = false;
        try {
            lease = await driver.connect();
            lease.on('error', () => {
                leaseLost = true;
                healthy = false;
                onFailure('database_lease_lost');
            });
            const locked = await lease.query('SELECT pg_try_advisory_lock(190221, 1) AS acquired');
            if (!locked.rows[0].acquired) throw new Error('PLATFORM_ALREADY_RUNNING');
        } catch (error) {
            lease?.release(true);
            await driver.end();
            throw error;
        }
        const checkLease = () => { if (leaseLost) throw new Error('PLATFORM_LEASE_LOST'); };
        query = async (sql, values = []) => {
            checkLease();
            const result = await driver.query(sql, values);
            checkLease();
            return result;
        };
        transaction = async (operation) => {
            checkLease();
            const client = await driver.connect();
            let discard = false;
            let connectionError = null;
            const observe = (error) => { connectionError = error; discard = true; onFailure('database_connection_failed'); };
            client.on('error', observe);
            try {
                checkLease();
                await client.query('BEGIN');
                const result = await operation(client);
                if (connectionError) throw connectionError;
                checkLease();
                await client.query('COMMIT');
                return result;
            } catch (error) {
                try { await client.query('ROLLBACK'); } catch { discard = true; }
                throw error;
            } finally {
                client.removeListener('error', observe);
                client.release(discard);
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
            for (const name of ['001-platform.sql', '002-digetpay.sql', '003-payment-review.sql', '004-study-tools.sql']) {
                const migration = await fs.readFile(path.join(__dirname, '../../db/migrations', name), 'utf8');
                if (url) await transaction((tx) => tx.query(migration));
                else await driver.exec(migration);
            }
        }
        const version = await query('SELECT version FROM halastudy.migrations WHERE version = 4');
        if (!version.rows.length) throw new Error('PLATFORM_MIGRATION_REQUIRED');
    } catch (error) {
        await close();
        throw error;
    }
    return { query, transaction, close, isHealthy: () => healthy };
}

module.exports = { createDatabase };
