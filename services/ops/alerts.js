const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

/** @type {Record<string, [string, number, string]>} */
const RULES = {
    account_rollback_persist_failed: ['critical', 1, 'Inspect storage and restore durable account state.'],
    video_revocation_failed: ['critical', 1, 'Check video provider access and pending revocations.'],
    video_revocation_persist_failed: ['critical', 1, 'Restore write access to the media revocation journal.'],
    video_revocation_start_failed: ['critical', 1, 'Inspect the media journal and runtime ownership.'],
    database_lease_lost: ['critical', 1, 'Stop this runtime and recover exclusive database ownership.'],
    database_connection_failed: ['warning', 3, 'Inspect database connectivity and rejected transactions.'],
    storage_shutdown_failed: ['critical', 1, 'Inspect durable state after failed shutdown persistence.'],
    backup_failed: ['critical', 1, 'Check backup destination and run a verified backup.'],
    backup_stale: ['warning', 1, 'Run a backup and verify the backup schedule.'],
    authentication_rejected: ['warning', 20, 'Review sign-in rejection volume and abuse controls.'],
    socket_handler_failed: ['warning', 3, 'Inspect application errors and affected room operations.'],
    attendance_sweep_failed: ['warning', 3, 'Inspect database health and attendance updates.'],
    account_recovery_delivery_failed: ['warning', 1, 'Check recovery mail configuration and delivery.'],
    payment_reconciliation_failed: ['warning', 1, 'Inspect payment verification worker and database health.'],
    video_provider_request_failed: ['warning', 3, 'Inspect video provider status and credentials.']
};
const WINDOW_MS = 5 * 60000;
const COOLDOWN_MS = 15 * 60000;

function createOperationalAlerts({ file, env = process.env, fetchImpl = fetch, now = Date.now, start = Promise.resolve() }) {
    const alerts = new Map();
    const counters = new Map();
    let writing = Promise.resolve();
    let delivery = null;
    let storageHealthy = true;
    let started = false;
    let stopped = false;
    let lastWritten = null;
    function storageFailed() {
        if (storageHealthy) console.error(JSON.stringify({ level: 'error', event: 'ops_alert_journal_failed' }));
        storageHealthy = false;
    }
    const destination = env.OPS_ALERT_WEBHOOK_URL ? new URL(env.OPS_ALERT_WEBHOOK_URL) : null;
    if (destination && env.NODE_ENV === 'test' && !['127.0.0.1', 'localhost', '[::1]'].includes(destination.hostname)) {
        throw new Error('TEST_ALERTS_REQUIRE_LOOPBACK');
    }
    if (destination && (destination.username || destination.password || destination.hash
        || (destination.protocol !== 'https:' && !(env.NODE_ENV === 'test'
            && destination.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(destination.hostname))))) {
        throw new Error('OPS_ALERT_WEBHOOK_REQUIRES_HTTPS');
    }
    const ready = (async () => {
        await start;
        if (file) {
            let stored;
            try { stored = JSON.parse(await fs.readFile(file, 'utf8')); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (stored) {
                if (!Array.isArray(stored) || stored.length > Object.keys(RULES).length) throw new Error('ALERT_JOURNAL_INVALID');
                for (const item of stored) {
                    if (!RULES[item.event] || typeof item.id !== 'string') throw new Error('ALERT_JOURNAL_INVALID');
                    // Events captured while loading take precedence.
                    if (!alerts.has(item.event)) alerts.set(item.event, item);
                }
            }
        }
        started = true;
    })();
    void ready.catch(storageFailed);
    function persist() {
        const operation = writing.catch(() => {}).then(async () => {
            await ready;
            const json = JSON.stringify([...alerts.values()]);
            if (file && json !== lastWritten) {
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(`${file}.tmp`, json, { mode: 0o600 });
                await fs.rename(`${file}.tmp`, file);
                lastWritten = json;
            }
            storageHealthy = true;
        });
        writing = operation;
        return operation.catch((error) => { storageFailed(); throw error; });
    }
    function observe(entry) {
        if (entry.event === 'backup_completed') {
            for (const key of ['backup_failed', 'backup_stale']) {
                const alert = alerts.get(key);
                if (alert) { alert.resolvedAt = now(); alert.pending = false; }
            }
        }
        const rule = RULES[entry.event];
        if (!rule) return;
        const timestamp = now();
        const counter = counters.get(entry.event);
        const count = counter && timestamp - counter.since < WINDOW_MS ? counter.count + 1 : 1;
        counters.set(entry.event, { since: count === 1 ? timestamp : counter.since, count });
        if (count < rule[1]) return;
        const previous = alerts.get(entry.event);
        const alert = previous && !previous.resolvedAt ? previous : {
            id: crypto.randomUUID(), event: entry.event, severity: rule[0], action: rule[2],
            firstSeenAt: timestamp, lastSentAt: 0, attempts: 0, nextAttemptAt: 0
        };
        alert.lastSeenAt = timestamp;
        alert.count = count;
        if (!alert.lastSentAt || timestamp - alert.lastSentAt >= COOLDOWN_MS) alert.pending = true;
        alerts.set(entry.event, alert);
    }
    async function flush() {
        if (delivery) return delivery;
        delivery = (async () => {
            await persist();
            if (!destination) return;
            for (const alert of alerts.values()) {
                if (!alert.pending || alert.resolvedAt || now() < alert.nextAttemptAt) continue;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                try {
                    // Explicit allowlist: no raw logs, account ids, mail or secrets.
                    const response = await fetchImpl(destination.href, {
                        method: 'POST', redirect: 'error', signal: controller.signal,
                        headers: { 'Content-Type': 'application/json',
                            ...(env.OPS_ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.OPS_ALERT_WEBHOOK_TOKEN}` } : {}) },
                        body: JSON.stringify({ id: alert.id, event: alert.event, severity: alert.severity,
                            action: alert.action, count: alert.count, firstSeenAt: alert.firstSeenAt, lastSeenAt: alert.lastSeenAt })
                    });
                    await response.body?.cancel();
                    if (!response.ok) throw new Error('ALERT_DELIVERY_FAILED');
                    alert.pending = false;
                    alert.lastSentAt = now();
                    alert.attempts = 0;
                    alert.nextAttemptAt = 0;
                } catch {
                    alert.attempts++;
                    alert.nextAttemptAt = now() + Math.min(COOLDOWN_MS, 30000 * 2 ** Math.min(alert.attempts - 1, 5));
                } finally { clearTimeout(timeout); }
            }
            await persist();
        })().finally(() => { delivery = null; });
        return delivery;
    }
    const timer = setInterval(() => { if (!stopped) void flush().catch(() => {}); }, 5000);
    timer.unref();
    return {
        ready, observe, flush,
        status: () => ({ storageHealthy, started, deliveryConfigured: !!destination,
            pending: [...alerts.values()].filter((item) => item.pending && !item.resolvedAt).length }),
        list: () => [...alerts.values()].map((item) => ({ ...item })).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
        async close() {
            stopped = true;
            clearInterval(timer);
            // A running delivery may have persisted before the latest event.
            if (delivery) await delivery.catch(() => {});
            await flush();
        }
    };
}

module.exports = { createOperationalAlerts };
