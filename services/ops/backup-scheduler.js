// Automated on-disk backups of the rooms + users state files, with per-label
// retention. Reuses the same atomic-write helpers as the manual operator
// scripts (scripts/backup-rooms.js), so restore tooling works on both.
const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readRoomStateArray, timestampLabel, writeJsonAtomic } = require('../../scripts/room-state-utils');

/** @param {{ intervalMinutes?: number, retentionCount?: number, backupDir: string, targets?: Array<{label: string, filePath: string}>, extraBackup?: any, logger?: any }} options */
function createBackupScheduler({ intervalMinutes = 0, retentionCount = 48, backupDir, targets = [], extraBackup = null, logger = console } = /** @type {any} */ ({})) {
    let timer = null;
    let running = null;
    let stopped = false;
    const status = { lastRunAt: null, lastError: null };

    function pruneOldBackups(label) {
        const prefix = `${label}.`;
        const suffix = '.backup.json';
        const stale = fs.readdirSync(backupDir)
            .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
            .sort()
            .slice(0, -retentionCount);
        for (const name of stale) {
            fs.rmSync(path.join(backupDir, name), { force: true });
        }
    }

    async function writeBackup() {
        const label = timestampLabel();
        const written = [];
        let entryCount = 0;
        try {
            ensureDir(backupDir);
            for (const target of targets) {
                if (!fs.existsSync(target.filePath)) continue;
                const entries = readRoomStateArray(target.filePath);
                const backupFile = path.join(backupDir, `${target.label}.${label}.backup.json`);
                writeJsonAtomic(backupFile, entries);
                pruneOldBackups(target.label);
                written.push(backupFile);
                entryCount += entries.length;
            }
            if (extraBackup) {
                const result = await extraBackup(path.join(backupDir, `platform.${label}.backup.json`));
                written.push(result.filePath);
                entryCount += result.entries;
                pruneOldBackups('platform');
            }
            status.lastRunAt = Date.now();
            status.lastError = null;
            logger.info({ event: 'backup_completed', files: written.length, entries: entryCount });
            return { files: written, entries: entryCount };
        } catch (error) {
            status.lastError = error.message;
            logger.error({ event: 'backup_failed', message: error.message });
            throw error;
        }
    }

    function runBackup() {
        if (stopped) return Promise.reject(new Error('BACKUP_SCHEDULER_STOPPED'));
        if (!running) running = writeBackup().finally(() => { running = null; });
        return running;
    }

    function start() {
        stopped = false;
        if (timer || !intervalMinutes) return;
        timer = setInterval(() => {
            void runBackup().catch(() => {});
        }, intervalMinutes * 60 * 1000);
        timer.unref();
    }

    async function stop() {
        stopped = true;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        // The active backup may still emit a failure or use the database.
        if (running) await running.catch(() => {});
    }

    return { start, stop, runBackup, status };
}

module.exports = {
    createBackupScheduler
};
