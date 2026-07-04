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
            TRUST_PROXY: '1',
            // Admin console under test (precomputed hash of "smoke-admin-password").
            ADMIN_PATH: '/ops-smoke-test-1234',
            ADMIN_PASSWORD_HASH: '5368261dff0e47c096a7f53dd6b12e59:3e6d92f21a9166c11cb9a46d04ac8043e67428d5b6c776128ac3c3d88db36bd6489cd46455dbcd57bc997587da6b36750cb995ae720b59a97f296dad71635e29'
        }
    });

    fs.writeFileSync(SMOKE_SERVER_INFO_FILE, JSON.stringify({
        pid: server.pid,
        fakeSfuPid: server.fakeSfuPid,
        roomStateFile: server.roomStateFile
    }), 'utf8');
};
