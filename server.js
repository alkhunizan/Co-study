const http = require('node:http');
const { createCoStudyServer } = require('./co-study-server');

const appServer = createCoStudyServer({
    mode: 'http',
    createServer: (app) => http.createServer(app)
});

appServer.listen(({ config }) => {
    const displayHost = config.host.includes(':') ? `[${config.host}]` : config.host;
    console.log(`Co-Study backend listening on http://${displayHost}:${config.port}`);
});
