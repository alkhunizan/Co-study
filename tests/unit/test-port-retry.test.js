const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');

const { launchOnFreePort } = require('../helpers/server-control');

function listen(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(() => resolve(undefined)));
}

async function occupiedPort(t) {
    const holder = await listen(0);
    t.after(() => close(holder));
    return /** @type {import('net').AddressInfo} */ (holder.address()).port;
}

test('a port taken between picking and binding is retried with a fresh port', async (t) => {
    const busy = await occupiedPort(t);
    const picks = [busy, 0];
    const tried = [];
    const server = await launchOnFreePort(undefined, async (port) => {
        tried.push(port);
        return listen(port);
    }, async () => picks.shift());
    t.after(() => close(server));
    assert.equal(tried[0], busy);
    assert.equal(tried.length, 2);
});

test('a caller-chosen port is never retried', async (t) => {
    const busy = await occupiedPort(t);
    let attempts = 0;
    await assert.rejects(
        launchOnFreePort(busy, async (port) => { attempts += 1; return listen(port); }),
        /EADDRINUSE/
    );
    assert.equal(attempts, 1);
});

test('failures other than a port collision are not retried', async () => {
    let attempts = 0;
    await assert.rejects(
        launchOnFreePort(undefined, async () => {
            attempts += 1;
            throw new Error('Server exited before becoming ready (code=1): SESSION_SECRET missing');
        }, async () => 40000),
        /SESSION_SECRET missing/
    );
    assert.equal(attempts, 1);
});

test('repeated collisions give up after three attempts with the last error', async (t) => {
    const busy = await occupiedPort(t);
    let attempts = 0;
    await assert.rejects(
        launchOnFreePort(undefined, async (port) => { attempts += 1; return listen(port); }, async () => busy),
        /EADDRINUSE/
    );
    assert.equal(attempts, 3);
});
