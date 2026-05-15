const https = require('node:https');
const os = require('node:os');
const selfsigned = require('selfsigned');
const { createCoStudyServer } = require('./co-study-server');

function buildSelfSignedCertificate() {
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    return selfsigned.generate(attrs, {
        algorithm: 'sha256',
        // @ts-expect-error selfsigned v5 accepts `days` at runtime; types lag
        days: 365,
        keySize: 2048,
        extensions: [
            { name: 'basicConstraints', cA: false },
            { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
            { name: 'extKeyUsage', serverAuth: true },
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },
                    { type: 7, ip: '127.0.0.1' }
                ]
            }
        ]
    });
}

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            if (entry && entry.family === 'IPv4' && !entry.internal) {
                return entry.address;
            }
        }
    }
    return '127.0.0.1';
}

(async () => {
    console.log('Generating self-signed certificate for local HTTPS...');
    const cert = await buildSelfSignedCertificate();

    const appServer = createCoStudyServer({
        mode: 'https',
        createServer: (app) => https.createServer({ key: cert.private, cert: cert.cert }, app)
    });

    appServer.listen(({ config }) => {
        const localIP = getLocalIPv4();
        console.log(`Co-Study local HTTPS listening on https://localhost:${config.port}`);
        console.log(`LAN: https://${localIP}:${config.port}`);
        console.log('This entrypoint is for local secure-context testing only. Production should run server.js behind Nginx TLS.');
    });
})().catch((err) => {
    console.error('Failed to start HTTPS server:', err);
    process.exit(1);
});
