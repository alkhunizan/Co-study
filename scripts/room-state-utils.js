const fs = require('fs');
const path = require('path');

function resolveRoomStateFile(env = process.env) {
    return path.resolve(env.ROOM_STATE_FILE || path.join(__dirname, '..', 'data', 'rooms.json'));
}

function resolveBackupDir(env = process.env) {
    return path.resolve(env.ROOM_STATE_BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups'));
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function timestampLabel(date = new Date()) {
    const parts = [
        date.getUTCFullYear(),
        `${date.getUTCMonth() + 1}`.padStart(2, '0'),
        `${date.getUTCDate()}`.padStart(2, '0'),
        `${date.getUTCHours()}`.padStart(2, '0'),
        `${date.getUTCMinutes()}`.padStart(2, '0'),
        `${date.getUTCSeconds()}`.padStart(2, '0')
    ];
    return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}Z`;
}

function readRoomStateArray(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Room state file not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
        throw new Error(`Room state file is empty: ${filePath}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Room state file is not valid JSON: ${filePath} (${error.message})`);
    }

    if (!Array.isArray(parsed)) {
        throw new Error(`Room state file must contain a JSON array: ${filePath}`);
    }

    return parsed;
}

function writeJsonAtomic(filePath, payload) {
    ensureDir(path.dirname(filePath));
    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tempFile, filePath);
}

module.exports = {
    ensureDir,
    readRoomStateArray,
    resolveBackupDir,
    resolveRoomStateFile,
    timestampLabel,
    writeJsonAtomic
};
