const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const { startServer, delay } = require('../helpers/server-control');

function postCompressed(baseUrl, body) {
    return new Promise((resolve, reject) => {
        const request = http.request(new URL('/api/auth/login', baseUrl), {
            method: 'POST', headers: {
                'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': body.length
            }
        }, (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
            response.on('error', reject);
        });
        request.on('error', reject);
        request.setTimeout(3000, () => request.destroy(new Error('Compressed request timed out')));
        request.end(body);
    });
}

test('compressed request trailing bytes cannot crash the server', { timeout: 15000 }, async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    assert.equal((await server.request('/api/health')).status, 200);
    const valid = gzipSync('{}');
    assert.equal(await postCompressed(server.baseUrl, valid), 401);
    const trailing = Buffer.concat([valid, Buffer.from([0]), Buffer.alloc(64 * 1024, 0x58)]);
    assert.equal(await postCompressed(server.baseUrl, trailing), 401);
    await delay(150);
    assert.equal((await server.request('/api/health')).status, 200);
    assert.equal(await postCompressed(server.baseUrl, valid), 401);
});
