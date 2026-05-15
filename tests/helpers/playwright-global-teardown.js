const fs = require('node:fs');

const { delay } = require('./server-control');
const { SMOKE_ROOM_STATE_FILE, SMOKE_SERVER_INFO_FILE, resetStateFile } = require('./test-env');

async function stopProcess(pid) {
    if (!pid) return;

    try {
        process.kill(pid, 'SIGTERM');
    } catch (_error) {
        return;
    }

    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            process.kill(pid, 0);
            await delay(250);
        } catch (_error) {
            return;
        }
    }

    try {
        process.kill(pid, 'SIGKILL');
    } catch (_error) {}
}

module.exports = async () => {
    let pid = null;
    let fakeSfuPid = null;

    if (fs.existsSync(SMOKE_SERVER_INFO_FILE)) {
        try {
            const payload = JSON.parse(fs.readFileSync(SMOKE_SERVER_INFO_FILE, 'utf8'));
            pid = payload.pid || null;
            fakeSfuPid = payload.fakeSfuPid || null;
        } catch (_error) {}
    }

    await stopProcess(pid);
    await stopProcess(fakeSfuPid);
    resetStateFile(SMOKE_ROOM_STATE_FILE);
    resetStateFile(SMOKE_SERVER_INFO_FILE);
};
