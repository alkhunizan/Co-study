const http = require('node:http');
const { createCoStudyServer } = require('./co-study-server');

(async () => {
    const appServer = createCoStudyServer({
        mode: 'http',
        createServer: (app) => http.createServer(app)
    });
    await appServer.initialize();
    appServer.listen(({ config }) => {
        console.log(`Co-Study backend listening on http://127.0.0.1:${config.port}`);
    });
})().catch((error) => {
    console.error('Failed to initialize Co-Study:', error?.message || error);
    process.exitCode = 1;
});
