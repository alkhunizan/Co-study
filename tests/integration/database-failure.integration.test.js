const assert = require('node:assert/strict');
const test = require('node:test');
const pg = require('pg');
const { createDatabase } = require('../../services/platform/database');

test('managed database bounds work and discards clients when rollback fails without retrying commit', async (t) => {
    const queries = [];
    const releases = [];
    /** @type {any} */
    let options;
    let rollbackFails = false;
    const original = new Error('commit response lost');
    const lease = { on() {}, release() {}, query: async () => ({ rows: [{ acquired: true }] }) };
    const client = {
        on() {}, removeListener() {},
        release: (discard) => releases.push(discard),
        query: async (sql) => {
            queries.push(sql);
            if (sql === 'COMMIT') throw original;
            if (sql === 'ROLLBACK' && rollbackFails) throw new Error('connection lost');
            return { rows: [] };
        }
    };
    let connects = 0;
    // biome-ignore lint/complexity/useArrowFunction: pg calls Pool as a constructor.
    t.mock.method(pg, 'Pool', function (config) {
        options = config;
        return {
            on() {}, end: async () => {},
            connect: async () => ++connects === 1 ? lease : client,
            query: async () => ({ rows: [{ version: 1 }] })
        };
    });
    const db = await createDatabase({ url: 'postgres://unused.invalid/test' });
    t.after(() => db.close());
    assert.equal(options.statement_timeout, 15000);
    assert.equal(options.lock_timeout, 5000);
    assert.ok(options.query_timeout > options.statement_timeout);
    assert.equal(options.idle_in_transaction_session_timeout, 30000);
    await assert.rejects(db.transaction(async (tx) => tx.query('SELECT 1')), (error) => error === original);
    assert.deepEqual(releases, [false]);
    rollbackFails = true;
    await assert.rejects(db.transaction(async (tx) => tx.query('SELECT 2')), (error) => error === original);
    assert.deepEqual(releases, [false, true]);
    assert.equal(queries.filter((sql) => sql === 'COMMIT').length, 2, 'uncertain commits are never automatically replayed');
});
