const path = require('node:path');
const fs = require('node:fs');

const {
    ensureDir,
    readRoomStateArray,
    resolveBackupDir,
    resolveRoomStateFile,
    timestampLabel,
    writeJsonAtomic
} = require('./room-state-utils');

function main() {
    const backupFileArg = process.argv[2];
    if (!backupFileArg) {
        throw new Error('Usage: npm run restore:rooms -- <backupFile>');
    }

    const backupFile = path.resolve(backupFileArg);
    const roomStateFile = resolveRoomStateFile(process.env);
    const backupDir = resolveBackupDir(process.env);
    const snapshot = readRoomStateArray(backupFile);

    ensureDir(backupDir);
    ensureDir(path.dirname(roomStateFile));

    let safetyBackupFile = null;
    if (fs.existsSync(roomStateFile)) {
        const safetyName = `${path.basename(roomStateFile, path.extname(roomStateFile))}.pre-restore.${timestampLabel()}.json`;
        safetyBackupFile = path.join(backupDir, safetyName);
        fs.copyFileSync(roomStateFile, safetyBackupFile);
    }

    writeJsonAtomic(roomStateFile, snapshot);

    console.log(`Room state restored from: ${backupFile}`);
    console.log(`Target state file: ${roomStateFile}`);
    if (safetyBackupFile) {
        console.log(`Pre-restore safety backup: ${safetyBackupFile}`);
    }
    console.log(`Entries: ${snapshot.length}`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
