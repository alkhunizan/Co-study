const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { version } = require('../../package.json');
const { validateDeploymentUrl, verifyDeployment } = require('../../scripts/deploy-verifier');

function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
}

async function startDeploymentFixture(overrides = {}) {
    const server = http.createServer((req, res) => {
        if (req.url === '/api/health') {
            sendJson(res, 200, {
                status: 'ok',
                mode: 'http',
                version: overrides.version || version
            }, overrides.healthHeaders);
            return;
        }
        if (req.url === '/api/ready') {
            const checks = overrides.readinessChecks || {
                roomStore: true,
                userStore: true,
                socket: true,
                config: true
            };
            sendJson(res, 200, { status: 'ready', checks });
            return;
        }
        if (req.url === '/api/metrics') {
            sendJson(res, 200, { status: 'ok', roomCount: 1, participantCount: 0, memoryRssMb: 32 });
            return;
        }
        if (req.url === '/api/runtime-config') {
            sendJson(res, 200, { videoProvider: 'realtimekit', videoPolicy: {}, googleAuthEnabled: false });
            return;
        }
        if (req.url === '/manifest.webmanifest') {
            sendJson(res, 200, { name: 'Halastudy', start_url: '/' }, {
                'Content-Type': 'application/manifest+json'
            });
            return;
        }
        if (req.url?.startsWith('/socket.io/?')) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('0{"sid":"fixture-sid","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000}');
            return;
        }
        res.writeHead(404);
        res.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        })
    };
}

test('deployment verification covers version, readiness, runtime config, static assets, and Socket.IO', async (t) => {
    const fixture = await startDeploymentFixture();
    t.after(fixture.close);

    const result = await verifyDeployment(fixture.baseUrl);
    assert.equal(result.version, version);
    assert.equal(result.videoProvider, 'realtimekit');
    assert.equal(result.socketTransport, 'polling');
});

test('deployment verification fails when any readiness check is false', async (t) => {
    const fixture = await startDeploymentFixture({
        readinessChecks: { roomStore: true, userStore: false, socket: true, config: true }
    });
    t.after(fixture.close);

    await assert.rejects(() => verifyDeployment(fixture.baseUrl), /Readiness checks failed: userStore/);
});

test('deployment verification rejects a stale build version', async (t) => {
    const fixture = await startDeploymentFixture({ version: '0.0.0-stale' });
    t.after(fixture.close);

    await assert.rejects(() => verifyDeployment(fixture.baseUrl), /Build version mismatch/);
});

test('deployment verification requires HSTS for the production TLS path', async (t) => {
    const fixture = await startDeploymentFixture();
    t.after(fixture.close);

    await assert.rejects(
        () => verifyDeployment(fixture.baseUrl, { requireHsts: true }),
        /HSTS header missing or too short/
    );
});

test('deployment verification accepts a one-year HSTS policy', async (t) => {
    const fixture = await startDeploymentFixture({
        healthHeaders: {
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
        }
    });
    t.after(fixture.close);

    const result = await verifyDeployment(fixture.baseUrl, { requireHsts: true });
    assert.equal(result.version, version);
});

test('deployment verification rejects cleartext non-loopback targets before making requests', () => {
    assert.throws(
        () => validateDeploymentUrl('http://deploy.example.com'),
        /Production deployment verification requires HTTPS/
    );
});
