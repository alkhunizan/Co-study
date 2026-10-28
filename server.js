const http = require('node:http');
const { createCoStudyServer } = require('./co-study-server');

(async () => {
    const appServer = createCoStudyServer({
        mode: 'http',
        createServer: (app) => http.createServer(app)
    });
    await appServer.initialize();
    appServer.listen(({ config }) => {
        const displayHost = config.host.includes(':') ? `[${config.host}]` : config.host;
        console.log(`Co-Study backend listening on http://${displayHost}:${config.port}`);
    });
})().catch((error) => {
    console.error('Failed to initialize Co-Study:', error?.message || error);
    process.exitCode = 1;
});
