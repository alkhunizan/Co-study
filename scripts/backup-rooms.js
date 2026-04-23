const path = require('path');
const fs = require('fs');

const {
    ensureDir,
    readRoomStateArray,
    resolveBackupDir,
    resolveRoomStateFile,
    timestampLabel,
    writeJsonAtomic
} = require('./room-state-utils');

function main() {
    const roomStateFile = resolveRoomStateFile(process.env);
    const backupDir = resolveBackupDir(process.env);
    const snapshot = readRoomStateArray(roomStateFile);
    const fileStem = path.basename(roomStateFile, path.extname(roomStateFile));
    const backupFile = path.join(backupDir, `${fileStem}.${timestampLabel()}.backup.json`);

    ensureDir(backupDir);
    writeJsonAtomic(backupFile, snapshot);

    const size = fs.statSync(backupFile).size;
    console.log(`Room state backup created: ${backupFile}`);
    console.log(`Entries: ${snapshot.length}`);
    console.log(`Bytes: ${size}`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
