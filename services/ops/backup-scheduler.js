// Automated on-disk backups of the rooms + users state files, with per-label
// retention. Reuses the same atomic-write helpers as the manual operator
// scripts (scripts/backup-rooms.js), so restore tooling works on both.
const fs = require('node:fs');
const path = require('node:path');
const { ensureDir, readRoomStateArray, timestampLabel, writeJsonAtomic } = require('../../scripts/room-state-utils');

/** @param {{ intervalMinutes?: number, retentionCount?: number, backupDir: string, targets?: Array<{label: string, filePath: string}>, logger?: any }} options */
function createBackupScheduler({ intervalMinutes = 0, retentionCount = 48, backupDir, targets = [], logger = console } = /** @type {any} */ ({})) {
    let timer = null;
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

    function runBackup() {
        ensureDir(backupDir);
        const label = timestampLabel();
        const written = [];
        let entryCount = 0;
        try {
            for (const target of targets) {
                if (!fs.existsSync(target.filePath)) continue;
                const entries = readRoomStateArray(target.filePath);
                const backupFile = path.join(backupDir, `${target.label}.${label}.backup.json`);
                writeJsonAtomic(backupFile, entries);
                pruneOldBackups(target.label);
                written.push(backupFile);
                entryCount += entries.length;
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

    function start() {
        if (timer || !intervalMinutes) return;
        timer = setInterval(() => {
            try {
                runBackup();
            } catch (_error) {
                // Already logged; keep the schedule alive.
            }
        }, intervalMinutes * 60 * 1000);
        timer.unref();
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    return { start, stop, runBackup, status };
}

module.exports = {
    createBackupScheduler
};
