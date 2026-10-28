const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAdminAuditLog } = require('../../services/admin/audit-log');

function setup(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-admin-audit-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const logged = [];
    const logger = {
        warn: (entry) => logged.push(entry),
        error: (entry) => logged.push(entry)
    };
    return { filePath: path.join(dir, 'audit.jsonl'), logger, logged };
}

function readLines(filePath) {
    return fs.readFileSync(filePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('entries are listed newest first and written one JSON line each, in order', async (t) => {
    const { filePath, logger } = setup(t);
    let clock = 1000;
    const audit = createAdminAuditLog({ filePath, logger, now: () => clock++ });

    audit.record({ action: 'login', ip: '127.0.0.1' });
    audit.record({ action: 'user_ban', target: { type: 'user', id: 'u1', label: 'Sara' }, reason: 'spam' });
    audit.record({ action: 'backup_run', details: { files: 2 } });
    await audit.flush();

    const listed = audit.list();
    assert.equal(listed.total, 3);
    assert.deepEqual(listed.entries.map((entry) => entry.action), ['backup_run', 'user_ban', 'login']);
    assert.deepEqual(listed.entries[1].target, { type: 'user', id: 'u1', label: 'Sara' });
    assert.equal(listed.entries[1].reason, 'spam');
    assert.deepEqual(listed.entries[0].details, { files: 2 });
    assert.equal(listed.entries[2].reason, '');
    assert.deepEqual(readLines(filePath).map((entry) => entry.action), ['login', 'user_ban', 'backup_run']);
});

test('filtering and paging apply to the newest-first list', async (t) => {
    const { filePath, logger } = setup(t);
    const audit = createAdminAuditLog({ filePath, logger });
    for (let index = 0; index < 5; index += 1) audit.record({ action: index % 2 ? 'user_ban' : 'login', details: { index } });

    const bans = audit.list({ action: 'user_ban' });
    assert.equal(bans.total, 2);
    assert.deepEqual(bans.entries.map((entry) => entry.details.index), [3, 1]);
    const secondPage = audit.list({ offset: 2, limit: 2 });
    assert.equal(secondPage.total, 5);
    assert.deepEqual(secondPage.entries.map((entry) => entry.details.index), [2, 1]);
});

test('a new log reloads the recent tail from disk and skips a torn last line', async (t) => {
    const { filePath, logger } = setup(t);
    const first = createAdminAuditLog({ filePath, logger, memoryLimit: 2 });
    first.record({ action: 'login' });
    first.record({ action: 'user_ban' });
    first.record({ action: 'user_unban' });
    await first.flush();
    fs.appendFileSync(filePath, '{"action":"room_cl');

    const reloaded = createAdminAuditLog({ filePath, logger, memoryLimit: 2 });
    assert.deepEqual(reloaded.list().entries.map((entry) => entry.action), ['user_unban', 'user_ban']);
});

test('memory keeps only the newest entries while the file keeps all of them', async (t) => {
    const { filePath, logger } = setup(t);
    const audit = createAdminAuditLog({ filePath, logger, memoryLimit: 2 });
    for (const action of ['a', 'b', 'c']) audit.record({ action });
    await audit.flush();

    assert.deepEqual(audit.list().entries.map((entry) => entry.action), ['c', 'b']);
    assert.equal(readLines(filePath).length, 3);
});

test('the file rotates to one older generation once it would exceed the cap', async (t) => {
    const { filePath, logger } = setup(t);
    const audit = createAdminAuditLog({ filePath, logger, maxFileBytes: 400 });
    for (let index = 0; index < 6; index += 1) audit.record({ action: 'login', details: { index } });
    await audit.flush();

    assert.ok(fs.statSync(filePath).size <= 400);
    const rotated = readLines(`${filePath}.1`);
    const current = readLines(filePath);
    const indexes = [...rotated, ...current].map((entry) => entry.details.index);
    // Only one older generation is kept: order holds and the newest entry survives.
    assert.deepEqual(indexes, indexes.slice().sort((a, b) => a - b));
    assert.equal(indexes.at(-1), 5);
});

test('a failed write is logged, keeps the entry in memory, and does not block later writes', async (t) => {
    const { filePath, logger, logged } = setup(t);
    // A directory where the file should be makes the first append fail.
    fs.mkdirSync(filePath);
    const audit = createAdminAuditLog({ filePath, logger });

    audit.record({ action: 'login' });
    await audit.flush();
    assert.ok(logged.some((entry) => entry.event === 'admin_audit_write_failed' && entry.action === 'login'));
    assert.equal(audit.list().total, 1);

    fs.rmSync(filePath, { recursive: true });
    audit.record({ action: 'logout' });
    await audit.flush();
    assert.deepEqual(readLines(filePath).map((entry) => entry.action), ['logout']);
});

test('an entry recorded after a torn last line starts on a new line and survives the next reload', async (t) => {
    const { filePath, logger } = setup(t);
    const first = createAdminAuditLog({ filePath, logger });
    first.record({ action: 'login' });
    await first.flush();
    fs.appendFileSync(filePath, '{"action":"room_cl');

    const afterCrash = createAdminAuditLog({ filePath, logger });
    afterCrash.record({ action: 'user_ban' });
    afterCrash.record({ action: 'user_unban' });
    await afterCrash.flush();

    const reloaded = createAdminAuditLog({ filePath, logger });
    assert.deepEqual(reloaded.list().entries.map((entry) => entry.action), ['user_unban', 'user_ban', 'login']);
});

test('a reload right after rotation still shows the recent entries from the rotated file', async (t) => {
    const { filePath, logger } = setup(t);
    const audit = createAdminAuditLog({ filePath, logger, maxFileBytes: 400 });
    for (let index = 0; index < 4; index += 1) audit.record({ action: 'login', details: { index } });
    await audit.flush();
    assert.ok(fs.existsSync(`${filePath}.1`));

    const onDisk = [...readLines(`${filePath}.1`), ...readLines(filePath)].map((entry) => entry.details.index);
    const reloaded = createAdminAuditLog({ filePath, logger, maxFileBytes: 400 });
    assert.deepEqual(
        reloaded.list().entries.map((entry) => entry.details.index),
        onDisk.slice().reverse()
    );
    assert.ok(onDisk.length > readLines(filePath).length);

    const capped = createAdminAuditLog({ filePath, logger, memoryLimit: 1 });
    assert.deepEqual(capped.list().entries.map((entry) => entry.details.index), [3]);
});
