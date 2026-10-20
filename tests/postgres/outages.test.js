const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Client } = require('pg');
const { createDatabase } = require('../../services/platform/database');
const { backupDatabase, restoreDatabase } = require('../../services/platform/maintenance');
const { startServer } = require('../helpers/server-control');
const { signupUser } = require('../helpers/auth-helpers');
const { connectSocket, emitAck, closeSocket } = require('../helpers/socket-client');

const url = process.env.HALASTUDY_TEST_DATABASE_URL;
if (!url) throw new Error('Use scripts/test-postgres.ps1 or the isolated PostgreSQL CI job.');
const target = new URL(url);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || !/^\/halastudy_hardening_test$/.test(target.pathname)) {
    throw new Error('Refusing non-loopback or non-test database');
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connectControl() {
    // WSL loopback forwarding can become ready just after pg_ctl succeeds.
    for (let attempt = 0; attempt < 50; attempt++) {
        const client = new Client({ connectionString: url, connectionTimeoutMillis: 1000 });
        try { await client.connect(); return client; }
        catch (error) {
            await client.end();
            if (error.code !== 'ECONNREFUSED' || attempt === 49) throw error;
            await pause(200);
        }
    }
}

test('real PostgreSQL migration, lock timeout, rollback, lease loss, backup and restore', { timeout: 90000 }, async (t) => {
    const control = await connectControl();
    t.after(() => control.end());
    let db = await createDatabase({ url, migrate: true });
    t.after(() => db?.close());
    // Migration connections intentionally have a longer deadline. Reopen using
    // the exact normal-runtime policy before exercising operational timeouts.
    await db.close();
    db = await createDatabase({ url });
    await assert.rejects(createDatabase({ url }), /PLATFORM_ALREADY_RUNNING/);
    await db.query("INSERT INTO halastudy.users(id,display_name,created_at) VALUES('outage-user','Original',1)");

    await control.query('BEGIN');
    await control.query("UPDATE halastudy.users SET display_name='Locked' WHERE id='outage-user'");
    const started = Date.now();
    await assert.rejects(db.transaction((tx) => tx.query("UPDATE halastudy.users SET display_name='Rejected' WHERE id='outage-user'")),
        (error) => /** @type {any} */ (error).code === '55P03');
    assert.ok(Date.now() - started >= 4500 && Date.now() - started < 15000);
    await control.query('ROLLBACK');
    assert.equal((await db.query("SELECT display_name FROM halastudy.users WHERE id='outage-user'")).rows[0].display_name, 'Original');

    await assert.rejects(db.transaction(async (tx) => {
        await tx.query("UPDATE halastudy.users SET display_name='Rolled back' WHERE id='outage-user'");
        throw new Error('injected application failure');
    }), /injected application failure/);
    assert.equal((await db.query("SELECT display_name FROM halastudy.users WHERE id='outage-user'")).rows[0].display_name, 'Original');

    // A network/backend failure while a borrowed client is between queries
    // must reject the transaction without crashing the application.
    await assert.rejects(db.transaction(async (tx) => {
        const pid = (await tx.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await tx.query("UPDATE halastudy.users SET display_name='Lost connection' WHERE id='outage-user'");
        await control.query('SELECT pg_terminate_backend($1)', [pid]);
        await pause(100);
    }));
    assert.equal((await db.query("SELECT display_name FROM halastudy.users WHERE id='outage-user'")).rows[0].display_name, 'Original');

    // Real statement deadline, not a mocked driver response.
    await assert.rejects(db.query('SELECT pg_sleep(25)'), (error) => /** @type {any} */ (error).code === '57014');
    assert.equal((await db.query('SELECT 1 AS ok')).rows[0].ok, 1);

    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-pg-restore-'));
    const backup = path.join(folder, 'platform.json');
    await backupDatabase(db, backup);
    const snapshot = JSON.parse(await fs.readFile(backup, 'utf8'));
    await assert.rejects(restoreDatabase(db, snapshot), /RESTORE_REQUIRES_EMPTY_DATABASE/);
    await control.query('CREATE DATABASE halastudy_hardening_restore');
    const restoreUrl = new URL(url);
    restoreUrl.pathname = '/halastudy_hardening_restore';
    const restoreDb = await createDatabase({ url: restoreUrl.href, migrate: true });
    try {
        await restoreDatabase(restoreDb, snapshot);
        assert.equal((await restoreDb.query("SELECT display_name FROM halastudy.users WHERE id='outage-user'")).rows[0].display_name, 'Original');
    } finally { await restoreDb.close(); }

    const lease = (await control.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=190221 AND objid=1")).rows[0].pid;
    await assert.rejects(db.transaction(async (tx) => {
        await tx.query("UPDATE halastudy.users SET display_name='Lost lease' WHERE id='outage-user'");
        await control.query('SELECT pg_terminate_backend($1)', [lease]);
        await pause(100);
    }), /PLATFORM_LEASE_LOST/);
    await assert.rejects(async () => db.query('SELECT 1'), /PLATFORM_LEASE_LOST/);
    await db.close();
    db = await createDatabase({ url });
    assert.equal((await db.query("SELECT display_name FROM halastudy.users WHERE id='outage-user'")).rows[0].display_name, 'Original');
    await db.close();
    db = null;
    const app = await startServer({ env: { PLATFORM_ENABLED: 'true', PLATFORM_DATABASE_URL: url, VIDEO_PROVIDER: 'mesh' } });
    t.after(() => app.stop());
    const owner = await signupUser(app);
    const socket = await connectSocket(app.baseUrl, { clientId: 'pg-outage-owner', extraHeaders: { Cookie: owner.cookie } });
    t.after(() => closeSocket(socket));
    const appLease = (await control.query("SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=190221 AND objid=1 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].pid;
    await control.query('SELECT pg_terminate_backend($1)', [appLease]);
    await pause(100);
    assert.equal((await app.request('/api/ready')).status, 503);
    assert.equal((await app.request('/api/health')).status, 200);
    assert.equal((await app.request('/api/me/profile', { method: 'PATCH', headers: { Cookie: owner.cookie }, body: { displayName: 'Rejected' } })).status, 503);
    assert.equal((await emitAck(socket, 'create-room', { roomName: 'Rejected room' })).errorCode, 'SERVICE_UNAVAILABLE');
    let persistedAlerts = [];
    for (let attempt = 0; attempt < 70; attempt++) {
        persistedAlerts = JSON.parse(await fs.readFile(`${app.userStateFile}.alerts.json`, 'utf8').catch(() => '[]'));
        if (persistedAlerts.some((item) => item.event === 'database_lease_lost')) break;
        await pause(100);
    }
    assert.ok(persistedAlerts.some((item) => item.event === 'database_lease_lost'));
});
