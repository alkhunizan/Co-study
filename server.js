const http = require('node:http');
const { createCoStudyServer } = require('./co-study-server');

const appServer = createCoStudyServer({
    mode: 'http',
    createServer: (app) => http.createServer(app)
});

appServer.listen(({ config }) => {
    console.log(`Co-Study backend listening on http://127.0.0.1:${config.port}`);
});
