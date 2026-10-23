const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createSupabaseClient } = require('../../services/supabase/client');

test('Supabase deadline covers response body after headers, with a successful control', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url.includes('/control?')) return res.end('[{"id":"synthetic"}]');
        res.flushHeaders();
        res.write('[');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
    const client = createSupabaseClient({
        url: `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`,
        serviceKey: 'local-fixture-only',
        timeoutMs: 100,
    });
    let deadline;
    try {
        assert.deepEqual(await client.select('control'), [{ id: 'synthetic' }]);
        const outcome = await Promise.race([
            client.select('stalled').then(
                () => 'unexpected-success',
                (error) => error.name,
            ),
            new Promise((resolve) => {
                deadline = setTimeout(() => resolve('still-pending'), 800);
            }),
        ]);
        assert.equal(outcome, 'AbortError', 'a streamed body must settle within the configured deadline');
    } finally {
        clearTimeout(deadline);
        server.closeAllConnections();
        await new Promise((resolve) => server.close(() => resolve(undefined)));
    }
});
