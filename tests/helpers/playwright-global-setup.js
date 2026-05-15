const fs = require('node:fs');

const { startServer } = require('./server-control');
const { resetStateFile, SMOKE_PORT, SMOKE_ROOM_STATE_FILE, SMOKE_SERVER_INFO_FILE } = require('./test-env');

module.exports = async () => {
    resetStateFile(SMOKE_ROOM_STATE_FILE);
    resetStateFile(SMOKE_SERVER_INFO_FILE);

    const server = await startServer({
        port: SMOKE_PORT,
        roomStateFile: SMOKE_ROOM_STATE_FILE,
        withFakeSfu: true,
        env: {
            TRUST_PROXY: '1'
        }
    });

    fs.writeFileSync(SMOKE_SERVER_INFO_FILE, JSON.stringify({
        pid: server.pid,
        fakeSfuPid: server.fakeSfuPid,
        roomStateFile: server.roomStateFile
    }), 'utf8');
};
