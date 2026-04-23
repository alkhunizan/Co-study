const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const SMOKE_PORT = Number(process.env.CO_STUDY_SMOKE_PORT || 3460);
const SMOKE_ROOM_STATE_FILE = process.env.CO_STUDY_SMOKE_ROOM_STATE_FILE
    || path.join(os.tmpdir(), `co-study-smoke-${SMOKE_PORT}.rooms.json`);
const SMOKE_SERVER_INFO_FILE = path.join(os.tmpdir(), `co-study-smoke-server-${SMOKE_PORT}.json`);

function resetStateFile(filePath) {
    fs.rmSync(filePath, { force: true });
    fs.rmSync(`${filePath}.tmp`, { force: true });
}

function makeTempStateFile(prefix = 'co-study-test') {
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    return path.join(os.tmpdir(), `${prefix}-${nonce}.rooms.json`);
}

module.exports = {
    repoRoot,
    SMOKE_PORT,
    SMOKE_ROOM_STATE_FILE,
    SMOKE_SERVER_INFO_FILE,
    resetStateFile,
    makeTempStateFile
};
