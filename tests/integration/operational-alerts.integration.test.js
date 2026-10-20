const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const test = require('node:test');
const { createOperationalAlerts } = require('../../services/ops/alerts');
const { createBackupScheduler } = require('../../services/ops/backup-scheduler');
const { createLogger } = require('../../services/logging/logger');
const { createVideoRevocations } = require('../../services/video/revocations');

test('shutdown waits for the in-flight backup before flushing its failure alert', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-backup-shutdown-'));
    const file = path.join(directory, 'alerts.json');
    const alerts = createOperationalAlerts({ file, env: {} });
    let failBackup = (_error) => {};
    const pendingBackup = new Promise((_resolve, reject) => { failBackup = reject; });
    const backup = createBackupScheduler({
        backupDir: directory, extraBackup: () => pendingBackup,
        logger: { error: alerts.observe, info: alerts.observe }
    });
    const active = backup.runBackup().catch(() => {});
    let completed = false;
    const shutdown = backup.stop().then(async () => { await alerts.close(); completed = true; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(completed, false);
    await assert.rejects(backup.runBackup(), /BACKUP_SCHEDULER_STOPPED/);
    failBackup(new Error('synthetic backup failure'));
    await active;
    await shutdown;
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8'))[0].event, 'backup_failed');
});

test('final alert flush retains delayed media cleanup failures and rejected owners leave journals untouched', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-alert-shutdown-'));
    const file = path.join(directory, 'alerts.json');
    const alerts = createOperationalAlerts({ file, env: {} });
    const media = createVideoRevocations({
        file: path.join(directory, 'media.json'),
        provider: { async revokeParticipant() {
            await new Promise((resolve) => setTimeout(resolve, 30));
            throw new Error('synthetic unavailable provider');
        } },
        logger: { error: alerts.observe }
    });
    await media.ready;
    await media.track({ meetingId: 'meeting', participantId: 'participant', roomId: 'room', socketId: 'socket' });
    await media.close();
    await alerts.close();
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8'))[0].event, 'video_revocation_failed');
    const original = await fs.readFile(file, 'utf8');
    const rejected = createOperationalAlerts({ file, env: {}, start: Promise.reject(new Error('ownership rejected')) });
    await assert.rejects(rejected.close(), /ownership rejected/);
    assert.equal(await fs.readFile(file, 'utf8'), original);
});

test('alerts persist, retry local delivery after restart, suppress duplicates and exclude secrets', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-alerts-'));
    const file = path.join(directory, 'alerts.json');
    let timestamp = 100000;
    let fail = true;
    const requests = [];
    const receiver = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push(JSON.parse(body));
        res.writeHead(fail ? 503 : 204).end();
    });
    await new Promise((resolve) => receiver.listen(0, '127.0.0.1', () => resolve(undefined)));
    t.after(() => new Promise((resolve) => receiver.close(resolve)));
    const env = { NODE_ENV: 'test', OPS_ALERT_WEBHOOK_URL: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (receiver.address()).port}` };
    let alerts = createOperationalAlerts({ file, env, now: () => timestamp });
    t.after(() => alerts.close());
    alerts.observe({ event: 'backup_failed', email: 'private@example.invalid', password: 'never-send', message: 'secret provider response' });
    await alerts.flush();
    assert.equal(requests.length, 1);
    assert.equal(alerts.status().pending, 1);
    const id = requests[0].id;
    assert.deepEqual(Object.keys(requests[0]).sort(), ['action', 'count', 'event', 'firstSeenAt', 'id', 'lastSeenAt', 'severity']);
    await alerts.close();
    alerts = createOperationalAlerts({ file, env, now: () => timestamp });
    timestamp += 31000;
    fail = false;
    await alerts.flush();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].id, id, 'retry uses stable incident id');
    assert.equal(alerts.status().pending, 0);
    alerts.observe({ event: 'backup_failed' });
    await alerts.flush();
    assert.equal(requests.length, 2, 'cooldown suppresses duplicates');
    for (let i = 0; i < 19; i++) alerts.observe({ event: 'authentication_rejected' });
    assert.equal(alerts.list().length, 1);
    alerts.observe({ event: 'authentication_rejected' });
    await alerts.flush();
    assert.equal(requests.length, 3);
    alerts.observe({ event: 'backup_completed' });
    await alerts.flush();
    assert.ok(alerts.list().find((item) => item.event === 'backup_failed').resolvedAt);
    const persisted = await fs.readFile(file, 'utf8');
    assert.ok(!/private@example|never-send|secret provider/.test(persisted));
});

test('backup directory errors become alerts and nested log secrets are redacted', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'halastudy-backup-error-'));
    const blocked = path.join(directory, 'file');
    await fs.writeFile(blocked, 'not a directory');
    const alerts = createOperationalAlerts({ file: null, env: {} });
    t.after(() => alerts.close());
    const entries = [];
    t.mock.method(console, 'error', () => {});
    t.mock.method(console, 'warn', () => {});
    const logger = createLogger({}, { onEntry: (entry) => entries.push(entry), onEvent: alerts.observe });
    const backup = createBackupScheduler({ backupDir: path.join(blocked, 'backup'), logger });
    await assert.rejects(backup.runBackup());
    assert.ok(backup.status.lastError);
    assert.equal(alerts.list()[0].event, 'backup_failed');
    logger.warn({ event: 'test', secret: { value: 'hidden' }, details: [{ authToken: 'hidden', ok: true }] });
    assert.equal(entries[1].secret, '[redacted]');
    assert.equal(entries[1].details[0].authToken, '[redacted]');
    assert.equal(entries[1].details[0].ok, true);
    assert.throws(() => createOperationalAlerts({ file: null, env: {
        NODE_ENV: 'production', OPS_ALERT_WEBHOOK_URL: 'http://example.invalid'
    } }), /HTTPS/);
    assert.throws(() => createOperationalAlerts({ file: null, env: {
        NODE_ENV: 'test', OPS_ALERT_WEBHOOK_URL: 'https://example.invalid'
    } }), /LOOPBACK/);
});
